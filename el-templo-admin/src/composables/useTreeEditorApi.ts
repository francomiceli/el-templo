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
    cleanup,
  };
}
