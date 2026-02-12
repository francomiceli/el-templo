/**
 * Mobility Exercise Selection
 *
 * Selects 1 mobility exercise per non-INITIUM block based on the block's route.
 * Uses route-to-mobility mapping for relevance, with full-pool fallback.
 *
 * Selection logic:
 * 1. Query all exercises with pattern = 'MOVILIDAD'
 * 2. Filter to route-relevant exercises (via ROUTE_TO_MOBILITY_ROUTES + mobilityRelated)
 * 3. Fallback to full MOVILIDAD pool if no route-specific matches
 * 4. Random selection from valid pool
 *
 * Prescription defaults (from examples.txt analysis):
 * - ISO exercises: 20 seconds (most common across 21 examples)
 * - CON exercises: 10 reps (middle ground between 6-12 range)
 * - Intensity does NOT affect mobility prescription (per user decision)
 * - Same mobility for all levels (per user decision)
 */

import { MySql2Database } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import * as schema from '../../../../db/schema';
import { ROUTE_TO_MOBILITY_ROUTES } from './mobility-routes';
import type { ExercisePrescription } from '../../types';

// Defaults derived from examples.txt analysis:
// ISO exercises: 20 seconds (most common across 21 examples)
// CON exercises: 10 reps (middle ground between 6-12 range)
const MOBILITY_DEFAULTS = {
  ISO_SECONDS: 20,
  CON_REPS: 10,
};

export async function selectMobilityExercise(
  blockRoute: string,
  db: MySql2Database<typeof schema>,
): Promise<ExercisePrescription | null> {
  // 1. Query ALL exercises with pattern = 'MOVILIDAD'
  const allMobility = await db
    .select({
      id: schema.exercises.id,
      name: schema.exercises.exercise,
      effort: schema.exercises.effort,
      mobilityRelated: schema.exercises.mobilityRelated,
    })
    .from(schema.exercises)
    .where(eq(schema.exercises.pattern, 'MOVILIDAD'));

  if (allMobility.length === 0) return null;

  // 2. Get related mobility routes for this block route
  const relatedRoutes = ROUTE_TO_MOBILITY_ROUTES[blockRoute] || [];

  // 3. Filter to route-relevant exercises (mobilityRelated column includes any related route)
  let pool = allMobility.filter(ex => {
    if (!ex.mobilityRelated || relatedRoutes.length === 0) return false;
    return relatedRoutes.some(route =>
      ex.mobilityRelated!.includes(route)
    );
  });

  // 4. Fallback: if no route-specific matches, use full MOVILIDAD pool
  if (pool.length === 0) {
    pool = allMobility;
  }

  // 5. Random selection from valid pool
  const selected = pool[Math.floor(Math.random() * pool.length)];

  // 6. Prescription based on contraction type (per user decision)
  // ISO = seconds (hold), CON = reps
  const isISO = selected.effort?.toUpperCase() === 'ISO';

  return {
    exerciseId: selected.id,
    name: selected.name,
    contraction: isISO ? 'ISO' : 'CON',
    reps: isISO ? 0 : MOBILITY_DEFAULTS.CON_REPS,
    seconds: isISO ? MOBILITY_DEFAULTS.ISO_SECONDS : 0,
    rest: 0, // Mobility is active rest - no prescribed rest after
    exerciseType: 'mobility',
  };
}
