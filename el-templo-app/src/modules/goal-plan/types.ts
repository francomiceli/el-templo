/**
 * Goal Plan types for the member app.
 *
 * Mirrors API types from el-templo-api/src/modules/goal-plans/types.ts
 * for frontend consumption.
 */

import type { Block } from '../training/types/session'

export type GoalPlanType =
  | 'tren_superior'
  | 'tren_inferior'
  | 'gluteos'
  | 'cuadriceps'
  | 'empuje'
  | 'traccion'
  | 'planche'
  | 'front_lever'

export type GoalPlanTier = 'principiante' | 'intermedio' | 'avanzado'

export interface GoalPlanProgress {
  goalPlanType: GoalPlanType
  isActive: boolean
  startedAt: string
}

export interface ArchivedGoalPlan {
  goalPlanType: GoalPlanType
  startedAt: string
  archivedAt: string
}

export interface GoalPlanMetadata {
  type: GoalPlanType
  name: string
  tier: GoalPlanTier
  description: string
  zones: string[]
  idealFor: string
}

/**
 * Cycle progress stats from GET /goal-plans/stats.
 * Derived from subscription plan durationDays and completed sessions.
 */
export interface CycleStats {
  cycleWeeks: number
  currentWeek: number
  cycleEndDate: string
  totalCompletions: number
  cycleComplete: boolean
}

/**
 * Goal plan session response from API.
 * Structured like existing Session type but with goal plan context.
 */
export interface GoalPlanSessionResponse {
  dayId: string
  week: number
  day: string
  levelGroup: string
  goalPlanType: GoalPlanType
  blockCount: number
  blocks: Block[]
}
