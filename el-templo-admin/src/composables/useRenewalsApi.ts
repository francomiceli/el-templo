/**
 * Renewals API composable — módulo de Renovaciones (admin), 2026-09-24.
 * Mismo patrón que `useReportsApi.ts`: refs de loading/error locales,
 * `extractError` para mensajes legibles, `cleanup()` expuesto (la página
 * llama `cleanup()` desde su propio `onUnmounted` — el composable en sí no
 * usa `onUnmounted`).
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type {
  RenewalListParams,
  RenewalListResult,
  RenewalRow,
  RenewalFollowupUpdateInput,
  RenewalNote,
  RenewalReason,
  RenewalReasonCreateInput,
  RenewalReasonUpdateInput,
} from 'src/types/renewals';

export function useRenewalsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function listRenewals(params: RenewalListParams): Promise<RenewalListResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<RenewalListResult>('/admin/renewals', { params });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando renovaciones');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updateFollowup(
    subscriptionId: number,
    input: RenewalFollowupUpdateInput
  ): Promise<RenewalRow> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.patch<RenewalRow>(`/admin/renewals/${subscriptionId}`, input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error actualizando la renovación');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function addNote(subscriptionId: number, content: string): Promise<RenewalNote> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<RenewalNote>(`/admin/renewals/${subscriptionId}/notes`, {
        content,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error agregando la observación');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function listReasons(includeInactive = false): Promise<RenewalReason[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<RenewalReason[]>('/admin/renewals/reasons', {
        params: { includeInactive },
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando motivos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function createReason(input: RenewalReasonCreateInput): Promise<RenewalReason> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<RenewalReason>('/admin/renewals/reasons', input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error creando el motivo');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updateReason(
    id: number,
    input: RenewalReasonUpdateInput
  ): Promise<RenewalReason> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.patch<RenewalReason>(`/admin/renewals/reasons/${id}`, input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error actualizando el motivo');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    listRenewals,
    updateFollowup,
    addNote,
    listReasons,
    createReason,
    updateReason,
    cleanup,
  };
}
