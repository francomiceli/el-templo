import { ref } from 'vue';
import { api } from 'src/boot/axios';
import type {
  SessionSummary,
  SessionFilter,
  SessionsResponse,
  SessionDetail,
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
      const axiosError = err as { response?: { data?: { error?: string } } };
      error.value = axiosError.response?.data?.error || 'Error cargando sesiones';
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
      const axiosError = err as { response?: { data?: { error?: string } } };
      error.value = axiosError.response?.data?.error || 'Error cargando sesion';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function approveSession(id: number): Promise<void> {
    await api.post(`/admin/sessions/${id}/approve`);
  }

  async function discardSession(id: number, reason?: string): Promise<void> {
    await api.post(`/admin/sessions/${id}/discard`, { reason });
  }

  async function revertSession(id: number): Promise<void> {
    await api.post(`/admin/sessions/${id}/revert`);
  }

  async function restoreSession(id: number): Promise<void> {
    await api.post(`/admin/sessions/${id}/restore`);
  }

  async function bulkApprove(ids: number[]): Promise<{ approvedCount: number }> {
    const { data } = await api.post<{ approvedCount: number }>('/admin/sessions/bulk-approve', { ids });
    return data;
  }

  async function getPendingCount(): Promise<number> {
    const { data } = await api.get<{ count: number }>('/admin/sessions/pending-count');
    return data.count;
  }

  return {
    loading,
    error,
    fetchSessions,
    fetchSessionDetail,
    approveSession,
    discardSession,
    revertSession,
    restoreSession,
    bulkApprove,
    getPendingCount,
  };
}
