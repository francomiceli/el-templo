import { MySql2Database } from "drizzle-orm/mysql2";
import { eq, and, gte, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { ExerciseQueryInput, SpomLookupInput } from "./schemas";

/**
 * Map a calendar week onto the rotator cycle.
 *
 * The weekly rotator only defines a fixed cycle of weeks (1..cycleWeeks — 26
 * in the source CSV), while calendar weeks keep counting up to 52. Weeks past
 * the end of the cycle wrap around so the route rotation repeats (week 27 ->
 * 1 with a 26-week cycle). Weeks within the cycle pass through unchanged, as
 * does everything when the table is empty (cycleWeeks <= 0).
 */
export function wrapToRotatorCycle(week: number, cycleWeeks: number): number {
  if (cycleWeeks <= 0 || week <= cycleWeeks) return week;
  return ((week - 1) % cycleWeeks) + 1;
}

export class SpomService {
  constructor(private db: MySql2Database<typeof schema>) {}

  // Get current SPOM week — derived from today's date, not DB
  // WEEK_ONE_MONDAY = 2026-02-23 (same anchor as sessions/routes.ts)
  getCurrentWeek(): number {
    const WEEK_ONE_MONDAY = new Date("2026-02-23T00:00:00");
    const now = new Date();
    const diffMs = now.getTime() - WEEK_ONE_MONDAY.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const week = Math.floor(diffDays / 7) + 1;
    return Math.max(1, Math.min(52, week));
  }

  // Update SPOM week (admin only)
  async updateCurrentWeek(
    week: number,
  ): Promise<{ currentWeek: number; updatedAt: Date }> {
    await this.db
      .update(schema.spomConfig)
      .set({ currentWeek: week })
      .where(eq(schema.spomConfig.id, 1));

    const [config] = await this.db
      .select()
      .from(schema.spomConfig)
      .where(eq(schema.spomConfig.id, 1));

    return { currentWeek: config.currentWeek, updatedAt: config.updatedAt };
  }

  // SPOM lookup: (week, route) -> intensity, wave, pattern, category
  async getSpomRule(input: SpomLookupInput) {
    const [route] = await this.db
      .select({ id: schema.routes.id })
      .from(schema.routes)
      .where(eq(schema.routes.code, input.route));

    if (!route) return null;

    const [rule] = await this.db
      .select()
      .from(schema.spomRules)
      .where(
        and(
          eq(schema.spomRules.week, input.week),
          eq(schema.spomRules.routeId, route.id),
        ),
      );

    return rule;
  }

  // Exercise query with filters (SPOM-09)
  async queryExercises(input: ExerciseQueryInput) {
    const conditions = [eq(schema.exercises.route, input.route)];

    if (input.effort) {
      conditions.push(eq(schema.exercises.effort, input.effort));
    }
    if (input.level) {
      conditions.push(eq(schema.exercises.level, input.level));
    }
    if (input.difficulty) {
      conditions.push(gte(schema.exercises.difficulty, input.difficulty));
    }

    const results = await this.db
      .select()
      .from(schema.exercises)
      .where(and(...conditions))
      .limit(input.limit ?? 50);

    return results;
  }

  // Get intensity rules lookup
  async getIntensityRule(intensity: number) {
    const [rule] = await this.db
      .select()
      .from(schema.intensityRules)
      .where(eq(schema.intensityRules.intensity, intensity));
    return rule;
  }

  // Get contraction distribution
  async getContractionRule(intensity: number, totalExercises: number) {
    const [rule] = await this.db
      .select()
      .from(schema.contractionRules)
      .where(
        and(
          eq(schema.contractionRules.intensity, intensity),
          eq(schema.contractionRules.totalExercises, totalExercises),
        ),
      );
    return rule;
  }

  // Get weekly rotator entry.
  // Weeks beyond the planned cycle wrap around (see wrapToRotatorCycle) —
  // SPOM rules are intentionally NOT wrapped: spom_rules covers all 52
  // calendar weeks, so periodization keeps advancing while routes repeat.
  async getWeeklyRotator(week: number, day: string, levelGroup: string) {
    const [maxRow] = await this.db
      .select({
        maxWeek: sql<number | null>`MAX(${schema.weeklyRotator.week})`,
      })
      .from(schema.weeklyRotator);
    const rotatorWeek = wrapToRotatorCycle(week, maxRow?.maxWeek ?? 0);

    const [entry] = await this.db
      .select()
      .from(schema.weeklyRotator)
      .where(
        and(
          eq(schema.weeklyRotator.week, rotatorWeek),
          eq(
            schema.weeklyRotator.day,
            day as
              | "lunes"
              | "martes"
              | "miercoles"
              | "jueves"
              | "viernes"
              | "sabado",
          ),
          eq(
            schema.weeklyRotator.levelGroup,
            levelGroup as "alfa_delta" | "sigma" | "omega",
          ),
        ),
      );
    return entry;
  }

  // Get route by ID - converts route FK to route code for session generation
  async getRouteById(
    routeId: number,
  ): Promise<{ id: number; code: string; displayName: string | null } | null> {
    const [route] = await this.db
      .select()
      .from(schema.routes)
      .where(eq(schema.routes.id, routeId));
    return route ?? null;
  }

  // Table row counts for version info
  async getTableCounts() {
    const counts: Record<string, number> = {};

    const tables = [
      ["routes", schema.routes],
      ["spom_rules", schema.spomRules],
      ["intensity_rules", schema.intensityRules],
      ["contraction_rules", schema.contractionRules],
      ["weekly_rotator", schema.weeklyRotator],
      ["formats", schema.formats],
      ["format_compatibility", schema.formatCompatibility],
      ["exercises", schema.exercises],
    ] as const;

    for (const [name, table] of tables) {
      const [result] = await this.db
        .select({ count: sql<number>`count(*)` })
        .from(table);
      counts[name] = result.count;
    }

    return counts;
  }
}
