/**
 * Reports Service
 *
 * Query methods for access log, charge history, expiring memberships,
 * and inactive members reports. All data is read-only.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, gt, sql, isNull, isNotNull, type SQL } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { firmMoneySqlFor } from "../finance/firm-money";
import { buildMemberNameSearchCondition } from "../shared/member-search";
import { activeMemberExists } from "../shared/active-member";
import { ForbiddenError, NotFoundError } from "../shared/errors";
import type {
  AccessReportFilters,
  AccessReportRow,
  BucketTotals,
  ChargeReportFilters,
  ChargeReportRow,
  DebtBucket,
  DebtManagementUpdateInput,
  DebtManagementView,
  ExpiredMemberRow,
  ExpiredMembersFilters,
  ExpiredMembersResult,
  ExpiringReportFilters,
  ExpiringReportRow,
  InactiveReportFilters,
  InactiveReportRow,
  OutstandingBalanceRow,
  OutstandingBalancesFilters,
  OutstandingBalancesResult,
  PaginatedResult,
  TrialConversionFilters,
  TrialConversionReport,
  TrialSessionsFilters,
  TrialSessionsReport,
  TrialSessionsRow,
} from "./types";

const DAY_LABELS: Record<number, string> = {
  1: "Lun",
  2: "Mar",
  3: "Mie",
  4: "Jue",
  5: "Vie",
  6: "Sab",
};

/**
 * Median of a pre-sorted numeric array. Returns null for empty input.
 * Used by the trial-conversion report for days-to-convert.
 */
function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

// =============================================================================
// CAJA-03 — Outstanding balances (Deudas) helpers
// =============================================================================

const MS_PER_DAY_OB = 1000 * 60 * 60 * 24;

const MONTHS_ES_OB = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/**
 * ageInDays = días transcurridos desde una fecha `YYYY-MM-DD`, clamp en 0 si es
 * futura. Computado en JS — no vía SQL DATEDIFF — para que el clamp sea portable
 * y no derive con el timezone de la sesión de DB.
 *
 * La fecha de referencia es la de CREACIÓN de la deuda (`balances.createdAt`),
 * no el devengo del plan (`subscriptions.startDate`): un plan `scheduled` a
 * futuro tiene devengo por delante y clampearía a 0, ocultando una deuda que ya
 * lleva días viva. Ver {@link debtCreationDateOB}.
 */
function computeAgeInDaysOB(referenceDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eff = new Date(referenceDate + "T00:00:00");
  const diffMs = today.getTime() - eff.getTime();
  return Math.max(0, Math.floor(diffMs / MS_PER_DAY_OB));
}

/**
 * Porción fecha (`YYYY-MM-DD`) de `balances.createdAt` — la fecha de creación
 * real de la deuda, base de la antigüedad del Reporte Deudas.
 */
function debtCreationDateOB(balanceCreatedAt: Date | string): string {
  const created =
    balanceCreatedAt instanceof Date
      ? balanceCreatedAt
      : new Date(balanceCreatedAt);
  return created.toISOString().slice(0, 10);
}

/** D-05 bucket boundaries (closed intervals). */
function computeBucketOB(ageInDays: number): DebtBucket {
  if (ageInDays <= 5) return "0-5";
  if (ageInDays <= 10) return "6-10";
  if (ageInDays <= 15) return "11-15";
  return "15+";
}

function emptyBucketTotals(): BucketTotals {
  return { "0-5": 0, "6-10": 0, "11-15": 0, "15+": 0 };
}

// =============================================================================
// Trial Sessions Report (Phase 114-05) — pure helpers
// =============================================================================

const MS_PER_DAY_TS = 1000 * 60 * 60 * 24;

/** Trim and join two nullable name parts with a single space. */
function trimJoin(a: string | null, b: string | null): string {
  return `${a ?? ""} ${b ?? ""}`.trim();
}

/** Today as ISO YYYY-MM-DD (UTC day boundary). */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Normalize a DB date column value (string or Date) to ISO YYYY-MM-DD. */
function normalizeISODate(v: string | Date): string {
  if (typeof v === "string") return v.slice(0, 10);
  return v.toISOString().slice(0, 10);
}

/** floor((b - a) / 1day) for two ISO YYYY-MM-DD strings (UTC day). */
function daysBetweenISO(a: string, b: string): number {
  const aMs = new Date(a + "T00:00:00Z").getTime();
  const bMs = new Date(b + "T00:00:00Z").getTime();
  return Math.floor((bMs - aMs) / MS_PER_DAY_TS);
}

/**
 * D-14 — ISO week range Monday..Sunday for a YYYY-MM-DD date.
 * Returned as "YYYY-MM-DD --- YYYY-MM-DD". Manual UTC arithmetic — no
 * date-fns (per CLAUDE.md / user memory: never install deps without asking).
 */
function isoWeekRange(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  // Map to ISO Mon=1..Sun=7. Offset to Monday: (dow === 0 ? -6 : 1 - dow).
  const offsetToMon = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d.getTime() + offsetToMon * MS_PER_DAY_TS);
  const sunday = new Date(monday.getTime() + 6 * MS_PER_DAY_TS);
  return `${monday.toISOString().slice(0, 10)} --- ${sunday.toISOString().slice(0, 10)}`;
}

