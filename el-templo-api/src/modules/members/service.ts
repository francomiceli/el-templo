/**
 * Member Service
 *
 * Business logic for member CRUD, profile management,
 * DNI uniqueness checks, and internal notes.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, or, like, sql, desc, ne, isNull, gte } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import argon2 from "argon2";
import * as schema from "../../db/schema";
import { buildMemberNameSearchCondition } from "../shared";
import type { TrainingLevel } from "../shared/training-constants";
import type {
  MemberListParams,
  MemberListItem,
  MemberProfile,
  MemberExportRow,
  CreateMemberInput,
  UpdateMemberInput,
  MemberNote,
  CreateNoteInput,
  UpdateNoteInput,
  DniCheckResult,
  TotalDebtRow,
} from "./types";
import type { DebtService } from "./debts-service";

export class MemberService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
    private debtService: DebtService,
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
      isActive,
      planId,
      segment,
      avatarType,
      country,
      debtorOnly,
      page,
      limit,
    } = params;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];

    // Only show actual members (not coaches/admins)
    conditions.push(eq(schema.users.role, "member"));

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
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country));
    }

    if (level !== undefined) {
      conditions.push(
        eq(
          schema.users.level,
          level as "alfa" | "delta" | "sigma" | "omega" | "spartan",
        ),
      );
    }

    if (isActive !== undefined) {
      // Derive active status from subscriptions (not the stale users.is_active column).
      // Active iff ∃ sub with status ∈ ('active','paused') AND endDate IS NULL OR endDate >= today.
      const activeExists = sql`EXISTS (
        SELECT 1 FROM subscriptions s
        WHERE s.user_id = users.id
          AND s.subscription_status IN ('active','paused')
          AND (s.end_date IS NULL OR s.end_date >= CURDATE())
      )`;
      conditions.push(isActive ? activeExists : sql`NOT ${activeExists}`);
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

    // Phase 101: restrict to users with at least one active (non-cancelled)
    // debt row. Composite index idx_debts_user_active covers the lookup.
    if (debtorOnly === true) {
      conditions.push(
        sql`EXISTS (
          SELECT 1 FROM debts d
          WHERE d.user_id = users.id AND d.is_cancelled = 0
        )`,
      );
    }

    const whereClause = and(...conditions);

    // Get total count. Joins branches so the country scope condition (when
    // present) resolves against the same column the paginated SELECT does.
    const [countResult] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(whereClause);

    const total = countResult?.count ?? 0;

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

    // Subquery: derive active status from subscriptions (source of truth).
    // Returns 1/0 from MySQL EXISTS; coerced to boolean in the mapper below.
    const isActiveSubquery = sql<number>`(
      SELECT EXISTS (
        SELECT 1 FROM subscriptions s
        WHERE s.user_id = users.id
          AND s.subscription_status IN ('active','paused')
          AND (s.end_date IS NULL OR s.end_date >= CURDATE())
      )
    )`;

    // Get paginated members with branch join and plan name
    const rows = await this.db
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
        isActive: isActiveSubquery,
        createdAt: schema.users.createdAt,
        planName: planNameSubquery,
        segment: segmentSubquery,
        avatarType: avatarTypeSubquery,
      })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(whereClause)
      .orderBy(schema.users.firstName, schema.users.lastName)
      .limit(limit)
      .offset(offset);

    // Phase 101: populate `debt` per row via a single batch lookup (no N+1).
    const pageUserIds = rows.map((r) => r.id);
    const debtsByUser =
      await this.debtService.getActiveDebtsForUsers(pageUserIds);

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
      isActive: Boolean(r.isActive),
      planName: r.planName ?? null,
      segment: r.segment ?? null,
      avatarType: r.avatarType ?? null,
      createdAt: r.createdAt.toISOString(),
      debt: debtsByUser.get(r.id) ?? null,
    }));

    // Phase 101 (D-07): totalDebtByCurrency aggregates active debts over the
    // SAME filter set as the paginated list (not just the current page). We
    // re-run the filter query selecting only user ids (no joins beyond the
    // branches join that may already be referenced by whereClause) and then
    // ask the debt service to SUM...GROUP BY currency over them. This is the
    // "one extra query" acknowledged in D-08; cost is bounded by total
    // filtered users and is covered by idx_debts_user_active.
    const filteredIdRows = await this.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(whereClause);
    const filteredIds = filteredIdRows.map((r) => r.id);
    const totalDebtByCurrency =
      await this.debtService.getTotalDebtByCurrency(filteredIds);

    return { members, total, totalDebtByCurrency };
  }

  /**
   * Get full member profile by ID. Returns null if not found.
   */
  async getMemberById(id: number): Promise<MemberProfile | null> {
    // Active = has an active/paused subscription that hasn't ended.
    // Same definition used by the member list query (single source of truth).
    const isActiveSubquery = sql<number>`(
      SELECT EXISTS (
        SELECT 1 FROM subscriptions s
        WHERE s.user_id = users.id
          AND s.subscription_status IN ('active','paused')
          AND (s.end_date IS NULL OR s.end_date >= CURDATE())
      )
    )`;

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
        isActive: isActiveSubquery,
        createdAt: schema.users.createdAt,
        updatedAt: schema.users.updatedAt,
      })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(eq(schema.users.id, id));

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
      isActive: Boolean(row.isActive),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
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
    const tempPassword = "eltemplo2026";
    const passwordHash = await argon2.hash(tempPassword);

    type Level = "alfa" | "delta" | "sigma" | "omega" | "spartan";
    type Gender = "male" | "female" | "other";
    type DocType = "DNI" | "Pasaporte" | "NIE" | "NIF" | "Otro";

    const result = await this.db.insert(schema.users).values({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
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
      isActive: true,
    });

    const userId = Number(result[0].insertId);
    const member = await this.getMemberById(userId);

    if (!member) {
      throw new Error("Failed to retrieve newly created member");
    }

    return { member, tempPassword };
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

    if (input.firstName !== undefined) updateData.firstName = input.firstName;
    if (input.lastName !== undefined) updateData.lastName = input.lastName;
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
      await this.db
        .update(schema.users)
        .set(updateData)
        .where(eq(schema.users.id, id));
    }

    return this.getMemberById(id);
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
      isActive,
      planId,
      avatarType,
      country,
    } = params;

    const conditions: ReturnType<typeof eq>[] = [];

    conditions.push(eq(schema.users.role, "member"));

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
    // ?country=. The branches innerJoin below resolves this column.
    if (country !== undefined) {
      conditions.push(eq(schema.branches.country, country));
    }

    if (level !== undefined) {
      conditions.push(
        eq(
          schema.users.level,
          level as "alfa" | "delta" | "sigma" | "omega" | "spartan",
        ),
      );
    }

    if (isActive !== undefined) {
      // Derive active status from subscriptions (same as listMembers).
      const activeExists = sql`EXISTS (
        SELECT 1 FROM subscriptions s
        WHERE s.user_id = users.id
          AND s.subscription_status IN ('active','paused')
          AND (s.end_date IS NULL OR s.end_date >= CURDATE())
      )`;
      conditions.push(isActive ? activeExists : sql`NOT ${activeExists}`);
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

    // Subquery: derive active status from subscriptions (same as listMembers).
    const isActiveSubquery = sql<number>`(
      SELECT EXISTS (
        SELECT 1 FROM subscriptions s
        WHERE s.user_id = users.id
          AND s.subscription_status IN ('active','paused')
          AND (s.end_date IS NULL OR s.end_date >= CURDATE())
      )
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
        isActive: isActiveSubquery,
        planName: planNameSubquery,
        endDate: endDateSubquery,
        dateOfBirth: schema.users.dateOfBirth,
        address: schema.users.address,
      })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(whereClause)
      .orderBy(schema.users.lastName, schema.users.firstName);

    return rows.map((r) => ({
      nombre: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
      email: r.email,
      dni: r.dni ?? "",
      telefono: r.phone ?? "",
      sucursal: r.branchName,
      nivel: r.level.charAt(0).toUpperCase() + r.level.slice(1),
      plan: r.planName ?? "Sin plan",
      estado: r.isActive ? "Activo" : "Inactivo",
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
