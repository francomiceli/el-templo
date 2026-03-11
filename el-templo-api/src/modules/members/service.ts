/**
 * Member Service
 *
 * Business logic for member CRUD, profile management,
 * DNI uniqueness checks, and internal notes.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, or, like, sql, desc, ne } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import argon2 from "argon2";
import * as schema from "../../db/schema";
import type {
  MemberListParams,
  MemberListItem,
  MemberProfile,
  CreateMemberInput,
  UpdateMemberInput,
  MemberNote,
  CreateNoteInput,
  UpdateNoteInput,
  DniCheckResult,
} from "./types";

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
  async listMembers(
    params: MemberListParams,
  ): Promise<{ members: MemberListItem[]; total: number }> {
    const { search, branchId, level, isActive, overdue, page, limit } = params;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];

    // Only show actual members (not coaches/admins)
    conditions.push(eq(schema.users.role, "member"));

    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        sql`(${schema.users.firstName} LIKE ${searchPattern} OR ${schema.users.lastName} LIKE ${searchPattern} OR ${schema.users.email} LIKE ${searchPattern} OR ${schema.users.dni} LIKE ${searchPattern})`,
      );
    }

    if (branchId !== undefined) {
      conditions.push(eq(schema.users.branchId, branchId));
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
      conditions.push(eq(schema.users.isActive, isActive));
    }

    // Overdue subquery: member has a subscription where endDate < CURDATE()
    // AND total non-voided payments < pricePaid
    const overdueSubquery = sql<number>`(
      SELECT COUNT(*) FROM subscriptions s
      WHERE s.user_id = ${schema.users.id}
        AND s.end_date < CURDATE()
        AND s.price_paid > COALESCE((
          SELECT SUM(p.amount) FROM payments p
          WHERE p.subscription_id = s.id AND p.voided_at IS NULL
        ), 0)
    )`;

    if (overdue === true) {
      conditions.push(sql`${overdueSubquery} > 0`);
    }

    const whereClause = and(...conditions);

    // Get total count
    const [countResult] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.users)
      .where(whereClause);

    const total = countResult?.count ?? 0;

    // Get paginated members with branch join and overdue flag
    const rows = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        phone: schema.users.phone,
        dni: schema.users.dni,
        level: schema.users.level,
        branchId: schema.users.branchId,
        branchName: schema.branches.name,
        isActive: schema.users.isActive,
        createdAt: schema.users.createdAt,
        overdueCount: overdueSubquery,
      })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.branches.id, schema.users.branchId))
      .where(whereClause)
      .orderBy(schema.users.firstName, schema.users.lastName)
      .limit(limit)
      .offset(offset);

    const members: MemberListItem[] = rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
      phone: r.phone,
      dni: r.dni,
      level: r.level,
      branchId: r.branchId,
      branchName: r.branchName,
      isActive: r.isActive,
      isOverdue: Number(r.overdueCount) > 0,
      createdAt: r.createdAt.toISOString(),
    }));

    return { members, total };
  }

  /**
   * Get full member profile by ID. Returns null if not found.
   */
  async getMemberById(id: number): Promise<MemberProfile | null> {
    const [row] = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        phone: schema.users.phone,
        dni: schema.users.dni,
        dateOfBirth: schema.users.dateOfBirth,
        gender: schema.users.gender,
        emergencyContactName: schema.users.emergencyContactName,
        emergencyContactPhone: schema.users.emergencyContactPhone,
        emergencyContactRelationship: schema.users.emergencyContactRelationship,
        role: schema.users.role,
        level: schema.users.level,
        branchId: schema.users.branchId,
        branchName: schema.branches.name,
        isActive: schema.users.isActive,
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
      dateOfBirth: row.dateOfBirth,
      gender: row.gender,
      emergencyContactName: row.emergencyContactName,
      emergencyContactPhone: row.emergencyContactPhone,
      emergencyContactRelationship: row.emergencyContactRelationship,
      role: row.role,
      level: row.level,
      branchId: row.branchId,
      branchName: row.branchName,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Create a new member. Hashes password with argon2.
   * Throws on duplicate email or DNI.
   */
  async createMember(input: CreateMemberInput): Promise<MemberProfile> {
    const passwordHash = await argon2.hash(input.password);

    type Level = "alfa" | "delta" | "sigma" | "omega" | "spartan";
    type Gender = "male" | "female" | "other";

    const result = await this.db.insert(schema.users).values({
      email: input.email,
      passwordHash,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      dni: input.dni,
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

    return member;
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
   * Toggle member active status.
   */
  async toggleActive(
    id: number,
    isActive: boolean,
  ): Promise<MemberProfile | null> {
    const existing = await this.getMemberById(id);
    if (!existing) return null;

    await this.db
      .update(schema.users)
      .set({ isActive })
      .where(eq(schema.users.id, id));

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
   * Authors can edit their own notes; admin/superadmin can edit/delete any.
   */
  canEditNote(noteAuthorId: number, userId: number, userRole: string): boolean {
    if (userRole === "admin" || userRole === "superadmin") return true;
    return noteAuthorId === userId;
  }
}
