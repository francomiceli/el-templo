/**
 * User Management Service
 *
 * Business logic for staff user CRUD (create, list, update, toggle active).
 * Owner-only operations for managing coach, admin, owner, and gestion users.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, ne } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import argon2 from "argon2";
import * as schema from "../../db/schema";
import type { StaffUser, CreateStaffInput, UpdateStaffInput } from "./types";

export class UserService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * List all staff users (non-member roles).
   * Optionally filter by branchId.
   *
   * Phase 103-06 (R11): exposes `staffDisabled` per row (replaces `isActive`).
   * Semantic inversion: `staffDisabled=true` means the staff member is
   * deactivated; `staffDisabled=false` means active.
   */
  async listStaff(branchId?: number): Promise<StaffUser[]> {
    const rows = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        role: schema.users.role,
        branchId: schema.users.branchId,
        branchName: schema.branches.name,
        staffDisabled: schema.users.staffDisabled,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.users.branchId, schema.branches.id))
      .where(ne(schema.users.role, "member"))
      .orderBy(schema.users.createdAt);

    // Apply branchId filter in-memory (simpler than dynamic where clause)
    const filtered =
      branchId != null ? rows.filter((r) => r.branchId === branchId) : rows;

    return filtered;
  }

  /**
   * Create a new staff user.
   * Returns the created user's ID.
   * Throws 409 if email already exists.
   */
  async createStaff(input: CreateStaffInput): Promise<number> {
    // Check if email already exists
    const [existing] = await this.db
      .select({ id: schema.users.id, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.email, input.email))
      .limit(1);

    if (existing) {
      // If already a staff role, reject
      if (existing.role !== "member") {
        const error = new Error("El email ya esta registrado como staff");
        (error as Error & { statusCode: number }).statusCode = 409;
        throw error;
      }

      // Promote existing member to staff role
      const passwordHash = await argon2.hash(input.password);
      await this.db
        .update(schema.users)
        .set({
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          role: input.role,
          branchId: input.branchId,
        })
        .where(eq(schema.users.id, existing.id));

      this.log.info(
        { staffId: existing.id, role: input.role, email: input.email },
        "Member promoted to staff",
      );

      return existing.id;
    }

    const passwordHash = await argon2.hash(input.password);

    const [result] = await this.db
      .insert(schema.users)
      .values({
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        branchId: input.branchId,
        // Phase 103-06 (R7, D-12, BLOCKER 1 reassignment from Plan 03):
        // Staff inserts (coach/admin/owner/gestion/recepcion) explicitly
        // pass status: null. The DB default is also NULL but we set it
        // explicitly here to make the intent unmistakable: only members
        // get a lifecycle status (freemium/prueba/activo/inactivo); staff
        // rows always have status=NULL and use staff_disabled instead.
        status: null,
      })
      .$returningId();

    this.log.info(
      { staffId: result.id, role: input.role, email: input.email },
      "Staff user created",
    );

    return result.id;
  }

  /**
   * Update a staff user.
   * Only allows updating non-member users.
   * If password is provided, it will be hashed.
   * If email is changed, checks uniqueness.
   */
  async updateStaff(
    userId: number,
    input: UpdateStaffInput,
  ): Promise<StaffUser | null> {
    // Verify target is a staff user
    const [target] = await this.db
      .select({
        id: schema.users.id,
        role: schema.users.role,
        email: schema.users.email,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!target || target.role === "member") {
      return null;
    }

    // If email is being changed, check uniqueness
    if (input.email && input.email !== target.email) {
      const [existing] = await this.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, input.email))
        .limit(1);

      if (existing) {
        const error = new Error("El email ya esta registrado");
        (error as Error & { statusCode: number }).statusCode = 409;
        throw error;
      }
    }

    // Build update fields
    const updateFields: Record<string, unknown> = {};
    if (input.firstName !== undefined) updateFields.firstName = input.firstName;
    if (input.lastName !== undefined) updateFields.lastName = input.lastName;
    if (input.email !== undefined) updateFields.email = input.email;
    if (input.role !== undefined) updateFields.role = input.role;
    if (input.branchId !== undefined) updateFields.branchId = input.branchId;

    if (input.password) {
      updateFields.passwordHash = await argon2.hash(input.password);
    }

    if (Object.keys(updateFields).length > 0) {
      await this.db
        .update(schema.users)
        .set(updateFields)
        .where(eq(schema.users.id, userId));
    }

    // Return updated user
    const [updated] = await this.db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        firstName: schema.users.firstName,
        lastName: schema.users.lastName,
        role: schema.users.role,
        branchId: schema.users.branchId,
        branchName: schema.branches.name,
        staffDisabled: schema.users.staffDisabled,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .innerJoin(schema.branches, eq(schema.users.branchId, schema.branches.id))
      .where(eq(schema.users.id, userId))
      .limit(1);

    this.log.info(
      { staffId: userId, fields: Object.keys(updateFields) },
      "Staff user updated",
    );

    return updated ?? null;
  }

  /**
   * Set the staff_disabled flag on a staff user.
   * Only applies to non-member users.
   * Prevents owner from disabling themselves.
   *
   * Phase 103-06 (R11, D-11): replaces the legacy `toggleActive` (which
   * read/wrote `users.is_active`, the column dropped in Plan 01). The
   * payload field is now `disabled` (semantic inversion: `disabled=true`
   * deactivates the staff member). Writes `users.staff_disabled` directly
   * with the explicit value from the caller — no toggling on the server
   * side, so concurrent admin clicks converge on the requested state
   * instead of fighting each other.
   */
  async toggleDisabled(
    userId: number,
    disabled: boolean,
    requesterId: number,
  ): Promise<{ staffDisabled: boolean } | null> {
    // Verify target is a staff user
    const [target] = await this.db
      .select({
        id: schema.users.id,
        role: schema.users.role,
        staffDisabled: schema.users.staffDisabled,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);

    if (!target || target.role === "member") {
      return null;
    }

    // Prevent owner from disabling themselves (preserves prior behavior).
    // Only block the destructive direction (disabled=true). Self re-enabling
    // is a no-op for the requester — they're already logged in to call this.
    if (userId === requesterId && disabled) {
      const error = new Error("Cannot deactivate your own account");
      (error as Error & { statusCode: number }).statusCode = 400;
      throw error;
    }

    await this.db
      .update(schema.users)
      .set({ staffDisabled: disabled })
      .where(eq(schema.users.id, userId));

    this.log.info(
      { staffId: userId, staffDisabled: disabled },
      "Staff user staff_disabled toggled",
    );

    return { staffDisabled: disabled };
  }
}
