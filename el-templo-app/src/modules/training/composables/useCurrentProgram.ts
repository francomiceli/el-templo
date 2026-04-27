import { computed } from 'vue'
import { useUserStore } from 'src/stores/useUserStore'
import { createLogger } from 'src/utils/logger'

const log = createLogger('useCurrentProgram')

/**
 * Phase 104 (R9): Composable for the program-selector UX in the weekly view.
 *
 * Wraps useUserStore's currentProgram + allActiveEnrollments state and
 * exposes a `select()` action that PUTs the new pointer and waits for the
 * server to confirm.
 *
 * Per project convention (CLAUDE.md): composables expose `cleanup()` and do
 * NOT use `onUnmounted` internally. This composable holds no subscriptions
 * or timers, so cleanup is a no-op.
 */
export function useCurrentProgram() {
  const userStore = useUserStore()

  const currentEnrollmentId = computed(() => userStore.currentProgram.enrollmentId)
  const currentProgram = computed(() => userStore.currentProgram.program)
  const enrollments = computed(() => userStore.allActiveEnrollments)
  const hasPresencial = computed(() => userStore.hasPresencialPlan)
  const showSelector = computed(() => userStore.showProgramSelector)
  const isUpdating = computed(() => userStore.isUpdatingCurrentProgram)

  /**
   * Derived view kind for callers that need to know which view the user is
   * currently on. Note: this is FE-only inference for UI labels — useWeekData
   * has its own server-aware view-param resolution that handles the
   * online-only-no-pointer case (BLOCKER #1).
   */
  const viewKind = computed<'templo' | 'program'>(() =>
    currentEnrollmentId.value === null && hasPresencial.value ? 'templo' : 'program',
  )

  async function select(enrollmentId: number | null): Promise<void> {
    try {
      await userStore.setCurrentProgramId(enrollmentId)
    } catch (err: unknown) {
      log.error('Failed to set current program', {
        error: err instanceof Error ? err.message : String(err),
        enrollmentId,
      })
      throw err
    }
  }

  function cleanup(): void {
    // No-op — this composable holds no subscriptions or timers.
  }

  return {
    currentEnrollmentId,
    currentProgram,
    enrollments,
    hasPresencial,
    showSelector,
    isUpdating,
    viewKind,
    select,
    cleanup,
  }
}
