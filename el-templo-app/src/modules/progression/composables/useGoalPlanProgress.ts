import { ref } from 'vue'
import { createLogger } from 'src/utils/logger'
import { useGoalPlanApi } from 'src/modules/goal-plan/composables/useGoalPlanApi'
import type {
  GoalPlanProgress,
  ArchivedGoalPlan,
  GoalPlanMetadata,
  CycleStats,
} from 'src/modules/goal-plan/types'

const log = createLogger('GoalPlanProgress')

/**
 * Goal plan progress data for Mi Templo display.
 * Combines active goal plan + metadata for rich display.
 */
export interface GoalPlanProgressDisplay {
  activeGoalPlan: GoalPlanProgress | null
  metadata: GoalPlanMetadata | null
  archivedGoalPlans: ArchivedGoalPlan[]
  allMetadata: GoalPlanMetadata[]
}

/**
 * Composable for fetching goal plan progress data for Mi Templo.
 *
 * Fetches active goal plan, archived goal plans, and metadata in parallel.
 * Exposes cleanup() per composable convention (no onUnmounted inside).
 */
export function useGoalPlanProgress() {
  const activeGoalPlan = ref<GoalPlanProgress | null>(null)
  const archivedGoalPlans = ref<ArchivedGoalPlan[]>([])
  const allMetadata = ref<GoalPlanMetadata[]>([])
  const cycleStats = ref<CycleStats | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  let apiInstance: ReturnType<typeof useGoalPlanApi> | null = null

  /**
   * Fetch all goal plan data needed for Mi Templo display.
   * Loads active goal plan, archived goal plans, and metadata in parallel.
   */
  async function fetchGoalPlanData(): Promise<void> {
    const api = useGoalPlanApi()
    apiInstance = api

    try {
      loading.value = true
      error.value = null

      const [active, archived, metadata, stats] = await Promise.all([
        api.getActiveGoalPlan(),
        api.getArchivedGoalPlans(),
        api.getMetadata(),
        api.getStats(),
      ])

      activeGoalPlan.value = active
      archivedGoalPlans.value = archived
      allMetadata.value = metadata
      cycleStats.value = stats

      log.debug('Goal plan progress loaded', {
        hasActive: active !== null,
        archivedCount: archived.length,
        metadataCount: metadata.length,
        hasCycleStats: stats !== null,
      })
    } catch (err: unknown) {
      error.value = 'Error cargando datos del plan por objetivos'
      log.error('Failed to fetch goal plan progress', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      loading.value = false
      api.cleanup()
      apiInstance = null
    }
  }

  /**
   * Get metadata for a specific goal plan type.
   */
  function getMetadataForType(goalPlanType: string): GoalPlanMetadata | undefined {
    return allMetadata.value.find((m) => m.type === goalPlanType)
  }

  /**
   * Cleanup: abort any in-flight requests.
   * Per composable convention: caller invokes cleanup() on unmount.
   */
  function cleanup(): void {
    if (apiInstance) {
      apiInstance.cleanup()
      apiInstance = null
    }
  }

  return {
    activeGoalPlan,
    archivedGoalPlans,
    allMetadata,
    cycleStats,
    loading,
    error,
    fetchGoalPlanData,
    getMetadataForType,
    cleanup,
  }
}
