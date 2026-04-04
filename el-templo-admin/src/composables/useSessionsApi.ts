import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type {
  SessionFilter,
  SessionsResponse,
  SessionDetail,
  PoolBlocksResponse,
} from 'src/types/session';

export function useSessionsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchSessions(filter: SessionFilter): Promise<SessionsResponse> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<SessionsResponse>('/admin/sessions', {
        params: filter,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando sesiones');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function fetchSessionDetail(id: number): Promise<SessionDetail> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<SessionDetail>(`/admin/sessions/${id}`);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando sesion');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function fetchDaySessionDetails(
    week: number,
    day: string,
    goalPlanType?: string,
  ): Promise<SessionDetail[]> {
    loading.value = true;
    error.value = null;
    try {
      const params: { week: number; day: string; personalizadaType?: string } = { week, day };
      if (goalPlanType) params.personalizadaType = goalPlanType;
      const { data } = await api.get<{ sessions: SessionDetail[] }>('/admin/sessions/day-details', {
        params,
      });
      return data.sessions;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando sesiones del dia');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function approveSession(id: number): Promise<void> {
    await api.post(`/admin/sessions/${id}/approve`);
  }

  async function revertSession(id: number): Promise<void> {
    await api.post(`/admin/sessions/${id}/revert`);
  }

  async function bulkApprove(ids: number[]): Promise<{ approvedCount: number }> {
    const { data } = await api.post<{ approvedCount: number }>('/admin/sessions/bulk-approve', {
      ids,
    });
    return data;
  }

  async function fetchBlockPool(
    route: string,
    memberLevel: string,
    excludeSessionId?: number,
    excludeBlockId?: number
  ): Promise<PoolBlocksResponse> {
    const { data } = await api.get<PoolBlocksResponse>('/admin/blocks/pool', {
      params: { route, memberLevel, excludeSessionId, excludeBlockId },
    });
    return data;
  }

  async function swapBlock(
    sessionId: number,
    blockId: number,
    sourceBlockId: number
  ): Promise<void> {
    await api.post(`/admin/sessions/${sessionId}/blocks/${blockId}/swap`, { sourceBlockId });
  }

  return {
    loading,
    error,
    fetchSessions,
    fetchSessionDetail,
    fetchDaySessionDetails,
    approveSession,
    revertSession,
    bulkApprove,
    fetchBlockPool,
    swapBlock,
  };
}
