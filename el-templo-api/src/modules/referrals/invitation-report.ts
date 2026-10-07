// Módulo: referrals — reporte del programa de Invitaciones (Fase 194-20, D-19)
//
// KPIs por mes de cohorte de activación, para gestión:
//   - invitaciones activadas y conversiones (compraron) por mes de activación y la
//     tasa = compran / activan (por COHORTE: una compra de hoy suma al mes en que se
//     activó la invitación, no al de la compra);
//   - invitados activos totales (hoy con cobertura de MEMBRESÍA, D-10d);
//   - monto de descuentos por mes Y por moneda, de `referral_credits`, incluidos los
//     vínculos heredados (es el "monto del programa"). NUNCA se suman monedas
//     distintas (ARS con EUR): la salida trae una fila por (mes, moneda).
//
// MES DE ACTIVACIÓN = `invitations.quota_month` ('YYYY-MM' en la tz de la sede del
// invitador, el mismo mes que consume el cupo). Es más correcto que
// `DATE_FORMAT(activated_at)` (que dependería de la zona horaria del servidor MySQL)
// y es la columna indexada. Las anuladas (`voided`) no cuentan en ningún KPI.
//
// ALCANCE: agregado de todo el gimnasio. Un rol de alcance por país (admin/gestión)
// recibe `country` y ve solo las invitaciones de sedes de su país y los créditos de
// subs de sedes de su país; el owner no pasa país y ve ambos (ya separados por
// moneda).
//
// AISLAMIENTO: `tenantWhere` en cada tabla de cada statement; `tenant_id` sale del
// `ctx` del servidor.
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { todayInTz } from "../shared/date-utils";
import { BadRequestError } from "../shared/errors";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import type { CountryCode } from "../shared/country-scope";
import { deriveMembershipCoveredUntilBatch } from "../subscriptions/service";

type DbInstance = MySql2Database<typeof schema>;

/** Meses que cubre el reporte por defecto (el actual + los 11 anteriores). */
const DEFAULT_MONTHS = 12;
/** Tope del rango pedido (evita una respuesta enorme por un `from` absurdo). */
const MAX_RANGE_MONTHS = 36;
/** tz con la que se resuelve "el mes actual" y "hoy" (la sede principal del gimnasio). */
const REPORT_TIMEZONE = "America/Argentina/Buenos_Aires";

export interface InvitationReportFilters {
  /** 'YYYY-MM' inclusive. Default: 11 meses antes de `to`. */
  from?: string;
  /** 'YYYY-MM' inclusive. Default: el mes actual. */
  to?: string;
  /** Solo para roles de alcance por país. */
  country?: CountryCode;
}

export interface InvitationReportMonth {
  month: string;
  activated: number;
  converted: number;
  /** converted / activated (0 si no hubo activaciones), 4 decimales. */
  conversionRate: number;
}

export interface InvitationReportDiscount {
  month: string;
  currency: string;
  /** Suma de `referral_credits.amount` del mes en ESA moneda. */
  amount: number;
  /** Cantidad de cobros con descuento. */
  credits: number;
}

export interface InvitationReport {
  from: string;
  to: string;
  /** Un elemento por mes del rango (con ceros), del más viejo al más nuevo. */
  months: InvitationReportMonth[];
  totals: Omit<InvitationReportMonth, "month">;
  /** Invitados distintos (invitación activa) con membresía vigente hoy. */
  activeInvitees: number;
  /** Una fila por (mes, moneda) con descuentos, sin sumar monedas distintas. */
  discounts: InvitationReportDiscount[];
}

