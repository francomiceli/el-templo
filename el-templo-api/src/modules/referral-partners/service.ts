// Module: referral-partners — service (fase 179).
//
// El corazón "de la plata" de los partners de comercio/marca: CRUD
// tenancy-native de la entidad `referral_partners` (D-20) con la validación
// de unicidad cruzada de códigos entre los 3 espacios de nombres del alta
// (D-03) — `referral_partners.code`, `users.referral_code`,
// `promo_plans.promo_code`. `currency` se deriva SIEMPRE de `branches.country`
// (D-13), nunca del payload (T-179-07).
//
// ADVERTENCIA: este módulo es un ESPEJO DELIBERADO de `referrals/service.ts`
// (mismo shape de DI, mismos helpers `isDuplicateKeyError`/normalización de
// código) y NO debe fusionarse con él. El CONTEXT de la fase prohíbe tocar
// `src/modules/referrals/**` y `computeReferralDiscountPercent`: el módulo de
// partners CALCA lo que necesita, no lo importa (salvo `ReferralService`,
// consumida solo desde `code-resolver.ts` para la rama `member`).

import { and, eq, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { FastifyBaseLogger } from "fastify";
import type * as schema from "../../db/schema";
import {
  referralPartners,
  branches,
  users,
  promoPlans,
  partnerReferrals,
  partnerCommissions,
  referrals,
} from "../../db/schema";
import { BadRequestError, ConflictError, NotFoundError } from "../shared/errors";
import { tenantValues, tenantWhere } from "../shared/tenant";
import type {
  CreatePartnerInput,
  PartnerBenefitType,
  PartnerCurrency,
  PartnerListItem,
  PartnerOrigin,
  TenantCtx,
  UpdatePartnerInput,
} from "./types";

type DbInstance = MySql2Database<typeof schema>;

/**
 * Días de vida del beneficio pendiente desde el registro (D-07): si el
 * referido no reserva/paga dentro de esta ventana, el beneficio vence (el
 * vínculo sigue vivo para atribución de comisión si paga después — ver
 * `attributePartnerAtSignup`). Reusada por 179-07 para el chequeo de
 * vencimiento — constante nombrada, no un mágico repetido.
 */
export const PARTNER_BENEFIT_TTL_DAYS = 30;

export class PartnerReferralService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * Crea un partner. Orden de validación (todas antes de tocar la DB salvo lo
   * marcado):
   *  1. Normaliza el código (`normalizeCode`).
   *  2. `benefitValue` según `benefitType` y `commissionValue >= 0` → `BadRequestError`.
   *  3. La sede existe y pertenece al tenant → `NotFoundError` si no.
   *  4. Deriva `currency` de `branches.country` (D-13) — nunca del payload.
   *  5. Validación cruzada de los 3 espacios de nombres (D-03): el código no
   *     puede existir ya en `referral_partners`, en `users.referral_code` ni
   *     en `promo_plans.promo_code` del mismo tenant → `ConflictError`.
   *  6. INSERT con `tenantValues`; el `ER_DUP_ENTRY` de la unique compuesta
   *     (carrera contra otro admin) se traduce igual a `ConflictError`.
   */
  async createPartner(
    ctx: TenantCtx,
    input: CreatePartnerInput,
    createdBy: number,
  ): Promise<{ id: number }> {
    const code = normalizeCode(input.code);

    if (input.benefitType === "discount_percent") {
      if (input.benefitValue < 1 || input.benefitValue > 100) {
        throw new BadRequestError(
          "El descuento debe estar entre 1 y 100",
        );
      }
    } else if (input.benefitValue !== 0) {
      throw new BadRequestError(
        "La semana gratis no lleva un valor de beneficio (debe ser 0)",
      );
    }
    if (input.commissionValue < 0) {
      throw new BadRequestError(
        "El monto de comisión no puede ser negativo",
      );
    }

    const [branch] = await this.db
      .select({ id: branches.id, country: branches.country })
      .from(branches)
      .where(and(tenantWhere(branches, ctx), eq(branches.id, input.branchId)))
      .limit(1);
    if (!branch) {
      throw new NotFoundError("La sede indicada no existe");
    }

    const currency = currencyForCountry(branch.country);

    // D-03: validación cruzada de los 3 espacios de nombres, todos acotados al
    // tenant (referral_partners.code, users.referral_code y
    // promo_plans.promo_code son unique POR TENANT, ver los schemas).
    const [existingPartner] = await this.db
      .select({ id: referralPartners.id })
      .from(referralPartners)
      .where(
        and(tenantWhere(referralPartners, ctx), eq(referralPartners.code, code)),
      )
      .limit(1);
    if (existingPartner) {
      throw new ConflictError("Ya existe un partner con ese código");
    }

    const [existingUser] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(tenantWhere(users, ctx), eq(users.referralCode, code)))
      .limit(1);
    if (existingUser) {
      throw new ConflictError("Ese código ya lo usa un socio");
    }

    const [existingPromo] = await this.db
      .select({ id: promoPlans.id })
      .from(promoPlans)
      .where(and(tenantWhere(promoPlans, ctx), eq(promoPlans.promoCode, code)))
      .limit(1);
    if (existingPromo) {
      throw new ConflictError("Ese código ya lo usa una promo");
    }

    try {
      const result = await this.db.insert(referralPartners).values(
        tenantValues(ctx, {
          name: input.name,
          code,
          branchId: input.branchId,
          benefitType: input.benefitType,
          benefitValue: input.benefitValue,
          commissionType: input.commissionType,
          commissionValue: input.commissionValue,
          currency,
          contactName: input.contactName ?? null,
          contactPhone: input.contactPhone ?? null,
          notes: input.notes ?? null,
          createdBy,
        }),
      );
      const id = Number(result[0].insertId);
      this.log.info(
        { partnerId: id, tenantId: ctx.tenantId, code },
        "referral-partners: partner creado",
      );
      return { id };
    } catch (err: unknown) {
      // Carrera contra la unique compuesta (tenant_id, code): otro admin ganó
      // entre el SELECT de arriba y este INSERT.
      if (isDuplicateKeyError(err)) {
        throw new ConflictError("Ya existe un partner con ese código");
      }
      throw err;
    }
  }

  /**
   * Actualiza un partner. El código NO se puede cambiar (hay tarjetas
   * impresas circulando): si `input.code` viene y difiere del actual, lanza
   * `BadRequestError` en vez de aplicar silenciosamente el resto del cambio.
   */
  async updatePartner(
    ctx: TenantCtx,
    id: number,
    input: UpdatePartnerInput,
  ): Promise<void> {
    const [existing] = await this.db
      .select({ code: referralPartners.code })
      .from(referralPartners)
      .where(and(tenantWhere(referralPartners, ctx), eq(referralPartners.id, id)))
      .limit(1);
    if (!existing) {
      throw new NotFoundError("El partner no existe");
    }

    if (input.code !== undefined) {
      const normalized = normalizeCode(input.code);
      if (normalized !== existing.code) {
        throw new BadRequestError(
          "El código de un partner no se puede modificar: hay tarjetas impresas con el código original circulando",
        );
      }
    }

    if (input.benefitType === "discount_percent") {
      if (
        input.benefitValue !== undefined &&
        (input.benefitValue < 1 || input.benefitValue > 100)
      ) {
        throw new BadRequestError("El descuento debe estar entre 1 y 100");
      }
    } else if (
      input.benefitType === "free_pass" &&
      input.benefitValue !== undefined &&
      input.benefitValue !== 0
    ) {
      throw new BadRequestError(
        "La semana gratis no lleva un valor de beneficio (debe ser 0)",
      );
    }
    if (input.commissionValue !== undefined && input.commissionValue < 0) {
      throw new BadRequestError(
        "El monto de comisión no puede ser negativo",
      );
    }

    const fields = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.benefitType !== undefined && {
        benefitType: input.benefitType,
      }),
      ...(input.benefitValue !== undefined && {
        benefitValue: input.benefitValue,
      }),
      ...(input.commissionType !== undefined && {
        commissionType: input.commissionType,
      }),
      ...(input.commissionValue !== undefined && {
        commissionValue: input.commissionValue,
      }),
      ...(input.contactName !== undefined && {
        contactName: input.contactName,
      }),
      ...(input.contactPhone !== undefined && {
        contactPhone: input.contactPhone,
      }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    };

    // Ningún campo editable presente. Pasa esto SIEMPRE que el único campo
    // del body haya sido `code` (o `currency`): el schema Fastify no los
    // lista en `properties`, así que Fastify los strippea en silencio
    // (`removeAdditional: true` default, mismo comportamiento que
    // `updateLeadSchema`/`createMemberSchema` documentan en
    // `members/schemas.ts`) — un `.update().set({})` sin columnas genera un
    // `UPDATE ... SET WHERE ...` inválido (error de sintaxis SQL, 500) en vez
    // de comunicar la intención real del cliente. 400 explícito en su lugar.
    if (Object.keys(fields).length === 0) {
      throw new BadRequestError(
        "No hay campos editables en la solicitud (el código y la moneda no se pueden modificar)",
      );
    }

    await this.db
      .update(referralPartners)
      .set(fields)
      .where(and(tenantWhere(referralPartners, ctx), eq(referralPartners.id, id)));

    this.log.info(
      { partnerId: id, tenantId: ctx.tenantId },
      "referral-partners: partner actualizado",
    );
  }

  /** Un partner puntual, con los mismos agregados que `listPartners`. */
  async getPartner(ctx: TenantCtx, id: number): Promise<PartnerListItem> {
    const rows = await this.queryPartners(ctx, { id });
    const found = rows[0];
    if (!found) {
      throw new NotFoundError("El partner no existe");
    }
    return found;
  }

  /**
   * Listado con filtros y agregados de vínculos/comisiones. Delegado a
   * `queryPartners` (privado) — ver el docblock ahí para el detalle de las
   * subqueries.
   */
  async listPartners(
    ctx: TenantCtx,
    filters: { branchId?: number; isActive?: boolean; country?: string },
  ): Promise<PartnerListItem[]> {
    return this.queryPartners(ctx, filters);
  }

  /**
   * Listado con filtros y agregados de vínculos/comisiones. Los contadores
   * salen de DOS subqueries pre-agrupadas por `partnerId` (una fila por
   * partner cada una) LEFT-JOINeadas a `referral_partners` — evita tanto el
   * N+1 (una sola query SQL) como el fan-out de un JOIN directo a las dos
   * tablas hijas a la vez (que multiplicaría filas y ensuciaría los SUM). El
   * filtro `id` es interno (lo usa `getPartner` para no traer el universo
   * completo por un solo registro).
   */
  private async queryPartners(
    ctx: TenantCtx,
    filters: {
      id?: number;
      branchId?: number;
      isActive?: boolean;
      country?: string;
    },
  ): Promise<PartnerListItem[]> {
    const referralStats = this.db
      .select({
        partnerId: partnerReferrals.partnerId,
        vinculosTotal: sql<number>`COUNT(*)`.as("vinculos_total"),
        vinculosQualified: sql<number>`
          COUNT(CASE WHEN ${partnerReferrals.status} = 'qualified' THEN 1 END)
        `.as("vinculos_qualified"),
      })
      .from(partnerReferrals)
      .where(tenantWhere(partnerReferrals, ctx))
      .groupBy(partnerReferrals.partnerId)
      .as("referral_stats");

    const commissionStats = this.db
      .select({
        partnerId: partnerCommissions.partnerId,
        comisionesPendientes: sql<number>`
          COUNT(CASE WHEN ${partnerCommissions.status} = 'pending' THEN 1 END)
        `.as("comisiones_pendientes"),
        montoPendiente: sql<number>`
          COALESCE(SUM(CASE WHEN ${partnerCommissions.status} = 'pending' THEN ${partnerCommissions.amount} ELSE 0 END), 0)
        `.as("monto_pendiente"),
      })
      .from(partnerCommissions)
      .where(tenantWhere(partnerCommissions, ctx))
      .groupBy(partnerCommissions.partnerId)
      .as("commission_stats");

    // tenantWhere(referralPartners, ctx) se inlinea DENTRO del `.where(and(...))`
    // de abajo (mismo statement que el `.from(referralPartners)`/`.innerJoin
    // (branches)`) a propósito: el lint de tenancy (CON-06) es un chequeo de
    // PRESENCIA textual por statement, y una `const conditions = [...]`
    // declarada aparte no cuenta como el mismo statement que la query.
    const conditions: ReturnType<typeof eq>[] = [];
    if (filters.id !== undefined) {
      conditions.push(eq(referralPartners.id, filters.id));
    }
    if (filters.branchId !== undefined) {
      conditions.push(eq(referralPartners.branchId, filters.branchId));
    }
    if (filters.isActive !== undefined) {
      conditions.push(eq(referralPartners.isActive, filters.isActive));
    }
    if (filters.country !== undefined) {
      conditions.push(eq(branches.country, filters.country));
    }

    const rows = await this.db
      .select({
        id: referralPartners.id,
        name: referralPartners.name,
        code: referralPartners.code,
        branchId: referralPartners.branchId,
        branchName: branches.name,
        country: branches.country,
        benefitType: referralPartners.benefitType,
        benefitValue: referralPartners.benefitValue,
        commissionType: referralPartners.commissionType,
        commissionValue: referralPartners.commissionValue,
        currency: referralPartners.currency,
        contactName: referralPartners.contactName,
        contactPhone: referralPartners.contactPhone,
        notes: referralPartners.notes,
        isActive: referralPartners.isActive,
        createdAt: referralPartners.createdAt,
        vinculosTotal: sql<number>`COALESCE(${referralStats.vinculosTotal}, 0)`,
        vinculosQualified: sql<number>`COALESCE(${referralStats.vinculosQualified}, 0)`,
        comisionesPendientes: sql<number>`COALESCE(${commissionStats.comisionesPendientes}, 0)`,
        montoPendiente: sql<number>`COALESCE(${commissionStats.montoPendiente}, 0)`,
      })
      .from(referralPartners)
      .innerJoin(branches, eq(branches.id, referralPartners.branchId))
      .leftJoin(referralStats, eq(referralStats.partnerId, referralPartners.id))
      .leftJoin(
        commissionStats,
        eq(commissionStats.partnerId, referralPartners.id),
      )
      .where(and(tenantWhere(referralPartners, ctx), ...conditions))
      .orderBy(referralPartners.name);

    return rows.map((row) => ({
      ...row,
      benefitType: row.benefitType as PartnerListItem["benefitType"],
      commissionType: row.commissionType as PartnerListItem["commissionType"],
      currency: row.currency as PartnerCurrency,
      vinculosTotal: Number(row.vinculosTotal),
      vinculosQualified: Number(row.vinculosQualified),
      comisionesPendientes: Number(row.comisionesPendientes),
      montoPendiente: Number(row.montoPendiente),
    }));
  }

  /**
   * Crea el vínculo `partner_referrals` del alta (D-02/D-03) con el beneficio
   * en estado `pending` y su vencimiento a `PARTNER_BENEFIT_TTL_DAYS` días
   * (D-07). Llamado desde el cuarto bloque best-effort de `POST
   * /api/auth/register` — NUNCA debe bloquear el registro, así que este
   * método nunca lanza para los casos de negocio esperados (D-12, carrera del
   * UNIQUE): devuelve `null` y loguea.
   *
   * Orden:
   *  1. `findOriginForMember` — si el socio YA tiene origen (referrer o
   *     partner), se DEGRADA EN SILENCIO devolviendo `null` (D-12: en el alta
   *     no hay 409 visible; el 409 es solo para la asignación retroactiva del
   *     plan 179-08).
   *  2. Calcula `benefitExpiresAt` = ahora + `PARTNER_BENEFIT_TTL_DAYS`.
   *  3. INSERT con `tenantValues({ tenantId }, ...)` — el `tenantId` viene de
   *     la fila del partner (única fuente legítima en una ruta pública sin
   *     `request.scope`, ver `code-resolver.ts`).
   *  4. Carrera contra el UNIQUE de `referred_id`: otro intento ganó entre el
   *     chequeo (1) y este INSERT → `isDuplicateKeyError` → `null`.
   */
  async attributePartnerAtSignup(params: {
    partnerId: number;
    tenantId: number;
    referredId: number;
    benefitType: PartnerBenefitType;
    benefitValue: number;
    createdBy?: number | null;
  }): Promise<{
    linkId: number;
    benefitType: PartnerBenefitType;
    benefitValue: number;
  } | null> {
    const { partnerId, tenantId, referredId, benefitType, benefitValue } =
      params;
    const ctx: TenantCtx = { tenantId };

    const existingOrigin = await this.findOriginForMember(ctx, referredId);
    if (existingOrigin) {
      this.log.info(
        { partnerId, referredId, origin: existingOrigin.kind },
        "referral-partners: atribución en el alta omitida — el socio ya tiene origen (D-12)",
      );
      return null;
    }

    const benefitExpiresAt = new Date(
      Date.now() + PARTNER_BENEFIT_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    try {
      const result = await this.db.insert(partnerReferrals).values(
        tenantValues(ctx, {
          partnerId,
          referredId,
          status: "pending" as const,
          attributionChannel: "self_service" as const,
          benefitType,
          benefitValue,
          benefitStatus: "pending" as const,
          benefitExpiresAt,
          createdBy: params.createdBy ?? null,
        }),
      );
      const linkId = Number(result[0].insertId);
      this.log.info(
        { partnerId, referredId, benefitType },
        "partner: vínculo creado en el alta",
      );
      return { linkId, benefitType, benefitValue };
    } catch (err: unknown) {
      // Carrera contra el UNIQUE de referred_id (D-12): otro origen ganó
      // entre el chequeo de arriba y este INSERT.
      if (isDuplicateKeyError(err)) {
        return null;
      }
      throw err;
    }
  }

  /**
   * "El hook de la plata" (D-11): cualifica el vínculo `pending` del payer y
   * da de alta la comisión del partner. Llamado desde el helper gemelo
   * `qualifyPartnerOnCharge` en las 4 charge-paths de
   * `subscriptions/service.ts`, calcado en estructura de
   * `qualifyFirstPayment` + `recordReferralCredit`
   * (`referrals/service.ts:367-404` y `:529-553`).
   *
   * Por qué el UPDATE guardado (misma cláusula WHERE que el SELECT previo) es
   * preferible a "leer y después escribir": bajo carrera real (dos cobros
   * concurrentes del mismo socio, o un reintento del webhook de pago) hay una
   * ventana entre el read y un write condicionado en JS donde otro proceso
   * puede flippear primero — el UPDATE con `status='pending'` en su propia
   * cláusula es atómico a nivel de fila en MySQL: si dos llamadas
   * concurrentes lo corren, como mucho UNA afecta una fila. Es el mismo
   * precedente que la fase 157 (`qualifyFirstPayment`) ya resolvió para
   * `referrals`.
   *
   * Por qué la idempotencia de `partner_commissions` va por `subscription_id`
   * y no por `partner_referral_id`: el flip del vínculo ocurre una sola vez
   * en su ciclo de vida (pending → qualified), pero lo que hay que blindar es
   * "un cargo concreto no genera dos comisiones aunque el cobro se
   * reintente" (D-11) — exactamente la misma garantía que
   * `unique_referral_credit_sub` da para `referral_credits`. Bajo la carrera
   * descripta arriba, ambas llamadas pueden pasar el SELECT-previo viendo
   * `pending` y llegar las dos al INSERT: el UNIQUE de `subscription_id` +
   * `onDuplicateKeyUpdate` es lo que garantiza 1 sola fila, no el UPDATE del
   * flip.
   *
   * Devuelve `null` si no había vínculo `pending` (re-cobro sobre un socio ya
   * `qualified`, o sin vínculo — nunca comisiona dos veces por el mismo
   * flip). Devuelve `commissionId: null` cuando el partner tiene
   * `commissionType='none'` o `commissionValue <= 0`: el flip igual ocurrió,
   * pero no hay comisión que armar.
   */
  async qualifyAndCommission(
    ctx: TenantCtx,
    payerUserId: number,
    subscriptionId: number,
  ): Promise<{ linkId: number; commissionId: number | null } | null> {
    // SELECT previo del vínculo pending del payer, con el commissionType/
    // commissionValue/currency del partner — ANTES del UPDATE: es lo que
    // permite saber si hubo flip real.
    const [pending] = await this.db
      .select({
        linkId: partnerReferrals.id,
        partnerId: partnerReferrals.partnerId,
        commissionType: referralPartners.commissionType,
        commissionValue: referralPartners.commissionValue,
        currency: referralPartners.currency,
      })
      .from(partnerReferrals)
      .innerJoin(
        referralPartners,
        eq(referralPartners.id, partnerReferrals.partnerId),
      )
      .where(
        and(
          tenantWhere(partnerReferrals, ctx),
          eq(partnerReferrals.referredId, payerUserId),
          eq(partnerReferrals.status, "pending"),
        ),
      )
      .limit(1);

    await this.db
      .update(partnerReferrals)
      .set({ status: "qualified", qualifiedAt: new Date() })
      .where(
        and(
          tenantWhere(partnerReferrals, ctx),
          eq(partnerReferrals.referredId, payerUserId),
          eq(partnerReferrals.status, "pending"),
        ),
      );

    if (!pending) {
      return null;
    }

    if (pending.commissionType === "none" || pending.commissionValue <= 0) {
      return { linkId: pending.linkId, commissionId: null };
    }

    const result = await this.db
      .insert(partnerCommissions)
      .values(
        tenantValues(ctx, {
          partnerId: pending.partnerId,
          partnerReferralId: pending.linkId,
          userId: payerUserId,
          subscriptionId,
          amount: pending.commissionValue,
          currency: pending.currency as PartnerCurrency,
          status: "pending" as const,
        }),
      )
      // Duplicado por re-cobro del mismo cargo → no-op (re-escribe el mismo
      // id). Calcado de recordReferralCredit.
      .onDuplicateKeyUpdate({ set: { subscriptionId } });

    const commissionId = Number(result[0].insertId);
    this.log.info(
      {
        partnerId: pending.partnerId,
        referredId: payerUserId,
        subscriptionId,
        amount: pending.commissionValue,
        currency: pending.currency,
      },
      "partner: comisión generada",
    );

    return { linkId: pending.linkId, commissionId };
  }

  /**
   * Devuelve el origen actual de un socio (D-12: exclusividad — `referrals`
   * XOR `partner_referrals`), o `null` si no tiene ninguno todavía. Reusado
   * por `attributePartnerAtSignup` (esta clase) y por la asignación
   * retroactiva (179-08).
   *
   * Lee `referrals` (tabla del módulo `referrals/`, ajeno a este): es una
   * LECTURA, no una modificación — el CONTEXT de la fase prohíbe tocar
   * `src/modules/referrals/**`, no prohíbe leer su tabla desde otro módulo
   * para resolver la exclusividad de origen.
   */
  async findOriginForMember(
    ctx: TenantCtx,
    userId: number,
  ): Promise<PartnerOrigin> {
    const [memberOrigin] = await this.db
      .select({ id: referrals.id })
      .from(referrals)
      .where(and(tenantWhere(referrals, ctx), eq(referrals.referredId, userId)))
      .limit(1);
    if (memberOrigin) {
      return { kind: "member" };
    }

    const [partnerOrigin] = await this.db
      .select({ id: partnerReferrals.id, partnerId: partnerReferrals.partnerId })
      .from(partnerReferrals)
      .where(
        and(
          tenantWhere(partnerReferrals, ctx),
          eq(partnerReferrals.referredId, userId),
        ),
      )
      .limit(1);
    if (partnerOrigin) {
      return {
        kind: "partner",
        partnerId: partnerOrigin.partnerId,
        linkId: partnerOrigin.id,
      };
    }

    return null;
  }
}

/**
 * Normaliza un código de partner: mayúsculas, solo `[A-Z0-9]`, recortado a 24
 * caracteres. Defensa contra la incertidumbre de colación de MySQL — se
 * aplica tanto al guardar (`createPartner`) como al resolver
 * (`code-resolver.ts`), así que dos formas distintas del mismo código escrito
 * a mano siempre matchean.
 */
export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 24);
}

/** `"ES"` → EUR; cualquier otro país (hoy solo "AR") → ARS (D-13). */
function currencyForCountry(country: string): PartnerCurrency {
  return country === "ES" ? "EUR" : "ARS";
}

/**
 * Narrowing del error de clave duplicada de mysql2 (ER_DUP_ENTRY / errno 1062).
 * Copiado LITERAL de `referrals/service.ts` (el CONTEXT prohíbe importar
 * helpers privados de ese módulo): Drizzle envuelve el error de mysql2 en un
 * DrizzleQueryError, así que el código real puede vivir en `err.cause` — se
 * recorre la cadena de causas.
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
