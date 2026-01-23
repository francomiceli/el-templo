import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq, and, gte, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import type { ExerciseQueryInput, SpomLookupInput } from './schemas';

export class SpomService {
  constructor(private db: MySql2Database<typeof schema>) {}

  // Get current SPOM week
  async getCurrentWeek(): Promise<number> {
    const [config] = await this.db
      .select({ currentWeek: schema.spomConfig.currentWeek })
      .from(schema.spomConfig)
      .where(eq(schema.spomConfig.id, 1));
    return config?.currentWeek ?? 1;
  }

  // Update SPOM week (admin only)
  async updateCurrentWeek(week: number): Promise<{ currentWeek: number; updatedAt: Date }> {
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
      .where(and(
        eq(schema.spomRules.week, input.week),
        eq(schema.spomRules.routeId, route.id)
      ));

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
      .where(and(
        eq(schema.contractionRules.intensity, intensity),
        eq(schema.contractionRules.totalExercises, totalExercises)
      ));
    return rule;
  }

  // Get weekly rotator entry
  async getWeeklyRotator(week: number, day: string, levelGroup: string) {
    const [entry] = await this.db
      .select()
      .from(schema.weeklyRotator)
      .where(and(
        eq(schema.weeklyRotator.week, week),
        eq(schema.weeklyRotator.day, day as 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado'),
        eq(schema.weeklyRotator.levelGroup, levelGroup as 'alfa_delta' | 'sigma' | 'omega')
      ));
    return entry;
  }

  // Table row counts for version info
  async getTableCounts() {
    const counts: Record<string, number> = {};

    const tables = [
      ['routes', schema.routes],
      ['spom_rules', schema.spomRules],
      ['intensity_rules', schema.intensityRules],
      ['contraction_rules', schema.contractionRules],
      ['weekly_rotator', schema.weeklyRotator],
      ['formats', schema.formats],
      ['format_compatibility', schema.formatCompatibility],
      ['exercises', schema.exercises],
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
