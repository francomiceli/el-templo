/**
 * Activity Service
 *
 * CRUD operations for scheduling activities (e.g., "Calistenia", "ROM").
 * Extracted from SchedulingService for single-responsibility.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, ne } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { ConflictError, NotFoundError } from "../shared/errors";
import type { ActivityRecord, AffectedScheduleRef } from "./types";

export class ActivityService {
  constructor(
    private db: MySql2Database<typeof schema>,
    private log: FastifyBaseLogger,
  ) {}

  /**
   * Create a new activity.
   */
  async createActivity(
    name: string,
    description?: string,
    maxCapacity?: number | null,
    isSpecial?: boolean,
  ): Promise<ActivityRecord> {
    // Phase 113 (D-16): reject duplicate name across ACTIVE activities.
    // Inactive activities don't block reuse — admins can recreate by name
    // after soft-delete. Comparison is the DB collation default (MySQL
    // default for utf8mb4 is case-insensitive `utf8mb4_0900_ai_ci`), which
    // matches the user-facing intent of "same name".
    const [collision] = await this.db
      .select({ id: schema.activities.id })
      .from(schema.activities)
      .where(
        and(
          eq(schema.activities.name, name),
          eq(schema.activities.isActive, true),
        ),
      )
      .limit(1);
    if (collision) {
      throw new ConflictError("Ya existe una actividad activa con ese nombre");
    }

    const result = await this.db.insert(schema.activities).values({
      name,
      description: description ?? null,
      // D-08 (HOR-03): NULL cuando no se envía → hereda el cupo de la sucursal.
      maxCapacity: maxCapacity ?? null,
      // ACT-01 (fase 161): flag de gating del pase "Actividades con Aura".
      // Default false → cero cambio de comportamiento para actividades regulares.
      isSpecial: isSpecial ?? false,
    });

    const id = Number(result[0].insertId);
    const activity = await this.getActivity(id);
    if (!activity) throw new Error("Failed to retrieve newly created activity");
    return activity;
  }

  /**
   * List all activities (active + inactive). The admin UI surfaces the
   * full state so inactive rows can be reactivated instead of appearing
   * to have been deleted.
   */
  async listActivities(): Promise<ActivityRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.activities)
      .orderBy(schema.activities.name);

    return rows.map((r) => this.mapActivityRow(r));
  }

  /**
   * Update an existing activity.
   */
  async updateActivity(
    id: number,
    data: {
      name?: string;
      description?: string;
      isActive?: boolean;
      maxCapacity?: number | null;
      isSpecial?: boolean;
    },
  ): Promise<ActivityRecord> {
    const existing = await this.getActivity(id);
    if (!existing) throw new NotFoundError("Actividad no encontrada");

    // Phase 113 (D-16): rename collision check. Excludes self via `ne(id)`
    // so a no-op rename (same name as current) is allowed. Filtered by
    // isActive=true so reusing an inactive activity's name is permitted.
    if (data.name !== undefined && data.name !== existing.name) {
      const [collision] = await this.db
        .select({ id: schema.activities.id })
        .from(schema.activities)
        .where(
          and(
            eq(schema.activities.name, data.name),
            eq(schema.activities.isActive, true),
            ne(schema.activities.id, id),
          ),
        )
        .limit(1);
      if (collision) {
        throw new ConflictError(
          "Ya existe otra actividad activa con ese nombre",
        );
      }
    }

    // Phase 113 (D-13): cascade-block deactivation when active schedules
    // reference this activity. Reactivation (false → true) is unrestricted
    // per D-14. The 409 carries an `affectedSchedules` payload so the admin
    // UI can list the schedules that need to be reassigned/disabled before
    // retrying. Pattern mirrors validateAnchorSet in subscriptions/service.ts.
    if (data.isActive === false && existing.isActive === true) {
      const affected: AffectedScheduleRef[] = await this.db
        .select({
          id: schema.schedules.id,
          dayOfWeek: schema.schedules.dayOfWeek,
          startTime: schema.schedules.startTime,
          endTime: schema.schedules.endTime,
          branchName: schema.branches.name,
        })
        .from(schema.schedules)
        .innerJoin(
          schema.branches,
          eq(schema.branches.id, schema.schedules.branchId),
        )
        .where(
          and(
            eq(schema.schedules.activityId, id),
            eq(schema.schedules.isActive, true),
          ),
        )
        .orderBy(schema.schedules.dayOfWeek, schema.schedules.startTime);
      if (affected.length > 0) {
        const err = new ConflictError(
          `No se puede desactivar: ${affected.length} horario(s) activo(s) usan esta actividad. Cambia su actividad o desactivalos primero.`,
        );
        // Attach structured payload so the route layer can serialize it.
        (
          err as ConflictError & {
            affectedSchedules?: AffectedScheduleRef[];
          }
        ).affectedSchedules = affected;
        throw err;
      }
    }

    const updateData: Partial<typeof schema.activities.$inferInsert> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    // D-08 (HOR-03): `null` explícito limpia el cupo (vuelve a heredar la
    // sucursal); ausencia de la key deja el valor existente intacto.
    if (data.maxCapacity !== undefined)
      updateData.maxCapacity = data.maxCapacity;
    // ACT-01 (fase 161): editar el flag de gating; ausencia de la key deja el
    // valor existente intacto (mismo patrón que maxCapacity).
    if (data.isSpecial !== undefined) updateData.isSpecial = data.isSpecial;

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(schema.activities)
        .set(updateData)
        .where(eq(schema.activities.id, id));
    }

    const updated = await this.getActivity(id);
    if (!updated) throw new Error("Failed to retrieve updated activity");
    return updated;
  }

  /**
   * Get a single activity by ID.
   */
  async getActivity(id: number): Promise<ActivityRecord | null> {
    const [row] = await this.db
      .select()
      .from(schema.activities)
      .where(eq(schema.activities.id, id));

    if (!row) return null;
    return this.mapActivityRow(row);
  }

  /**
   * Map a raw activity row to ActivityRecord.
   */
  private mapActivityRow(
    row: typeof schema.activities.$inferSelect,
  ): ActivityRecord {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      isActive: row.isActive,
      maxCapacity: row.maxCapacity,
      isSpecial: row.isSpecial,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
