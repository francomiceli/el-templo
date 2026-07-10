// Module: referrals — service (fase 157, milestone v5.5).
//
// El corazón "de la plata" del sistema de referidos. Cinco piezas puras que los
// planes 03 (atribución) y 04 (cobro) consumen sin reimplementar nada:
//   1. generateReferralCode — código legible único (PREFIJO-XXXX), unicidad por
//      constraint DB + retry, NO por entropía (Security V6). Idempotente y lazy
//      (D-16/D-17/D-25).
//   2. resolveReferralCode — code → userId del dueño, o null.
//   3. getReferralConfig — % por vínculo (aura_config) + tope (system_settings)
//      con fallback 10/40 (D-12/AURA-02).
//   4. computeReferralDiscountPercent — descuento simétrico condicional topeado.
//      "Activo" = deriveCoveredUntil de la contraparte, NUNCA users.status
//      (D-09/D-24).
//   5. qualifyFirstPayment / recordReferralCredit — flip idempotente del vínculo
//      y anotación auditable en referral_credits + aura_transactions amount=0 SIN
//      inflar el saldo gastable (AURA-01/D-06/D-18).
//
// Constructor DI (db, log) clonado de settings/service.ts:26-30.

import { and, eq, or } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import {
  users,
  referrals,
  referralCredits,
  auraConfig,
  auraTransactions,
  systemSettings,
} from "../../db/schema";
import { deriveCoveredUntil } from "../subscriptions/service";
import type { ReferralConfig } from "./types";

type DbInstance = MySql2Database<typeof schema>;

/** % por vínculo cuando la fila aura_config['referral'] falta (D-12). */
const DEFAULT_PERCENT_PER_LINK = 10;
/** Tope cuando system_settings['referral.max_percent_cap'] falta (D-12). */
const DEFAULT_MAX_PERCENT_CAP = 40;
/** Clave del tope en system_settings (precedente finance.pending_overdue_days). */
const MAX_PERCENT_CAP_KEY = "referral.max_percent_cap";
/** Reintentos máximos ante colisión del UNIQUE de referral_code (Security V6). */
const MAX_CODE_ATTEMPTS = 10;
/** Alfabeto del sufijo aleatorio (sin ambigüedad O/0 no requerida acá). */
const SUFFIX_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const SUFFIX_LENGTH = 4;

