/**
 * User Management Service
 *
 * Business logic for staff user CRUD (create, list, update, toggle active).
 * Owner-only operations for managing coach, admin, owner, and gestion users.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq, ne, inArray } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import argon2 from "argon2";
import * as schema from "../../db/schema";
import type { StaffUser, CreateStaffInput, UpdateStaffInput } from "./types";
import { tenantWhere, tenantValues, type TenantContext } from "../shared/tenant";
import {
  assertBranchDelGimnasio,
  resolveBranchDelGimnasio,
} from "../shared/branch-consistency";

/**
 * Phase 110 REQ-9: per-role cardinality validation. Throws Error with
 * statusCode=400 on violation. The FOUR shape rules:
 *   - admin / gestion → must have country
 *   - coach / recepcion → must have ≥ 1 branchIds
 *   - owner → must NOT have country (D-12: owner.country=NULL models global)
 *   - member → must NOT have any branchIds (defense-in-depth — even though
 *     the staff CRUD route is OWNER_ROLES-only, a malformed payload with
 *     role=member + branchIds=[X] would otherwise silently insert junk
 *     user_branches rows. JSON Schema layer also rejects this — belt-and-
 *     suspenders.)
 */
function validateStaffCardinality(input: {
  role: string;
  country?: string | null;
  branchIds?: number[];
}): void {
  if ((input.role === "admin" || input.role === "gestion") && !input.country) {
    const e = new Error("Los roles admin y gestión requieren un país");
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
  if (
    (input.role === "coach" || input.role === "recepcion") &&
    (!input.branchIds || input.branchIds.length === 0)
  ) {
    const e = new Error(
      "Coach y recepción requieren al menos una sede operativa",
    );
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
  if (input.role === "owner" && input.country) {
    const e = new Error("Owner no puede tener país asignado (acceso global)");
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
  // Phase 110 REQ-9 4th rule (Blocker 1): members must NOT carry branchIds.
  if (
    input.role === "member" &&
    input.branchIds &&
    input.branchIds.length > 0
  ) {
    const e = new Error("Members no pueden tener sedes operativas");
    (e as Error & { statusCode: number }).statusCode = 400;
    throw e;
  }
}

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
   *
   * Phase 110 REQ-9 / REQ-11: also projects `country` (admin/gestion scope)
   * and aggregates `branchIds` (coach/recepción operational scope) per row.
   *
   * Fase 173 (ADO-02): `ctx` PRIMERO. `branchId` es un filtro de querystring
   * del cliente — se resuelve contra el gimnasio del `ctx` ANTES de listar
   * (D-06): una sede de otro gimnasio devuelve lista vacía, nunca filas
   * ajenas ni un código de acceso denegado que confirme que la sede existe
   * en otro lado.
   */
  async listStaff(ctx: TenantContext, branchId?: number): Promise<StaffUser[]> {
    if (branchId != null) {
      const resolved = await resolveBranchDelGimnasio(ctx, branchId, this.db);
      if (!resolved) {
        return [];
      }
    }

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
        country: schema.users.country,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .innerJoin(
        schema.branches,
        // D-14/2.3: el filtro de la tabla joineada va en el ON, también en
        // INNER — branches no es la tabla ancla de este query pero comparte
        // el mismo gimnasio del ctx (users.branch_id -> FK compuesta 173-12).
        and(
          tenantWhere(schema.branches, ctx),
          eq(schema.users.branchId, schema.branches.id),
        ),
      )
      .where(and(tenantWhere(schema.users, ctx), ne(schema.users.role, "member")))
      .orderBy(schema.users.createdAt);

    // Apply branchId filter in-memory (simpler than dynamic where clause)
    const filtered =
      branchId != null ? rows.filter((r) => r.branchId === branchId) : rows;

    // Phase 110: aggregate user_branches rows for coach/recepción in a single
    // SELECT keyed by the returned ids (T-110-05-07: avoids N+1).
    const ids = filtered.map((r) => r.id);
    const ubRows =
      ids.length > 0
        ? await this.db
            .select({
              userId: schema.userBranches.userId,
              branchId: schema.userBranches.branchId,
            })
            .from(schema.userBranches)
            .where(
              and(
                tenantWhere(schema.userBranches, ctx),
                inArray(schema.userBranches.userId, ids),
              ),
            )
        : [];

    const branchIdsByUser = new Map<number, number[]>();
    for (const row of ubRows) {
      const list = branchIdsByUser.get(row.userId) ?? [];
      list.push(row.branchId);
      branchIdsByUser.set(row.userId, list);
    }

    const result: StaffUser[] = filtered.map((r) => ({
      ...r,
      country: (r.country as "AR" | "ES" | null) ?? null,
      branchIds: (branchIdsByUser.get(r.id) ?? []).sort((a, b) => a - b),
    }));

    return result;
  }

  /**
   * Create a new staff user.
   * Returns the created user's ID.
   * Throws 400 if cardinality rules (REQ-9) are violated.
   * Throws 409 if email already exists as staff.
   *
   * Phase 110: writes to users + user_branches in a single transaction
   * so partial state is impossible (T-110-05-01).
   *
   * Fase 173 (ADO-02, D-05/D-06/D-08): `ctx` PRIMERO. `input.branchId` y cada
   * elemento de `input.branchIds` se resuelven con `assertBranchDelGimnasio`
   * DENTRO de la misma transacción — lo que se escribe es el `id` de la fila
   * resuelta, nunca el número crudo del payload. Una sede de otro gimnasio
   * lanza `NotFoundError` ("Sede no encontrada"), jamás un código de acceso
   * denegado (T-173-13-01).
   * `branchIds[]` se resuelve una por una y si CUALQUIERA no es del gimnasio
   * se rechaza la operación ENTERA (T-173-13-02): filtrar en silencio dejaría
   * al operador creyendo que guardó sedes que en realidad no guardó.
   */
  async createStaff(ctx: TenantContext, input: CreateStaffInput): Promise<number> {
    // Phase 110 REQ-9: cardinality first, before any DB work.
    validateStaffCardinality(input);

    // Email uniqueness check (existing 409 behavior preserved).
    const [existing] = await this.db
      .select({ id: schema.users.id, role: schema.users.role })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.email, input.email)))
      .limit(1);

    if (existing && existing.role !== "member") {
      const error = new Error("El email ya esta registrado como staff");
      (error as Error & { statusCode: number }).statusCode = 409;
      throw error;
    }

    const passwordHash = await argon2.hash(input.password);
    const country = input.country ?? null;
    const branchIds = input.branchIds ?? [];

    return this.db.transaction(async (tx) => {
      // ADO-07: resolver la sede del alta/promoción ANTES de escribir nada.
      const branch = await assertBranchDelGimnasio(ctx, input.branchId, tx);

      // branchIds[]: resolución una por una, todo-o-nada (T-173-13-02).
      const resolvedBranchIds: number[] = [];
      for (const bid of branchIds) {
        const resolvedBranch = await assertBranchDelGimnasio(ctx, bid, tx);
        resolvedBranchIds.push(resolvedBranch.id);
      }

      let userId: number;

      if (existing) {
        // Promote existing member to staff role.
        await tx
          .update(schema.users)
          .set({
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            role: input.role,
            branchId: branch.id,
            // Recategorización (0185): promoción a staff fija la sede → 'manual'.
            branchUpdatedAt: new Date(),
            branchSource: "manual" as const,
            country,
          })
          .where(
            and(tenantWhere(schema.users, ctx), eq(schema.users.id, existing.id)),
          );
        userId = existing.id;
        // Replace any prior user_branches rows for the promoted user.
        await tx
          .delete(schema.userBranches)
          .where(
            and(
              tenantWhere(schema.userBranches, ctx),
              eq(schema.userBranches.userId, userId),
            ),
          );
      } else {
        const [result] = await tx
          .insert(schema.users)
          .values(
            tenantValues(ctx, {
              email: input.email,
              passwordHash,
              firstName: input.firstName,
              lastName: input.lastName,
              role: input.role,
              branchId: branch.id,
              // Recategorización (0185): alta de staff fija la sede → 'manual'.
              branchUpdatedAt: new Date(),
              branchSource: "manual" as const,
              country,
              // Phase 103-06 (BLOCKER 1): staff inserts explicitly status=null.
              status: null,
            }),
          )
          .$returningId();
        userId = result.id;
      }

      if (resolvedBranchIds.length > 0) {
        await tx
          .insert(schema.userBranches)
          .values(
            resolvedBranchIds.map((bid) =>
              tenantValues(ctx, { userId, branchId: bid }),
            ),
          );
      }

      this.log.info(
        { staffId: userId, role: input.role, email: input.email },
        existing ? "Member promoted to staff" : "Staff user created",
      );

      return userId;
    });
  }

  /**
   * Update a staff user.
   * Only allows updating non-member users.
   * If password is provided, it will be hashed.
   * If email is changed, checks uniqueness.
   *
   * Phase 110 REQ-9: validates per-role cardinality on the effective shape
   * (target row + input overrides). All writes (users + user_branches) are
   * wrapped in a single transaction so partial state is impossible.
   *
   * Fase 173 (ADO-02, D-05/D-06/D-08): `ctx` PRIMERO (antes de `userId`).
   * `input.branchId` se resuelve con `assertBranchDelGimnasio` DENTRO de la
   * transacción — se escribe el `id` de la fila resuelta, y el trío
   * `branchId`/`branchUpdatedAt`/`branchSource` se escribe SIEMPRE junto
   * (`src/db/schema/users.ts:144`; antes de este plan la edición de sede vía
   * PUT no tocaba `branchUpdatedAt`/`branchSource` — Rule 1, ver SUMMARY).
   * `input.branchIds[]` se resuelve una por una, todo-o-nada (T-173-13-02).
   */
  async updateStaff(
    ctx: TenantContext,
    userId: number,
    input: UpdateStaffInput,
  ): Promise<StaffUser | null> {
    // Verify target is a staff user
    const [target] = await this.db
      .select({
        id: schema.users.id,
        role: schema.users.role,
        email: schema.users.email,
        country: schema.users.country,
      })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
      .limit(1);

    if (!target || target.role === "member") {
      return null;
    }

    // If email is being changed, check uniqueness
    if (input.email && input.email !== target.email) {
      const [existing] = await this.db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(
          and(tenantWhere(schema.users, ctx), eq(schema.users.email, input.email)),
        )
        .limit(1);

      if (existing) {
        const error = new Error("El email ya esta registrado");
        (error as Error & { statusCode: number }).statusCode = 409;
        throw error;
      }
    }

    // Phase 110 REQ-9: build effective shape for cardinality validation.
    // - effectiveRole: `input.role` if changing, otherwise target's current role.
    // - effectiveCountry: if `input.country` is explicitly provided (including
    //   null), use it; otherwise inherit the target's current country. This
    //   means an UPDATE that does not touch country won't 400 an existing
    //   admin/gestion row.
    // - effectiveBranchIds: only validated when caller is asserting them
    //   (input.branchIds defined). When undefined, we read the current set
    //   from user_branches so cardinality stays consistent if the role is
    //   changing without re-supplying branchIds.
    const effectiveRole = input.role ?? target.role;
    const effectiveCountry =
      input.country !== undefined ? input.country : target.country;
    let effectiveBranchIds: number[];
    if (input.branchIds !== undefined) {
      effectiveBranchIds = input.branchIds;
    } else {
      const currentRows = await this.db
        .select({ branchId: schema.userBranches.branchId })
        .from(schema.userBranches)
        .where(
          and(
            tenantWhere(schema.userBranches, ctx),
            eq(schema.userBranches.userId, userId),
          ),
        );
      effectiveBranchIds = currentRows.map((r) => r.branchId);
    }
    validateStaffCardinality({
      role: effectiveRole,
      country: effectiveCountry,
      branchIds: effectiveBranchIds,
    });

    // Build the fields that don't need DB validation, outside the
    // transaction (argon2.hash is CPU-bound — no reason to hold a tx open).
    const baseUpdateFields: Record<string, unknown> = {};
    if (input.firstName !== undefined) baseUpdateFields.firstName = input.firstName;
    if (input.lastName !== undefined) baseUpdateFields.lastName = input.lastName;
    if (input.email !== undefined) baseUpdateFields.email = input.email;
    if (input.role !== undefined) baseUpdateFields.role = input.role;
    if (input.country !== undefined) baseUpdateFields.country = input.country;

    if (input.password) {
      baseUpdateFields.passwordHash = await argon2.hash(input.password);
    }

    return this.db.transaction(async (tx) => {
      const updateFields: Record<string, unknown> = { ...baseUpdateFields };

      if (input.branchId !== undefined) {
        // ADO-07: resolver ANTES de armar el update — lo que se escribe es
        // el id de la fila resuelta, no el número crudo del payload.
        const branch = await assertBranchDelGimnasio(ctx, input.branchId, tx);
        updateFields.branchId = branch.id;
        updateFields.branchUpdatedAt = new Date();
        updateFields.branchSource = "manual" as const;
      }

      if (Object.keys(updateFields).length > 0) {
        await tx
          .update(schema.users)
          .set(updateFields)
          .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)));
      }

      // Phase 110: replace user_branches atomically when caller provides
      // branchIds (defined, including [] to explicitly clear). Undefined
      // means "do not touch user_branches".
      if (input.branchIds !== undefined) {
        await tx
          .delete(schema.userBranches)
          .where(
            and(
              tenantWhere(schema.userBranches, ctx),
              eq(schema.userBranches.userId, userId),
            ),
          );
        if (input.branchIds.length > 0) {
          // branchIds[]: resolución una por una, todo-o-nada (T-173-13-02).
          const resolvedBranchIds: number[] = [];
          for (const bid of input.branchIds) {
            const resolvedBranch = await assertBranchDelGimnasio(ctx, bid, tx);
            resolvedBranchIds.push(resolvedBranch.id);
          }
          await tx
            .insert(schema.userBranches)
            .values(
              resolvedBranchIds.map((bid) =>
                tenantValues(ctx, { userId, branchId: bid }),
              ),
            );
        }
      }

      // Read back the updated row inside the transaction for a consistent view.
      const [updated] = await tx
        .select({
          id: schema.users.id,
          email: schema.users.email,
          firstName: schema.users.firstName,
          lastName: schema.users.lastName,
          role: schema.users.role,
          branchId: schema.users.branchId,
          branchName: schema.branches.name,
          staffDisabled: schema.users.staffDisabled,
          country: schema.users.country,
          createdAt: schema.users.createdAt,
        })
        .from(schema.users)
        .innerJoin(
          schema.branches,
          and(
            tenantWhere(schema.branches, ctx),
            eq(schema.users.branchId, schema.branches.id),
          ),
        )
        .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
        .limit(1);

      if (!updated) {
        return null;
      }

      const ubRows = await tx
        .select({ branchId: schema.userBranches.branchId })
        .from(schema.userBranches)
        .where(
          and(
            tenantWhere(schema.userBranches, ctx),
            eq(schema.userBranches.userId, userId),
          ),
        );
      const branchIds = ubRows.map((r) => r.branchId).sort((a, b) => a - b);

      this.log.info(
        { staffId: userId, fields: Object.keys(updateFields) },
        "Staff user updated",
      );

      const result: StaffUser = {
        ...updated,
        country: (updated.country as "AR" | "ES" | null) ?? null,
        branchIds,
      };
      return result;
    });
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
   *
   * Fase 173 (ADO-02): `ctx` PRIMERO — el read y el update quedan acotados
   * al gimnasio, así un `userId` de otro gimnasio no matchea (404 vía
   * `!target`, mismo contrato que el resto de la fase).
   */
  async toggleDisabled(
    ctx: TenantContext,
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
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)))
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
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId)));

    this.log.info(
      { staffId: userId, staffDisabled: disabled },
      "Staff user staff_disabled toggled",
    );

    return { staffDisabled: disabled };
  }
}
