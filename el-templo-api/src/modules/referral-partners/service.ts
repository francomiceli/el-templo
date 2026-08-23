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
} from "../../db/schema";
import { BadRequestError, ConflictError, NotFoundError } from "../shared/errors";
import { tenantValues, tenantWhere } from "../shared/tenant";
import type {
  CreatePartnerInput,
  PartnerCurrency,
  PartnerListItem,
  TenantCtx,
  UpdatePartnerInput,
} from "./types";

type DbInstance = MySql2Database<typeof schema>;

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
