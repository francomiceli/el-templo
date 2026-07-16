/**
 * Member Service
 *
 * Business logic for member CRUD, profile management,
 * DNI uniqueness checks, and internal notes.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import {
  eq,
  and,
  or,
  like,
  sql,
  desc,
  ne,
  isNull,
  gte,
  inArray,
  SQL,
} from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import argon2 from "argon2";
import * as schema from "../../db/schema";

/** Temporary password assigned by admin-driven member creation and password reset. */
export const MEMBER_TEMP_PASSWORD = "eltemplo2026";
import {
  buildMemberNameSearchCondition,
  normalizePhone,
  sanitizePhoneForStorage,
} from "../shared";
import type { TrainingLevel } from "../shared/training-constants";
import type {
  MemberListParams,
  MemberListItem,
  MemberSearchParams,
  MemberSearchItem,
  MemberProfile,
  MemberExportRow,
  SepaExportRow,
  CreateMemberInput,
  CreateMemberServiceInput,
  CreateTrialMemberServiceInput,
  CreateMinimalMemberServiceInput,
  ConvertFreemiumToTrialServiceInput,
  UpdateLeadInput,
  LeadSnapshot,
  UpdateMemberInput,
  MemberNote,
  CreateNoteInput,
  UpdateNoteInput,
  DniCheckResult,
  TotalDebtRow,
  UserStatus,
} from "./types";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from "../shared/errors";
import { isDuplicateKeyError } from "../shared/sql-errors";
import { ReferralService } from "../referrals/service";
import { referralCopyVariant } from "../referrals/ab-variant";
import { isValidIban, normalizeIban } from "../shared/iban";
import { activeMemberExists } from "../shared/active-member";
import { alias } from "drizzle-orm/mysql-core";
import type { MemberSegment } from "../segmentation/types";