export class ReferralService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
    // Generador del sufijo inyectable para forzar colisiones en tests. En
    // producción usa Math.random (la unicidad la garantiza el UNIQUE + retry,
    // NO la entropía — Security V6, no hace falta crypto RNG).
    private readonly suffixFn: () => string = defaultSuffix,
  ) {}

  /**
   * Genera (o devuelve, si ya existe) el referralCode legible del socio.
   *
   * Formato `PREFIJO-XXXX`: prefijo = primeras 4 letras del firstName en
   * mayúsculas (fallback estable si es null/sin letras); sufijo alfanumérico
   * corto. La unicidad la impone el UNIQUE de users.referral_code: ante colisión
   * se reintenta con nuevo sufijo hasta MAX_CODE_ATTEMPTS. Idempotente: si el
   * socio ya tiene código lo devuelve sin tocar la DB (lazy, D-17/D-25).
   *
   * Tras agotar los reintentos lanza — la política de fallo del alta la decide el
   * llamador (plan 03, best-effort), no este método.
   */
  async generateReferralCode(userId: number): Promise<string> {
    const [row] = await this.db
      .select({ code: users.referralCode, firstName: users.firstName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!row) {
      throw new Error(`referral: user ${userId} not found`);
    }
    if (row.code) {
      return row.code;
    }

    const prefix = derivePrefix(row.firstName);
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = `${prefix}-${this.suffixFn()}`;
      try {
        await this.db
          .update(users)
          .set({ referralCode: code })
          .where(eq(users.id, userId));
        return code;
      } catch (err: unknown) {
        if (isDuplicateKeyError(err)) {
          this.log.warn(
            { userId, code },
            "referral code collision, retrying with a new suffix",
          );
          continue;
        }
        throw err;
      }
    }

    throw new Error(
      `referral: could not generate a unique code for user ${userId} after ${MAX_CODE_ATTEMPTS} attempts`,
    );
  }

  /** Devuelve el userId dueño del code, o null si no existe. */
  async resolveReferralCode(code: string): Promise<number | null> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.referralCode, code))
      .limit(1);
    return row?.id ?? null;
  }

  /**
   * Lee la calibración con fallback (D-12/AURA-02): % por vínculo desde
   * aura_config['referral'].default_amount (fallback 10), tope desde
   * system_settings['referral.max_percent_cap'] (fallback 40). Ambos ajustables
   * sin deploy.
   */
  async getReferralConfig(): Promise<ReferralConfig> {
    const [cfg] = await this.db
      .select({ amount: auraConfig.defaultAmount })
      .from(auraConfig)
      .where(eq(auraConfig.sourceType, "referral"))
      .limit(1);

    const [cap] = await this.db
      .select({ value: systemSettings.settingValue })
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, MAX_PERCENT_CAP_KEY))
      .limit(1);

    const parsedCap = cap ? Number.parseInt(cap.value, 10) : Number.NaN;

    return {
      percentPerLink: cfg?.amount ?? DEFAULT_PERCENT_PER_LINK,
      maxPercentCap: Number.isFinite(parsedCap)
        ? parsedCap
        : DEFAULT_MAX_PERCENT_CAP,
    };
  }

  /**
   * Descuento simétrico condicional topeado (DESC-02/03/04). Suma percentPerLink
   * por cada vínculo `qualified` (en cualquiera de las dos direcciones) cuya
   * CONTRAPARTE esté cubierta hoy — "activo" se determina SOLO con
   * deriveCoveredUntil (D-09/D-24), nunca con users.status. Topeado a
   * maxPercentCap. Cero vínculos activos → 0.
   */
  async computeReferralDiscountPercent(userId: number): Promise<number> {
    const { percentPerLink, maxPercentCap } = await this.getReferralConfig();

    const links = await this.db
      .select({
        referrerId: referrals.referrerId,
        referredId: referrals.referredId,
      })
      .from(referrals)
      .where(
        and(
          eq(referrals.status, "qualified"),
          or(
            eq(referrals.referrerId, userId),
            eq(referrals.referredId, userId),
          ),
        ),
      );

    const today = new Date().toISOString().split("T")[0];
    let activeLinks = 0;
    for (const link of links) {
      const counterpartyId =
        link.referrerId === userId ? link.referredId : link.referrerId;
      const coveredUntil = await deriveCoveredUntil(this.db, counterpartyId);
      if (coveredUntil !== null && coveredUntil >= today) {
        activeLinks++;
      }
    }

    return Math.min(activeLinks * percentPerLink, maxPercentCap);
  }

  /**
   * Marca `qualified` el vínculo `pending` del que el payer es referido (DESC-01).
   * UPDATE guardado `WHERE referred_id=? AND status='pending'`: idempotente y
   * race-safe (no-op si no hay pending o ya está qualified). El gate de "primer
   * pago con pricePaid>0" lo aplica el llamador (plan 04, D-20); acá solo el flip.
   */
  async qualifyFirstPayment(payerUserId: number): Promise<void> {
    await this.db
      .update(referrals)
      .set({ status: "qualified", qualifiedAt: new Date() })
      .where(
        and(
          eq(referrals.referredId, payerUserId),
          eq(referrals.status, "pending"),
        ),
      );
  }

  /**
   * Registro auditable del descuento aplicado en un cargo (AURA-01/D-06/D-18).
   * INSERT idempotente en referral_credits (UNIQUE por subscriptionId) + INSERT
   * directo en aura_transactions con amount=0, sourceType='referral',
   * referenceType='subscription', referenceId=subscriptionId — anotación de
   * trazabilidad que NO infla el saldo gastable (prohibido AuraService.award/spend).
   * Idempotente por subscriptionId / por el UNIQUE unique_user_source_ref.
   */
  async recordReferralCredit(
    userId: number,
    subscriptionId: number,
    percent: number,
    amount: number,
  ): Promise<void> {
    await this.db
      .insert(referralCredits)
      .values({ userId, subscriptionId, percent, amount })
      // Duplicado por re-cobro del mismo cargo → no-op (re-escribe el mismo id).
      .onDuplicateKeyUpdate({ set: { subscriptionId } });

    await this.db
      .insert(auraTransactions)
      .values({
        userId,
        sourceType: "referral",
        amount: 0,
        referenceType: "subscription",
        referenceId: subscriptionId,
        description: `Descuento por referido: ${percent}%`,
      })
      // UNIQUE (userId, sourceType, referenceType, referenceId) → no-op idempotente.
      .onDuplicateKeyUpdate({ set: { amount: 0 } });
  }
}

/** Prefijo legible = hasta 4 letras A-Z del firstName; fallback estable "REF". */
function derivePrefix(firstName: string | null): string {
  const letters = (firstName ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  return letters.slice(0, 4) || "REF";
}

/** Sufijo aleatorio corto A-Z0-9 (Math.random; unicidad por UNIQUE + retry). */
function defaultSuffix(): string {
  let out = "";
  for (let i = 0; i < SUFFIX_LENGTH; i++) {
    out += SUFFIX_ALPHABET[Math.floor(Math.random() * SUFFIX_ALPHABET.length)];
  }
  return out;
}

/**
 * Narrowing del error de clave duplicada de mysql2 (ER_DUP_ENTRY / errno 1062).
 * Drizzle envuelve el error de mysql2 en un DrizzleQueryError, así que el código
 * real puede vivir en `err.cause` — se recorre la cadena de causas.
 */
function isDuplicateKeyError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current != null; depth++) {
    if (typeof current === "object") {
      const e = current as { code?: string; errno?: number; cause?: unknown };
      if (e.code === "ER_DUP_ENTRY" || e.errno === 1062) {
        return true;
      }
      current = e.cause;
    } else {
      break;
    }
  }
  return false;
}
