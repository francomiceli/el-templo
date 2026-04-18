/**
 * Activity Service
 *
 * CRUD operations for scheduling activities (e.g., "Sesion Grupal", "ROM").
 * Extracted from SchedulingService for single-responsibility.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import * as schema from "../../db/schema";
import { NotFoundError } from "../shared/errors";
import type { ActivityRecord } from "./types";

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
  ): Promise<ActivityRecord> {
    const result = await this.db.insert(schema.activities).values({
      name,
      description: description ?? null,
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
    data: { name?: string; description?: string; isActive?: boolean },
  ): Promise<ActivityRecord> {
    const existing = await this.getActivity(id);
    if (!existing) throw new NotFoundError("Actividad no encontrada");

    const updateData: Partial<typeof schema.activities.$inferInsert> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

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
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
