/**
 * ROM Session Generator
 *
 * Generates ROM (Range of Motion) mobility sessions with 3 body-zone blocks:
 * ROM_LOWER (Tren Inferior), ROM_CORE (Zona Media), ROM_UPPER (Tren Superior).
 *
 * Each block has 3 CON exercises with shuffled [20, 30, 40] reps,
 * For Quality x3 format, and 30s rest.
 *
 * Two tiers: alfa (Basico, dificultadLineal 1-3) and delta (Avanzado, 4-6).
 * Bypasses the 7-stage SPOM pipeline entirely.
 */

import { MySql2Database } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import type {
  DaySession,
  BlockPlan,
  ExercisePrescription,
  BlockRole,
  TraceEvent,
} from "./types";
import { LEVEL_DIFFICULTY_MAP } from "../shared/training-constants";

/** Body zone to mobilityRelated field mapping (per D-11) */
export const ROM_ZONE_MOBILITY_MAP: Record<string, string[]> = {
  ROM_LOWER: ["LS ( LUNGES )"],
  ROM_CORE: ["FL", "TTB / HF", "MN"],
  ROM_UPPER: ["PL"],
};

/** Display names for ROM block roles (per D-25) */
export const ROM_BLOCK_DISPLAY_NAMES: Record<string, string> = {
  ROM_LOWER: "TREN INFERIOR",
  ROM_CORE: "ZONA MEDIA",
  ROM_UPPER: "TREN SUPERIOR",
};

/** ROM block roles in execution order */
const ROM_BLOCK_ROLES: BlockRole[] = ["ROM_LOWER", "ROM_CORE", "ROM_UPPER"];

/** Rep values assigned to the 3 exercises per block (shuffled) */
const ROM_REP_VALUES = [20, 30, 40];

/** Fixed rest between rounds (per D-08) */
const ROM_REST_SECONDS = 30;

/** Fixed intensity for ROM blocks (moderate, informational only) */
const ROM_INTENSITY = 50;

/** Fixed reps budget for ROM blocks (3 exercises x avg 90 reps) */
const ROM_REPS_BUDGET = 270;

/**
 * Fisher-Yates shuffle (in-place)
 */
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate a complete ROM session for a given week, day, and member level.
 *
 * @param db - Database connection
 * @param week - Week number
 * @param day - Day name (e.g., 'sabado')
 * @param memberLevel - 'alfa' (Basico) or 'delta' (Avanzado)
 * @returns Complete DaySession with session_mode='rom'
 */
export async function generateRomSession(
  db: MySql2Database<typeof schema>,
  week: number,
  day: string,
  memberLevel: "alfa" | "delta",
): Promise<DaySession> {
  const dayId = `W${week}-${day}-${memberLevel}`;
  const sessionTrace: TraceEvent[] = [];

  // Query ALL mobility exercises once (shared across blocks)
  const allMobility = await db
    .select()
    .from(schema.exercises)
    .where(eq(schema.exercises.pattern, "MOVILIDAD"));

  // Determine difficulty range based on member level
  const maxDifficulty = LEVEL_DIFFICULTY_MAP[memberLevel] ?? 6;
  const minDifficulty = memberLevel === "alfa" ? 1 : 4;

  const blocks: BlockPlan[] = [];

  for (const role of ROM_BLOCK_ROLES) {
    const mobilityKeys = ROM_ZONE_MOBILITY_MAP[role];

    // Filter by body zone using mobilityRelated field
    const zoneExercises = allMobility.filter((ex) => {
      if (!ex.mobilityRelated) return false;
      return mobilityKeys.some((key) => ex.mobilityRelated!.includes(key));
    });

    // Filter by CON contraction and difficulty range
    let eligible = zoneExercises.filter(
      (ex) =>
        ex.effort === "CON" &&
        ex.dificultadLineal >= minDifficulty &&
        ex.dificultadLineal <= maxDifficulty,
    );

    // Graceful fallback: if fewer than 3 exercises, relax difficulty filter (per T-97-04)
    if (eligible.length < 3) {
      sessionTrace.push({
        ts: new Date().toISOString(),
        severity: "WARNING",
        code: "ROM_POOL_THIN",
        where: {
          week,
          day,
          levelGroup: "alfa_delta",
          memberLevel,
          blockId: `ROM-${role}-W${week}-${day}-${memberLevel}`,
          role,
        },
        decision: {
          zone: role,
          eligibleCount: eligible.length,
          fallback: "relaxing_difficulty_filter",
        },
      });

      // Fall back to all CON mobility exercises in this zone regardless of difficulty
      eligible = zoneExercises.filter((ex) => ex.effort === "CON");
    }

    // Pick 3 random exercises (Fisher-Yates shuffle, take first 3)
    const selected = shuffleArray(eligible).slice(0, 3);

    // Shuffle rep values [20, 30, 40] and assign one to each exercise
    const shuffledReps = shuffleArray(ROM_REP_VALUES);

    // Build prescriptions
    const exercises: ExercisePrescription[] = selected.map((ex, idx) => ({
      exerciseId: ex.id,
      name: ex.exercise,
      contraction: "CON" as const,
      reps: shuffledReps[idx],
      seconds: 0,
      rest: ROM_REST_SECONDS,
      exerciseType: "main" as const,
      dificultadLineal: ex.dificultadLineal,
    }));

    const blockId = `ROM-${role}-W${week}-${day}-${memberLevel}`;

    blocks.push({
      blockId,
      role,
      route: role,
      pattern: "MOVILIDAD",
      intensity: ROM_INTENSITY,
      repsBudget: ROM_REPS_BUDGET,
      format: { formatId: 0, name: "For Quality" },
      formatParams: { type: "for_quality", rounds: 3 },
      exercises,
      trace: [],
      mobilityExercise: undefined,
    });

    sessionTrace.push({
      ts: new Date().toISOString(),
      severity: "INFO",
      code: "ROM_BLOCK_GENERATED",
      where: {
        week,
        day,
        levelGroup: "alfa_delta",
        memberLevel,
        blockId,
        role,
      },
      decision: {
        zone: role,
        exerciseCount: exercises.length,
        poolSize: eligible.length,
      },
    });
  }

  return {
    dayId,
    week,
    day,
    levelGroup: "alfa_delta",
    memberLevel,
    blocks,
    trace: sessionTrace,
    goalPlanType: null,
    sessionMode: "rom",
  };
}
