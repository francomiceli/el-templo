/**
 * ExerciseService - Exercise Listing with Pagination, Search, and Filters
 *
 * Provides paginated exercise listing for the admin exercise management UI.
 * Supports filtering by category, level, route, effort (contraction type),
 * video status, and text search.
 */

import { eq, like, isNull, isNotNull, sql, asc, and } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { SQL } from "drizzle-orm";
import * as schema from "../../db/schema";

export interface ExerciseListFilters {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  level?: string;
  route?: string;
  effort?: string;
  hasVideo?: boolean;
  equipment?: string;
}

export interface ExerciseListItem {
  id: number;
  exercise: string;
  category: string;
  level: string | null;
  route: string;
  effort: string;
  difficulty: number;
  dificultadLineal: number;
  videoUrl: string | null;
  equipment: string | null;
}

export interface ExerciseListResult {
  exercises: ExerciseListItem[];
  total: number;
  page: number;
  totalPages: number;
}

export class ExerciseService {
  static async listExercises(
    db: MySql2Database<typeof schema>,
    filters: ExerciseListFilters,
  ): Promise<ExerciseListResult> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const offset = (page - 1) * limit;

    // Build WHERE conditions
    const conditions: SQL[] = [];

    if (filters.search) {
      conditions.push(like(schema.exercises.exercise, `%${filters.search}%`));
    }

    if (filters.category) {
      conditions.push(eq(schema.exercises.category, filters.category));
    }

    if (filters.level) {
      conditions.push(
        eq(
          schema.exercises.level,
          filters.level as "alfa" | "delta" | "sigma" | "omega" | "spartan",
        ),
      );
    }

    if (filters.route) {
      conditions.push(eq(schema.exercises.route, filters.route));
    }

    if (filters.effort === "empty") {
      conditions.push(eq(schema.exercises.effort, ""));
    } else if (filters.effort) {
      conditions.push(eq(schema.exercises.effort, filters.effort));
    }

    if (filters.hasVideo === true) {
      conditions.push(isNotNull(schema.exercises.videoUrl));
    } else if (filters.hasVideo === false) {
      conditions.push(isNull(schema.exercises.videoUrl));
    }

    if (filters.equipment === "empty") {
      conditions.push(isNull(schema.exercises.equipment));
    } else if (filters.equipment) {
      conditions.push(
        eq(
          schema.exercises.equipment,
          filters.equipment as
            | "barras"
            | "anillas"
            | "paralelas"
            | "cajon"
            | "ninguno",
        ),
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Count total matching exercises
    const [countRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.exercises)
      .where(whereClause);

    const total = Number(countRow?.count ?? 0);
    const totalPages = Math.ceil(total / limit);

    // Fetch exercises for current page
    const exercises = await db
      .select({
        id: schema.exercises.id,
        exercise: schema.exercises.exercise,
        category: schema.exercises.category,
        level: schema.exercises.level,
        route: schema.exercises.route,
        effort: schema.exercises.effort,
        difficulty: schema.exercises.difficulty,
        dificultadLineal: schema.exercises.dificultadLineal,
        videoUrl: schema.exercises.videoUrl,
        equipment: schema.exercises.equipment,
      })
      .from(schema.exercises)
      .where(whereClause)
      .orderBy(asc(schema.exercises.exercise))
      .limit(limit)
      .offset(offset);

    return {
      exercises: exercises.map((ex) => ({
        ...ex,
        level: ex.level ?? null,
        videoUrl: ex.videoUrl ?? null,
        equipment: ex.equipment ?? null,
      })),
      total,
      page,
      totalPages,
    };
  }
}