export class MemberService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  // ─── Member CRUD ───────────────────────────────────────────────────────

  /**
   * List members with search, filters, and pagination.
   * Search matches against firstName, lastName, email, and dni.
   */
  async listMembers(params: MemberListParams): Promise<{
    members: MemberListItem[];
    total: number;
    totalDebtByCurrency: TotalDebtRow[];
  }> {
    const {
      search,
      branchId,
      multiBranch,
      level,
      planId,
      segment,
      avatarType,
      country,
      debtorOnly,
      includeTotalDebt,
      status,
      page,
      limit,
    } = params;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];

    // Only show actual members (not coaches/admins)
    conditions.push(eq(schema.users.role, "member"));
    // Hide soft-deleted rows from the admin list.
    conditions.push(isNull(schema.users.deletedAt));

    if (search) {
      const condition = buildMemberNameSearchCondition(search);
      if (condition) conditions.push(condition);
    }

    if (multiBranch === true) {
      // Filter members whose active subscription is on a multi-branch plan
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM subscriptions sub
          INNER JOIN subscription_plans sp ON sp.id = sub.plan_id
          WHERE sub.user_id = ${schema.users.id}
            AND sp.multi_branch = 1
            AND (sub.subscription_status = 'active' OR sub.end_date >= CURDATE())
        )`,
      );
    } else if (branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, branchId));
    }

    // Country scope (Phase 98): filter by the member's branch country. The
    // query already innerJoins `branches` below, so the condition is safe.
    // Virtual branches (e.g. ONLINE) are cross-country: self-registered
    // members default to ONLINE (AR) and must stay visible to ES staff until
    // a coach reassigns them to their physical branch.
    if (country !== undefined) {
      const countryOrVirtual = or(
        eq(schema.branches.country, country),
        eq(schema.branches.isVirtual, true),
      );
      if (countryOrVirtual) conditions.push(countryOrVirtual);
    }

    if (level !== undefined) {
      conditions.push(
        eq(
          schema.users.level,
          level as "kairos" | "alfa" | "delta" | "sigma" | "omega" | "spartan",
        ),
      );
    }

    // Plan filter: planId=0 means "no active subscription" (Sin plan),
    // planId>0 means filter by specific plan
    if (planId !== undefined) {
      if (planId === 0) {
        // Members with NO active/paused subscription
        conditions.push(
          sql`NOT EXISTS (
            SELECT 1 FROM subscriptions s
            WHERE s.user_id = users.id AND s.subscription_status IN ('active','paused')
          )`,
        );
      } else {
        // Members with active/paused subscription on this specific plan
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM subscriptions s
            WHERE s.user_id = users.id AND s.subscription_status IN ('active','paused') AND s.plan_id = ${planId}
          )`,
        );
      }
    }

    // Segment filter (Phase 136): filter by the Attendance label stored in
    // member_profiles.member_segment. The query param is validated against the
    // 4-band enum in schemas.ts before reaching here.
    if (segment !== undefined) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM member_profiles mp
          WHERE mp.user_id = users.id AND mp.member_segment = ${segment}
        )`,
      );
    }

    // Avatar type filter: filter by avatar type from member_profiles
    if (avatarType !== undefined) {
      if (avatarType === "none") {
        // "Sin avatar" filter — members with no avatar
        conditions.push(
          sql`NOT EXISTS (
            SELECT 1 FROM member_profiles mp
            WHERE mp.user_id = users.id AND mp.avatar_type IS NOT NULL
          )`,
        );
      } else {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM member_profiles mp
            WHERE mp.user_id = users.id AND mp.avatar_type = ${avatarType}
          )`,
        );
      }
    }

    // Phase 105 (TXN-04, D-10): restrict to users with at least one
    // outstanding balance (amount > 0) in the new finance cache. The
    // composite index idx_balances_amount_member(amount, member_id)
    // (Plan 01) backs this lookup. Replaces the previous EXISTS against
    // the dropped `debts` table.
    if (debtorOnly === true) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM balances b
          WHERE b.member_id = users.id AND b.amount > 0
        )`,
      );
    }

    // Effective status, computed live from subscriptions rather than read
    // from the (lazily-updated) users.status column. The persisted column is
    // a denormalized cache refreshed by recomputeUserStatus on subscription
    // transitions and by the daily auto-expire cron, but a member whose only
    // sub silently lapsed can carry a stale 'activo' until that runs. Deriving
    // here mirrors recomputeUserStatus's CASE exactly so the list (and its
    // status filter) is always correct, independent of cache freshness.
    // 'freemium'/'prueba' are not derivable from subs, so they pass through.
    const effectiveStatusExpr = sql<UserStatus>`(
      CASE
        WHEN EXISTS (
          SELECT 1 FROM subscriptions s
          WHERE s.user_id = users.id
            AND s.subscription_status IN ('active','paused')
            AND s.start_date <= CURDATE()
            AND (s.end_date IS NULL OR s.end_date >= CURDATE())
        ) THEN 'activo'
        WHEN users.status IN ('activo','inactivo') THEN 'inactivo'
        ELSE users.status
      END
    )`;

    // Status filter compares against the computed expression so it stays
    // consistent with what the list displays. 'todos' (or undefined) is a no-op.
    if (
      status === "freemium" ||
      status === "prueba" ||
      status === "activo" ||
      status === "inactivo"
    ) {
      conditions.push(sql`${effectiveStatusExpr} = ${status}`);
    }
    // status === "todos" or undefined → no-op

    const whereClause = and(...conditions);

    // Subquery: active subscription plan name (most recent if multiple)
    const planNameSubquery = sql<string | null>`(
      SELECT sp.name FROM subscriptions s
      JOIN subscription_plans sp ON sp.id = s.plan_id
      WHERE s.user_id = users.id AND s.subscription_status IN ('active','paused')
      ORDER BY s.created_at DESC LIMIT 1
    )`;

    // Subquery: Attendance label (Phase 136) from member_profiles. Reads the
    // physical column `member_segment` (name unchanged); the value is now one
    // of the 4 Attendance bands or NULL (<1 month / no active plan, D-07/D-08).
    const segmentSubquery = sql<MemberSegment | null>`(
      SELECT mp.member_segment FROM member_profiles mp
      WHERE mp.user_id = users.id LIMIT 1
    )`;

    // Subquery: avatar type from member_profiles
    const avatarTypeSubquery = sql<string | null>`(
      SELECT mp.avatar_type FROM member_profiles mp
      WHERE mp.user_id = users.id LIMIT 1
    )`;

    // Subquery: active/paused subscription end date for the Vencimiento
    // countdown pill (YYYY-MM-DD); null when no active/paused subscription.
    const endDateSubquery = sql<string | null>`(
      SELECT DATE_FORMAT(s.end_date, '%Y-%m-%d') FROM subscriptions s
      WHERE s.user_id = users.id AND s.subscription_status IN ('active','paused')
      ORDER BY s.created_at DESC LIMIT 1
    )`;

    // Phase 102 (R7): EXISTS projection for the trial-history boolean.
    // Returns 1/0 from MySQL; coerced to boolean in the mapper below.
    // Uses idx_bookings_member_date (member_id prefix) for the lookup.
    // Cancelled trials are excluded so that admin can cancel a trial booking
    // (from the slot dialog) to reset the chip back to 0/1 and re-schedule.
    const hasUsedTrialSubquery = sql<number>`(
      SELECT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.member_id = users.id AND b.is_trial = 1 AND b.booking_status != 'cancelado'
      )
    )`;

    // Run the three filter-scoped queries in parallel:
    //   1. COUNT(*) for pagination
    //   2. Paginated page SELECT
    //   3. Per-currency debt aggregate joined directly against the same
    //      filter set (replaces the previous two-step "collect filtered ids
    //      then SUM...IN(...)" round-trip from Phase 101 D-07).
    // Parallelism turns total latency into max(q1,q2,q3) instead of the sum.
    const countPromise = this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(whereClause);

    const rowsPromise = this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        phone: schema.users.phone,
        dni: schema.users.dni,
        documentType: schema.users.documentType,
        photoUrl: schema.users.photoUrl,
        level: schema.users.level,
        branchId: schema.users.branchId,
        branchName: schema.branches.name,
        // Computed live (see effectiveStatusExpr above) so a member whose
        // subscription lapsed reads 'inactivo' immediately, without waiting
        // for the auto-expire cron to refresh the persisted users.status.
        status: effectiveStatusExpr,
        createdAt: schema.users.createdAt,
        planName: planNameSubquery,
        segment: segmentSubquery,
        avatarType: avatarTypeSubquery,
        endDate: endDateSubquery,
        hasUsedTrial: hasUsedTrialSubquery,
      })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(whereClause)
      .orderBy(schema.users.firstName, schema.users.lastName)
      .limit(limit)
      .offset(offset);

    // Phase 105 (TXN-04, D-10): outstanding-balance aggregate per currency,
    // sourced from the `balances` cache (the dropped `debts` table replacement).
    // Filter `amount > 0` excludes saldo-a-favor rows (D-08 negative amounts)
    // and saldado rows (D-07 zero amounts kept for audit), so the banner
    // shows what members still owe. Response shape `TotalDebtRow[]` is
    // preserved unchanged for the AlumnosPage banner contract.
    //
    // Gated to owner/admin (includeTotalDebt): the aggregate is financial data
    // that gestion/coach/recepcion must not see. When not authorized we skip
    // the query outright and return an empty aggregate.
    const totalDebtPromise: Promise<TotalDebtRow[]> = includeTotalDebt
      ? this.db
          .select({
            currency: schema.balances.currency,
            amount: sql<number>`CAST(SUM(${schema.balances.amount}) AS SIGNED)`,
          })
          .from(schema.balances)
          .innerJoin(
            schema.users,
            eq(schema.users.id, schema.balances.memberId),
          )
          .innerJoin(
            schema.branches,
            eq(schema.branches.id, schema.users.branchId),
          )
          .where(and(sql`${schema.balances.amount} > 0`, whereClause))
          .groupBy(schema.balances.currency)
      : Promise.resolve<TotalDebtRow[]>([]);

    const [countResult, rows, totalDebtRows] = await Promise.all([
      countPromise,
      rowsPromise,
      totalDebtPromise,
    ]);

    const total = countResult[0]?.count ?? 0;
    const totalDebtByCurrency: TotalDebtRow[] = totalDebtRows.map((r) => ({
      currency: r.currency,
      amount: Number(r.amount),
    }));

    // Phase 105 (TXN-04, D-10): per-row `debt` enrichment is gone. The
    // aggregate banner (totalDebtByCurrency) covers the listing UX; if
    // Phase 108+ needs per-member breakdowns, a dedicated endpoint will
    // expose the new finance model directly.
    const members: MemberListItem[] = rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
      phone: r.phone,
      dni: r.dni,
      documentType: r.documentType,
      photoUrl: r.photoUrl ?? null,
      level: r.level,
      branchId: r.branchId,
      branchName: r.branchName,
      status: r.status,
      planName: r.planName ?? null,
      segment: r.segment ?? null,
      avatarType: r.avatarType ?? null,
      endDate: r.endDate ?? null,
      createdAt: r.createdAt.toISOString(),
      hasUsedTrial: Boolean(r.hasUsedTrial),
    }));

    return { members, total, totalDebtByCurrency };
  }

  /**
   * Lightweight member typeahead for the scheduling dialogs.
   *
   * Deliberately NOT a thin wrapper over listMembers: that endpoint runs a
   * COUNT(*), a per-currency debt aggregate, and five correlated subqueries
   * (status/plan/segment/avatar/trial) per row — all useless for an
   * autocomplete and the cause of the 10s timeout when searching a common
   * substring. This query projects only id/name/dni, so even though the
   * `LIKE '%token%'` is a full scan, materializing + ordering the matches is
   * cheap and the LIMIT keeps the result small.
   */
  async searchMembers(params: MemberSearchParams): Promise<MemberSearchItem[]> {
    const { search, country, limit } = params;

    const searchCondition = buildMemberNameSearchCondition(search);
    // No meaningful tokens (e.g. only whitespace) → nothing to search for.
    if (!searchCondition) return [];

    const conditions: SQL[] = [
      eq(schema.users.role, "member"),
      isNull(schema.users.deletedAt),
      searchCondition,
    ];

    // Country scope mirrors listMembers: members on virtual branches (e.g.
    // Templo Online) are cross-country and must stay visible to staff.
    if (country !== undefined) {
      const countryOrVirtual = or(
        eq(schema.branches.country, country),
        eq(schema.branches.isVirtual, true),
      );
      if (countryOrVirtual) conditions.push(countryOrVirtual);
    }

    // Active subscription plan name — same subquery as listMembers, for the
    // "Sin plan / Activa / Inactiva" badge in SlotAttendancePanel.
    const planNameSubquery = sql<string | null>`(
      SELECT sp.name FROM subscriptions s
      JOIN subscription_plans sp ON sp.id = s.plan_id
      WHERE s.user_id = users.id AND s.subscription_status IN ('active','paused')
      ORDER BY s.created_at DESC LIMIT 1
    )`;

    // Effective status computed live from subscriptions (mirrors listMembers'
    // effectiveStatusExpr) so a lapsed member reads 'inactivo' immediately,
    // without waiting for the auto-expire cron to refresh users.status.
    const effectiveStatusExpr = sql<UserStatus>`(
      CASE
        WHEN EXISTS (
          SELECT 1 FROM subscriptions s
          WHERE s.user_id = users.id
            AND s.subscription_status IN ('active','paused')
            AND s.start_date <= CURDATE()
            AND (s.end_date IS NULL OR s.end_date >= CURDATE())
        ) THEN 'activo'
        WHEN users.status IN ('activo','inactivo') THEN 'inactivo'
        ELSE users.status
      END
    )`;

    return this.db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        dni: schema.users.dni,
        planName: planNameSubquery,
        status: effectiveStatusExpr,
      })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(and(...conditions))
      .orderBy(schema.users.firstName, schema.users.lastName)
      .limit(limit);
  }

  /**
   * Get full member profile by ID. Returns null if not found.
   */
  async getMemberById(id: number): Promise<MemberProfile | null> {
    // Phase 103 (R10): users.status is the source of truth — direct
    // projection (no derived subquery).

    // Phase 102 (R7): same EXISTS predicate as the list endpoint — single
    // source of truth for hasUsedTrial semantics. Cancelled trials excluded.
    const hasUsedTrialSubquery = sql<number>`(
      SELECT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.member_id = users.id AND b.is_trial = 1 AND b.booking_status != 'cancelado'
      )
    )`;

    // Phase 114 (D-38): self-join to materialize the creator-admin's name
    // for the "Gestiona: <name>" caption in AlumnoDetailPage's "Datos de
    // Lead" block. Mirrors the same alias() pattern used by updateLead.
    const creator = alias(schema.users, "creator");

    const [row] = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        phone: schema.users.phone,
        dni: schema.users.dni,
        documentType: schema.users.documentType,
        photoUrl: schema.users.photoUrl,
        address: schema.users.address,
        dateOfBirth: schema.users.dateOfBirth,
        gender: schema.users.gender,
        emergencyContactName: schema.users.emergencyContactName,
        emergencyContactPhone: schema.users.emergencyContactPhone,
        emergencyContactRelationship: schema.users.emergencyContactRelationship,
        role: schema.users.role,
        level: schema.users.level,
        branchId: schema.users.branchId,
        branchName: schema.branches.name,
        branchCountry: schema.branches.country,
        status: schema.users.status,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
        hasUsedTrial: hasUsedTrialSubquery,
        leadStatus: schema.users.leadStatus,
        leadNotes: schema.users.leadNotes,
        purchasedPlanId: schema.users.purchasedPlanId,
        purchasedPlanName: schema.subscriptionPlans.name,
        creatorId: creator.id,
        creatorFirstName: creator.firstName,
        creatorLastName: creator.lastName,
      })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .leftJoin(creator, eq(creator.id, schema.users.createdBy))
      .leftJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.users.purchasedPlanId),
      )
      .where(and(eq(schema.users.id, id), isNull(schema.users.deletedAt)));

    if (!row) return null;

    // Latest non-cancelled trial booking for this member. One round-trip,
    // mirrors the attendance derivation used by the trial-sessions report
    // (reports/service.ts:1475). Returns null when the user never booked a
    // trial or all trial bookings are cancelled.
    const [trialRow] = await this.db
      .select({
        bookingId: schema.bookings.id,
        bookingDate: schema.bookings.bookingDate,
        startTime: schema.schedules.startTime,
        branchName: schema.branches.name,
        attendanceId: schema.attendance.id,
      })
      .from(schema.bookings)
      .innerJoin(
        schema.schedules,
        eq(schema.schedules.id, schema.bookings.scheduleId),
      )
      .innerJoin(
        schema.branches,
        eq(schema.branches.id, schema.schedules.branchId),
      )
      .leftJoin(
        schema.attendance,
        and(
          eq(schema.attendance.memberId, schema.bookings.memberId),
          eq(schema.attendance.scheduleId, schema.bookings.scheduleId),
          eq(schema.attendance.sessionDate, schema.bookings.bookingDate),
          eq(schema.attendance.status, "confirmado"),
        ),
      )
      .where(
        and(
          eq(schema.bookings.memberId, id),
          eq(schema.bookings.isTrial, true),
          ne(schema.bookings.status, "cancelado"),
        ),
      )
      .orderBy(desc(schema.bookings.bookingDate))
      .limit(1);

    // Domiciliación bancaria (SEPA): fila 1:1 opcional. Se devuelve siempre
    // que exista (aunque el socio se haya mudado a una sede no-ES) — el
    // gating de UI es por branchCountry, los datos no se pierden al mudarse.
    const [sepaRow] = await this.db
      .select({
        debtorName: schema.userSepaDetails.debtorName,
        address: schema.userSepaDetails.address,
        postalCode: schema.userSepaDetails.postalCode,
        city: schema.userSepaDetails.city,
        country: schema.userSepaDetails.country,
        nif: schema.userSepaDetails.nif,
        iban: schema.userSepaDetails.iban,
      })
      .from(schema.userSepaDetails)
      .where(eq(schema.userSepaDetails.userId, id))
      .limit(1);

    let latestTrial: MemberProfile["latestTrial"] = null;
    if (trialRow) {
      const today = new Date().toISOString().slice(0, 10);
      const attended: "si" | "no" | null =
        trialRow.attendanceId !== null
          ? "si"
          : trialRow.bookingDate < today
            ? "no"
            : null;
      latestTrial = {
        bookingId: trialRow.bookingId,
        bookingDate: trialRow.bookingDate,
        startTime: trialRow.startTime.slice(0, 5),
        branchName: trialRow.branchName,
        attended,
      };
    }

    return {
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      dni: row.dni,
      documentType: row.documentType,
      photoUrl: row.photoUrl ?? null,
      address: row.address,
      dateOfBirth: row.dateOfBirth,
      gender: row.gender,
      emergencyContactName: row.emergencyContactName,
      emergencyContactPhone: row.emergencyContactPhone,
      emergencyContactRelationship: row.emergencyContactRelationship,
      role: row.role,
      level: row.level,
      branchId: row.branchId,
      branchName: row.branchName,
      branchCountry: row.branchCountry,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      hasUsedTrial: Boolean(row.hasUsedTrial),
      leadStatus: row.leadStatus,
      leadNotes: row.leadNotes,
      purchasedPlanId: row.purchasedPlanId,
      purchasedPlanName: row.purchasedPlanName,
      createdBy: row.creatorId
        ? {
            userId: row.creatorId,
            name:
              [row.creatorFirstName, row.creatorLastName]
                .filter(Boolean)
                .join(" ")
                .trim() || "—",
          }
        : null,
      latestTrial,
      sepaDetails: sepaRow ?? null,
    };
  }

  /**
   * Create a new member with auto-generated password.
   * Returns the member profile and the temporary password (for email).
   * Throws on duplicate email or DNI.
   */
  async createMember(
    input: CreateMemberServiceInput,
  ): Promise<{ member: MemberProfile; tempPassword: string }> {
    const tempPassword = MEMBER_TEMP_PASSWORD;
    const passwordHash = await argon2.hash(tempPassword);

    type Level = "kairos" | "alfa" | "delta" | "sigma" | "omega" | "spartan";
    type Gender = "male" | "female" | "other";
    type DocType = "DNI" | "Pasaporte" | "NIE" | "NIF" | "Otro";

    // Phase 111-01 (REQ-9, D-26): trim firstName/lastName before insert.
    // Prevents the Soledad Mailland bug (trailing space stored in DB).
    // Phase 118-01 (D-02): wrap the user insert + status-history write in a
    // single tx so the 'prueba' transition is recorded atomically. New alta →
    // fromStatus=null, toStatus='prueba', source='admin' (staff-initiated).
    const userId = await this.db.transaction(async (tx) => {
      const result = await tx.insert(schema.users).values({
        email: input.email,
        passwordHash,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: input.phone,
        dni: input.dni,
        documentType: (input.documentType as DocType) || null,
        address: input.address || null,
        branchId: input.branchId,
        // Phase 130 (KAIROS-04, D-01): new members default to kairos when no
        // explicit level is supplied. An explicit input.level (e.g. 'delta') is
        // still honored — the default only applies when the field is omitted.
        level: (input.level as Level) || "kairos",
        dateOfBirth: input.dateOfBirth || null,
        gender: (input.gender as Gender) || null,
        emergencyContactName: input.emergencyContactName || null,
        emergencyContactPhone: input.emergencyContactPhone || null,
        emergencyContactRelationship:
          input.emergencyContactRelationship || null,
        role: "member",
        // Phase 157-03 (REF-03, D-08): canal asistido. referredBy ya viene
        // validado del route (socio real o undefined). Se persiste en el mismo
        // insert; el vínculo referrals(pending, assisted) se crea abajo.
        referredBy: input.referredBy ?? null,
        // Phase 103-04 (R7, D-12, BLOCKER 3): admin enrolling someone who walked
        // into a sede starts as 'prueba'. If planId is also provided, the
        // route handler calls subscriptionService.assignPlan which triggers
        // Plan 02's recomputeUserStatus → flips status to 'activo' inside
        // the same transaction. Single-owner edit per the wave-conflict
        // resolution.
        status: "prueba" as const,
      });

      const newUserId = Number(result[0].insertId);

      // Phase 118-01 (D-02): record the freemium-less alta → 'prueba'
      // transition. No prior status on a brand-new row, so fromStatus=null.
      await tx.insert(schema.userStatusHistory).values({
        userId: newUserId,
        fromStatus: null,
        toStatus: "prueba",
        source: "admin",
      });
      this.log.info(
        { userId: newUserId, fromStatus: null, toStatus: "prueba" },
        "user status transition recorded",
      );

      return newUserId;
    });

    // Phase 157-03 (milestone v5.5): referral attribution + eager code. Both
    // are best-effort and run OUTSIDE the user tx so a referral failure can
    // never roll back the alta (graceful degradation, T-157-11 / UI-SPEC hard
    // rule). The assisted link is written HERE — inside createMember, before
    // the route calls assignPlan — so plan 04's qualification flip finds the
    // pending link in the same request.
    const referralService = new ReferralService(this.db, this.log);

    // (1) Assisted attribution (REF-03, D-08). referredBy is the route-validated
    // referrer id; guard auto-referral (D-13) defensively. A second claim on the
    // same referred_id (UNIQUE, D-14) throws and is swallowed here.
    if (input.referredBy != null && input.referredBy !== userId) {
      try {
        await this.db.insert(schema.referrals).values({
          referrerId: input.referredBy,
          referredId: userId,
          status: "pending",
          attributionChannel: "assisted",
          createdBy: input.createdBy ?? null,
          // A/B copy test: variante del referidor (derivada de su id). Aunque el
          // alta asistida no pasa por la card, se estampa igual para no perder la
          // conversión en el denominador del reporte por variante.
          copyVariant: referralCopyVariant(input.referredBy),
        });
      } catch (err: unknown) {
        this.log.warn(
          {
            err: err instanceof Error ? err.message : String(err),
            referredBy: input.referredBy,
            userId,
          },
          "Assisted referral attribution failed (graceful degradation)",
        );
      }
    }

    // (2) Eager generation of the new member's OWN referral code (REF-01, D-25),
    // independent of referredBy. An irrecoverable UNIQUE collision leaves
    // referral_code NULL (the backfill covers it) and NEVER blocks the alta.
    try {
      await referralService.generateReferralCode(userId);
    } catch (err: unknown) {
      this.log.warn(
        { err: err instanceof Error ? err.message : String(err), userId },
        "Eager referral code generation failed (graceful degradation)",
      );
    }

    const member = await this.getMemberById(userId);

    if (!member) {
      throw new Error("Failed to retrieve newly created member");
    }

    return { member, tempPassword };
  }

  /**
   * Soft register a "sesión de prueba" lead. Only the 4 fields the
   * receptionist captures at the door — firstName/lastName/phone/branchId.
   * Email, DNI, document type and the rest stay NULL until the lead
   * converts (via the standard MemberFormDialog edit flow + assignPlan).
   *
   * Phase 114 (D-31): the new user row is initialized with
   * `lead_status='en_seguimiento'` and `created_by=<admin id>`. The
   * `createdBy` value MUST come from the route handler (sourced from the
   * JWT-authenticated admin) — the public request schema does NOT accept
   * `createdBy` from the client (createTrialMemberSchema has
   * additionalProperties:false, which Fastify's default AJV config strips
   * before the handler runs).
   *
   * Validation:
   *   - phone uniqueness across non-deleted users (normalized via
   *     normalizePhone — last 10 digits). Same-phone repeat would let the
   *     same person book a second trial via a different user row.
   */
  async createTrialMember(
    input: CreateTrialMemberServiceInput,
  ): Promise<{ member: MemberProfile; tempPassword: string }> {
    const normalizedPhone = normalizePhone(input.phone);
    if (!normalizedPhone) {
      throw new ConflictError("El teléfono ingresado no es válido");
    }

    const [existing] = await this.db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
      })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.phone, normalizedPhone),
          isNull(schema.users.deletedAt),
        ),
      )
      .limit(1);

    if (existing) {
      const name = [existing.firstName, existing.lastName]
        .filter(Boolean)
        .join(" ");
      throw new ConflictError(
        `Ya existe un alumno con ese teléfono${name ? ` (${name})` : ""}`,
      );
    }

    const tempPassword = MEMBER_TEMP_PASSWORD;
    const passwordHash = await argon2.hash(tempPassword);

    // Phase 118-01 (D-02): user insert + status-history write in one tx so the
    // new lead's 'prueba' transition is recorded atomically (fromStatus=null,
    // source='admin' — receptionist-initiated trial registration).
    const userId = await this.db.transaction(async (tx) => {
      const result = await tx.insert(schema.users).values({
        passwordHash,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: normalizedPhone,
        branchId: input.branchId,
        role: "member",
        // Phase 130 (KAIROS-04, D-01): admin-created trial/lead members are
        // born kairos like every other new member.
        level: "kairos",
        status: "prueba" as const,
        // Phase 114 D-31: lead lifecycle starts here. lead_status='en_seguimiento'
        // is the only valid initial value for an admin-created trial. created_by
        // is the JWT-authenticated admin from the route layer.
        leadStatus: "en_seguimiento" as const,
        leadStatusSource: "auto" as const, // Phase 163 (D-07): alta = automatismo
        createdBy: input.createdBy,
      });

      const newUserId = Number(result[0].insertId);

      await tx.insert(schema.userStatusHistory).values({
        userId: newUserId,
        fromStatus: null,
        toStatus: "prueba",
        source: "admin",
      });
      this.log.info(
        { userId: newUserId, fromStatus: null, toStatus: "prueba" },
        "user status transition recorded",
      );

      return newUserId;
    });

    const member = await this.getMemberById(userId);

    if (!member) {
      throw new Error("Failed to retrieve newly created trial member");
    }

    return { member, tempPassword };
  }

  /**
   * Phase 148 (ALTA-01): minimal alta for the PoS profe — nombre + apellido +
   * DNI + sucursal, sin email/teléfono. The member is born `status='prueba'`
   * (can check-in immediately, the crear-en-vivo + validar-después model) with
   * email=null; gestión completes email/phone when validating the charge in the
   * bandeja. Mirrors createTrialMember's tx structure (user insert +
   * userStatusHistory in one tx) but keys on DNI instead of phone.
   *
   * Returns the new userId. `createdBy` MUST come from the JWT-authenticated
   * user at the route layer (148-02), never the raw body (D-31 spoof guard).
   *
   * DNI uniqueness race (T-148-02): `users.dni` is UNIQUE. The orchestrator
   * (148-02) already dedups via checkDuplicates before calling, but two
   * concurrent altas for the same brand-new DNI could both pass that probe and
   * race to insert. Wrap the insert in an isDuplicateKeyError catch and, on a
   * dni dup, re-run checkDuplicates to return the now-existing member's id —
   * never surfacing an uncontrolled 500 nor creating a duplicate.
   */
  async createMinimalMember(
    input: CreateMinimalMemberServiceInput,
  ): Promise<number> {
    const dni = input.dni.trim();
    if (!dni) {
      throw new ConflictError("El DNI ingresado no es válido");
    }

    const passwordHash = await argon2.hash(MEMBER_TEMP_PASSWORD);

    try {
      // user insert + status-history write in one tx so the new alumno's
      // 'prueba' transition is recorded atomically (fromStatus=null,
      // source='admin' — staff/profe-initiated PoS alta).
      const userId = await this.db.transaction(async (tx) => {
        const result = await tx.insert(schema.users).values({
          passwordHash,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          dni,
          // email/phone intencionalmente null: el walk-in que paga en mostrador
          // no los aporta; gestión los completa al validar (CONTEXT L70-74).
          email: null,
          branchId: input.branchId,
          role: "member",
          // Phase 130 (KAIROS-04, D-01): nuevos miembros nacen kairos.
          level: "kairos",
          status: "prueba" as const,
          // Phase 148 (D-31): created_by es el usuario autenticado por JWT,
          // resuelto en la ruta orquestadora — nunca del body crudo.
          createdBy: input.createdBy,
        });

        const newUserId = Number(result[0].insertId);

        await tx.insert(schema.userStatusHistory).values({
          userId: newUserId,
          fromStatus: null,
          toStatus: "prueba",
          source: "admin",
        });
        this.log.info(
          { userId: newUserId, fromStatus: null, toStatus: "prueba" },
          "user status transition recorded",
        );

        return newUserId;
      });

      return userId;
    } catch (err: unknown) {
      // T-148-02: carrera contra el UNIQUE de dni. Re-dedup y devolver el
      // existente (backstop del dedup previo del orquestador 148-02).
      if (isDuplicateKeyError(err).isDuplicate) {
        const { matches } = await this.checkDuplicates({ dni });
        const existing = matches.find((m) => m.matchedField === "dni");
        if (existing) return existing.id;
      }
      throw err;
    }
  }

  /**
   * Convert a self-registered freemium member into a "sesión de prueba" lead.
   *
   * Mirrors the inverse of the prueba→activo conversion (assignPlan): instead
   * of moving a lead forward, this pulls a freemium user INTO the lead pipeline
   * so an admin can manage them as a trial prospect.
   *
   * Effects (all in a single UPDATE):
   *   - status:     'freemium' → 'prueba'
   *   - leadStatus: NULL → 'en_seguimiento' (lead lifecycle starts here, same
   *     initial value as createTrialMember / D-31)
   *   - createdBy:  set to the converting admin (sourced from the JWT in the
   *     route layer, never the request body)
   *   - branchId:   reassigned to the chosen PHYSICAL sede — that's where the
   *     trial session will later be booked (slots live on physical branches).
   *
   * Deliberately untouched:
   *   - converted_at stays NULL so the lead-conversion hook in
   *     recomputeUserStatus still fires correctly on the FIRST plan assignment
   *     (it gates on converted_at IS NULL + an is_trial booking).
   *   - email/dni/profile fields are kept — a freemium already has them, and a
   *     prueba is allowed to carry them.
   *
   * Guards:
   *   - 404 if the user doesn't exist or is soft-deleted.
   *   - 409 if the user is not freemium (only freemium → prueba is valid; an
   *     activo/inactivo/prueba user is rejected so we never clobber an existing
   *     lifecycle or downgrade a paying member).
   *   - 404 if the target branch doesn't exist.
   *   - 409 if the target branch is virtual (a trial session must be presencial).
   */
  async convertFreemiumToTrial(
    userId: number,
    input: ConvertFreemiumToTrialServiceInput,
  ): Promise<MemberProfile> {
    const [user] = await this.db
      .select({
        id: schema.users.id,
        status: schema.users.status,
        deletedAt: schema.users.deletedAt,
        phone: schema.users.phone,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user || user.deletedAt) {
      throw new NotFoundError("Alumno no encontrado");
    }
    if (user.status !== "freemium") {
      throw new ConflictError(
        "Solo se puede convertir a sesión de prueba un alumno freemium",
      );
    }

    // Fase 165 (D-02): ninguna alta de SP desde el admin puede quedar sin
    // teléfono del lead. CR-01: saneamos PRIMERO y rechazamos si el resultado no
    // tiene dígitos ("abc", "()", "n/a" pasaban el no-vacío y luego se dropeaban
    // silenciosamente → lead a 'prueba' sin teléfono, lo que D-02 prohíbe).
    // Espeja el gate de createTrialMember. Si el freemium no tiene phone en su
    // perfil y ninguno válido viene en el body, se rechaza con 409 accionable.
    // WR-02: sanitizePhoneForStorage preserva el prefijo país (no trunca a 10).
    // Si vino phone válido, se escribe en la MISMA tx que flipea el status.
    const phoneFromBody = input.phone?.trim()
      ? sanitizePhoneForStorage(input.phone)
      : "";
    if (!user.phone && !phoneFromBody) {
      throw new ConflictError(
        "Cargale el teléfono al lead antes de convertirlo a sesión de prueba",
      );
    }
    const phone = !user.phone ? phoneFromBody : undefined;

    const [branch] = await this.db
      .select({
        id: schema.branches.id,
        isVirtual: schema.branches.isVirtual,
      })
      .from(schema.branches)
      .where(eq(schema.branches.id, input.branchId))
      .limit(1);

    if (!branch) {
      throw new NotFoundError("Sede no encontrada");
    }
    if (branch.isVirtual) {
      throw new ConflictError(
        "La sesión de prueba debe asignarse a una sede física",
      );
    }

    // Phase 118-01 (D-02): the 409 guard above already restricts this path to
    // freemium → prueba, so the transition always changes the status — no
    // dedupe branch is needed here (TS narrows user.status to 'freemium', which
    // can never equal the 'prueba' we write). UPDATE + history insert run in the
    // same tx → rolls back together. source='admin' (admin-initiated convert).
    const statusBefore = user.status;
    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({
          status: "prueba" as const,
          leadStatus: "en_seguimiento" as const,
          leadStatusSource: "auto" as const, // Phase 163 (D-07): alta = automatismo
          createdBy: input.createdBy,
          branchId: input.branchId,
          ...(phone ? { phone } : {}),
        })
        .where(eq(schema.users.id, userId));

      await tx.insert(schema.userStatusHistory).values({
        userId,
        fromStatus: statusBefore,
        toStatus: "prueba",
        source: "admin",
      });
      this.log.info(
        { userId, fromStatus: statusBefore, toStatus: "prueba" },
        "user status transition recorded",
      );
    });

    const member = await this.getMemberById(userId);
    if (!member) {
      throw new Error("Failed to retrieve converted trial member");
    }
    return member;
  }

  /**
   * Phase 114 (D-27): PATCH /api/admin/leads/:userId — admin edits the lead
   * lifecycle fields (lead_status, lead_notes) of a user with status='prueba'.
   *
   * - D-28: rejects non-leads (status !== 'prueba') with ConflictError (409).
   * - D-28: empty-string lead_notes is normalized to NULL.
   * - Hotfix 2026-07: "Plan comprado" (purchased_plan_id) editable acá, con
   *   invariante 'ganado' ⇔ plan cargado:
   *     - setear un plan sin mandar leadStatus auto-setea 'ganado'
   *     - 'ganado' sin plan (ni en el input ni ya en la fila) → 409
   *     - borrar el plan dejando el estado en 'ganado' → 409
   *   lead_notes queda como texto libre puro — nunca se toca automáticamente.
   */
  async updateLead(
    userId: number,
    input: UpdateLeadInput,
  ): Promise<LeadSnapshot> {
    const [user] = await this.db
      .select({
        id: schema.users.id,
        status: schema.users.status,
        deletedAt: schema.users.deletedAt,
        leadStatus: schema.users.leadStatus,
        purchasedPlanId: schema.users.purchasedPlanId,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!user || user.deletedAt) {
      throw new NotFoundError("Lead no encontrado");
    }
    if (user.status !== "prueba") {
      throw new ConflictError(
        "El usuario no es un lead (status='prueba' requerido)",
      );
    }

    if (input.purchasedPlanId !== undefined && input.purchasedPlanId !== null) {
      const [plan] = await this.db
        .select({ id: schema.subscriptionPlans.id })
        .from(schema.subscriptionPlans)
        .where(eq(schema.subscriptionPlans.id, input.purchasedPlanId))
        .limit(1);
      if (!plan) {
        throw new BadRequestError("El plan indicado no existe");
      }
    }

    const updateData: Partial<typeof schema.users.$inferInsert> = {};
    if (input.leadStatus !== undefined) {
      updateData.leadStatus = input.leadStatus;
      updateData.leadStatusSource = "manual"; // Phase 163 (D-04): edición manual del estado
    }
    if (input.leadNotes !== undefined) {
      updateData.leadNotes =
        input.leadNotes === "" || input.leadNotes === null
          ? null
          : input.leadNotes;
    }
    if (input.purchasedPlanId !== undefined) {
      updateData.purchasedPlanId = input.purchasedPlanId;
    }

    // Invariante 'ganado' ⇔ plan comprado, evaluado sobre el estado RESULTANTE
    // (input pisa fila). Setear plan sin estado explícito promociona a 'ganado'
    // en el mismo UPDATE — nunca queda una fila plan-sin-ganado a mitad de camino.
    const nextStatus =
      input.leadStatus !== undefined ? input.leadStatus : user.leadStatus;
    const nextPlanId =
      input.purchasedPlanId !== undefined
        ? input.purchasedPlanId
        : user.purchasedPlanId;
    if (nextStatus === "ganado" && nextPlanId === null) {
      throw new ConflictError(
        "Un lead 'Ganado' requiere un plan comprado cargado",
      );
    }
    if (nextPlanId !== null && nextStatus !== "ganado") {
      if (input.leadStatus !== undefined) {
        // El caller pidió explícitamente un estado ≠ ganado con plan cargado.
        throw new ConflictError(
          "Un lead con plan comprado debe estar en estado 'Ganado' (quitá el plan o cambiá el estado)",
        );
      }
      updateData.leadStatus = "ganado";
      updateData.leadStatusSource = "manual"; // Phase 163 (D-04): promoción originada por el PATCH manual
    }

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(schema.users)
        .set(updateData)
        .where(eq(schema.users.id, userId));
    }

    // Re-fetch with the createdBy admin JOIN so the response payload renders
    // "Gestiona: <name>" without a second round-trip.
    const creator = alias(schema.users, "creator");
    const [snapshot] = await this.db
      .select({
        userId: schema.users.id,
        leadStatus: schema.users.leadStatus,
        leadNotes: schema.users.leadNotes,
        purchasedPlanId: schema.users.purchasedPlanId,
        purchasedPlanName: schema.subscriptionPlans.name,
        status: schema.users.status,
        creatorId: creator.id,
        creatorFirstName: creator.firstName,
        creatorLastName: creator.lastName,
      })
      .from(schema.users)
      .leftJoin(creator, eq(creator.id, schema.users.createdBy))
      .leftJoin(
        schema.subscriptionPlans,
        eq(schema.subscriptionPlans.id, schema.users.purchasedPlanId),
      )
      .where(eq(schema.users.id, userId))
      .limit(1);

    return {
      userId: snapshot.userId,
      leadStatus: snapshot.leadStatus,
      leadNotes: snapshot.leadNotes,
      purchasedPlanId: snapshot.purchasedPlanId,
      purchasedPlanName: snapshot.purchasedPlanName,
      status: snapshot.status,
      createdBy: snapshot.creatorId
        ? {
            userId: snapshot.creatorId,
            name:
              [snapshot.creatorFirstName, snapshot.creatorLastName]
                .filter(Boolean)
                .join(" ")
                .trim() || "—",
          }
        : null,
    };
  }

  /**
   * Phase 114 (D-29): branch-scope helper for PATCH /api/admin/leads/:userId.
   * Returns the lead's branchId (for canAccessBranch evaluation) or null when
   * the user does not exist or is soft-deleted. The route handler converts
   * null → 404 before reaching updateLead.
   */
  async getLeadBranchId(userId: number): Promise<number | null> {
    const [row] = await this.db
      .select({
        branchId: schema.users.branchId,
        deletedAt: schema.users.deletedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (!row || row.deletedAt) return null;
    return row.branchId;
  }

  /**
   * Update member profile fields. Password is never changeable here. Email is
   * write-once: it can be SET when the member has none yet (trial → alumno
   * conversion — trials are created with email=NULL), but an email already on
   * file stays immutable since it's the member's app login identity.
   */
  async updateMember(
    id: number,
    input: UpdateMemberInput,
  ): Promise<MemberProfile | null> {
    const existing = await this.getMemberById(id);
    if (!existing) return null;

    // Domiciliación (SEPA): validar el IBAN ANTES de tocar users, así un 400
    // no deja la edición aplicada a medias. Vacío/null es válido (carga
    // progresiva de la ficha) — solo se valida un IBAN presente.
    if (input.sepaDetails?.iban) {
      if (!isValidIban(input.sepaDetails.iban)) {
        throw new BadRequestError(
          "El IBAN ingresado no es válido (verificá los dígitos de control)",
        );
      }
    }

    // Build update object, only including provided fields
    const updateData: Partial<typeof schema.users.$inferInsert> = {};

    // Phase 111-01 (REQ-9, D-26): trim firstName/lastName before update.
    if (input.firstName !== undefined)
      updateData.firstName = input.firstName.trim();
    if (input.lastName !== undefined)
      updateData.lastName = input.lastName.trim();
    if (input.phone !== undefined) updateData.phone = input.phone;
    if (input.dni !== undefined) updateData.dni = input.dni;
    if (input.documentType !== undefined)
      updateData.documentType = input.documentType as
        | "DNI"
        | "Pasaporte"
        | "NIE"
        | "NIF"
        | "Otro"
        | null;
    if (input.photoUrl !== undefined) updateData.photoUrl = input.photoUrl;
    if (input.address !== undefined) updateData.address = input.address;
    if (input.dateOfBirth !== undefined)
      updateData.dateOfBirth = input.dateOfBirth;
    if (input.gender !== undefined)
      updateData.gender = input.gender as "male" | "female" | "other" | null;
    if (input.emergencyContactName !== undefined)
      updateData.emergencyContactName = input.emergencyContactName;
    if (input.emergencyContactPhone !== undefined)
      updateData.emergencyContactPhone = input.emergencyContactPhone;
    if (input.emergencyContactRelationship !== undefined)
      updateData.emergencyContactRelationship =
        input.emergencyContactRelationship;
    if (input.branchId !== undefined) updateData.branchId = input.branchId;
    if (input.level !== undefined) {
      const newLevel = input.level as
        | "kairos"
        | "alfa"
        | "delta"
        | "sigma"
        | "omega"
        | "spartan";
      updateData.level = newLevel;
      // Phase 130 (KAIROS-06, D-03/D-05): a coach manually CHANGING the level is
      // a sticky decision — set level_override=true so auto-graduation (Plan 02)
      // never reverts it. We must gate on an actual value change, not on
      // input.level being present: the admin edit form always sends the
      // member's current level alongside unrelated field edits (phone, DNI,
      // name), so keying off presence would poison the flag on every routine
      // edit and permanently kill auto-graduation (CR-01). When the level is
      // sent but unchanged, leave the flag untouched.
      if (newLevel !== existing.level) {
        updateData.levelOverride = true;
      }
    }

    // Write-once email: only set it when the member has none yet (trial →
    // alumno flow). Ignored silently if an email is already on file so we
    // never repoint an existing login identity from this generic edit path.
    if (
      input.email !== undefined &&
      input.email.trim() !== "" &&
      (existing.email === null || existing.email === "")
    ) {
      const email = input.email.trim();
      const [emailClash] = await this.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(
          and(
            eq(schema.users.email, email),
            ne(schema.users.id, id),
            isNull(schema.users.deletedAt),
          ),
        )
        .limit(1);
      if (emailClash) {
        throw new ConflictError("El email ingresado ya está en uso");
      }
      updateData.email = email;
    }

    if (Object.keys(updateData).length > 0) {
      // When the member's sede changes, cascade the destructive cleanup the
      // admin opted in to via the MemberFormDialog confirmation:
      //   1. Sync subscriptions.branch_id so the fixed-schedule editor
      //      (changeFixedSchedules) and capacity validation work against
      //      the new sede.
      //   2. Cancel future bookings — they're pinned to the old sede and
      //      no longer match the member's location.
      //   3. Drop subscription_schedules — the admin must reassign fixed
      //      slots in the new sede afterwards.
      // Bosch/Carmela case (may 2026) surfaced this — `changeFixedSchedules`
      // checks `schedule.branchId === subscription.branchId`, so without
      // (1) every edit attempt 400s. Without (2)/(3) the member keeps a
      // queue of phantom reservations in the old sede.
      //
      // Multi-sucursal exception: if any live sub belongs to a multi_branch
      // plan (Performance, Foundation+ today), the member is entitled to
      // reserve in any sede — cancelling future bookings or dropping fixed
      // schedules would be wrong. In that case we only sync sub.branch_id
      // (step 1) and leave bookings + schedules alone.
      const branchChanged =
        input.branchId !== undefined && input.branchId !== existing.branchId;
      await this.db.transaction(async (tx) => {
        await tx
          .update(schema.users)
          .set(updateData)
          .where(eq(schema.users.id, id));
        if (branchChanged) {
          // Detect whether any live sub is multi_branch — that disables the
          // destructive cleanup and keeps the member's bookings/schedules
          // intact across sedes.
          const liveSubs = await tx
            .select({
              id: schema.subscriptions.id,
              multiBranch: schema.subscriptionPlans.multiBranch,
            })
            .from(schema.subscriptions)
            .innerJoin(
              schema.subscriptionPlans,
              eq(schema.subscriptionPlans.id, schema.subscriptions.planId),
            )
            .where(
              and(
                eq(schema.subscriptions.userId, id),
                inArray(schema.subscriptions.status, [
                  "active",
                  "scheduled",
                  "paused",
                ]),
              ),
            );
          const hasMultiBranchPlan = liveSubs.some((s) => s.multiBranch);

          // 1. Sync sub.branchId for live subs (always — regardless of
          //    multi-branch). The "principal" sede follows the member.
          await tx
            .update(schema.subscriptions)
            .set({ branchId: input.branchId as number })
            .where(
              and(
                eq(schema.subscriptions.userId, id),
                inArray(schema.subscriptions.status, [
                  "active",
                  "scheduled",
                  "paused",
                ]),
              ),
            );

          if (!hasMultiBranchPlan) {
            // 2. Cancel future bookings (today and onwards). Past bookings
            //    stay untouched for attendance/history.
            const todayStr = new Date().toISOString().split("T")[0];
            await tx
              .update(schema.bookings)
              .set({
                status: "cancelado",
                cancelledAt: new Date(),
              })
              .where(
                and(
                  eq(schema.bookings.memberId, id),
                  inArray(schema.bookings.status, ["reservado", "confirmado"]),
                  gte(schema.bookings.bookingDate, todayStr),
                ),
              );

            // 3. Drop fixed-schedule anchors for this member's live subs so
            //    the admin can reassign them in the new sede.
            if (liveSubs.length > 0) {
              await tx.delete(schema.subscriptionSchedules).where(
                inArray(
                  schema.subscriptionSchedules.subscriptionId,
                  liveSubs.map((r) => r.id),
                ),
              );
            }
          }
        }
      });
    }

    // Upsert de la fila SEPA 1:1 (después de la tx de users: su única falla
    // esperable —IBAN inválido— ya se rechazó arriba). Enviar sepaDetails
    // con todos los campos en null limpia los datos pero conserva la fila.
    if (input.sepaDetails !== undefined) {
      const sepa = input.sepaDetails;
      const normalize = (v: string | null | undefined): string | null => {
        const trimmed = v?.trim();
        return trimmed ? trimmed : null;
      };
      const sepaData = {
        debtorName: normalize(sepa.debtorName),
        address: normalize(sepa.address),
        postalCode: normalize(sepa.postalCode),
        city: normalize(sepa.city),
        country: normalize(sepa.country)?.toUpperCase() ?? "ES",
        nif: normalize(sepa.nif)?.toUpperCase() ?? null,
        iban: sepa.iban ? normalizeIban(sepa.iban) : null,
      };
      await this.db
        .insert(schema.userSepaDetails)
        .values({ userId: id, ...sepaData })
        .onDuplicateKeyUpdate({ set: sepaData });
    }

    return this.getMemberById(id);
  }

  /**
   * Soft-delete a member. Sets deletedAt, rewrites email to a deleted-shaped
   * placeholder, and nulls out DNI. The unique email and dni are scrubbed
   * so the real values can be reused if the person re-registers (the
   * operational trigger for this feature: post-password-policy change, a
   * handful of alumnos couldn't be re-onboarded because their real email
   * was still occupying the row). The read side filters by deletedAt IS
   * NULL — no users.status transition needed (the row is hidden everywhere).
   *
   * FK-bearing history (financial_transactions, subscriptions, bookings,
   * aura, etc.) is deliberately kept intact: the row stays so audit trails
   * and reports don't change. Listing/reading endpoints filter by
   * deletedAt IS NULL.
   *
   * Returns:
   *   - { ok: true }                    on success
   *   - { ok: false, reason: "not_found" }
   *   - { ok: false, reason: "not_member" } — refuses to delete non-members
   *                                           (coach/admin/owner/etc.)
   *   - { ok: false, reason: "already_deleted" }
   */
  async softDeleteMember(
    id: number,
  ): Promise<
    | { ok: true }
    | { ok: false; reason: "not_found" | "not_member" | "already_deleted" }
  > {
    const [existing] = await this.db
      .select({
        id: schema.users.id,
        role: schema.users.role,
        deletedAt: schema.users.deletedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);

    if (!existing) return { ok: false, reason: "not_found" };
    if (existing.role !== "member") return { ok: false, reason: "not_member" };
    if (existing.deletedAt) return { ok: false, reason: "already_deleted" };

    const timestamp = Date.now();
    const scrubbedEmail = `deleted-${id}-${timestamp}@deleted.local`;

    await this.db
      .update(schema.users)
      .set({
        deletedAt: new Date(),
        email: scrubbedEmail,
        dni: null,
      })
      .where(eq(schema.users.id, id));

    return { ok: true };
  }

  /**
   * Reset a member's password to MEMBER_TEMP_PASSWORD ("eltemplo2026").
   * Refuses non-members and soft-deleted rows.
   *
   * Returns:
   *   - { ok: true }
   *   - { ok: false, reason: "not_found" }
   *   - { ok: false, reason: "not_member" } — refuses staff
   *   - { ok: false, reason: "deleted" }    — refuses soft-deleted rows
   */
  async resetMemberPassword(
    id: number,
  ): Promise<
    { ok: true } | { ok: false; reason: "not_found" | "not_member" | "deleted" }
  > {
    const [existing] = await this.db
      .select({
        id: schema.users.id,
        role: schema.users.role,
        deletedAt: schema.users.deletedAt,
      })
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);

    if (!existing) return { ok: false, reason: "not_found" };
    if (existing.deletedAt) return { ok: false, reason: "deleted" };
    if (existing.role !== "member") return { ok: false, reason: "not_member" };

    const passwordHash = await argon2.hash(MEMBER_TEMP_PASSWORD);

    await this.db
      .update(schema.users)
      .set({ passwordHash })
      .where(eq(schema.users.id, id));

    return { ok: true };
  }

  /**
   * Check if a DNI is available (unique).
   * Optionally excludes a specific user (for edit scenarios).
   */
  async checkDniUniqueness(
    dni: string,
    excludeUserId?: number,
  ): Promise<DniCheckResult> {
    const conditions = [eq(schema.users.dni, dni)];

    if (excludeUserId !== undefined) {
      conditions.push(ne(schema.users.id, excludeUserId));
    }

    const [existing] = await this.db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
      })
      .from(schema.users)
      .where(and(...conditions))
      .limit(1);

    if (existing) {
      const name = [existing.firstName, existing.lastName]
        .filter(Boolean)
        .join(" ");
      return { available: false, existingMemberName: name || "Unknown" };
    }

    return { available: true };
  }

  /**
   * Check for duplicate users matching by DNI exact OR phone normalized
   * (last-10 digits, AR mobile convention). Excludes soft-deleted users.
   *
   * Phase 111 Plan 04 (REQ-4). Phone match runs at SQL level via
   * `RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 10) = ?` — no schema
   * changes, no new index (D-05 / CONTEXT "Out of scope: phone column").
   *
   * If both `dni` and `phone` are provided, returns the union of matches
   * deduplicated by user id. When a single row matches on both criteria,
   * `matchedField='dni'` is preferred so the admin sees the stronger
   * identifier first.
   */
  async checkDuplicates(opts: { dni?: string; phone?: string }): Promise<{
    matches: Array<{
      id: number;
      firstName: string | null;
      lastName: string | null;
      branchId: number;
      branchName: string;
      isVirtual: boolean;
      status: string | null;
      deletedAt: string | null;
      matchedField: "dni" | "phone";
    }>;
  }> {
    const dniInput = opts.dni?.trim() || undefined;
    const phoneNormalized = opts.phone ? normalizePhone(opts.phone) : undefined;

    // No usable criteria → nothing to query (route already guards 400 in
    // the missing-both case; this is the additional defensive path when
    // phone normalizes to "" or dni is whitespace).
    const orParts: SQL[] = [];
    if (dniInput) orParts.push(eq(schema.users.dni, dniInput));
    if (phoneNormalized && phoneNormalized.length > 0) {
      orParts.push(
        sql`RIGHT(REGEXP_REPLACE(${schema.users.phone}, '[^0-9]', ''), 10) = ${phoneNormalized}`,
      );
    }
    if (orParts.length === 0) return { matches: [] };

    const rows = await this.db
      .select({
        id: schema.users.id,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        branchId: schema.users.branchId,
        branchName: schema.branches.name,
        isVirtual: schema.branches.isVirtual,
        status: schema.users.status,
        deletedAt: schema.users.deletedAt,
        dni: schema.users.dni,
        phone: schema.users.phone,
      })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.users.branchId, schema.branches.id))
      .where(and(or(...orParts), isNull(schema.users.deletedAt)));

    // Deduplicate by user id; prefer dni when both criteria match the row.
    const seen = new Map<number, (typeof rows)[number]>();
    for (const r of rows) {
      if (!seen.has(r.id)) seen.set(r.id, r);
    }

    const matches = Array.from(seen.values()).map((r) => {
      const matchedField: "dni" | "phone" =
        dniInput && r.dni === dniInput ? "dni" : "phone";
      return {
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        branchId: r.branchId,
        branchName: r.branchName,
        isVirtual: Boolean(r.isVirtual),
        status: r.status ?? null,
        deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
        matchedField,
      };
    });

    return { matches };
  }

  /**
   * Update just the photo_url column for a given user.
   */
  async updatePhoto(userId: number, photoUrl: string): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ photoUrl })
      .where(eq(schema.users.id, userId));
  }

  // ─── Export ──────────────────────────────────────────────────────────

  /**
   * Export all members matching filters (no pagination) as rows for Excel export.
   * Reuses the same filter logic as listMembers but without offset/limit.
   */
  async exportMembers(
    params: Omit<MemberListParams, "page" | "limit">,
  ): Promise<MemberExportRow[]> {
    const {
      search,
      branchId,
      multiBranch,
      level,
      status,
      planId,
      avatarType,
      country,
    } = params;

    const conditions: ReturnType<typeof eq>[] = [];

    conditions.push(eq(schema.users.role, "member"));
    // Hide soft-deleted rows from exports (mirrors listMembers).
    conditions.push(isNull(schema.users.deletedAt));

    if (search) {
      const condition = buildMemberNameSearchCondition(search);
      if (condition) conditions.push(condition);
    }

    if (multiBranch === true) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM subscriptions sub
          INNER JOIN subscription_plans sp ON sp.id = sub.plan_id
          WHERE sub.user_id = ${schema.users.id}
            AND sp.multi_branch = 1
            AND (sub.subscription_status = 'active' OR sub.end_date >= CURDATE())
        )`,
      );
    } else if (branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, branchId));
    }

    // Country scope (Phase 98): filter export by the member's branch country
    // so /export never leaks cross-country rows even when the client omits
    // ?country=. The branches innerJoin below resolves this column. Virtual
    // branches (e.g. ONLINE) are cross-country so self-registered members
    // remain exportable by staff of either country until reassigned.
    if (country !== undefined) {
      const countryOrVirtual = or(
        eq(schema.branches.country, country),
        eq(schema.branches.isVirtual, true),
      );
      if (countryOrVirtual) conditions.push(countryOrVirtual);
    }

    if (level !== undefined) {
      conditions.push(
        eq(
          schema.users.level,
          level as "kairos" | "alfa" | "delta" | "sigma" | "omega" | "spartan",
        ),
      );
    }

    // Phase 103 (R8): export uses the same first-class status filter as
    // listMembers (no derived isActiveSubquery).
    if (
      status === "freemium" ||
      status === "prueba" ||
      status === "activo" ||
      status === "inactivo"
    ) {
      conditions.push(eq(schema.users.status, status));
    }

    if (planId !== undefined) {
      if (planId === 0) {
        conditions.push(
          sql`NOT EXISTS (
            SELECT 1 FROM subscriptions s
            WHERE s.user_id = users.id AND s.subscription_status IN ('active','paused')
          )`,
        );
      } else {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM subscriptions s
            WHERE s.user_id = users.id AND s.subscription_status IN ('active','paused') AND s.plan_id = ${planId}
          )`,
        );
      }
    }

    // Avatar type filter: filter by avatar type from member_profiles
    if (avatarType !== undefined) {
      if (avatarType === "none") {
        conditions.push(
          sql`NOT EXISTS (
            SELECT 1 FROM member_profiles mp
            WHERE mp.user_id = users.id AND mp.avatar_type IS NOT NULL
          )`,
        );
      } else {
        conditions.push(
          sql`EXISTS (
            SELECT 1 FROM member_profiles mp
            WHERE mp.user_id = users.id AND mp.avatar_type = ${avatarType}
          )`,
        );
      }
    }

    const whereClause = and(...conditions);

    // Subquery: active subscription plan name
    const planNameSubquery = sql<string | null>`(
      SELECT sp.name FROM subscriptions s
      JOIN subscription_plans sp ON sp.id = s.plan_id
      WHERE s.user_id = users.id AND s.subscription_status IN ('active','paused')
      ORDER BY s.created_at DESC LIMIT 1
    )`;

    // Subquery: subscription end date
    const endDateSubquery = sql<string | null>`(
      SELECT DATE_FORMAT(s.end_date, '%Y-%m-%d') FROM subscriptions s
      WHERE s.user_id = users.id AND s.subscription_status IN ('active','paused')
      ORDER BY s.created_at DESC LIMIT 1
    )`;

    const rows = await this.db
      .select({
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        email: schema.users.email,
        dni: schema.users.dni,
        phone: schema.users.phone,
        branchName: schema.branches.name,
        level: schema.users.level,
        // Phase 103 (R10): direct projection of users.status (replaces the
        // legacy isActiveSubquery). Mapping below renders the 4-state label.
        status: schema.users.status,
        planName: planNameSubquery,
        endDate: endDateSubquery,
        dateOfBirth: schema.users.dateOfBirth,
        address: schema.users.address,
      })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(whereClause)
      .orderBy(schema.users.lastName, schema.users.firstName);

    // Phase 103 (R10, D-09): 4-state label mapping for the export 'Estado'
    // column. NULL (staff) is filtered out by role='member' above; defensive
    // empty-string fallback preserved.
    const STATUS_LABELS: Record<string, string> = {
      freemium: "Freemium",
      prueba: "En Prueba",
      activo: "Activo",
      inactivo: "Inactivo",
    };

    return rows.map((r) => ({
      nombre: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
      email: r.email,
      dni: r.dni ?? "",
      telefono: r.phone ?? "",
      sucursal: r.branchName,
      nivel: r.level.charAt(0).toUpperCase() + r.level.slice(1),
      plan: r.planName ?? "Sin plan",
      estado: r.status ? (STATUS_LABELS[r.status] ?? "") : "",
      vencimientoSuscripcion: r.endDate ?? "",
      fechaNacimiento: r.dateOfBirth ?? "",
      direccion: r.address ?? "",
    }));
  }

  /**
   * Filas del export mensual de domiciliación bancaria (España): socios de
   * sedes ES con sus datos SEPA, para el archivo que se le pasa al banco.
   *
   * "Activo" se computa con activeMemberExists (EXISTS vivo sobre
   * subscriptions), NO con users.status — la columna driftea (fantasmas
   * 2026-05-26) y un socio dado de baja no puede colarse en el débito
   * bancario del mes.
   */
  async exportSepaMembers(params: {
    branchId?: number;
    status?: "activo" | "todos";
  }): Promise<SepaExportRow[]> {
    const conditions: SQL[] = [
      eq(schema.users.role, "member"),
      isNull(schema.users.deletedAt),
      eq(schema.branches.country, "ES"),
    ];

    if (params.branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, params.branchId));
    }

    // Default 'activo': el archivo del banco es solo de socios con cuota
    // vigente. 'todos' queda para control/auditoría de datos cargados.
    if (params.status !== "todos") {
      conditions.push(activeMemberExists(schema.users.id));
    }

    const planNameSubquery = sql<string | null>`(
      SELECT sp.name FROM subscriptions s
      JOIN subscription_plans sp ON sp.id = s.plan_id
      WHERE s.user_id = users.id AND s.subscription_status IN ('active','paused')
      ORDER BY s.created_at DESC LIMIT 1
    )`;

    const rows = await this.db
      .select({
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        email: schema.users.email,
        branchName: schema.branches.name,
        planName: planNameSubquery,
        debtorName: schema.userSepaDetails.debtorName,
        nif: schema.userSepaDetails.nif,
        iban: schema.userSepaDetails.iban,
        address: schema.userSepaDetails.address,
        postalCode: schema.userSepaDetails.postalCode,
        city: schema.userSepaDetails.city,
        country: schema.userSepaDetails.country,
      })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .leftJoin(
        schema.userSepaDetails,
        eq(schema.userSepaDetails.userId, schema.users.id),
      )
      .where(and(...conditions))
      .orderBy(schema.users.lastName, schema.users.firstName);

    return rows.map((r) => ({
      socio: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
      email: r.email ?? "",
      plan: r.planName ?? "Sin plan",
      sucursal: r.branchName,
      deudor: r.debtorName ?? "",
      nif: r.nif ?? "",
      iban: r.iban ?? "",
      direccion: r.address ?? "",
      codigoPostal: r.postalCode ?? "",
      poblacion: r.city ?? "",
      pais: r.country ?? "",
    }));
  }

  // ─── Notes ─────────────────────────────────────────────────────────────

  /**
   * List notes for a user, ordered by most recent first.
   * Joins author info for display.
   */
  async getNotes(userId: number): Promise<MemberNote[]> {
    // Alias for author table
    const authorUsers = schema.users;

    const rows = await this.db
      .select({
        id: schema.memberNotes.id,
        userId: schema.memberNotes.userId,
        authorId: schema.memberNotes.authorId,
        authorFirstName: authorUsers.firstName,
        authorLastName: authorUsers.lastName,
        content: schema.memberNotes.content,
        createdAt: schema.memberNotes.createdAt,
        updatedAt: schema.memberNotes.updatedAt,
      })
      .from(schema.memberNotes)
      .innerJoin(authorUsers, eq(authorUsers.id, schema.memberNotes.authorId))
      .where(eq(schema.memberNotes.userId, userId))
      .orderBy(desc(schema.memberNotes.createdAt));

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      authorId: r.authorId,
      authorName: [r.authorFirstName, r.authorLastName]
        .filter(Boolean)
        .join(" "),
      content: r.content,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  /**
   * Create a note on a member profile.
   */
  async createNote(
    authorId: number,
    input: CreateNoteInput,
  ): Promise<MemberNote> {
    const result = await this.db.insert(schema.memberNotes).values({
      userId: input.userId,
      authorId,
      content: input.content,
    });

    const noteId = Number(result[0].insertId);
    const notes = await this.getNotes(input.userId);
    const note = notes.find((n) => n.id === noteId);

    if (!note) {
      throw new Error("Failed to retrieve newly created note");
    }

    return note;
  }

  /**
   * Update note content.
   */
  async updateNote(
    noteId: number,
    input: UpdateNoteInput,
  ): Promise<MemberNote | null> {
    const [existing] = await this.db
      .select({
        id: schema.memberNotes.id,
        userId: schema.memberNotes.userId,
      })
      .from(schema.memberNotes)
      .where(eq(schema.memberNotes.id, noteId));

    if (!existing) return null;

    await this.db
      .update(schema.memberNotes)
      .set({ content: input.content })
      .where(eq(schema.memberNotes.id, noteId));

    const notes = await this.getNotes(existing.userId);
    return notes.find((n) => n.id === noteId) ?? null;
  }

  /**
   * Delete a note.
   */
  async deleteNote(noteId: number): Promise<boolean> {
    const [existing] = await this.db
      .select({ id: schema.memberNotes.id })
      .from(schema.memberNotes)
      .where(eq(schema.memberNotes.id, noteId));

    if (!existing) return false;

    await this.db
      .delete(schema.memberNotes)
      .where(eq(schema.memberNotes.id, noteId));

    return true;
  }

  /**
   * Check if a user can edit/delete a note.
   * Authors can edit their own notes; admin/owner can edit/delete any.
   */
  canEditNote(noteAuthorId: number, userId: number, userRole: string): boolean {
    if (userRole === "admin" || userRole === "owner") return true;
    return noteAuthorId === userId;
  }

  // ─── Session Level Counts (Phase 99 R11) ───────────────────────────────

  /**
   * Return per-level session completion counts for a member over the last
   * `days` days. Only levels with count > 0 are returned. Order is not
   * guaranteed and is not asserted by the client.
   */
  async getSessionLevelCounts(
    userId: number,
    days: number,
  ): Promise<Array<{ level: TrainingLevel; count: number }>> {
    const since = new Date(Date.now() - days * 86400000)
      .toISOString()
      .slice(0, 10);

    const rows = await this.db
      .select({
        level: schema.completedSessions.sessionLevel,
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(schema.completedSessions)
      .where(
        and(
          eq(schema.completedSessions.userId, userId),
          gte(schema.completedSessions.date, since),
        ),
      )
      .groupBy(schema.completedSessions.sessionLevel);

    return rows
      .map((r) => ({ level: r.level as TrainingLevel, count: Number(r.count) }))
      .filter((r) => r.count > 0);
  }
}
