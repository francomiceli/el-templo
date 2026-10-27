// Módulo: reports — reporte Wellhub por sede y mes (Fase 204: D-16, D-22, D-13, D-19)
//
// UN solo reporte, para el staff de gestión/admin/owner, con cuatro ítems:
//   1. visitas VALIDADAS por Wellhub (`attendance_source = 'wellhub'`): lo que pasó por
//      su app y se controla contra la liquidación de Wellhub;
//   2. presentes A MANO (`attendance_source = 'wellhub_manual'`, D-19): visitas que el
//      staff marcó y que Wellhub no ve ni paga. NO suman al ítem 1;
//   3. personas y frecuencia: únicas, nuevos / ex-alumnos / socios, visitas por persona
//      y el listado por persona;
//   4. reservas (confirmadas / canceladas / canceladas tarde / rechazadas), no-shows y
//      conversiones a socio (fecha + plan) con la tasa Wellhub → socio (D-22).
//
// AISLAMIENTO: `tenant_id = ctx.tenantId` en CADA tabla de CADA statement (SQL crudo
// con el gimnasio inline; el `ctx` sale del servidor, nunca del querystring).
//
// MES: `YYYY-MM` y los límites del mes se cortan con las fechas LOCALES guardadas
// (`attendance.session_date`, `bookings.booking_date`, `wellhub_slots.session_date`,
// `wellhub_conversions.local_date`), nunca con `DATE_FORMAT` de un timestamp UTC: una
// visita del último día del mes en la tz de la sede cae en ese mes aunque en UTC ya
// sea el día 1 del siguiente.
//
// ALCANCE: igual que el log de accesos. `branchId` acota a una sede; sin `branchId`,
// un admin_sede queda acotado a sus sedes (`branchIds`) y un rol de país a las sedes de
// su país (`country`); el owner ve todo el gimnasio.
//
// CLASIFICACIÓN DE PERSONAS (A5, elección del planner):
//   - `socio`     si alguna de sus visitas Wellhub del mes estaba cubierta por una
//                 suscripción de plan REAL (no `is_trial`) vigente ese día;
//   - `ex_alumno` si no, y tuvo alguna suscripción de plan real que arrancó ANTES de
//                 su primera visita Wellhub del mes;
//   - `nuevo`     en cualquier otro caso (incluye al que se asoció después de visitar).
//
// TASA (D-22): conversiones del mes ÷ personas únicas Wellhub del mes, en % redondeado.
// Son dos conjuntos con la misma ventana (no una cohorte): alcanza para seguir el pulso
// mensual. `kind = 'otro'` de una conversión (freemium/prueba → activo con actividad
// Wellhub, ver `conversion.ts`) se informa tal cual: cuenta en la tasa y en la lista y
// la pantalla lo muestra como su propia etiqueta, sin forzarlo a nuevo ni ex-alumno.
import type { MySql2Database } from "drizzle-orm/mysql2";
import { sql, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import {
  DEFAULT_TENANT_TIMEZONE,
  shiftMonth,
  todayInTz,
} from "../shared/date-utils";
import { BadRequestError } from "../shared/errors";
import { notTrialPlanSql } from "../shared/membership";
import type { CountryCode } from "../shared/country-scope";
import type { TenantContext } from "../shared/tenant";
import {
  isWellhubAttendanceRawSql,
  isWellhubBookingRawSql,
} from "../shared/wellhub-sources";

type DbInstance = MySql2Database<typeof schema>;

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export type WellhubPersonKind = "nuevo" | "ex_alumno" | "socio";

export interface WellhubReportParams {
  /** 'YYYY-MM'. Default: el mes actual. */
  month?: string;
  /** Una sede. Sin esto, se acota por `branchIds` / `country` del actor. */
  branchId?: number;
  /** Sedes a las que el actor está acotado (admin_sede). */
  branchIds?: number[];
  /** Solo para roles de alcance por país. */
  country?: CountryCode | null;
}

export interface WellhubReportPerson {
  userId: number;
  name: string;
  kind: WellhubPersonKind;
  validatedVisits: number;
  manualVisits: number;
}

export interface WellhubReportConversion {
  userId: number;
  name: string;
  kind: string;
  planName: string;
  localDate: string;
  branchName: string;
}

export interface WellhubReport {
  month: string;
  branchId: number | null;
  validatedVisits: number;
  manualVisits: number;
  people: {
    unique: number;
    nuevos: number;
    exAlumnos: number;
    socios: number;
    visitsPerPerson: number;
  };
  peopleList: WellhubReportPerson[];
  bookings: {
    confirmed: number;
    canceled: number;
    lateCanceled: number;
    rejected: number;
    noShows: number;
  };
  conversions: {
    count: number;
    ratePct: number;
    items: WellhubReportConversion[];
  };
}

/** Primer día del mes siguiente a `month` ('YYYY-MM' -> 'YYYY-MM-01'). */
function nextMonthStart(month: string): string {
  return `${shiftMonth(month, 1)}-01`;
}

/** Resultado de `db.execute` de drizzle-mysql2: `[filas, metadatos]`. */
function rowsOf<T>(res: unknown): T[] {
  return (res as [T[]])[0] ?? [];
}

function fullName(first: string | null, last: string | null): string {
  return `${first ?? ""} ${last ?? ""}`.trim();
}

interface PersonVisitRow {
  userId: number;
  firstName: string | null;
  lastName: string | null;
  validated: number | string;
  manual: number | string;
}

interface UserIdRow {
  userId: number;
}

interface BookingStatusRow {
  status: string;
  total: number | string;
}

interface ConversionRow {
  userId: number;
  firstName: string | null;
  lastName: string | null;
  kind: string;
  planName: string;
  localDate: string;
  branchName: string;
}

export class WellhubReportService {
  constructor(
    private readonly db: DbInstance,
    private readonly log: FastifyBaseLogger,
  ) {}

  /** Reporte D-16 del gimnasio de `ctx` para un mes (y una sede, opcional). */
  async getReport(
    ctx: TenantContext,
    params: WellhubReportParams = {},
  ): Promise<WellhubReport> {
    const month = this.resolveMonth(params.month);
    const from = `${month}-01`;
    const to = nextMonthStart(month);
    const branchId = params.branchId ?? null;

    // Items 1, 2 y 3: una fila por persona con sus visitas del mes.
    const visitRows = await this.loadPersonVisits(ctx, params, from, to);
    const socioIds = await this.loadSocioIds(ctx, params, from, to);
    const exAlumnoIds = await this.loadExAlumnoIds(ctx, params, from, to);

    const peopleList: WellhubReportPerson[] = visitRows.map((row) => {
      const userId = Number(row.userId);
      const kind: WellhubPersonKind = socioIds.has(userId)
        ? "socio"
        : exAlumnoIds.has(userId)
          ? "ex_alumno"
          : "nuevo";
      return {
        userId,
        name: fullName(row.firstName, row.lastName),
        kind,
        validatedVisits: Number(row.validated),
        manualVisits: Number(row.manual),
      };
    });
    peopleList.sort(
      (a, b) =>
        b.validatedVisits +
          b.manualVisits -
          (a.validatedVisits + a.manualVisits) ||
        a.name.localeCompare(b.name, "es"),
    );

    const validatedVisits = peopleList.reduce(
      (sum, p) => sum + p.validatedVisits,
      0,
    );
    const manualVisits = peopleList.reduce(
      (sum, p) => sum + p.manualVisits,
      0,
    );
    const unique = peopleList.length;

    const bookings = await this.loadBookings(ctx, params, from, to);
    const conversionItems = await this.loadConversions(ctx, params, from, to);

    this.log.debug(
      { month, branchId, unique, conversions: conversionItems.length },
      "Reporte Wellhub generado",
    );

    return {
      month,
      branchId,
      validatedVisits,
      manualVisits,
      people: {
        unique,
        nuevos: peopleList.filter((p) => p.kind === "nuevo").length,
        exAlumnos: peopleList.filter((p) => p.kind === "ex_alumno").length,
        socios: peopleList.filter((p) => p.kind === "socio").length,
        visitsPerPerson:
          unique === 0
            ? 0
            : Math.round(((validatedVisits + manualVisits) / unique) * 10) / 10,
      },
      peopleList,
      bookings,
      conversions: {
        count: conversionItems.length,
        ratePct:
          unique > 0 ? Math.round((conversionItems.length / unique) * 100) : 0,
        items: conversionItems,
      },
    };
  }

  /** Mes pedido (validado) o el actual. T-204-36: el querystring ya trae el patrón. */
  private resolveMonth(month: string | undefined): string {
    if (month === undefined) {
      return todayInTz(DEFAULT_TENANT_TIMEZONE).slice(0, 7);
    }
    if (!MONTH_PATTERN.test(month)) {
      throw new BadRequestError("Mes inválido, usá AAAA-MM");
    }
    return month;
  }

  /**
   * Filtro de alcance sobre la columna de sede indicada (unión cerrada, nunca texto
   * del cliente) y sobre `br.country`: toda query que lo usa une `branches br`.
   */
  private scopeSql(
    params: WellhubReportParams,
    branchColumn: "a.branch_id" | "sc.branch_id" | "c.branch_id",
  ): SQL {
    const col = sql.raw(branchColumn);
    const parts: SQL[] = [];
    if (params.branchId !== undefined) {
      parts.push(sql` AND ${col} = ${params.branchId}`);
    } else if (params.branchIds !== undefined) {
      // Array vacío = actor sin sedes: no ve nada (nunca "todas").
      parts.push(
        params.branchIds.length === 0
          ? sql` AND 1 = 0`
          : sql` AND ${col} IN (${sql.join(
              params.branchIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
      );
    }
    if (params.country) {
      parts.push(sql` AND br.country = ${params.country}`);
    }
    return sql.join(parts, sql``);
  }

  /** Visitas Wellhub del mes por persona (ítems 1, 2 y base del 3). */
  private async loadPersonVisits(
    ctx: TenantContext,
    params: WellhubReportParams,
    from: string,
    to: string,
  ): Promise<PersonVisitRow[]> {
    const res = await this.db.execute(sql`
      SELECT a.member_id AS userId,
             u.first_name AS firstName,
             u.last_name AS lastName,
             SUM(CASE WHEN a.attendance_source = 'wellhub' THEN 1 ELSE 0 END) AS validated,
             SUM(CASE WHEN a.attendance_source = 'wellhub_manual' THEN 1 ELSE 0 END) AS manual
      FROM attendance a
      JOIN branches br ON br.id = a.branch_id AND br.tenant_id = ${ctx.tenantId}
      JOIN users u ON u.id = a.member_id AND u.tenant_id = ${ctx.tenantId}
      WHERE a.tenant_id = ${ctx.tenantId}
        AND a.session_date >= ${from}
        AND a.session_date < ${to}
        AND ${isWellhubAttendanceRawSql("a")}
        ${this.scopeSql(params, "a.branch_id")}
      GROUP BY a.member_id, u.first_name, u.last_name
    `);
    return rowsOf<PersonVisitRow>(res);
  }

  /** Personas con alguna visita del mes cubierta por una membresía real (socios). */
  private async loadSocioIds(
    ctx: TenantContext,
    params: WellhubReportParams,
    from: string,
    to: string,
  ): Promise<Set<number>> {
    const res = await this.db.execute(sql`
      SELECT DISTINCT a.member_id AS userId
      FROM attendance a
      JOIN branches br ON br.id = a.branch_id AND br.tenant_id = ${ctx.tenantId}
      JOIN subscriptions s
        ON s.tenant_id = ${ctx.tenantId}
       AND s.user_id = a.member_id
       AND s.subscription_status IN ('active','paused','expired','completed','changed')
       AND s.start_date <= a.session_date
       AND (s.end_date IS NULL OR s.end_date >= a.session_date)
       AND ${notTrialPlanSql("s")}
      WHERE a.tenant_id = ${ctx.tenantId}
        AND a.session_date >= ${from}
        AND a.session_date < ${to}
        AND ${isWellhubAttendanceRawSql("a")}
        ${this.scopeSql(params, "a.branch_id")}
    `);
    return new Set(rowsOf<UserIdRow>(res).map((r) => Number(r.userId)));
  }

  /** Personas con una membresía real que arrancó antes de su primera visita del mes. */
  private async loadExAlumnoIds(
    ctx: TenantContext,
    params: WellhubReportParams,
    from: string,
    to: string,
  ): Promise<Set<number>> {
    const res = await this.db.execute(sql`
      SELECT DISTINCT f.member_id AS userId
      FROM (
        SELECT a.member_id AS member_id, MIN(a.session_date) AS first_date
        FROM attendance a
        JOIN branches br ON br.id = a.branch_id AND br.tenant_id = ${ctx.tenantId}
        WHERE a.tenant_id = ${ctx.tenantId}
          AND a.session_date >= ${from}
          AND a.session_date < ${to}
          AND ${isWellhubAttendanceRawSql("a")}
          ${this.scopeSql(params, "a.branch_id")}
        GROUP BY a.member_id
      ) f
      JOIN subscriptions s
        ON s.tenant_id = ${ctx.tenantId}
       AND s.user_id = f.member_id
       AND s.subscription_status <> 'scheduled'
       AND s.start_date < f.first_date
       AND ${notTrialPlanSql("s")}
    `);
    return new Set(rowsOf<UserIdRow>(res).map((r) => Number(r.userId)));
  }

  /** Ítem 4: solicitudes de reserva por estado + no-shows Wellhub del mes. */
  private async loadBookings(
    ctx: TenantContext,
    params: WellhubReportParams,
    from: string,
    to: string,
  ): Promise<WellhubReport["bookings"]> {
    const statusRes = await this.db.execute(sql`
      SELECT wb.status AS status, COUNT(*) AS total
      FROM wellhub_bookings wb
      JOIN wellhub_slots ws
        ON ws.id = wb.wellhub_slot_row_id AND ws.tenant_id = ${ctx.tenantId}
      JOIN schedules sc
        ON sc.id = ws.schedule_id AND sc.tenant_id = ${ctx.tenantId}
      JOIN branches br ON br.id = sc.branch_id AND br.tenant_id = ${ctx.tenantId}
      WHERE wb.tenant_id = ${ctx.tenantId}
        AND ws.session_date >= ${from}
        AND ws.session_date < ${to}
        AND wb.status IN ('confirmed','canceled','late_canceled','rejected')
        ${this.scopeSql(params, "sc.branch_id")}
      GROUP BY wb.status
    `);
    const byStatus = new Map<string, number>();
    for (const row of rowsOf<BookingStatusRow>(statusRes)) {
      byStatus.set(row.status, Number(row.total));
    }

    const noShowRes = await this.db.execute(sql`
      SELECT COUNT(*) AS total
      FROM bookings b
      JOIN schedules sc
        ON sc.id = b.schedule_id AND sc.tenant_id = ${ctx.tenantId}
      JOIN branches br ON br.id = sc.branch_id AND br.tenant_id = ${ctx.tenantId}
      WHERE b.tenant_id = ${ctx.tenantId}
        AND ${isWellhubBookingRawSql("b")}
        AND b.booking_status = 'no_show'
        AND b.booking_date >= ${from}
        AND b.booking_date < ${to}
        ${this.scopeSql(params, "sc.branch_id")}
    `);
    const noShows = Number(
      rowsOf<{ total: number | string }>(noShowRes)[0]?.total ?? 0,
    );

    return {
      confirmed: byStatus.get("confirmed") ?? 0,
      canceled: byStatus.get("canceled") ?? 0,
      lateCanceled: byStatus.get("late_canceled") ?? 0,
      rejected: byStatus.get("rejected") ?? 0,
      noShows,
    };
  }

  /** Ítem 4: conversiones a socio del mes, con plan, fecha local y sede. */
  private async loadConversions(
    ctx: TenantContext,
    params: WellhubReportParams,
    from: string,
    to: string,
  ): Promise<WellhubReportConversion[]> {
    const res = await this.db.execute(sql`
      SELECT c.user_id AS userId,
             u.first_name AS firstName,
             u.last_name AS lastName,
             c.kind AS kind,
             p.name AS planName,
             c.local_date AS localDate,
             br.name AS branchName
      FROM wellhub_conversions c
      JOIN branches br ON br.id = c.branch_id AND br.tenant_id = ${ctx.tenantId}
      JOIN users u ON u.id = c.user_id AND u.tenant_id = ${ctx.tenantId}
      JOIN subscription_plans p ON p.id = c.plan_id AND p.tenant_id = ${ctx.tenantId}
      WHERE c.tenant_id = ${ctx.tenantId}
        AND c.local_date >= ${from}
        AND c.local_date < ${to}
        ${this.scopeSql(params, "c.branch_id")}
      ORDER BY c.local_date ASC, c.id ASC
    `);
    return rowsOf<ConversionRow>(res).map((row) => ({
      userId: Number(row.userId),
      name: fullName(row.firstName, row.lastName),
      kind: row.kind,
      planName: row.planName,
      localDate: row.localDate,
      branchName: row.branchName,
    }));
  }
}
