import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { Notify } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import type {
  ProposalListResponse,
  ProposalFilters,
  AcceptOverrides,
  BulkAcceptResponse,
} from 'src/types/proposal';

const log = createLogger('useProposalsApi');

/**
 * Profe review of the heuristic dimension proposals (TREE-03).
 * Hits /admin/exercises/proposals* (Phase 125 Plan 02). Every method wraps the
 * call in the standard extractError + Notify + log.error idiom and rethrows so
 * the page can decide whether to refresh. NEVER console.log (CLAUDE.md).
 */
export function useProposalsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchProposals(filters: ProposalFilters = {}): Promise<ProposalListResponse> {
    loading.value = true;
    error.value = null;
    try {
      // axios omits null/undefined params; leaving status undefined lets the
      // backend default to pending.
      const params: Record<string, string> = {};
      if (filters.route) params.route = filters.route;
      if (filters.status) params.status = filters.status;

      const { data } = await api.get<ProposalListResponse>('/admin/exercises/proposals', {
        params,
      });
      return data;
    } catch (err: unknown) {
      const message = extractError(err, 'Error cargando propuestas');
      error.value = message;
      log.error('Failed to fetch proposals', { error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function acceptProposal(id: number, overrides?: AcceptOverrides): Promise<void> {
    try {
      await api.post(`/admin/exercises/proposals/${id}/accept`, overrides ?? {});
    } catch (err: unknown) {
      const message = extractError(err, 'Error aceptando propuesta');
      error.value = message;
      log.error('Failed to accept proposal', { id, error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    }
  }

  async function rejectProposal(id: number): Promise<void> {
    try {
      await api.post(`/admin/exercises/proposals/${id}/reject`, {});
    } catch (err: unknown) {
      const message = extractError(err, 'Error rechazando propuesta');
      error.value = message;
      log.error('Failed to reject proposal', { id, error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    }
  }

  async function bulkAccept(ids: number[]): Promise<BulkAcceptResponse> {
    try {
      const { data } = await api.post<BulkAcceptResponse>(
        '/admin/exercises/proposals/bulk-accept',
        { ids }
      );
      return data;
    } catch (err: unknown) {
      const message = extractError(err, 'Error aceptando el grupo');
      error.value = message;
      log.error('Failed to bulk-accept proposals', { ids, error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    }
  }

  return {
    loading,
    error,
    fetchProposals,
    acceptProposal,
    rejectProposal,
    bulkAccept,
  };
}