/** RFC 4180 CSV escape: wrap fields with `,`, `"`, CR, or LF in quotes; double quotes. */
function csvEscape(s: string): string {
  if (
    s.includes(",") ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r")
  ) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** D-05 — DD/MM/YYYY from a YYYY-MM-DD ISO string. */
function isoToDDMMYYYY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Spanish display label for the D-09 effective lead status. */
function leadStatusLabelES(s: "en_seguimiento" | "ganado" | "perdido"): string {
  if (s === "en_seguimiento") return "En seguimiento";
  if (s === "ganado") return "Ganado";
  return "Perdido";
}

/** Date portion (ISO YYYY-MM-DD) of a Date | string timestamp column value. */
function isoDatePortionOB(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}

/**
 * D-05/D-06 + Phase 153 (DEUDA-01/02/03): derive every computed field of an
 * outstanding-balances row from existing data (no migration). Single source of
 * truth shared by getOutstandingBalances, its bucketTotals scan and
 * exportOutstandingBalances so the JSON listing and the Excel export never
 * drift.
 *
 * Returned superset (the historical `{ effectiveDate, conceptLabel }` is kept
 * so pre-153 call sites — the bucketTotals scans — keep working unchanged):
 * - effectiveDate: subscription rows → subscriptions.startDate; debt_balance /
 *   orphaned rows → balances.createdAt (date portion). Drives aging.
 * - conceptLabel: legacy "Mensualidad <Mes> <Año> — <PlanName>" /
 *   "Saldo a regularizar" wording (unchanged; still rendered by old consumers).
 * - reasonLabel (DEUDA-02): "Cuota <PlanName>" for subscription debts;
 *   "Sin plan"/"Otro" derived from the origin advance_payment miscReason for
 *   cobros sueltos; "Saldo a regularizar" for orphaned debt_balance rows.
 * - periodStart/periodEnd (DEUDA-03): subscription cycle range; null for
 *   debt_balance rows.
 * - registeredAt (DEUDA-01): balances.createdAt date portion, for EVERY row.
 * - notes (D-11): free-text note of the origin transaction (debt_balance with
 *   origin only); null otherwise.
 *
 * `subscriptionEndDate`, `miscReason` and `transactionNotes` are optional so
 * the bucketTotals scans (which only need effectiveDate) can call this without
 * projecting the extra columns.
 */
function deriveEffectiveDateAndLabelOB(input: {
  targetKind: "subscription" | "debt_balance";
  targetId: number;
  subscriptionStartDate: string | null;
  planName: string | null;
  balanceCreatedAt: Date | string;
  subscriptionEndDate?: string | null;
  miscReason?: string | null;
  transactionNotes?: string | null;
}): {
  effectiveDate: string;
  conceptLabel: string;
  reasonLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  registeredAt: string;
  notes: string | null;
} {
  // DEUDA-01: registration date = balances.createdAt, independent of origin.
  const registeredAt = isoDatePortionOB(input.balanceCreatedAt);

  if (
    input.targetKind === "subscription" &&
    input.subscriptionStartDate !== null
  ) {
    const effectiveDate = input.subscriptionStartDate;
    const d = new Date(effectiveDate + "T00:00:00");
    const month = MONTHS_ES_OB[d.getMonth()] ?? "";
    const year = d.getFullYear();
    const conceptLabel = `Mensualidad ${month} ${year} — ${input.planName ?? "Plan"}`;
    // DEUDA-02: "Cuota <PlanName>" (fallback "Cuota" when the plan name is
    // missing). DEUDA-03: cycle range = subscription start/end (end may be null).
    const reasonLabel = input.planName ? `Cuota ${input.planName}` : "Cuota";
    return {
      effectiveDate,
      conceptLabel,
      reasonLabel,
      periodStart: input.subscriptionStartDate,
      periodEnd: input.subscriptionEndDate ?? null,
      registeredAt,
      notes: null,
    };
  }

  // debt_balance (cobro suelto) or orphaned subscription row.
  const effectiveDate = registeredAt;
  const miscReason = input.miscReason ?? null;
  // DEUDA-02: derive the motivo from the origin advance_payment miscReason.
  let reasonLabel: string;
  let notes: string | null;
  if (miscReason === "sin_plan") {
    reasonLabel = "Sin plan";
    notes = input.transactionNotes ?? null;
  } else if (miscReason === "otro") {
    reasonLabel = "Otro";
    notes = input.transactionNotes ?? null;
  } else {
    // No resolvable origin transaction (orphaned data): keep the legacy wording.
    reasonLabel = "Saldo a regularizar";
    notes = null;
  }
  return {
    effectiveDate,
    conceptLabel: "Saldo a regularizar",
    reasonLabel,
    periodStart: null,
    periodEnd: null,
    registeredAt,
    notes,
  };
}

export class ReportsService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  // ─── Access Log ───────────────────────────────────────────────────────────

  async getAccessLog(
    filters: AccessReportFilters,
  ): Promise<PaginatedResult<AccessReportRow>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = this.buildAccessConditions(filters);

    // Count total
    // NOTE: join on branches already present; buildAccessConditions may emit
    // `branches.country = ?` so the join must remain on both count + select.
    const [countResult] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.attendance)
      .innerJoin(schema.users, eq(schema.users.id, schema.attendance.memberId))
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.attendance.branchId),
      )
      .where(and(...conditions));

    const total = Number(countResult?.count ?? 0);

    // Fetch rows with joins
    const rows = await this.db
      .select({
        id: schema.attendance.id,
        checkedInAt: schema.attendance.checkedInAt,
        memberFirstName: schema.users.firstName,
        memberLastName: schema.users.lastName,
        memberId: schema.attendance.memberId,
        branchName: schema.branches.name,
        source: schema.attendance.source,
        scheduleId: schema.attendance.scheduleId,
      })
      .from(schema.attendance)
      .innerJoin(schema.users, eq(schema.users.id, schema.attendance.memberId))
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.attendance.branchId),
      )
      .where(and(...conditions))
      .orderBy(sql`${schema.attendance.checkedInAt} DESC`)
      .limit(limit)
      .offset(offset);

    // Gather schedule IDs that need slot info
    const scheduleIds = rows
      .map((r) => r.scheduleId)
      .filter((id): id is number => id !== null);

    const scheduleMap = new Map<number, string>();
    if (scheduleIds.length > 0) {
      const uniqueIds = [...new Set(scheduleIds)];
      const scheduleRows = await this.db
        .select({
          id: schema.schedules.id,
          dayOfWeek: schema.schedules.dayOfWeek,
          startTime: schema.schedules.startTime,
          activityName: schema.activities.name,
        })
        .from(schema.schedules)
        .innerJoin(
          schema.activities,
          eq(schema.activities.id, schema.schedules.activityId),
        )
        .where(
          sql`${schema.schedules.id} IN (${sql.join(
            uniqueIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );

      for (const s of scheduleRows) {
        const dayLabel = DAY_LABELS[s.dayOfWeek] ?? `D${s.dayOfWeek}`;
        scheduleMap.set(s.id, `${dayLabel} ${s.startTime} - ${s.activityName}`);
      }
    }

    const mappedRows: AccessReportRow[] = rows.map((r) => ({
      id: r.id,
      checkedInAt: r.checkedInAt.toISOString(),
      memberName: `${r.memberFirstName ?? ""} ${r.memberLastName ?? ""}`.trim(),
      memberId: r.memberId,
      branchName: r.branchName,
      source: r.source as "qr" | "manual",
      scheduleSlot: r.scheduleId
        ? (scheduleMap.get(r.scheduleId) ?? null)
        : null,
    }));

    return { rows: mappedRows, total, page, limit };
  }

  // ─── Charge History ───────────────────────────────────────────────────────

  async getChargeHistory(
    filters: ChargeReportFilters,
  ): Promise<PaginatedResult<ChargeReportRow>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const memberAlias = schema.users;

    const conditions = this.buildChargeConditions(filters);

    // Count total — join branches so country filter in buildChargeConditions
    // resolves without reference errors. Phase 105 D-01: revenue rows are
    // financial_transactions with kind IN ('plan_charge','debt_settlement')
    // AND direction='inflow' AND voided_at IS NULL. The transaction_links join
    // is required because financial_transactions has no subscription_id column
    // (links go through the pivot, see SPEC §2).
    const [countResult] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.financialTransactions)
      .innerJoin(
        schema.transactionLinks,
        and(
          eq(
            schema.transactionLinks.transactionId,
            schema.financialTransactions.id,
          ),
          eq(schema.transactionLinks.targetKind, "subscription"),
        ),
      )
      .innerJoin(
        schema.subscriptions,
        eq(schema.subscriptions.id, schema.transactionLinks.targetId),
      )
      .innerJoin(
        memberAlias,
        eq(memberAlias.id, schema.financialTransactions.memberId),
      )
      .innerJoin(schema.branches, eq(schema.branches.id, memberAlias.branchId))
      .where(and(...conditions));

    const total = Number(countResult?.count ?? 0);

    // Fetch rows — use raw SQL for recorder self-join since drizzle doesn't support
    // multiple aliases on the same table easily. Alias `branches b` so the raw
    // `b.country = ?` predicate from buildChargeConditionsRaw resolves.
    // Column alias `paymentDate` preserved (sourced from ft.transaction_date)
    // so the ChargeReportRow mapper at L204+ stays unchanged.
    const rows = await this.db.execute(sql`
      SELECT
        ft.id,
        ft.transaction_date AS paymentDate,
        CONCAT(COALESCE(m.first_name, ''), ' ', COALESCE(m.last_name, '')) AS memberName,
        ft.member_id AS memberId,
        sp.name AS planName,
        ft.amount,
        ft.currency,
        ft.payment_method AS paymentMethod,
        CONCAT(COALESCE(r.first_name, ''), ' ', COALESCE(r.last_name, '')) AS recorderName,
        ft.voided_at AS voidedAt
      FROM financial_transactions ft
      INNER JOIN transaction_links tl
        ON tl.transaction_id = ft.id AND tl.target_kind = 'subscription'
      INNER JOIN subscriptions s ON s.id = tl.target_id
      INNER JOIN users m ON m.id = ft.member_id
      INNER JOIN branches b ON b.id = m.branch_id
      INNER JOIN subscription_plans sp ON sp.id = s.plan_id
      INNER JOIN users r ON r.id = ft.recorded_by
      WHERE ft.kind IN ('plan_charge', 'debt_settlement')
        AND ft.direction = 'inflow'
        AND ${sql.raw(firmMoneySqlFor("ft"))}
        AND ${this.buildChargeConditionsRaw(filters)}
      ORDER BY ft.transaction_date DESC, ft.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const resultRows = (rows as unknown as [Array<Record<string, unknown>>])[0];

    const mappedRows: ChargeReportRow[] = (resultRows ?? []).map(
      (r: Record<string, unknown>) => ({
        id: Number(r.id),
        paymentDate: String(r.paymentDate),
        memberName: String(r.memberName).trim(),
        memberId: Number(r.memberId),
        planName: String(r.planName),
        amount: Number(r.amount),
        currency: r.currency ? String(r.currency) : "ARS",
        paymentMethod: String(r.paymentMethod) as "cash" | "transfer" | "card",
        recorderName: String(r.recorderName).trim(),
        voidedAt: r.voidedAt ? String(r.voidedAt) : null,
      }),
    );

    return { rows: mappedRows, total, page, limit };
  }

  // ─── Expiring Memberships ────────────────────────────────────────────────

  async getExpiringMemberships(
    filters: ExpiringReportFilters,
  ): Promise<ExpiringReportRow[]> {
    const daysWindow = filters.daysWindow ?? 7;
    const includeExpired = filters.includeExpired ?? true;
    const includeRenewed = filters.includeRenewed ?? false;

    // Range mode: explicit [dateFrom, dateTo] on end_date. Falls back to the
    // legacy window (end_date <= today + daysWindow) when not provided.
    const useRange =
      filters.dateFrom !== undefined && filters.dateTo !== undefined;

    // In range mode we always consider expired-status subs too — the date
    // range itself is the time cut, so there's no separate "include expired"
    // switch. Legacy mode keeps the includeExpired behaviour.
    const statusValues =
      useRange || includeExpired
        ? ["active", "paused", "expired"]
        : ["active", "paused"];

    // "Future coverage" = the member already renewed. There exists ANOTHER
    // subscription of the SAME category group (presencial vs online) that is
    // still active/paused or scheduled and ends AFTER the expiring one. We
    // don't require contiguity (a small start gap still counts as renewed) and
    // we don't rely on previous_subscription_id — category + end_date is more
    // robust. Category grouping collapses online_regular/online_goal into one
    // "online" bucket, mirroring the dual-subscription rule (presencial and
    // online are independent; two of the same group are mutually exclusive).
    const coverageExists = sql`EXISTS (
      SELECT 1
      FROM ${schema.subscriptions} sub2
      JOIN ${schema.subscriptionPlans} sp2 ON sp2.id = sub2.plan_id
      WHERE sub2.user_id = ${schema.subscriptions.userId}
        AND sub2.id <> ${schema.subscriptions.id}
        AND sub2.subscription_status IN ('active', 'paused', 'scheduled')
        AND sub2.end_date IS NOT NULL
        AND sub2.end_date > ${schema.subscriptions.endDate}
        AND (sp2.plan_category = 'presencial') = (${schema.subscriptionPlans.planCategory} = 'presencial')
    )`;

    const conditions: ReturnType<typeof sql>[] = [
      sql`${schema.subscriptions.status} IN (${sql.join(
        statusValues.map((s) => sql`${s}`),
        sql`, `,
      )})`,
      sql`${schema.subscriptions.endDate} IS NOT NULL`,
    ];

    if (useRange) {
      conditions.push(
        sql`${schema.subscriptions.endDate} >= ${filters.dateFrom}`,
      );
      conditions.push(
        sql`${schema.subscriptions.endDate} <= ${filters.dateTo}`,
      );
    } else {
      conditions.push(
        sql`${schema.subscriptions.endDate} <= DATE_ADD(CURDATE(), INTERVAL ${daysWindow} DAY)`,
      );
      if (!includeExpired) {
        // Only show those not yet expired
        conditions.push(sql`${schema.subscriptions.endDate} >= CURDATE()`);
      }
    }

    if (!includeRenewed) {
      // Hide members who already renewed (have future same-category coverage).
      conditions.push(sql`NOT ${coverageExists}`);
    }

    if (filters.branchId !== undefined) {
      conditions.push(eq(schema.subscriptions.branchId, filters.branchId));
    }

    if (filters.country !== undefined) {
      conditions.push(eq(schema.branches.country, filters.country));
    }

    const rows = await this.db
      .select({
        userId: schema.subscriptions.userId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        branchId: schema.subscriptions.branchId,
        branchName: schema.branches.name,
        planName: schema.subscriptionPlans.name,
        endDate: schema.subscriptions.endDate,
        phone: schema.users.phone,
        currency: schema.subscriptions.currency,
        daysRemaining: sql<number>`DATEDIFF(${schema.subscriptions.endDate}, CURDATE())`,
        hasFutureCoverage: sql<number>`${coverageExists}`,
      })
      .from(schema.subscriptions)
      .innerJoin(schema.users, eq(schema.users.id, schema.subscriptions.userId))
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .where(and(...conditions))
      // Order by expiration urgency (oldest/closest end_date first). The sede
      // is no longer a sort key — the branch selector handles filtering. Name
      // is the tie-breaker so the order is stable within a given date.
      .orderBy(
        sql`DATEDIFF(${schema.subscriptions.endDate}, CURDATE()) ASC`,
        schema.users.firstName,
        schema.users.lastName,
      );

    return rows.map((r) => ({
      userId: r.userId,
      memberName: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
      branchId: r.branchId,
      branchName: r.branchName,
      planName: r.planName,
      endDate: r.endDate ?? "",
      daysRemaining: Number(r.daysRemaining),
      phone: r.phone,
      currency: r.currency ?? "ARS",
      hasFutureCoverage: Boolean(Number(r.hasFutureCoverage)),
    }));
  }

  // ─── Inactive Members ────────────────────────────────────────────────────

  async getInactiveMembers(
    filters: InactiveReportFilters,
  ): Promise<InactiveReportRow[]> {
    const daysThreshold = filters.daysThreshold ?? 14;

    const branchCondition =
      filters.branchId !== undefined
        ? sql`AND s.branch_id = ${filters.branchId}`
        : sql``;

    const countryCondition =
      filters.country !== undefined
        ? sql`AND b.country = ${filters.country}`
        : sql``;

    const rows = await this.db.execute(sql`
      SELECT
        s.user_id AS userId,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS memberName,
        sp.name AS planName,
        MAX(a.checked_in_at) AS lastCheckIn,
        u.phone,
        s.start_date AS startDate
      FROM subscriptions s
      INNER JOIN users u ON u.id = s.user_id
      INNER JOIN branches b ON b.id = s.branch_id
      INNER JOIN subscription_plans sp ON sp.id = s.plan_id
      LEFT JOIN attendance a ON a.member_id = s.user_id
      WHERE s.subscription_status IN ('active', 'paused')
        ${branchCondition}
        ${countryCondition}
      GROUP BY s.user_id, u.first_name, u.last_name, sp.name, u.phone, s.start_date
      HAVING lastCheckIn IS NULL
        OR DATEDIFF(CURDATE(), lastCheckIn) >= ${daysThreshold}
      ORDER BY
        CASE WHEN lastCheckIn IS NULL
          THEN DATEDIFF(CURDATE(), s.start_date)
          ELSE DATEDIFF(CURDATE(), lastCheckIn)
        END DESC
    `);

    const resultRows = (rows as unknown as [Array<Record<string, unknown>>])[0];

    return (resultRows ?? []).map((r: Record<string, unknown>) => {
      const lastCheckIn = r.lastCheckIn ? String(r.lastCheckIn) : null;
      const startDate = String(r.startDate);

      // Calculate daysSinceCheckIn
      let daysSinceCheckIn: number;
      if (lastCheckIn) {
        const checkInDate = new Date(lastCheckIn);
        const now = new Date();
        daysSinceCheckIn = Math.floor(
          (now.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24),
        );
      } else {
        const start = new Date(startDate);
        const now = new Date();
        daysSinceCheckIn = Math.floor(
          (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
        );
      }

      return {
        userId: Number(r.userId),
        memberName: String(r.memberName).trim(),
        planName: String(r.planName),
        lastCheckIn,
        daysSinceCheckIn,
        phone: r.phone ? String(r.phone) : null,
      };
    });
  }

  // ─── Outstanding Balances / Deudas (CAJA-03 — Phase 109-02) ──────────────

  /**
   * Phase 153 (DEUDA-02/D-11) — derived table resolving the origin
   * advance_payment transaction of each debt_balance. One row per debt_balance
   * targetId (GROUP BY) with txId = MIN(financial_transactions.id) = the
   * earliest (autoincrement) LIVE advance_payment linked to it. Grouping
   * guarantees a single row per targetId so the outer LEFT JOIN never
   * multiplies balance rows even when a debt_balance has multiple linked
   * advance_payments.
   *
   * WR-04: voided transactions are excluded (voided_at IS NULL). The "Corregir"
   * flow (phase 137/141) is void+recreate, so a corrected loose charge leaves
   * the debt_balance linked to BOTH the anulada (lower id) and the recreada
   * (higher id). Without this filter MIN(id) would always pick the anulada,
   * surfacing the stale motivo/nota (D-11 tooltip) instead of the live one.
   *
   * Shared by getOutstandingBalances + exportOutstandingBalances so the JSON
   * listing and the Excel export derive the same motivo/nota.
   */
  private buildDebtOriginTxSubquery() {
    return this.db
      .select({
        targetId: schema.transactionLinks.targetId,
        txId: sql<number>`MIN(${schema.financialTransactions.id})`.as("tx_id"),
      })
      .from(schema.transactionLinks)
      .innerJoin(
        schema.financialTransactions,
        and(
          eq(
            schema.financialTransactions.id,
            schema.transactionLinks.transactionId,
          ),
          eq(schema.financialTransactions.kind, "advance_payment"),
          isNull(schema.financialTransactions.voidedAt),
        ),
      )
      .where(eq(schema.transactionLinks.targetKind, "debt_balance"))
      .groupBy(schema.transactionLinks.targetId)
      .as("debt_origin_tx");
  }

  /**
   * Última asistencia por miembro (brief §2.3): MAX(attendance.checkedInAt)
   * agrupado por member_id, LEFT JOINed a cada fila de deuda. Backed por
   * idx_attendance_member_checked_in. La MISMA instancia debe usarse en el
   * join y en las conditions/orderBy que la referencian (alias compartido).
   */
  private buildLastAttendanceSubquery() {
    return this.db
      .select({
        memberId: schema.attendance.memberId,
        lastCheckinAt: sql<
          Date | string | null
        >`MAX(${schema.attendance.checkedInAt})`.as("last_checkin_at"),
      })
      .from(schema.attendance)
      .groupBy(schema.attendance.memberId)
      .as("last_attendance");
  }

  /**
   * Estado efectivo de gestión: una deuda sin fila en debt_management es
   * 'activa'. Compartido por conditions, statusTotals y projection.
   */
  private effectiveDebtStatusSQL(): SQL {
    return sql`COALESCE(${schema.debtManagement.status}, 'activa')`;
  }

  /**
   * Conditions del reporte Deudas SIN el corte por estado (brief §4): sucursal,
   * país, moneda, búsqueda, promesa de pago, rangos de fecha y asistencia.
   * El corte por estado se agrega aparte porque statusTotals (cobrable vs
   * incobrable) necesita el universo filtrado con TODOS los estados.
   */
  private buildOutstandingBaseConds(
    filters: OutstandingBalancesFilters,
    lastAtt: ReturnType<ReportsService["buildLastAttendanceSubquery"]>,
  ): SQL[] {
    const conds: SQL[] = [];

    if (filters.branchId !== undefined) {
      // Filter on subscriptions.branchId (LEFT JOIN). debt_balance rows have
      // no subscription, so they're implicitly excluded — documented (D-04).
      conds.push(eq(schema.subscriptions.branchId, filters.branchId));
    }
    if (filters.country !== undefined) {
      conds.push(eq(schema.branches.country, filters.country));
    }
    if (filters.currency !== undefined) {
      conds.push(eq(schema.balances.currency, filters.currency));
    }
    if (filters.search !== undefined && filters.search.trim().length > 0) {
      const searchCond = buildMemberNameSearchCondition(filters.search, {
        includeDni: false,
      });
      if (searchCond !== null) {
        conds.push(searchCond);
      }
    }

    // Promesa de pago (brief §4.3). 'sin' también matchea deudas nunca
    // gestionadas (LEFT JOIN → columna NULL). 'vencida' es la cola de trabajo
    // de cobranzas: prometió una fecha ya pasada y la deuda no se cobró.
    if (filters.promise === "con") {
      conds.push(isNotNull(schema.debtManagement.promisedPaymentDate));
    } else if (filters.promise === "sin") {
      conds.push(isNull(schema.debtManagement.promisedPaymentDate));
    } else if (filters.promise === "vencida") {
      conds.push(sql`${schema.debtManagement.promisedPaymentDate} < CURDATE()`);
      conds.push(sql`${this.effectiveDebtStatusSQL()} <> 'cobrada'`);
    }

    // Rangos de fecha (brief §4.2): registro = DATE(balances.createdAt);
    // devengo = COALESCE(subscriptions.startDate, registro) — el mismo
    // fallback que deriveEffectiveDateAndLabelOB usa para effectiveDate.
    if (filters.registeredFrom !== undefined) {
      conds.push(
        sql`DATE(${schema.balances.createdAt}) >= ${filters.registeredFrom}`,
      );
    }
    if (filters.registeredTo !== undefined) {
      conds.push(
        sql`DATE(${schema.balances.createdAt}) <= ${filters.registeredTo}`,
      );
    }
    if (filters.accruedFrom !== undefined) {
      conds.push(
        sql`COALESCE(${schema.subscriptions.startDate}, DATE(${schema.balances.createdAt})) >= ${filters.accruedFrom}`,
      );
    }
    if (filters.accruedTo !== undefined) {
      conds.push(
        sql`COALESCE(${schema.subscriptions.startDate}, DATE(${schema.balances.createdAt})) <= ${filters.accruedTo}`,
      );
    }

    // "Sin asistir hace más de X días" (brief §4.4): detector de fantasmas.
    // NULL (nunca asistió) cuenta como fantasma — sin registro de asistencia
    // no hay evidencia de que siga viniendo.
    if (filters.minDaysSinceAttendance !== undefined) {
      conds.push(
        sql`(${lastAtt.lastCheckinAt} IS NULL OR ${lastAtt.lastCheckinAt} < DATE_SUB(CURDATE(), INTERVAL ${filters.minDaysSinceAttendance} DAY))`,
      );
    }

    return conds;
  }

  /**
   * Corte por estado (brief §4.5). Default 'activa' = la vista de trabajo:
   * deuda vigente (amount > 0) sin baja. 'cobrada'/'incobrable' relajan el
   * `amount > 0` histórico — una cobrada quedó saldada en 0 y debe seguir
   * visible en su filtro (brief §2.4: "sale del reporte de pendientes o queda
   * visible en un filtro aparte").
   */
  private buildOutstandingStatusConds(
    status: OutstandingBalancesFilters["status"],
  ): SQL[] {
    const effStatus = this.effectiveDebtStatusSQL();
    const effective = status ?? "activa";
    if (effective === "activa") {
      return [gt(schema.balances.amount, 0), sql`${effStatus} = 'activa'`];
    }
    if (effective === "incobrable") {
      return [sql`${effStatus} = 'incobrable'`];
    }
    return [sql`${effStatus} = 'cobrada'`];
  }

  /**
   * ORDER BY del listado (brief §4.1/4.4/4.7), determinista vía tiebreaker
   * balances.id (WR-03). La antigüedad se ordena por balances.createdAt
   * invertido (antigüedad = hoy − createdAt, así que "más vieja primero" =
   * createdAt ASC). Última asistencia ASC deja los NULL (nunca asistió)
   * primero — los "más abandonados" arriba (default de MySQL para ASC).
   */
  private buildOutstandingOrderBy(
    filters: OutstandingBalancesFilters,
    lastAtt: ReturnType<ReportsService["buildLastAttendanceSubquery"]>,
  ): SQL {
    const sortBy = filters.sortBy ?? "age";
    const dir = filters.sortDir ?? "desc";
    if (sortBy === "amount") {
      return dir === "asc"
        ? sql`${schema.balances.amount} ASC, ${schema.balances.id} ASC`
        : sql`${schema.balances.amount} DESC, ${schema.balances.id} ASC`;
    }
    if (sortBy === "lastAttendance") {
      return dir === "asc"
        ? sql`${lastAtt.lastCheckinAt} ASC, ${schema.balances.id} ASC`
        : sql`${lastAtt.lastCheckinAt} DESC, ${schema.balances.id} ASC`;
    }
    // age (default): DESC = más vieja primero = createdAt ASC.
    return dir === "asc"
      ? sql`${schema.balances.createdAt} DESC, ${schema.balances.id} DESC`
      : sql`${schema.balances.createdAt} ASC, ${schema.balances.id} ASC`;
  }

  /**
   * SELECT + joins + mapping de filas del reporte Deudas — la única fuente de
   * verdad compartida por el listado paginado y el export Excel para que
   * nunca deriven (mismo contrato que ya cumplían por copia, ahora por DRY).
   */
  private async selectOutstandingRows(opts: {
    lastAtt: ReturnType<ReportsService["buildLastAttendanceSubquery"]>;
    whereClause: SQL | undefined;
    orderBy: SQL;
    limit?: number;
    offset?: number;
  }): Promise<OutstandingBalanceRow[]> {
    // Phase 153 (DEUDA-02/D-11): resolve the origin advance_payment of each
    // debt_balance to derive the motivo (miscReason) + free-text note.
    const debtOriginTx = this.buildDebtOriginTxSubquery();

    let query = this.db
      .select({
        balanceId: schema.balances.id,
        memberId: schema.balances.memberId,
        memberFirstName: schema.users.firstName,
        memberLastName: schema.users.lastName,
        memberPhone: schema.users.phone,
        branchId: schema.subscriptions.branchId,
        branchName: schema.branches.name,
        targetKind: schema.balances.targetKind,
        targetId: schema.balances.targetId,
        amount: schema.balances.amount,
        currency: schema.balances.currency,
        subscriptionStartDate: schema.subscriptions.startDate,
        subscriptionEndDate: schema.subscriptions.endDate,
        planName: schema.subscriptionPlans.name,
        balanceCreatedAt: schema.balances.createdAt,
        originMiscReason: schema.financialTransactions.miscReason,
        originNotes: schema.financialTransactions.notes,
        dmStatus: schema.debtManagement.status,
        dmPromisedPaymentDate: schema.debtManagement.promisedPaymentDate,
        dmNotes: schema.debtManagement.notes,
        lastCheckinAt: opts.lastAtt.lastCheckinAt,
      })
      .from(schema.balances)
      .leftJoin(
        schema.subscriptions,
        and(
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.subscriptions.id, schema.balances.targetId),
        ),
      )
      .leftJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .leftJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .leftJoin(schema.users, eq(schema.users.id, schema.balances.memberId))
      .leftJoin(
        schema.debtManagement,
        eq(schema.debtManagement.balanceId, schema.balances.id),
      )
      .leftJoin(
        opts.lastAtt,
        eq(opts.lastAtt.memberId, schema.balances.memberId),
      )
      .leftJoin(
        debtOriginTx,
        and(
          eq(schema.balances.targetKind, "debt_balance"),
          eq(debtOriginTx.targetId, schema.balances.targetId),
        ),
      )
      .leftJoin(
        schema.financialTransactions,
        eq(schema.financialTransactions.id, debtOriginTx.txId),
      )
      .where(opts.whereClause)
      .orderBy(opts.orderBy)
      .$dynamic();

    if (opts.limit !== undefined) {
      query = query.limit(opts.limit);
    }
    if (opts.offset !== undefined) {
      query = query.offset(opts.offset);
    }

    const rawRows = await query;

    return rawRows.map((r) => {
      const {
        effectiveDate,
        conceptLabel,
        reasonLabel,
        periodStart,
        periodEnd,
        registeredAt,
        notes,
      } = deriveEffectiveDateAndLabelOB({
        targetKind: r.targetKind,
        targetId: r.targetId,
        subscriptionStartDate: r.subscriptionStartDate,
        subscriptionEndDate: r.subscriptionEndDate,
        planName: r.planName,
        balanceCreatedAt: r.balanceCreatedAt,
        miscReason: r.originMiscReason,
        transactionNotes: r.originNotes,
      });
      const ageInDays = computeAgeInDaysOB(
        debtCreationDateOB(r.balanceCreatedAt),
      );
      const bucket = computeBucketOB(ageInDays);
      const memberName =
        `${r.memberFirstName ?? ""} ${r.memberLastName ?? ""}`.trim();
      return {
        memberId: r.memberId,
        memberName,
        memberPhone: r.memberPhone ?? null,
        branchId: r.branchId ?? null,
        branchName: r.branchName ?? null,
        targetKind: r.targetKind,
        targetId: r.targetId,
        conceptLabel,
        reasonLabel,
        periodStart,
        periodEnd,
        registeredAt,
        notes,
        amount: Number(r.amount),
        currency: r.currency,
        effectiveDate,
        ageInDays,
        bucket,
        balanceId: r.balanceId,
        status: r.dmStatus ?? "activa",
        promisedPaymentDate: r.dmPromisedPaymentDate ?? null,
        managementNotes: r.dmNotes ?? null,
        lastAttendanceAt:
          r.lastCheckinAt !== null && r.lastCheckinAt !== undefined
            ? isoDatePortionOB(r.lastCheckinAt)
            : null,
      };
    });
  }

  /**
   * Aging report data feed for the "Deudas" tab in ReportesPage (D-08).
   *
   * Source: balances WHERE amount > 0 LEFT JOIN subscriptions
   *   LEFT JOIN subscription_plans LEFT JOIN branches LEFT JOIN users.
   *
   * Why LEFT JOIN: target_kind='debt_balance' rows have no subscription, so
   * an INNER JOIN would silently drop them. Same for branches — debt_balance
   * rows have no branch.
   *
   * Bucket math is in JS (computeAgeInDaysOB / computeBucketOB) — not SQL —
   * so the clamp at 0 for future effective_dates is portable and timezone-
   * independent (matches Phase 108 getOutstandingConcepts).
   *
   * Filtering nuance:
   *  - branchId filter implicitly excludes debt_balance rows (no branch).
   *    Documented; acceptable per D-04 (debt_balance is rare).
   *  - country filter applied through branches.country. Same exclusion of
   *    debt_balance applies — semantically correct because debt_balance is
   *    a virtual concept without geography.
   *
   * D-22 — pagination via LIMIT/OFFSET (no cursor). Default page=1, limit=50.
   * Schema caps limit at 200 (T-109-05 DoS mitigation).
   *
   * D-06 — bucketTotals shape varies by isOwner:
   *   - non-owner: flat BucketTotals (always single currency by country scope).
   *   - owner: keyed by currency, e.g. { ARS: {...}, EUR: {...} }.
   *   We NEVER sum amounts across currencies.
   *
   * Sort order: ageInDays DESC (oldest debts first).
   */
  async getOutstandingBalances(
    filters: OutstandingBalancesFilters,
    scope: { isOwner: boolean },
  ): Promise<OutstandingBalancesResult> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;

    // ── Build WHERE conditions ──────────────────────────────────────────────
    // Base (sucursal/país/moneda/búsqueda/promesa/fechas/asistencia) + corte
    // por estado (default 'activa'). La MISMA instancia de lastAtt se usa en
    // conditions, joins y orderBy (alias compartido del derived table).
    const lastAtt = this.buildLastAttendanceSubquery();
    const baseConds = this.buildOutstandingBaseConds(filters, lastAtt);
    const whereClause = and(
      ...this.buildOutstandingStatusConds(filters.status),
      ...baseConds,
    );

    // ── Count (no LIMIT) ────────────────────────────────────────────────────
    // debt_management + last_attendance joined porque el WHERE puede
    // referenciar estado/promesa/asistencia.
    const [countRow] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.balances)
      .leftJoin(
        schema.subscriptions,
        and(
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.subscriptions.id, schema.balances.targetId),
        ),
      )
      .leftJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .leftJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .leftJoin(schema.users, eq(schema.users.id, schema.balances.memberId))
      .leftJoin(
        schema.debtManagement,
        eq(schema.debtManagement.balanceId, schema.balances.id),
      )
      .leftJoin(lastAtt, eq(lastAtt.memberId, schema.balances.memberId))
      .where(whereClause);

    const total = Number(countRow?.count ?? 0);

    // ── Paginated rows query ────────────────────────────────────────────────
    // Proyección + joins + mapping compartidos con el export (DRY) vía
    // selectOutstandingRows. El orden es determinista (tiebreaker balances.id)
    // así que la paginación LIMIT/OFFSET no duplica ni pierde filas.
    const mapped = await this.selectOutstandingRows({
      lastAtt,
      whereClause,
      orderBy: this.buildOutstandingOrderBy(filters, lastAtt),
      limit,
      offset,
    });

    // ── bucketTotals (full filtered set, no LIMIT) ──────────────────────────
    // Single query over the same JOINs and WHERE. We project just what's
    // needed to derive (effectiveDate, currency, amount).
    const totalsRows = await this.db
      .select({
        targetKind: schema.balances.targetKind,
        targetId: schema.balances.targetId,
        currency: schema.balances.currency,
        amount: schema.balances.amount,
        subscriptionStartDate: schema.subscriptions.startDate,
        planName: schema.subscriptionPlans.name,
        balanceCreatedAt: schema.balances.createdAt,
      })
      .from(schema.balances)
      .leftJoin(
        schema.subscriptions,
        and(
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.subscriptions.id, schema.balances.targetId),
        ),
      )
      .leftJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .leftJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .leftJoin(schema.users, eq(schema.users.id, schema.balances.memberId))
      .leftJoin(
        schema.debtManagement,
        eq(schema.debtManagement.balanceId, schema.balances.id),
      )
      .leftJoin(lastAtt, eq(lastAtt.memberId, schema.balances.memberId))
      .where(whereClause);

    let bucketTotals: BucketTotals | Record<string, BucketTotals>;
    if (scope.isOwner) {
      const map: Record<string, BucketTotals> = {};
      for (const r of totalsRows) {
        const bucket = computeBucketOB(
          computeAgeInDaysOB(debtCreationDateOB(r.balanceCreatedAt)),
        );
        const key = r.currency;
        if (!map[key]) map[key] = emptyBucketTotals();
        map[key][bucket] += Number(r.amount);
      }
      bucketTotals = map;
    } else {
      const flat: BucketTotals = emptyBucketTotals();
      for (const r of totalsRows) {
        const bucket = computeBucketOB(
          computeAgeInDaysOB(debtCreationDateOB(r.balanceCreatedAt)),
        );
        flat[bucket] += Number(r.amount);
      }
      bucketTotals = flat;
    }

    // ── statusTotals — cobrable vs incobrable (brief §2.4) ──────────────────
    // Universo filtrado SIN el corte por estado (deuda viva, amount > 0),
    // agrupado por moneda y estado efectivo. Las 'cobrada' quedan afuera por
    // definición (saldadas en 0 — y una cobrada manual con saldo > 0 no es ni
    // cobrable ni baja, se ignora del resumen).
    const statusTotalsRows = await this.db
      .select({
        currency: schema.balances.currency,
        effStatus: sql<string>`${this.effectiveDebtStatusSQL()}`.as(
          "eff_status",
        ),
        totalAmount: sql<number>`CAST(SUM(${schema.balances.amount}) AS SIGNED)`,
      })
      .from(schema.balances)
      .leftJoin(
        schema.subscriptions,
        and(
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.subscriptions.id, schema.balances.targetId),
        ),
      )
      .leftJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .leftJoin(schema.users, eq(schema.users.id, schema.balances.memberId))
      .leftJoin(
        schema.debtManagement,
        eq(schema.debtManagement.balanceId, schema.balances.id),
      )
      .leftJoin(lastAtt, eq(lastAtt.memberId, schema.balances.memberId))
      .where(and(gt(schema.balances.amount, 0), ...baseConds))
      .groupBy(schema.balances.currency, sql`eff_status`);

    const statusTotals: OutstandingBalancesResult["statusTotals"] = {
      cobrable: {},
      incobrable: {},
    };
    for (const r of statusTotalsRows) {
      if (r.effStatus === "activa") {
        statusTotals.cobrable[r.currency] = Number(r.totalAmount);
      } else if (r.effStatus === "incobrable") {
        statusTotals.incobrable[r.currency] = Number(r.totalAmount);
      }
    }

    return { rows: mapped, total, page, limit, bucketTotals, statusTotals };
  }

  // ─── Expired members / "Vencidos" (DEUDA-04, Phase 153-02) ───────────────

  /**
   * Members whose plan expired in the last 60 days without renewing (DEUDA-04).
   *
   * These are renewal LEADS, not debts — the row carries NO amount (D-06). The
   * cohort reuses the analytics fase-121 "vencido sin renovar" predicate adapted
   * to a 60-day window (D-05, not 30):
   *   - end_date < CURDATE()              (already expired)
   *   - end_date >= today-60d             (recent enough to still be a lead)
   *   - end_date >= start_date            (discard the ~4260 cancelled subs with
   *                                        an inverted window — historical dirty
   *                                        data that must never surface)
   *   - NOT activeMemberExists(user_id)   (dropped out = did not renew; the
   *                                        canonical predicate, never users.status)
   *
   * A member may have several expired subs in the window; we dedup per user and
   * keep the most recent expiry (smallest daysOverdue). Scoping mirrors OB:
   * gestion/admin → their country, owner without ?country → all countries.
   * Dedup + pagination happen in JS (the 60-day cohort is small) so the total
   * counts distinct members, not sub rows.
   */
  async getExpiredMembers(
    filters: ExpiredMembersFilters,
    scope: { isOwner: boolean },
  ): Promise<ExpiredMembersResult> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;

    const conds: SQL[] = [
      sql`${schema.subscriptions.endDate} < CURDATE()`,
      sql`${schema.subscriptions.endDate} >= DATE_SUB(CURDATE(), INTERVAL 60 DAY)`,
      // Discard the historical inverted-window dirty data (end < start, all
      // cancelled) so a bogus end_date inside the window never leaks a lead.
      sql`${schema.subscriptions.endDate} >= ${schema.subscriptions.startDate}`,
      // "vencido sin renovar": negate the canonical active predicate so a member
      // who renewed (has an in-effect sub) drops out of the renewal worklist.
      // NEVER read users.status directly.
      sql`NOT ${activeMemberExists(schema.subscriptions.userId)}`,
      // WR-01: also exclude members who already renewed with a FUTURE-dated
      // subscription (subscription_status='scheduled'). activeMemberExists only
      // matches active|paused with start_date <= CURDATE(), so a scheduled sub
      // starting tomorrow would slip through and this member would wrongly
      // appear as a renewal lead for something already paid. Mirror of the
      // coverageExists / getExpiringMemberships semantics in this same service
      // (phase 144 defines coverage as the active+paused+scheduled chain).
      sql`NOT EXISTS (
        SELECT 1 FROM ${schema.subscriptions} s2
        WHERE s2.user_id = ${schema.subscriptions.userId}
          AND s2.subscription_status IN ('active', 'paused', 'scheduled')
          AND (s2.end_date IS NULL OR s2.end_date >= CURDATE())
      )`,
      // WR-02: never surface PII (name/phone) of soft-deleted members in a
      // contact worklist. Mirror of pendingLeads in the conversion report.
      isNull(schema.users.deletedAt),
    ];

    if (filters.branchId !== undefined) {
      conds.push(eq(schema.subscriptions.branchId, filters.branchId));
    }

    if (filters.country !== undefined) {
      conds.push(eq(schema.branches.country, filters.country));
    }

    if (filters.search !== undefined && filters.search.trim().length > 0) {
      const searchCond = buildMemberNameSearchCondition(filters.search, {
        includeDni: false,
      });
      if (searchCond !== null) {
        conds.push(searchCond);
      }
    }

    const whereClause = and(...conds);

    const rawRows = await this.db
      .select({
        userId: schema.subscriptions.userId,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        phone: schema.users.phone,
        planName: schema.subscriptionPlans.name,
        expiryDate: schema.subscriptions.endDate,
        daysOverdue: sql<number>`DATEDIFF(CURDATE(), ${schema.subscriptions.endDate})`,
      })
      .from(schema.subscriptions)
      .innerJoin(schema.users, eq(schema.users.id, schema.subscriptions.userId))
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .innerJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
      )
      .where(whereClause);

    // Dedup per member, keeping the most recent expiry (smallest daysOverdue).
    const expiredByUser = new Map<number, ExpiredMemberRow>();
    for (const r of rawRows) {
      const daysOverdue = Number(r.daysOverdue);
      const existing = expiredByUser.get(r.userId);
      if (existing && existing.daysOverdue <= daysOverdue) {
        continue;
      }
      const memberName = `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim();
      expiredByUser.set(r.userId, {
        userId: r.userId,
        memberName,
        memberPhone: r.phone ?? null,
        planName: r.planName,
        // The WHERE clause guarantees end_date is non-null (end_date < CURDATE()).
        expiryDate: r.expiryDate as string,
        daysOverdue,
      });
    }

    // Most recent expiry first (daysOverdue ASC). WR-03: userId tiebreaker so
    // ties (several members expiring the same day — common with monthly cycles)
    // keep a stable, deterministic order across the page-1 and page-2 requests.
    // Without it the JS slice could duplicate or drop a row on "Cargar más".
    const allRows = [...expiredByUser.values()].sort(
      (a, b) => a.daysOverdue - b.daysOverdue || a.userId - b.userId,
    );

    const total = allRows.length;
    const rows = allRows.slice(offset, offset + limit);

    return { rows, total, page, limit };
  }

  // ─── Trial Conversion (Phase 102-07) ─────────────────────────────────────

  /**
   * Surface the trial→alumno conversion funnel for the Reportes tab.
   *
   * Date window semantics: `dateFrom`/`dateTo` filter on the *first trial's*
   * booking_date, i.e. "of the leads whose first trial was in this window,
   * how many converted?" — not "which conversions happened in this window".
   *
   * Country-scoped via filters.country (and optionally a single branchId).
   * Virtual branches are included on country match to mirror the rest of
   * the admin country-scope behaviour.
   */
  async getTrialConversionReport(
    filters: TrialConversionFilters,
  ): Promise<TrialConversionReport> {
    // Subquery: each lead's first trial (one row per user with is_trial=1,
    // giving the earliest trial's schedule + booking_date). Used as the
    // join key for per-branch / per-hour / per-shift breakdowns.
    //
    // We hit this subquery repeatedly below — inline SQL to keep the
    // query planner's job simple rather than materializing into a temp.
    const firstTrialSQL = sql`
      (
        SELECT
          b.member_id AS user_id,
          MIN(b.booking_date) AS trial_date,
          (
            SELECT b2.schedule_id
            FROM bookings b2
            WHERE b2.member_id = b.member_id
              AND b2.is_trial = 1
            ORDER BY b2.booking_date ASC, b2.id ASC
            LIMIT 1
          ) AS first_schedule_id
        FROM bookings b
        WHERE b.is_trial = 1
        GROUP BY b.member_id
      )
    `;

    const dateFrom = filters.dateFrom ?? "1970-01-01";
    const dateTo = filters.dateTo ?? "9999-12-31";
    const country = filters.country ?? "AR";
    const branchIdFilter =
      filters.branchId !== undefined
        ? sql`AND s.branch_id = ${filters.branchId}`
        : sql`AND (br.country = ${country} OR br.is_virtual = 1)`;

    // Totals: one query that hits every lead matching the window + scope,
    // returns converted flag + days-to-convert for median + revenue sum.
    const rowsForStats = await this.db.execute<{
      user_id: number;
      converted: number;
      days_to_convert: number | null;
      revenue: number;
    }>(sql`
      SELECT
        ft.user_id,
        CASE WHEN u.converted_at IS NOT NULL THEN 1 ELSE 0 END AS converted,
        CASE
          WHEN u.converted_at IS NOT NULL
          THEN DATEDIFF(u.converted_at, ft.trial_date)
          ELSE NULL
        END AS days_to_convert,
        COALESCE((
          SELECT SUM(fx.amount)
          FROM financial_transactions fx
          WHERE fx.member_id = ft.user_id
            AND ${sql.raw(firmMoneySqlFor("fx"))}
            AND fx.direction = 'inflow'
            AND fx.kind IN ('plan_charge', 'debt_settlement')
        ), 0) AS revenue
      FROM ${firstTrialSQL} AS ft
      JOIN users u ON u.id = ft.user_id
      JOIN schedules s ON s.id = ft.first_schedule_id
      JOIN branches br ON br.id = s.branch_id
      WHERE ft.trial_date >= ${dateFrom}
        AND ft.trial_date <= ${dateTo}
        ${branchIdFilter}
    `);

    const stats = rowsForStats[0] as unknown as Array<{
      user_id: number;
      converted: number;
      days_to_convert: number | null;
      revenue: number;
    }>;

    const trialsCount = stats.length;
    const convertedRows = stats.filter((r) => r.converted === 1);
    const convertedCount = convertedRows.length;
    const conversionRatePct =
      trialsCount > 0 ? (convertedCount * 100) / trialsCount : 0;

    const daysList = convertedRows
      .map((r) => Number(r.days_to_convert))
      .filter((d) => Number.isFinite(d))
      .sort((a, b) => a - b);
    const medianDaysToConvert = median(daysList);

    const revenueFromConverted = convertedRows.reduce(
      (acc, r) => acc + Number(r.revenue ?? 0),
      0,
    );
    const revenuePerTrial =
      trialsCount > 0 ? revenueFromConverted / trialsCount : 0;

    // Breakdowns — three grouped queries with the same scope filters.
    const byBranchRaw = await this.db.execute<{
      branch_id: number;
      branch_name: string;
      trials_count: number;
      converted_count: number;
    }>(sql`
      SELECT
        br.id AS branch_id,
        br.name AS branch_name,
        COUNT(*) AS trials_count,
        SUM(CASE WHEN u.converted_at IS NOT NULL THEN 1 ELSE 0 END) AS converted_count
      FROM ${firstTrialSQL} AS ft
      JOIN users u ON u.id = ft.user_id
      JOIN schedules s ON s.id = ft.first_schedule_id
      JOIN branches br ON br.id = s.branch_id
      WHERE ft.trial_date >= ${dateFrom}
        AND ft.trial_date <= ${dateTo}
        ${branchIdFilter}
      GROUP BY br.id, br.name
      ORDER BY br.name ASC
    `);

    const byBranch = (
      byBranchRaw[0] as unknown as Array<{
        branch_id: number;
        branch_name: string;
        trials_count: number;
        converted_count: number;
      }>
    ).map((r) => {
      const t = Number(r.trials_count);
      const c = Number(r.converted_count);
      return {
        branchId: Number(r.branch_id),
        branchName: String(r.branch_name),
        trialsCount: t,
        convertedCount: c,
        conversionRatePct: t > 0 ? (c * 100) / t : 0,
      };
    });

    const byHourRaw = await this.db.execute<{
      hour: string;
      trials_count: number;
      converted_count: number;
    }>(sql`
      SELECT
        DATE_FORMAT(s.start_time, '%H:00') AS hour,
        COUNT(*) AS trials_count,
        SUM(CASE WHEN u.converted_at IS NOT NULL THEN 1 ELSE 0 END) AS converted_count
      FROM ${firstTrialSQL} AS ft
      JOIN users u ON u.id = ft.user_id
      JOIN schedules s ON s.id = ft.first_schedule_id
      JOIN branches br ON br.id = s.branch_id
      WHERE ft.trial_date >= ${dateFrom}
        AND ft.trial_date <= ${dateTo}
        ${branchIdFilter}
      GROUP BY hour
      ORDER BY hour ASC
    `);

    const byHourSlot = (
      byHourRaw[0] as unknown as Array<{
        hour: string;
        trials_count: number;
        converted_count: number;
      }>
    ).map((r) => {
      const t = Number(r.trials_count);
      const c = Number(r.converted_count);
      return {
        hour: String(r.hour),
        trialsCount: t,
        convertedCount: c,
        conversionRatePct: t > 0 ? (c * 100) / t : 0,
      };
    });

    const byShiftRaw = await this.db.execute<{
      shift: "TM" | "TT";
      trials_count: number;
      converted_count: number;
    }>(sql`
      SELECT
        CASE WHEN s.start_time < '13:00:00' THEN 'TM' ELSE 'TT' END AS shift,
        COUNT(*) AS trials_count,
        SUM(CASE WHEN u.converted_at IS NOT NULL THEN 1 ELSE 0 END) AS converted_count
      FROM ${firstTrialSQL} AS ft
      JOIN users u ON u.id = ft.user_id
      JOIN schedules s ON s.id = ft.first_schedule_id
      JOIN branches br ON br.id = s.branch_id
      WHERE ft.trial_date >= ${dateFrom}
        AND ft.trial_date <= ${dateTo}
        ${branchIdFilter}
      GROUP BY shift
      ORDER BY shift ASC
    `);

    const byShift = (
      byShiftRaw[0] as unknown as Array<{
        shift: "TM" | "TT";
        trials_count: number;
        converted_count: number;
      }>
    ).map((r) => {
      const t = Number(r.trials_count);
      const c = Number(r.converted_count);
      return {
        shift: r.shift,
        trialsCount: t,
        convertedCount: c,
        conversionRatePct: t > 0 ? (c * 100) / t : 0,
      };
    });

    // Pending leads: un-converted, sorted oldest trial first (most stale).
    const pendingRaw = await this.db.execute<{
      user_id: number;
      first_name: string;
      last_name: string;
      phone: string | null;
      branch_id: number;
      branch_name: string;
      trial_date: string;
      days_since_trial: number;
    }>(sql`
      SELECT
        ft.user_id,
        u.first_name,
        u.last_name,
        u.phone,
        br.id AS branch_id,
        br.name AS branch_name,
        ft.trial_date,
        DATEDIFF(CURDATE(), ft.trial_date) AS days_since_trial
      FROM ${firstTrialSQL} AS ft
      JOIN users u ON u.id = ft.user_id
      JOIN schedules s ON s.id = ft.first_schedule_id
      JOIN branches br ON br.id = s.branch_id
      WHERE ft.trial_date >= ${dateFrom}
        AND ft.trial_date <= ${dateTo}
        AND u.converted_at IS NULL
        AND u.deleted_at IS NULL
        ${branchIdFilter}
      ORDER BY ft.trial_date ASC, u.first_name ASC
    `);

    const pendingLeads = (
      pendingRaw[0] as unknown as Array<{
        user_id: number;
        first_name: string;
        last_name: string;
        phone: string | null;
        branch_id: number;
        branch_name: string;
        trial_date: string;
        days_since_trial: number;
      }>
    ).map((r) => ({
      userId: Number(r.user_id),
      firstName: String(r.first_name ?? ""),
      lastName: String(r.last_name ?? ""),
      phone: r.phone ? String(r.phone) : null,
      branchId: Number(r.branch_id),
      branchName: String(r.branch_name),
      trialDate:
        typeof r.trial_date === "string"
          ? r.trial_date.slice(0, 10)
          : new Date(r.trial_date).toISOString().slice(0, 10),
      daysSinceTrial: Number(r.days_since_trial),
    }));

    return {
      totals: {
        trialsCount,
        convertedCount,
        conversionRatePct,
        medianDaysToConvert,
        revenueFromConverted,
        revenuePerTrial,
      },
      byBranch,
      byHourSlot,
      byShift,
      pendingLeads,
    };
  }

  // ─── Trial Sessions Report (Phase 114-05) ─────────────────────────────────
  //
  // One row per LEAD (user), NOT per booking (D-03 / D-42 / D-43).
  //
  // The driver of the SELECT is a derived table `latest_trial` that picks the
  // single representative trial booking per user: the latest non-cancelado
  // trial. We use MAX(id) as the tiebreaker — within a user, larger id ⇒
  // later booking (auto-increment + same-day reactivations land at the
  // latest id). The derived-table form is used (rather than a CTE) to
  // mirror the inline-subquery style already used by
  // `getTrialConversionReport` on this codebase, and works identically on
  // MySQL 5.7 and 8.x.
  //
  // Country scope replicates D-24: include branches where
  // `branch.country = ${country}` OR `branch.is_virtual = 1`.
  //
  // SQL injection: every user-input filter (branchId, dateFrom, dateTo,
  // leadStatus[], shift, gestionaUserId, daysWithoutConvertingMin, search,
  // page, limit) flows through drizzle's parameterized `sql\`... ${val} ...\``
  // template tag, never `sql.raw` and never string concatenation. The Zod/AJV
  // schema layer is the first defense (integer/enum enforcement); this is
  // defense-in-depth (T-114-05-04).

  async getTrialSessionsReport(
    filters: TrialSessionsFilters,
  ): Promise<TrialSessionsReport> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;

    // Build the list of WHERE predicates as SQL fragments. Each filter that
    // injects user input does so via drizzle's `${...}` parameter binding —
    // never string concat.
    const conds = this.buildTrialSessionsConditions(filters);

    // Total count: SAME `latest_trial` derived table + SAME predicates as
    // the row query, so `total` reflects deduplicated leads — not raw
    // booking rows. Two separate queries (count + page) per the precedent
    // set by getChargeHistory.
    const countRows = await this.db.execute<{ total: number }>(sql`
      SELECT COUNT(*) AS total
      FROM (
        SELECT b2.member_id, MAX(b2.id) AS booking_id
        FROM ${schema.bookings} AS b2
        WHERE b2.is_trial = 1 AND b2.booking_status <> 'cancelado'
        GROUP BY b2.member_id
      ) AS lt
      JOIN ${schema.bookings} AS b      ON b.id = lt.booking_id
      JOIN ${schema.users}    AS u      ON u.id = lt.member_id
      JOIN ${schema.schedules} AS s     ON s.id = b.schedule_id
      JOIN ${schema.branches}  AS br    ON br.id = s.branch_id
      LEFT JOIN ${schema.attendance} AS a
        ON a.member_id = b.member_id
       AND a.schedule_id = b.schedule_id
       AND a.session_date = b.booking_date
       AND a.attendance_status = 'confirmado'
      LEFT JOIN ${schema.users} AS creator ON creator.id = u.created_by
      WHERE u.deleted_at IS NULL
        ${conds}
    `);
    const countResult = countRows[0] as unknown as Array<{ total: number }>;
    const total = Number(countResult[0]?.total ?? 0);

    // Page query — same JOIN graph, returns the raw columns we'll derive
    // the response rows from in JS. Sort: most recent representative
    // trial first.
    const rawRows = await this.db.execute<{
      booking_id: number;
      user_id: number;
      first_name: string | null;
      last_name: string | null;
      booking_date: string | Date;
      booked_at: string | Date;
      start_time: string;
      branch_id: number;
      branch_name: string;
      attendance_id: number | null;
      lead_status: "en_seguimiento" | "ganado" | "perdido" | null;
      lead_notes: string | null;
      purchased_plan_id: number | null;
      purchased_plan_name: string | null;
      converted_at: string | Date | null;
      creator_id: number | null;
      creator_first_name: string | null;
      creator_last_name: string | null;
    }>(sql`
      SELECT
        b.id              AS booking_id,
        u.id              AS user_id,
        u.first_name      AS first_name,
        u.last_name       AS last_name,
        b.booking_date    AS booking_date,
        b.booked_at       AS booked_at,
        s.start_time      AS start_time,
        br.id             AS branch_id,
        br.name           AS branch_name,
        a.id              AS attendance_id,
        u.lead_status     AS lead_status,
        u.lead_notes      AS lead_notes,
        u.purchased_plan_id AS purchased_plan_id,
        pp.name           AS purchased_plan_name,
        u.converted_at    AS converted_at,
        creator.id        AS creator_id,
        creator.first_name AS creator_first_name,
        creator.last_name  AS creator_last_name
      FROM (
        SELECT b2.member_id, MAX(b2.id) AS booking_id
        FROM ${schema.bookings} AS b2
        WHERE b2.is_trial = 1 AND b2.booking_status <> 'cancelado'
        GROUP BY b2.member_id
      ) AS lt
      JOIN ${schema.bookings}  AS b      ON b.id = lt.booking_id
      JOIN ${schema.users}     AS u      ON u.id = lt.member_id
      JOIN ${schema.schedules} AS s      ON s.id = b.schedule_id
      JOIN ${schema.branches}  AS br     ON br.id = s.branch_id
      LEFT JOIN ${schema.attendance} AS a
        ON a.member_id = b.member_id
       AND a.schedule_id = b.schedule_id
       AND a.session_date = b.booking_date
       AND a.attendance_status = 'confirmado'
      LEFT JOIN ${schema.users} AS creator ON creator.id = u.created_by
      LEFT JOIN ${schema.subscriptionPlans} AS pp ON pp.id = u.purchased_plan_id
      WHERE u.deleted_at IS NULL
        ${conds}
      ORDER BY b.booking_date DESC, b.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const dbRows = rawRows[0] as unknown as Array<{
      booking_id: number;
      user_id: number;
      first_name: string | null;
      last_name: string | null;
      booking_date: string | Date;
      booked_at: string | Date;
      start_time: string;
      branch_id: number;
      branch_name: string;
      attendance_id: number | null;
      lead_status: "en_seguimiento" | "ganado" | "perdido" | null;
      lead_notes: string | null;
      purchased_plan_id: number | null;
      purchased_plan_name: string | null;
      converted_at: string | Date | null;
      creator_id: number | null;
      creator_first_name: string | null;
      creator_last_name: string | null;
    }>;

    const rows: TrialSessionsRow[] = dbRows.map((r) =>
      this.mapTrialSessionRow(r),
    );

    return { rows, total, page, limit };
  }

  /**
   * Export form: same query, no pagination, hard cap at 10000 rows (D-26 /
   * T-114-05-03). Returns the CSV body as a string WITHOUT the UTF-8 BOM —
   * the BOM is prepended at the route layer so that test fixtures can opt
   * out cleanly if needed.
   *
   * RFC 4180 escaping: fields containing comma, double-quote, CR, or LF
   * are wrapped in double quotes; any literal double quote is doubled.
   *
   * Spanish headers (literal accented chars; the file is UTF-8):
   *   Lead, Fecha, Creación, Hora, Sucursal, Asistió, Estado del Lead,
   *   Plan comprado, Gestiona, Comentarios, Turno, Periodo, Semana
   *
   * Date format: DD/MM/YYYY (D-05). Hora: HH:MM (D-06). Asistió: "Sí" / "No"
   * / "" (D-08).
   */
  async exportTrialSessions(filters: TrialSessionsFilters): Promise<string> {
    // D-26 / T-114-05-03 — hard cap. Override pagination, fetch the full set.
    const HARD_CAP = 10000;
    const data = await this.getTrialSessionsReport({
      ...filters,
      page: 1,
      limit: HARD_CAP,
    });

    const headers = [
      "Lead",
      "Fecha",
      "Creación",
      "Hora",
      "Sucursal",
      "Asistió",
      "Estado del Lead",
      "Plan comprado",
      "Gestiona",
      "Comentarios",
      "Turno",
      "Periodo",
      "Semana",
    ];

    const lines: string[] = [headers.map(csvEscape).join(",")];
    for (const row of data.rows) {
      const fechaDDMMYYYY = isoToDDMMYYYY(row.bookingDate);
      const creacionDDMMYYYY = isoToDDMMYYYY(row.bookingCreatedAt);
      const asistidoLabel =
        row.attended === "si" ? "Sí" : row.attended === "no" ? "No" : "";
      const estadoLabel = leadStatusLabelES(row.leadStatusEffective);
      const gestionaName = row.createdBy?.name ?? "";
      const turnoLabel = row.shift === "TM" ? "Mañana" : "Tarde";
      const cells = [
        row.lead,
        fechaDDMMYYYY,
        creacionDDMMYYYY,
        row.startTime,
        row.branchName,
        asistidoLabel,
        estadoLabel,
        row.purchasedPlanName ?? "",
        gestionaName,
        row.leadNotes ?? "",
        turnoLabel,
        row.period,
        row.weekRange,
      ];
      lines.push(cells.map(csvEscape).join(","));
    }

    // CRLF per RFC 4180 (Excel-friendly).
    return lines.join("\r\n") + "\r\n";
  }

  /**
   * Build the WHERE-fragment list for getTrialSessionsReport. All user-input
   * values are bound via drizzle's `${...}` parameter interpolation — never
   * string-concatenated. The Zod/AJV layer (T1) is the first defense (integer
   * + enum enforcement); this is defense-in-depth (T-114-05-04).
   *
   * Returned shape: a single SQL fragment of the form ` AND <p1> AND <p2>...`
   * (note the leading ` AND ` so it composes cleanly after `u.deleted_at IS
   * NULL` in the caller). Empty filters yield an empty fragment.
   */
  private buildTrialSessionsConditions(filters: TrialSessionsFilters): SQL {
    const preds: SQL[] = [];

    // D-24 country scope — branch's country must match OR branch is virtual.
    if (filters.country !== undefined) {
      preds.push(sql`(br.country = ${filters.country} OR br.is_virtual = 1)`);
    }

    if (filters.branchId !== undefined) {
      preds.push(sql`br.id = ${filters.branchId}`);
    }

    if (filters.dateFrom !== undefined) {
      preds.push(sql`b.booking_date >= ${filters.dateFrom}`);
    }
    if (filters.dateTo !== undefined) {
      preds.push(sql`b.booking_date <= ${filters.dateTo}`);
    }

    if (filters.leadStatus !== undefined && filters.leadStatus.length > 0) {
      // The UI shows `leadStatusEffective` which is derived (see
      // mapTrialSessionRow): `lead_status ?? (converted ? 'ganado' : 'en_seguimiento')`.
      // Filtering must match the same derivation, otherwise rows with
      // `lead_status IS NULL` (which display as 'en_seguimiento' or 'ganado'
      // depending on converted_at) get excluded from their own filter.
      // Each enum value is bound as a parameter; SQL injection-safe.
      const placeholders = sql.join(
        filters.leadStatus.map((v) => sql`${v}`),
        sql`, `,
      );
      const orParts: SQL[] = [sql`u.lead_status IN (${placeholders})`];
      if (filters.leadStatus.includes("en_seguimiento")) {
        orParts.push(sql`(u.lead_status IS NULL AND u.converted_at IS NULL)`);
      }
      if (filters.leadStatus.includes("ganado")) {
        orParts.push(
          sql`(u.lead_status IS NULL AND u.converted_at IS NOT NULL)`,
        );
      }
      preds.push(sql`(${sql.join(orParts, sql` OR `)})`);
    }

    if (filters.attended !== undefined) {
      // D-08 derivation as filter predicates. The LEFT JOIN on attendance
      // gives `a.id IS NULL` for "no row matching" — exactly the same gate
      // used to render 'no' vs null in JS.
      if (filters.attended === "true") {
        preds.push(sql`a.id IS NOT NULL`);
      } else if (filters.attended === "false") {
        preds.push(sql`a.id IS NULL AND b.booking_date < CURDATE()`);
      } else {
        // pending
        preds.push(sql`a.id IS NULL AND b.booking_date >= CURDATE()`);
      }
    }

    if (filters.shift !== undefined) {
      if (filters.shift === "TM") {
        preds.push(sql`s.start_time < '12:00'`);
      } else {
        preds.push(sql`s.start_time >= '12:00'`);
      }
    }

    if (filters.gestionaUserId !== undefined) {
      // D-44: the route layer is responsible for silently stripping this
      // when the caller is not owner. The service trusts the shape it
      // receives. Bound as a parameter for SQL-injection safety.
      preds.push(sql`u.created_by = ${filters.gestionaUserId}`);
    }

    if (filters.daysWithoutConvertingMin !== undefined) {
      // D-40: only applies to non-converted leads. `b.booking_date` IS the
      // user's representative trial (latest non-cancelado) by construction
      // of the `latest_trial` derived table — no per-user MIN ambiguity.
      //
      // PARAMETERIZATION (T-114-05-04 / defense in depth): the integer is
      // bound via drizzle template-tag `${...}`. Zod/AJV already enforced
      // integer minimum:0 at the schema layer.
      preds.push(
        sql`u.converted_at IS NULL AND DATEDIFF(CURDATE(), b.booking_date) >= ${filters.daysWithoutConvertingMin}`,
      );
    }

    if (filters.search !== undefined && filters.search.trim().length > 0) {
      // The shared buildMemberNameSearchCondition() emits `users.first_name`
      // bare-column references via drizzle's `schema.users.firstName`. Our
      // query aliases `users AS u` and `users AS creator`, so referencing
      // the bare `users.first_name` would be ambiguous (and is actually
      // wrong — there is no un-aliased `users` table in the FROM clause).
      // Inline the predicate against the `u.` alias to avoid the conflict
      // while preserving the same token-AND semantics (search by first /
      // last / concat).
      const tokens = filters.search
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const tokenPreds: SQL[] = tokens.map((token) => {
        const pattern = `%${token}%`;
        return sql`(u.first_name LIKE ${pattern}
          OR u.last_name LIKE ${pattern}
          OR CONCAT_WS(' ', u.first_name, u.last_name) LIKE ${pattern})`;
      });
      if (tokenPreds.length > 0) {
        preds.push(
          tokenPreds.length === 1
            ? tokenPreds[0]
            : sql.join(tokenPreds, sql` AND `),
        );
      }
    }

    if (preds.length === 0) return sql``;
    return sql` AND ${sql.join(preds, sql` AND `)}`;
  }

  /**
   * D-04..D-14 row derivations. Booking-level fields (`bookingDate`,
   * `startTime`, `branchName`, `attended`) come from the chosen
   * latest-non-cancelado trial booking. User-level fields (`leadStatus`,
   * `leadNotes`, `createdBy`, `converted`, `leadStatusEffective`) come
   * directly from the user row.
   */
  private mapTrialSessionRow(r: {
    booking_id: number;
    user_id: number;
    first_name: string | null;
    last_name: string | null;
    booking_date: string | Date;
    booked_at: string | Date;
    start_time: string;
    branch_id: number;
    branch_name: string;
    attendance_id: number | null;
    lead_status: "en_seguimiento" | "ganado" | "perdido" | null;
    lead_notes: string | null;
    purchased_plan_id: number | null;
    purchased_plan_name: string | null;
    converted_at: string | Date | null;
    creator_id: number | null;
    creator_first_name: string | null;
    creator_last_name: string | null;
  }): TrialSessionsRow {
    const bookingDate = normalizeISODate(r.booking_date);
    // Fecha de creación de la SP (sesión de prueba) = cuándo se registró el booking.
    const bookingCreatedAt = normalizeISODate(r.booked_at);
    const startTime = r.start_time.slice(0, 5);
    const lead = trimJoin(r.first_name, r.last_name);
    const converted = r.converted_at !== null;

    // D-08 attended derivation.
    let attended: "si" | "no" | null;
    if (r.attendance_id !== null) {
      attended = "si";
    } else {
      // Compare booking_date < today (UTC, day-level) — past sessions w/o
      // attendance row count as "no", future/today w/o attendance is null.
      const today = todayISO();
      attended = bookingDate < today ? "no" : null;
    }

    // D-09 effective lead status.
    const leadStatusEffective: "en_seguimiento" | "ganado" | "perdido" =
      r.lead_status ?? (converted ? "ganado" : "en_seguimiento");

    // D-12 shift.
    const shift: "TM" | "TT" = startTime < "12:00" ? "TM" : "TT";

    // D-13 period.
    const period = bookingDate.slice(0, 7);

    // D-14 week range — ISO Mon..Sun for the booking_date.
    const weekRange = isoWeekRange(bookingDate);

    // daysSinceTrial — floor((today - bookingDate) / 1d). Negative for future.
    const daysSinceTrial = daysBetweenISO(bookingDate, todayISO());

    const createdBy =
      r.creator_id !== null
        ? {
            userId: r.creator_id,
            name: trimJoin(r.creator_first_name, r.creator_last_name),
          }
        : null;

    return {
      bookingId: r.booking_id,
      userId: r.user_id,
      lead,
      bookingDate,
      bookingCreatedAt,
      startTime,
      branchId: r.branch_id,
      branchName: r.branch_name,
      attended,
      leadStatus: r.lead_status,
      leadStatusEffective,
      createdBy,
      leadNotes: r.lead_notes,
      purchasedPlanId: r.purchased_plan_id,
      purchasedPlanName: r.purchased_plan_name,
      shift,
      period,
      weekRange,
      daysSinceTrial,
      converted,
    };
  }

  // ─── Export Methods (no pagination) ───────────────────────────────────────

  async exportAccessLog(
    filters: AccessReportFilters,
  ): Promise<AccessReportRow[]> {
    const result = await this.getAccessLog({
      ...filters,
      page: 1,
      limit: 100000,
    });
    return result.rows;
  }

  async exportChargeHistory(
    filters: ChargeReportFilters,
  ): Promise<ChargeReportRow[]> {
    const result = await this.getChargeHistory({
      ...filters,
      page: 1,
      limit: 100000,
    });
    return result.rows;
  }

  async exportExpiringMemberships(
    filters: ExpiringReportFilters,
  ): Promise<ExpiringReportRow[]> {
    return this.getExpiringMemberships(filters);
  }

  async exportInactiveMembers(
    filters: InactiveReportFilters,
  ): Promise<InactiveReportRow[]> {
    return this.getInactiveMembers(filters);
  }

  /**
   * Phase 109-04 — Export rows for the Deudas (outstanding balances) report.
   *
   * Returns the full filtered set in one shot (no pagination). Shares
   * conditions, joins, projection and sort with `getOutstandingBalances`
   * (selectOutstandingRows) so the export contains byte-identical rows to
   * what the paginated listing would produce. We skip the bucketTotals /
   * statusTotals scans because the export only needs row-level data.
   *
   * Like the listing endpoint, branchId/country filters implicitly
   * exclude debt_balance rows (no branch/no geography).
   */
  async exportOutstandingBalances(
    filters: OutstandingBalancesFilters,
  ): Promise<OutstandingBalanceRow[]> {
    const lastAtt = this.buildLastAttendanceSubquery();
    const whereClause = and(
      ...this.buildOutstandingStatusConds(filters.status),
      ...this.buildOutstandingBaseConds(filters, lastAtt),
    );
    return this.selectOutstandingRows({
      lastAtt,
      whereClause,
      orderBy: this.buildOutstandingOrderBy(filters, lastAtt),
    });
  }

  /**
   * Gestión de una deuda (brief §2/§3): upsert de promesa de pago,
   * observaciones y estado sobre debt_management, keyed por balanceId (la
   * identidad única de la deuda en el reporte). Campos no provistos quedan
   * como están — el PATCH es parcial. `null` explícito borra promesa/notas.
   *
   * Scope del non-owner: espeja la visibilidad del listado — su listado
   * SIEMPRE filtra por su país (lo que excluye deudas sin sucursal, las
   * debt_balance), así que solo puede gestionar deudas de sucursales de su
   * país. Fail-closed si el scope de país no resolvió.
   */
  async updateDebtManagement(
    balanceId: number,
    input: DebtManagementUpdateInput,
    actor: { userId: number; isOwner: boolean; country: "AR" | "ES" | null },
  ): Promise<DebtManagementView> {
    const [bal] = await this.db
      .select({
        id: schema.balances.id,
        branchCountry: schema.branches.country,
      })
      .from(schema.balances)
      .leftJoin(
        schema.subscriptions,
        and(
          eq(schema.balances.targetKind, "subscription"),
          eq(schema.subscriptions.id, schema.balances.targetId),
        ),
      )
      .leftJoin(
        schema.branches,
        eq(schema.branches.id, schema.subscriptions.branchId),
      )
      .where(eq(schema.balances.id, balanceId))
      .limit(1);

    if (!bal) {
      throw new NotFoundError("Deuda no encontrada");
    }
    if (!actor.isOwner) {
      if (actor.country === null || bal.branchCountry !== actor.country) {
        throw new ForbiddenError("La deuda no pertenece a tu país");
      }
    }

    // Upsert atómico vía UNIQUE(balance_id): el INSERT siembra defaults y el
    // ON DUPLICATE KEY UPDATE pisa SOLO los campos provistos (PATCH parcial).
    await this.db
      .insert(schema.debtManagement)
      .values({
        balanceId,
        status: input.status ?? "activa",
        promisedPaymentDate: input.promisedPaymentDate ?? null,
        notes: input.notes ?? null,
        updatedBy: actor.userId,
      })
      .onDuplicateKeyUpdate({
        set: {
          updatedBy: actor.userId,
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.promisedPaymentDate !== undefined
            ? { promisedPaymentDate: input.promisedPaymentDate }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      });

    const [row] = await this.db
      .select({
        status: schema.debtManagement.status,
        promisedPaymentDate: schema.debtManagement.promisedPaymentDate,
        notes: schema.debtManagement.notes,
      })
      .from(schema.debtManagement)
      .where(eq(schema.debtManagement.balanceId, balanceId))
      .limit(1);

    return {
      balanceId,
      status: row?.status ?? "activa",
      promisedPaymentDate: row?.promisedPaymentDate ?? null,
      notes: row?.notes ?? null,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  private buildAccessConditions(
    filters: AccessReportFilters,
  ): ReturnType<typeof sql>[] {
    const conditions: ReturnType<typeof sql>[] = [sql`1 = 1`];

    if (filters.branchId !== undefined) {
      conditions.push(eq(schema.attendance.branchId, filters.branchId));
    }

    if (filters.country !== undefined) {
      conditions.push(eq(schema.branches.country, filters.country));
    }

    if (filters.dateFrom) {
      conditions.push(
        sql`DATE(${schema.attendance.checkedInAt}) >= ${filters.dateFrom}`,
      );
    }

    if (filters.dateTo) {
      conditions.push(
        sql`DATE(${schema.attendance.checkedInAt}) <= ${filters.dateTo}`,
      );
    }

    if (filters.source) {
      conditions.push(eq(schema.attendance.source, filters.source));
    }

    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        sql`(CONCAT(COALESCE(${schema.users.firstName}, ''), ' ', COALESCE(${schema.users.lastName}, '')) LIKE ${searchTerm} OR ${schema.users.dni} LIKE ${searchTerm})`,
      );
    }

    return conditions;
  }

  private buildChargeConditions(
    filters: ChargeReportFilters,
  ): ReturnType<typeof sql>[] {
    // Phase 105 D-01: revenue == financial_transactions where kind is a real
    // cash inflow (plan_charge, debt_settlement) and the row is not voided.
    // direction='inflow' excludes refunds. These three conditions belong on
    // every charge-history listing.
    const conditions: ReturnType<typeof sql>[] = [
      sql`1 = 1`,
      sql`${schema.financialTransactions.kind} IN ('plan_charge', 'debt_settlement')`,
      eq(schema.financialTransactions.direction, "inflow"),
      isNull(schema.financialTransactions.voidedAt),
      // Phase 137 (VAL-05): firm money counts only validated rows.
      eq(schema.financialTransactions.validationStatus, "validado"),
    ];

    if (filters.branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, filters.branchId));
    }

    if (filters.country !== undefined) {
      conditions.push(eq(schema.branches.country, filters.country));
    }

    if (filters.dateFrom) {
      conditions.push(
        sql`${schema.financialTransactions.transactionDate} >= ${filters.dateFrom}`,
      );
    }

    if (filters.dateTo) {
      conditions.push(
        sql`${schema.financialTransactions.transactionDate} <= ${filters.dateTo}`,
      );
    }

    if (filters.paymentMethod) {
      conditions.push(
        eq(schema.financialTransactions.paymentMethod, filters.paymentMethod),
      );
    }

    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        sql`(CONCAT(COALESCE(${schema.users.firstName}, ''), ' ', COALESCE(${schema.users.lastName}, '')) LIKE ${searchTerm} OR ${schema.users.dni} LIKE ${searchTerm})`,
      );
    }

    return conditions;
  }

  private buildChargeConditionsRaw(
    filters: ChargeReportFilters,
  ): ReturnType<typeof sql> {
    const parts: ReturnType<typeof sql>[] = [sql`1 = 1`];

    if (filters.branchId !== undefined) {
      parts.push(sql`m.branch_id = ${filters.branchId}`);
    }

    if (filters.country !== undefined) {
      parts.push(sql`b.country = ${filters.country}`);
    }

    if (filters.dateFrom) {
      parts.push(sql`ft.transaction_date >= ${filters.dateFrom}`);
    }

    if (filters.dateTo) {
      parts.push(sql`ft.transaction_date <= ${filters.dateTo}`);
    }

    if (filters.paymentMethod) {
      parts.push(sql`ft.payment_method = ${filters.paymentMethod}`);
    }

    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      parts.push(
        sql`(CONCAT(COALESCE(m.first_name, ''), ' ', COALESCE(m.last_name, '')) LIKE ${searchTerm} OR m.dni LIKE ${searchTerm})`,
      );
    }

    return sql.join(parts, sql` AND `);
  }
}