/** Primer día del mes siguiente a `month` ('YYYY-MM' -> 'YYYY-MM-01'). */
function nextMonthStart(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  const total = year * 12 + mon; // mes (base 1) + 1 mes, en meses absolutos
  const nextYear = Math.floor((total - 1) / 12);
  const nextMon = total - nextYear * 12;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMon).padStart(2, "0")}-01`;
}

/** Resta `months` meses a un 'YYYY-MM'. */
function shiftMonth(month: string, months: number): string {
  const [year, mon] = month.split("-").map(Number);
  const total = year * 12 + (mon - 1) + months;
  const y = Math.floor(total / 12);
  return `${String(y).padStart(4, "0")}-${String(total - y * 12 + 1).padStart(2, "0")}`;
}

/** Todos los meses de `from` a `to` inclusive ('YYYY-MM'). Ambos ya validados. */
export function monthsBetween(from: string, to: string): string[] {
  const result: string[] = [];
  for (let month = from; month <= to; month = shiftMonth(month, 1)) {
    result.push(month);
  }
  return result;
}

function rate(converted: number, activated: number): number {
  return activated === 0 ? 0 : Math.round((converted / activated) * 1e4) / 1e4;
}

export class InvitationReportService {
  constructor(private readonly db: DbInstance) {}

  /** Reporte D-19 del gimnasio de `ctx`. */
  async getReport(
    ctx: TenantContext,
    filters: InvitationReportFilters = {},
  ): Promise<InvitationReport> {
    const { from, to } = this.resolveRange(filters);

    const cohorts = await this.loadCohorts(ctx, from, to, filters.country);
    const months = monthsBetween(from, to).map(
      (month): InvitationReportMonth => {
        const cohort = cohorts.get(month);
        const activated = cohort?.activated ?? 0;
        const converted = cohort?.converted ?? 0;
        return {
          month,
          activated,
          converted,
          conversionRate: rate(converted, activated),
        };
      },
    );
    const activated = months.reduce((sum, m) => sum + m.activated, 0);
    const converted = months.reduce((sum, m) => sum + m.converted, 0);

    return {
      from,
      to,
      months,
      totals: {
        activated,
        converted,
        conversionRate: rate(converted, activated),
      },
      activeInvitees: await this.countActiveInvitees(ctx, filters.country),
      discounts: await this.loadDiscounts(ctx, from, to, filters.country),
    };
  }

  /** Rango por defecto y validación (T-194-69: el querystring ya trae el patrón). */
  private resolveRange(filters: InvitationReportFilters): {
    from: string;
    to: string;
  } {
    const to = filters.to ?? todayInTz(REPORT_TIMEZONE).slice(0, 7);
    const from = filters.from ?? shiftMonth(to, -(DEFAULT_MONTHS - 1));
    if (from > to) {
      throw new BadRequestError(
        "El mes inicial no puede ser posterior al final",
      );
    }
    if (monthsBetween(from, to).length > MAX_RANGE_MONTHS) {
      throw new BadRequestError(
        `El rango no puede superar ${MAX_RANGE_MONTHS} meses`,
      );
    }
    return { from, to };
  }

  /** Activadas y convertidas por mes de cohorte (`quota_month`). */
  private async loadCohorts(
    ctx: TenantContext,
    from: string,
    to: string,
    country?: CountryCode,
  ): Promise<Map<string, { activated: number; converted: number }>> {
    const i = schema.invitations;
    const rows = await this.db
      .select({
        month: i.quotaMonth,
        activated: sql<number>`COUNT(*)`,
        converted: sql<number>`COUNT(${i.convertedAt})`,
      })
      .from(i)
      .innerJoin(
        schema.branches,
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, i.branchId),
        ),
      )
      .where(
        and(
          tenantWhere(i, ctx),
          eq(i.status, "active"),
          gte(i.quotaMonth, from),
          lte(i.quotaMonth, to),
          country ? eq(schema.branches.country, country) : undefined,
        ),
      )
      .groupBy(i.quotaMonth);
    return new Map(
      rows.map((row) => [
        row.month,
        { activated: Number(row.activated), converted: Number(row.converted) },
      ]),
    );
  }

  /**
   * Invitados DISTINTOS con invitación activa y cobertura de membresía hoy (no
   * acotado al rango: es un total). Batch: una query de ids + una de coberturas.
   */
  private async countActiveInvitees(
    ctx: TenantContext,
    country?: CountryCode,
  ): Promise<number> {
    const i = schema.invitations;
    const rows = await this.db
      .selectDistinct({ userId: i.invitedUserId })
      .from(i)
      .innerJoin(
        schema.branches,
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, i.branchId),
        ),
      )
      .where(
        and(
          tenantWhere(i, ctx),
          eq(i.status, "active"),
          country ? eq(schema.branches.country, country) : undefined,
        ),
      );
    const covered = await deriveMembershipCoveredUntilBatch(
      this.db,
      rows.map((row) => row.userId),
      ctx,
    );
    const today = todayInTz(REPORT_TIMEZONE);
    let active = 0;
    for (const coveredUntil of covered.values()) {
      if (coveredUntil !== null && coveredUntil >= today) active++;
    }
    return active;
  }

  /**
   * Descuentos del programa por mes y moneda: `SUM(referral_credits.amount)` unido a
   * la sub del cobro para saber la moneda. El mes es el de `referral_credits.created_at`
   * (cuándo se aplicó el descuento).
   */
  private async loadDiscounts(
    ctx: TenantContext,
    from: string,
    to: string,
    country?: CountryCode,
  ): Promise<InvitationReportDiscount[]> {
    // El formato va como SQL literal: el mismo texto en SELECT y GROUP BY (con un
    // parámetro, MySQL no puede probar que las dos expresiones son la misma).
    /* tenant-safe: fragmento de expresión (mes del crédito) que solo viaja dentro
       de la query de abajo, que acota referral_credits con tenantWhere. */
    const monthExpr = sql<string>`DATE_FORMAT(${schema.referralCredits.createdAt}, '%Y-%m')`;
    const rows = await this.db
      .select({
        month: monthExpr,
        currency: schema.subscriptions.currency,
        amount: sql<number>`SUM(${schema.referralCredits.amount})`,
        credits: sql<number>`COUNT(*)`,
      })
      .from(schema.referralCredits)
      .innerJoin(
        schema.subscriptions,
        and(
          tenantWhere(schema.subscriptions, ctx),
          eq(schema.subscriptions.id, schema.referralCredits.subscriptionId),
        ),
      )
      .innerJoin(
        schema.branches,
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.branches.id, schema.subscriptions.branchId),
        ),
      )
      .where(
        and(
          tenantWhere(schema.referralCredits, ctx),
          // Constantes 'YYYY-MM-DD': MySQL las interpreta en la misma zona de sesión
          // que el DATE_FORMAT de arriba (un `Date` de JS viajaría en la del proceso).
          sql`${schema.referralCredits.createdAt} >= ${`${from}-01`}`,
          sql`${schema.referralCredits.createdAt} < ${nextMonthStart(to)}`,
          country ? eq(schema.branches.country, country) : undefined,
        ),
      )
      .groupBy(monthExpr, schema.subscriptions.currency)
      .orderBy(asc(monthExpr), asc(schema.subscriptions.currency));
    return rows.map((row) => ({
      month: row.month,
      currency: row.currency,
      amount: Number(row.amount),
      credits: Number(row.credits),
    }));
  }
}
