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
import { buildMemberNameSearchCondition, normalizePhone } from "../shared";
import type { TrainingLevel } from "../shared/training-constants";
import type {
  MemberListParams,
  MemberListItem,
  MemberProfile,
  MemberExportRow,
  CreateMemberInput,
  CreateTrialMemberServiceInput,
  UpdateLeadInput,
  LeadSnapshot,
  UpdateMemberInput,
  MemberNote,
  CreateNoteInput,
  UpdateNoteInput,
  DniCheckResult,
  TotalDebtRow,
} from "./types";
import { ConflictError, NotFoundError } from "../shared/errors";
import { alias } from "drizzle-orm/mysql-core";

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
          level as "alfa" | "delta" | "sigma" | "omega" | "spartan",
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

    // Segment filter: filter by behavioral segment from member_profiles
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

    // Phase 103 (R8): direct read of users.status. The legacy 'leads'/'alumnos'
    // derivation is gone — Plan 02's recomputeUserStatus keeps users.status in
    // sync with subscription/booking transitions, so a single column read is
    // the truth. 'todos' (or undefined) is a no-op.
    if (
      status === "freemium" ||
      status === "prueba" ||
      status === "activo" ||
      status === "inactivo"
    ) {
      conditions.push(eq(schema.users.status, status));
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

    // Subquery: behavioral segment from member_profiles
    const segmentSubquery = sql<string | null>`(
      SELECT mp.member_segment FROM member_profiles mp
      WHERE mp.user_id = users.id LIMIT 1
    )`;

    // Subquery: avatar type from member_profiles
    const avatarTypeSubquery = sql<string | null>`(
      SELECT mp.avatar_type FROM member_profiles mp
      WHERE mp.user_id = users.id LIMIT 1
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
        // Phase 103 (R10): direct projection of users.status (replaces
        // the derived isActiveSubquery). Plan 02's recomputeUserStatus
        // keeps this column in sync with sub create/cancel transitions.
        status: schema.users.status,
        createdAt: schema.users.createdAt,
        planName: planNameSubquery,
        segment: segmentSubquery,
        avatarType: avatarTypeSubquery,
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
    const totalDebtPromise = this.db
      .select({
        currency: schema.balances.currency,
        amount: sql<number>`CAST(SUM(${schema.balances.amount}) AS SIGNED)`,
      })
      .from(schema.balances)
      .innerJoin(schema.users, eq(schema.users.id, schema.balances.memberId))
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(and(sql`${schema.balances.amount} > 0`, whereClause))
      .groupBy(schema.balances.currency);

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
      createdAt: r.createdAt.toISOString(),
      hasUsedTrial: Boolean(r.hasUsedTrial),
    }));

    return { members, total, totalDebtByCurrency };
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
        status: schema.users.status,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
        hasUsedTrial: hasUsedTrialSubquery,
        leadStatus: schema.users.leadStatus,
        leadNotes: schema.users.leadNotes,
        creatorId: creator.id,
        creatorFirstName: creator.firstName,
        creatorLastName: creator.lastName,
      })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .leftJoin(creator, eq(creator.id, schema.users.createdBy))
      .where(and(eq(schema.users.id, id), isNull(schema.users.deletedAt)));

    if (!row) return null;

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
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      hasUsedTrial: Boolean(row.hasUsedTrial),
      leadStatus: row.leadStatus,
      leadNotes: row.leadNotes,
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
    };
  }

  /**
   * Create a new member with auto-generated password.
   * Returns the member profile and the temporary password (for email).
   * Throws on duplicate email or DNI.
   */
  async createMember(
    input: CreateMemberInput,
  ): Promise<{ member: MemberProfile; tempPassword: string }> {
    const tempPassword = MEMBER_TEMP_PASSWORD;
    const passwordHash = await argon2.hash(tempPassword);

    type Level = "alfa" | "delta" | "sigma" | "omega" | "spartan";
    type Gender = "male" | "female" | "other";
    type DocType = "DNI" | "Pasaporte" | "NIE" | "NIF" | "Otro";

    // Phase 111-01 (REQ-9, D-26): trim firstName/lastName before insert.
    // Prevents the Soledad Mailland bug (trailing space stored in DB).
    const result = await this.db.insert(schema.users).values({
      email: input.email,
      passwordHash,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone,
      dni: input.dni,
      documentType: (input.documentType as DocType) || null,
      address: input.address || null,
      branchId: input.branchId,
      level: (input.level as Level) || "alfa",
      dateOfBirth: input.dateOfBirth || null,
      gender: (input.gender as Gender) || null,
      emergencyContactName: input.emergencyContactName || null,
      emergencyContactPhone: input.emergencyContactPhone || null,
      emergencyContactRelationship: input.emergencyContactRelationship || null,
      role: "member",
      // Phase 103-04 (R7, D-12, BLOCKER 3): admin enrolling someone who walked
      // into a sede starts as 'prueba'. If planId is also provided, the
      // route handler calls subscriptionService.assignPlan which triggers
      // Plan 02's recomputeUserStatus → flips status to 'activo' inside
      // the same transaction. Single-owner edit per the wave-conflict
      // resolution.
      status: "prueba" as const,
    });

    const userId = Number(result[0].insertId);
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

    const result = await this.db.insert(schema.users).values({
      passwordHash,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: normalizedPhone,
      branchId: input.branchId,
      role: "member",
      level: "alfa",
      status: "prueba" as const,
      // Phase 114 D-31: lead lifecycle starts here. lead_status='en_seguimiento'
      // is the only valid initial value for an admin-created trial. created_by
      // is the JWT-authenticated admin from the route layer.
      leadStatus: "en_seguimiento" as const,
      createdBy: input.createdBy,
    });

    const userId = Number(result[0].insertId);
    const member = await this.getMemberById(userId);

    if (!member) {
      throw new Error("Failed to retrieve newly created trial member");
    }

    return { member, tempPassword };
  }

  /**
   * Phase 114 (D-27): PATCH /api/admin/leads/:userId — admin edits the lead
   * lifecycle fields (lead_status, lead_notes) of a user with status='prueba'.
   *
   * - D-28: rejects non-leads (status !== 'prueba') with ConflictError (409).
   * - D-28: empty-string lead_notes is normalized to NULL.
   * - D-34: manual lead_status='cerrado' edits do NOT auto-modify lead_notes.
   *   Only the subscription-create hook (Plan 03 / recomputeUserStatus)
   *   prefixes the plan name into lead_notes on conversion.
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

    const updateData: Partial<typeof schema.users.$inferInsert> = {};
    if (input.leadStatus !== undefined) {
      updateData.leadStatus = input.leadStatus;
    }
    if (input.leadNotes !== undefined) {
      updateData.leadNotes =
        input.leadNotes === "" || input.leadNotes === null
          ? null
          : input.leadNotes;
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
        status: schema.users.status,
        creatorId: creator.id,
        creatorFirstName: creator.firstName,
        creatorLastName: creator.lastName,
      })
      .from(schema.users)
      .leftJoin(creator, eq(creator.id, schema.users.createdBy))
      .where(eq(schema.users.id, userId))
      .limit(1);

    return {
      userId: snapshot.userId,
      leadStatus: snapshot.leadStatus,
      leadNotes: snapshot.leadNotes,
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
   * Update member profile fields. Does NOT allow changing email or password.
   */
  async updateMember(
    id: number,
    input: UpdateMemberInput,
  ): Promise<MemberProfile | null> {
    const existing = await this.getMemberById(id);
    if (!existing) return null;

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
    if (input.level !== undefined)
      updateData.level = input.level as
        | "alfa"
        | "delta"
        | "sigma"
        | "omega"
        | "spartan";

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
          level as "alfa" | "delta" | "sigma" | "omega" | "spartan",
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
