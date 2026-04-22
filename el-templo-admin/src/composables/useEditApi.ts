import { ref, computed } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type {
  ExercisePoolResponse,
  CompatibleFormatsResponse,
  PrescriptionUpdate,
  SessionPreview,
  SavedBlock,
} from 'src/types/session';

export function useEditApi() {
  const activeRequests = ref(0);
  const loading = computed(() => activeRequests.value > 0);
  const error = ref<string | null>(null);

  async function apiCall<T>(
    fn: () => Promise<T>,
    fallbackError: string,
    trackLoading = true
  ): Promise<T> {
    if (trackLoading) activeRequests.value++;
    try {
      return await fn();
    } catch (err: unknown) {
      error.value = extractError(err, fallbackError);
      throw err;
    } finally {
      if (trackLoading) activeRequests.value--;
    }
  }

  async function fetchExercisePool(params: {
    route: string;
    blockId: number;
    contraction?: string;
    pattern?: string;
    blockRole?: string;
  }): Promise<ExercisePoolResponse> {
    return apiCall(async () => {
      const { data } = await api.get<ExercisePoolResponse>('/admin/exercises/pool', { params });
      return data;
    }, 'Error cargando ejercicios disponibles');
  }

  async function searchExercises(params: {
    q: string;
    contraction?: string;
    blockId?: number;
    limit?: number;
  }): Promise<ExercisePoolResponse> {
    return apiCall(
      async () => {
        const { data } = await api.get<ExercisePoolResponse>('/admin/exercises/search', { params });
        return data;
      },
      'Error buscando ejercicios',
      false
    );
  }

  async function swapExercise(
    sessionId: number,
    blockId: number,
    prescriptionId: number,
    newExerciseId: number
  ): Promise<void> {
    return apiCall(
      () =>
        api
          .post(`/admin/sessions/${sessionId}/blocks/${blockId}/exercises/${prescriptionId}/swap`, {
            newExerciseId,
          })
          .then(() => undefined),
      'Error al cambiar ejercicio'
    );
  }

  async function updatePrescription(
    sessionId: number,
    blockId: number,
    prescriptionId: number,
    fields: PrescriptionUpdate
  ): Promise<void> {
    return apiCall(
      () =>
        api
          .patch(
            `/admin/sessions/${sessionId}/blocks/${blockId}/exercises/${prescriptionId}`,
            fields
          )
          .then(() => undefined),
      'Error al actualizar prescripcion'
    );
  }

  async function changeBlockFormat(
    sessionId: number,
    blockId: number,
    formatId: number,
    formatName: string
  ): Promise<void> {
    return apiCall(
      () =>
        api
          .patch(`/admin/sessions/${sessionId}/blocks/${blockId}/format`, {
            formatId,
            formatName,
          })
          .then(() => undefined),
      'Error al cambiar formato'
    );
  }

  async function addExercise(
    sessionId: number,
    blockId: number,
    exerciseId: number
  ): Promise<void> {
    return apiCall(
      () =>
        api
          .post(`/admin/sessions/${sessionId}/blocks/${blockId}/exercises`, { exerciseId })
          .then(() => undefined),
      'Error al agregar ejercicio'
    );
  }

  async function removeExercise(
    sessionId: number,
    blockId: number,
    prescriptionId: number
  ): Promise<void> {
    return apiCall(
      () =>
        api
          .delete(`/admin/sessions/${sessionId}/blocks/${blockId}/exercises/${prescriptionId}`)
          .then(() => undefined),
      'Error al eliminar ejercicio'
    );
  }

  async function reorderExercise(
    sessionId: number,
    blockId: number,
    prescriptionId: number,
    direction: 'up' | 'down'
  ): Promise<void> {
    return apiCall(
      () =>
        api
          .patch(
            `/admin/sessions/${sessionId}/blocks/${blockId}/exercises/${prescriptionId}/reorder`,
            { direction }
          )
          .then(() => undefined),
      'Error al reordenar ejercicio'
    );
  }

  async function resetToAlgorithm(sessionId: number): Promise<void> {
    return apiCall(
      () => api.post(`/admin/sessions/${sessionId}/reset`).then(() => undefined),
      'Error al restaurar sesion original'
    );
  }

  async function fetchCompatibleFormats(params: {
    blockRole: string;
    level: string;
    intensity: number;
  }): Promise<CompatibleFormatsResponse> {
    return apiCall(async () => {
      const { data } = await api.get<CompatibleFormatsResponse>('/admin/formats/compatible', {
        params,
      });
      return data;
    }, 'Error cargando formatos compatibles');
  }

  async function fetchCompatibleFormatsBatch(
    blocks: Array<{ blockRole: string; level: string; intensity: number }>
  ): Promise<Map<string, CompatibleFormatsResponse>> {
    return apiCall(async () => {
      const { data } = await api.post<{
        results: Array<{ blockRole: string; formats: CompatibleFormatsResponse['formats'] }>;
      }>('/admin/formats/compatible-batch', { blocks });
      const map = new Map<string, CompatibleFormatsResponse>();
      for (const r of data.results) {
        map.set(r.blockRole, { formats: r.formats });
      }
      return map;
    }, 'Error cargando formatos compatibles');
  }

  async function fetchPreview(sessionId: number, memberLevel?: string): Promise<SessionPreview> {
    return apiCall(async () => {
      const { data } = await api.get<SessionPreview>(`/admin/sessions/${sessionId}/preview`, {
        params: memberLevel ? { memberLevel } : undefined,
      });
      return data;
    }, 'Error cargando vista previa');
  }

  async function updateFormatParams(
    sessionId: number,
    blockId: number,
    formatParams: Record<string, unknown>
  ): Promise<{ formatParams: Record<string, unknown> }> {
    return apiCall(async () => {
      const { data } = await api.patch<{ formatParams: Record<string, unknown> }>(
        `/admin/sessions/${sessionId}/blocks/${blockId}/format-params`,
        { formatParams }
      );
      return data;
    }, 'Error al actualizar parametros de formato');
  }

  async function updateCustomTitle(
    sessionId: number,
    blockId: number,
    customTitle: string | null
  ): Promise<{ customTitle: string | null }> {
    return apiCall(async () => {
      const { data } = await api.patch<{ customTitle: string | null }>(
        `/admin/sessions/${sessionId}/blocks/${blockId}/custom-title`,
        { customTitle }
      );
      return data;
    }, 'Error al actualizar titulo personalizado');
  }

  async function saveBlock(blockId: number, name: string): Promise<SavedBlock> {
    return apiCall(async () => {
      const { data } = await api.post<SavedBlock>('/admin/saved-blocks', {
        blockId,
        name,
      });
      return data;
    }, 'Error al guardar bloque');
  }

  async function fetchMobilityPool(blockRoute: string): Promise<ExercisePoolResponse> {
    return apiCall(async () => {
      const { data } = await api.get<ExercisePoolResponse>('/admin/exercises/mobility-pool', {
        params: { blockRoute },
      });
      return data;
    }, 'Error cargando ejercicios de movilidad');
  }

  async function swapMobilityExercise(
    sessionId: number,
    blockId: number,
    newExerciseId: number
  ): Promise<void> {
    return apiCall(
      () =>
        api
          .post(`/admin/sessions/${sessionId}/blocks/${blockId}/mobility/swap`, {
            newExerciseId,
          })
          .then(() => undefined),
      'Error al cambiar ejercicio de movilidad'
    );
  }

  async function updateBlockRole(
    sessionId: number,
    blockId: number,
    role: 'ATHLOS' | 'EPIKOS'
  ): Promise<void> {
    return apiCall(
      () =>
        api
          .patch(`/admin/sessions/${sessionId}/blocks/${blockId}/role`, { role })
          .then(() => undefined),
      'Error al cambiar rol del bloque'
    );
  }

  return {
    loading,
    error,
    fetchExercisePool,
    searchExercises,
    swapExercise,
    updatePrescription,
    changeBlockFormat,
    addExercise,
    removeExercise,
    reorderExercise,
    resetToAlgorithm,
    fetchCompatibleFormats,
    fetchCompatibleFormatsBatch,
    fetchPreview,
    updateFormatParams,
    updateCustomTitle,
    saveBlock,
    fetchMobilityPool,
    swapMobilityExercise,
    updateBlockRole,
  };
}
