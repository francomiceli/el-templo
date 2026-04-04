import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import type {
  GoalPlanType,
  GoalPlanMetadata,
  GoalPlanProgress,
  ArchivedGoalPlan,
  GoalPlanSessionResponse,
  CycleStats,
} from '../types'

const log = createLogger('GoalPlanApi')

interface SessionCompleteData {
  dayId: string
  goalPlanType: GoalPlanType
  date: string
  startedAt: string
  finishedAt: string
  blocksCompleted: string[]
  rpe: number | null
  notes: string | null
  exercisesCompleted: Record<string, number[]> | null
}

interface SessionCompleteResponse {
  success: boolean
  progress: GoalPlanProgress
}

/**
 * Composable for goal plan API calls.
 *
 * Handles all HTTP communication with the goal-plans endpoints.
 * Returns cleanup() per composable convention (no onUnmounted inside).
 */
export function useGoalPlanApi() {
  let abortController: AbortController | null = null

  function createAbortSignal(): AbortSignal {
    abortController = new AbortController()
    return abortController.signal
  }

  /**
   * Fetch static goal plan metadata for all 6 goal plans.
   * GET /api/goal-plans/metadata
   */
  async function getMetadata(): Promise<GoalPlanMetadata[]> {
    try {
      const response = await api.get<{ goalPlans: GoalPlanMetadata[] }>(
        '/goal-plans/metadata',
        {
          signal: createAbortSignal(),
        },
      )
      return response.data.goalPlans
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return []
      }
      log.error('Failed to fetch goal plan metadata', {
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  /**
   * Fetch the member's active goal plan progress.
   * GET /api/goal-plans/active
   * Returns null if no active goal plan.
   */
  async function getActiveGoalPlan(): Promise<GoalPlanProgress | null> {
    try {
      const response = await api.get<GoalPlanProgress | null>('/goal-plans/active', {
        signal: createAbortSignal(),
      })
      return response.data
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return null
      }
      log.error('Failed to fetch active goal plan', {
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  /**
   * Fetch archived/completed goal plans for the member.
   * GET /api/goal-plans/archived
   */
  async function getArchivedGoalPlans(): Promise<ArchivedGoalPlan[]> {
    try {
      const response = await api.get<ArchivedGoalPlan[]>('/goal-plans/archived', {
        signal: createAbortSignal(),
      })
      return response.data
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return []
      }
      log.error('Failed to fetch archived goal plans', {
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  /**
   * Fetch cycle progress stats for the member's active goal plan.
   * GET /api/goal-plans/stats
   * Returns null if no active goal plan.
   */
  async function getStats(): Promise<CycleStats | null> {
    try {
      const response = await api.get<{ stats: CycleStats | null }>('/goal-plans/stats', {
        signal: createAbortSignal(),
      })
      return response.data.stats
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return null
      }
      log.error('Failed to fetch goal plan stats', {
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  /**
   * Fetch a goal plan session for a specific week/day.
   * GET /api/goal-plans/session
   */
  async function getSession(
    week: number,
    day: string,
  ): Promise<GoalPlanSessionResponse | null> {
    try {
      const response = await api.get<GoalPlanSessionResponse | null>(
        '/goal-plans/session',
        {
          params: { week, day },
          signal: createAbortSignal(),
        },
      )
      return response.data
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'CanceledError') {
        return null
      }
      log.error('Failed to fetch goal plan session', {
        error: err instanceof Error ? err.message : String(err),
        week,
        day,
      })
      throw err
    }
  }

  /**
   * Complete a goal plan session and update progress.
   * POST /api/goal-plans/complete
   */
  async function completeSession(data: SessionCompleteData): Promise<SessionCompleteResponse> {
    try {
      const response = await api.post<SessionCompleteResponse>('/goal-plans/complete', data, {
        signal: createAbortSignal(),
      })
      return response.data
    } catch (err: unknown) {
      log.error('Failed to complete goal plan session', {
        error: err instanceof Error ? err.message : String(err),
        dayId: data.dayId,
      })
      throw err
    }
  }

  /**
   * Cleanup: abort any in-flight requests.
   * Per composable convention: caller invokes cleanup() on unmount.
   */
  function cleanup(): void {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  return {
    getMetadata,
    getActiveGoalPlan,
    getArchivedGoalPlans,
    getStats,
    getSession,
    completeSession,
    cleanup,
  }
}
