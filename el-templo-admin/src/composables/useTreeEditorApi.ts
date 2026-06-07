import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { Notify } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import type {
  EditableTree,
  ReorderBody,
  PrecedenceBody,
  RegroupBody,
  MutationResult,
  MilestoneReviewRow,
  MilestoneVariant,
  AcceptMilestoneBody,
} from 'src/types/tree-editor';

const log = createLogger('useTreeEditorApi');

/**
 * Profe-facing skill-tree editor (TREE-07). Consumes the Plan-02 endpoints under
 * /admin/tree-editor (axios `api` already prefixes /api). Every method wraps the
 * call in the standard extractError + Notify + log.error idiom and rethrows so
 * the page can decide whether to refetch. NEVER console.log (CLAUDE.md).
 *
 * Composable contract (CLAUDE.md): exposes a no-op-safe cleanup(); does NOT call
 * onUnmounted internally — the consuming component owns the lifecycle.
 */
export function useTreeEditorApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchTree(): Promise<EditableTree> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<EditableTree>('/admin/tree-editor/tree');
      return data;
    } catch (err: unknown) {
      const message = extractError(err, 'Error cargando el árbol');
      error.value = message;
      log.error('Failed to fetch editable tree', { error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function reorderPartition(body: ReorderBody): Promise<MutationResult> {
    try {
      const { data } = await api.post<MutationResult>('/admin/tree-editor/reorder', body);
      return data;
    } catch (err: unknown) {
      const message = extractError(err, 'Error reordenando la partición');
      error.value = message;
      log.error('Failed to reorder partition', {
        route: body.route,
        effort: body.effort,
        error: message,
      });
      Notify.create({ type: 'negative', message });
      throw err;
    }
  }

  async function setPrecedence(body: PrecedenceBody): Promise<MutationResult> {
    try {
      const { data } = await api.post<MutationResult>('/admin/tree-editor/precedence', body);
      return data;
    } catch (err: unknown) {
      const message = extractError(err, 'Error actualizando la precedencia');
      error.value = message;
      log.error('Failed to set precedence edge', {
        fromExerciseId: body.fromExerciseId,
        toExerciseId: body.toExerciseId,
        op: body.op,
        error: message,
      });
      Notify.create({ type: 'negative', message });
      throw err;
    }
  }

  async function regroup(body: RegroupBody): Promise<MutationResult> {
    try {
      const { data } = await api.post<MutationResult>('/admin/tree-editor/regroup', body);
      return data;
    } catch (err: unknown) {
      const message = extractError(err, 'Error reagrupando ejercicios');
      error.value = message;
      log.error('Failed to regroup exercises', {
        exerciseIds: body.exerciseIds,
        targetRoute: body.targetRoute,
        error: message,
      });
      Notify.create({ type: 'negative', message });
      throw err;
    }
  }

  // ── Milestone review (Phase 133 Plan 06 — R1-REV, mirrors Plan-05 endpoints) ──

  /** Pending hito/variante proposals of a route (drawer rows). */
  async function getMilestoneReview(route: string): Promise<MilestoneReviewRow[]> {
    try {
      const { data } = await api.get<{ rows: MilestoneReviewRow[] }>(
        '/admin/tree-editor/milestone-review',
        { params: { route } }
      );
      return data.rows;
    } catch (err: unknown) {
      const message = extractError(
        err,
        'No se pudo cargar la revisión de hitos. Recargá la página para reintentar.'
      );
      error.value = message;
      log.error('Failed to fetch milestone review rows', { route, error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    }
  }

  /** Variantes hanging off a hito (truth column, not proposals) — side panel. */
  async function getVariants(exerciseId: number): Promise<MilestoneVariant[]> {
    try {
      const { data } = await api.get<{ variants: MilestoneVariant[] }>(
        `/admin/tree-editor/milestone/${exerciseId}/variants`
      );
      return data.variants;
    } catch (err: unknown) {
      const message = extractError(
        err,
        'No se pudieron cargar las variantes. Recargá la página para reintentar.'
      );
      error.value = message;
      log.error('Failed to fetch milestone variants', { exerciseId, error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    }
  }

  /** ONE-tx accept: dimension overrides + hito/variante truth in a single pass. */
  async function acceptMilestoneReview(body: AcceptMilestoneBody): Promise<MutationResult> {
    try {
      const { data } = await api.post<MutationResult>(
        '/admin/tree-editor/milestone-review/accept',
        body
      );
      return data;
    } catch (err: unknown) {
      const message = extractError(
        err,
        'No se pudo guardar el cambio. Reintentá; si persiste, recargá la página.'
      );
      error.value = message;
      log.error('Failed to accept milestone review', {
        exerciseId: body.exerciseId,
        role: body.role,
        milestoneExerciseId: body.milestoneExerciseId,
        error: message,
      });
      Notify.create({ type: 'negative', message });
      throw err;
    }
  }

  /** Status-only flip of the pending hito proposal — never touches exercises. */
  async function rejectMilestoneReview(exerciseId: number): Promise<MutationResult> {
    try {
      const { data } = await api.post<MutationResult>(
        '/admin/tree-editor/milestone-review/reject',
        { exerciseId }
      );
      return data;
    } catch (err: unknown) {
      const message = extractError(
        err,
        'No se pudo guardar el cambio. Reintentá; si persiste, recargá la página.'
      );
      error.value = message;
      log.error('Failed to reject milestone review', { exerciseId, error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    }
  }

  /** Transactional variante↔hito swap (the chains recompute server-side). */
  async function promoteMilestone(exerciseId: number): Promise<MutationResult> {
    try {
      const { data } = await api.post<MutationResult>('/admin/tree-editor/milestone/promote', {
        exerciseId,
      });
      return data;
    } catch (err: unknown) {
      const message = extractError(
        err,
        'No se pudo guardar el cambio. Reintentá; si persiste, recargá la página.'
      );
      error.value = message;
      log.error('Failed to promote milestone', { exerciseId, error: message });
      Notify.create({ type: 'negative', message });
      throw err;
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
    fetchTree,
    reorderPartition,
    setPrecedence,
    regroup,
    getMilestoneReview,
    getVariants,
    acceptMilestoneReview,
    rejectMilestoneReview,
    promoteMilestone,
    cleanup,
  };
}
