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
//      "Activo" = deriveCoveredUntil de la contraparte, NUNCA el estado
//      derivado por cron del usuario (D-09/D-24).
//   5. qualifyFirstPayment / recordReferralCredit — flip idempotente del vínculo
//      y anotación auditable en referral_credits + aura_transactions amount=0 SIN
//      inflar el saldo gastable (AURA-01/D-06/D-18).
//
// Constructor DI (db, log) clonado de settings/service.ts:26-30.

import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import {
  users,
  referrals,
  referralCredits,
  referralCtaClicks,
  auraConfig,
  auraTransactions,
  systemSettings,
} from "../../db/schema";
import { deriveCoveredUntil } from "../subscriptions/service";
import { referralCopyVariant } from "./ab-variant";
import type {
  ReferralConfig,
  ReferralLinkView,
  ReferralOverview,
  ReferralAbResults,
  ReferralAbVariantResult,
} from "./types";

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
   * deriveCoveredUntil (D-09/D-24), nunca con el estado del socio. Topeado a
   * maxPercentCap. Cero vínculos activos → 0.
   *
   * `simulatePendingQualification`: cuenta también el vínculo `pending` del que
   * userId es el REFERIDO (a lo sumo uno, referredId UNIQUE — D-14), como si su
   * primer pago ya lo hubiera cualificado. Es el mismo vínculo que
   * qualifyFirstPayment flippea dentro del cobro real, así el preview muestra el
   * precio que efectivamente se va a cobrar. Solo para previews — las
   * charge-paths NUNCA pasan esta opción (el flip real sigue siendo del cobro).
   */
  async computeReferralDiscountPercent(
    userId: number,
    opts?: { simulatePendingQualification?: boolean },
  ): Promise<number> {
    const { percentPerLink, maxPercentCap } = await this.getReferralConfig();

    const qualifiedFilter = eq(referrals.status, "qualified");
    const statusFilter = opts?.simulatePendingQualification
      ? or(
          qualifiedFilter,
          and(
            eq(referrals.status, "pending"),
            eq(referrals.referredId, userId),
          ),
        )
      : qualifiedFilter;

    const links = await this.db
      .select({
        referrerId: referrals.referrerId,
        referredId: referrals.referredId,
      })
      .from(referrals)
      .where(
        and(
          statusFilter,
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
   * Fuente de datos de las pantallas de visibilidad (fase 158, VIS-01/VIS-03):
   * compone en un shape único el código (lazy), el descuento vigente con
   * desglose y ambos lados del vínculo con estado derivado. LEE, no altera la
   * mecánica de 157.
   *
   * Reuso obligatorio (D-30): `discount.percent` se obtiene LLAMANDO a
   * `computeReferralDiscountPercent` — cero drift posible con el cómputo del
   * cobro. El loop propio existe SOLO para derivar el `state` por vínculo
   * (`ReferralLinkView`), con el MISMO criterio que ese cómputo
   * (`deriveCoveredUntil` de la contraparte vs today, D-09/D-24/D-28), NUNCA
   * `users.status`. Los vínculos `revoked` se excluyen.
   */
  async getReferralOverview(userId: number): Promise<ReferralOverview> {
    const referralCode = await this.generateReferralCode(userId);

    // Vínculos no-revoked en cualquiera de las dos direcciones.
    const links = await this.db
      .select({
        referrerId: referrals.referrerId,
        referredId: referrals.referredId,
        status: referrals.status,
      })
      .from(referrals)
      .where(
        and(
          ne(referrals.status, "revoked"),
          or(
            eq(referrals.referrerId, userId),
            eq(referrals.referredId, userId),
          ),
        ),
      );

    const { percentPerLink, maxPercentCap } = await this.getReferralConfig();
    const today = new Date().toISOString().split("T")[0];

    const referred: ReferralLinkView[] = [];
    let referredBy: ReferralLinkView | null = null;
    let activeCount = 0;

    for (const link of links) {
      const isReferrer = link.referrerId === userId;
      const counterpartyId = isReferrer ? link.referredId : link.referrerId;

      let state: ReferralLinkView["state"];
      if (link.status === "pending") {
        state = "pending";
      } else {
        // qualified: activo si la contraparte está cubierta hoy (mismo criterio
        // que computeReferralDiscountPercent) — sino suspendido (se reactiva si
        // la contraparte vuelve, D-10).
        const coveredUntil = await deriveCoveredUntil(this.db, counterpartyId);
        state =
          coveredUntil !== null && coveredUntil >= today
            ? "active"
            : "suspended";
      }
      if (state === "active") {
        activeCount++;
      }

      const [cp] = await this.db
        .select({ firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, counterpartyId))
        .limit(1);
      const fullName = [cp?.firstName, cp?.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

      const view: ReferralLinkView = {
        userId: counterpartyId,
        fullName,
        state,
      };
      if (isReferrer) {
        referred.push(view);
      } else {
        // referredId es UNIQUE (D-14): a lo sumo un vínculo "me trajo".
        referredBy = view;
      }
    }

    // Reuso D-30: el % vigente es EXACTAMENTE el del cobro, no una reimplementación.
    const percent = await this.computeReferralDiscountPercent(userId);

    return {
      referralCode,
      discount: {
        percent,
        activeCount,
        perLinkPercent: percentPerLink,
        capPercent: maxPercentCap,
      },
      referred,
      referredBy,
    };
  }

  /**
   * Marca `qualified` el vínculo `pending` del que el payer es referido (DESC-01).
   * UPDATE guardado `WHERE referred_id=? AND status='pending'`: idempotente y
   * race-safe (no-op si no hay pending o ya está qualified). El gate de "primer
   * pago con pricePaid>0" lo aplica el llamador (plan 04, D-20); acá solo el flip.
   *
   * Devuelve el vínculo que EFECTIVAMENTE flippeó (`referrerId` + nombre del
   * referido para interpolar la notificación al referidor, VIS-02/D-31), o `null`
   * si no hubo pending que flippear (re-cobro o sin vínculo) — así el hook de
   * notificación dispara UNA sola vez, en el flip real. El SELECT previo NO altera
   * la mecánica del UPDATE (157 congelada): la cláusula del UPDATE es idéntica.
   */
  async qualifyFirstPayment(
    payerUserId: number,
  ): Promise<{ referrerId: number; referredFirstName: string } | null> {
    // SELECT previo del vínculo pending (con el firstName del payer/referido)
    // ANTES del UPDATE: si no hay pending, no hubo flip → no notificar.
    const [pending] = await this.db
      .select({
        referrerId: referrals.referrerId,
        referredFirstName: users.firstName,
      })
      .from(referrals)
      .innerJoin(users, eq(users.id, referrals.referredId))
      .where(
        and(
          eq(referrals.referredId, payerUserId),
          eq(referrals.status, "pending"),
        ),
      )
      .limit(1);

    await this.db
      .update(referrals)
      .set({ status: "qualified", qualifiedAt: new Date() })
      .where(
        and(
          eq(referrals.referredId, payerUserId),
          eq(referrals.status, "pending"),
        ),
      );

    if (!pending) {
      return null;
    }
    return {
      referrerId: pending.referrerId,
      referredFirstName: pending.referredFirstName ?? "",
    };
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

  /**
   * A/B copy test — registra un tap en el CTA "Compartir código" de la card.
   * La variante se RECOMPUTA server-side desde el userId (nunca se confía en el
   * cliente, mismo criterio IDOR que el resto del módulo). Es best-effort desde
   * la vista del socio: la card no debe bloquear la navegación si esto falla, así
   * que la ruta swallowea el error — pero acá dejamos el insert crudo.
   */
  async recordCtaClick(userId: number): Promise<void> {
    await this.db.insert(referralCtaClicks).values({
      userId,
      variant: referralCopyVariant(userId),
    });
  }

  /**
   * A/B copy test — resultados agregados por variante para el tab de Analíticas.
   * Tres señales, ninguna requiere event-tracking nuevo salvo el clic:
   *   - expuestos: socios ACTIVOS (status='activo', role='member') por paridad de
   *     id. Es un proxy del denominador (no todos abren la app), pero como el
   *     bucketing es par/impar, ambos grupos tienen la misma tasa de apertura →
   *     la comparación RELATIVA entre variantes es justa.
   *   - clickers únicos / clics totales: de referral_cta_clicks.
   *   - referidos creados / cualificados: de referrals con copy_variant estampado
   *     (los previos al experimento son NULL y quedan fuera).
   * Las tasas (CTR, conversión) se calculan sobre "expuestos".
   */
  async getAbTestResults(): Promise<ReferralAbResults> {
    // Expuestos por variante: paridad del id del socio activo.
    const exposedRows = await this.db
      .select({
        variant: sql<string>`CASE WHEN ${users.id} % 2 = 0 THEN 'A' ELSE 'B' END`,
        count: sql<number>`COUNT(*)`,
      })
      .from(users)
      .where(and(eq(users.role, "member"), eq(users.status, "activo")))
      .groupBy(sql`CASE WHEN ${users.id} % 2 = 0 THEN 'A' ELSE 'B' END`);

    // Clics: clickers únicos + clics totales por variante.
    const clickRows = await this.db
      .select({
        variant: referralCtaClicks.variant,
        uniqueClickers: sql<number>`COUNT(DISTINCT ${referralCtaClicks.userId})`,
        totalClicks: sql<number>`COUNT(*)`,
      })
      .from(referralCtaClicks)
      .groupBy(referralCtaClicks.variant);

    // Referidos: creados + cualificados por variante (solo los estampados).
    const referralRows = await this.db
      .select({
        variant: referrals.copyVariant,
        created: sql<number>`COUNT(*)`,
        qualified: sql<number>`SUM(CASE WHEN ${referrals.status} = 'qualified' THEN 1 ELSE 0 END)`,
      })
      .from(referrals)
      .where(isNotNull(referrals.copyVariant))
      .groupBy(referrals.copyVariant);

    const buildVariant = (v: "A" | "B"): ReferralAbVariantResult => {
      const exposed = Number(
        exposedRows.find((r) => r.variant === v)?.count ?? 0,
      );
      const click = clickRows.find((r) => r.variant === v);
      const ref = referralRows.find((r) => r.variant === v);
      const uniqueClickers = Number(click?.uniqueClickers ?? 0);
      const totalClicks = Number(click?.totalClicks ?? 0);
      const referralsCreated = Number(ref?.created ?? 0);
      const referralsQualified = Number(ref?.qualified ?? 0);
      return {
        variant: v,
        exposedMembers: exposed,
        uniqueClickers,
        totalClicks,
        referralsCreated,
        referralsQualified,
        // Tasas sobre expuestos (0 si no hay denominador, para no dividir por 0).
        ctr: exposed > 0 ? uniqueClickers / exposed : 0,
        qualifiedRate: exposed > 0 ? referralsQualified / exposed : 0,
      };
    };

    return { variants: [buildVariant("A"), buildVariant("B")] };
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
