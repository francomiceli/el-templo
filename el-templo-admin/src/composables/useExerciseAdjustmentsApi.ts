import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { Notify } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
import type { MemberAdjustment } from 'src/types/exercise-adjustments';

const log = createLogger('useExerciseAdjustmentsApi');

/**
 * Coach-facing read of a member's dominado/bajado log (Phase 131 Plan 02,
 * ADJUST-04). Consumes GET /admin/exercise-adjustments/:memberId (axios `api`
 * already prefixes /api). Gated server-side by TRAINING_ROLES — a 403 means the
 * current staff role cannot view it; callers may silence that case.
 *
 * Composable contract (CLAUDE.md): exposes a no-op-safe cleanup(); does NOT call
 * onUnmounted internally — the consuming component owns the lifecycle. NEVER
 * console.log.
 */
export function useExerciseAdjustmentsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchMemberAdjustments(memberId: number): Promise<MemberAdjustment[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<MemberAdjustment[]>(`/admin/exercise-adjustments/${memberId}`);
      return data;
    } catch (err: unknown) {
      const message = extractError(err, 'Error cargando los ajustes del alumno');
      error.value = message;
      // A 403/404 is expected for non-coach roles (TRAINING_ROLES gate) — let the
      // caller decide whether to surface it. Only toast + log.error on real
      // failures; rethrow either way so the page can fall back to an empty list.
      if (!isExpectedClientError(err)) {
        log.error('Failed to fetch member adjustments', { memberId, error: message });
        Notify.create({ type: 'negative', message });
      }
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * No-op-safe cleanup hook (CLAUDE.md composable contract). The composable holds
   * no timers/subscriptions, so this just resets transient state.
   */
  function cleanup(): void {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    fetchMemberAdjustments,
    cleanup,
  };
}
