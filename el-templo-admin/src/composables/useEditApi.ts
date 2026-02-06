import { ref } from 'vue';
import { api } from 'src/boot/axios';
import type {
  ExercisePoolResponse,
  CompatibleFormatsResponse,
  PrescriptionUpdate,
  SessionPreview,
} from 'src/types/session';

export function useEditApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchExercisePool(params: {
    route: string;
    blockId: number;
    contraction?: string;
    pattern?: string;
  }): Promise<ExercisePoolResponse> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<ExercisePoolResponse>(
        '/admin/exercises/pool',
        { params },
      );
      return data;
    } catch (err: unknown) {
      const axiosError = err as {
        response?: { data?: { error?: string } };
      };
      error.value =
        axiosError.response?.data?.error ||
        'Error cargando ejercicios disponibles';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function swapExercise(
    sessionId: number,
    blockId: number,
    prescriptionId: number,
    newExerciseId: number,
  ): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.post(
        `/admin/sessions/${sessionId}/blocks/${blockId}/exercises/${prescriptionId}/swap`,
        { newExerciseId },
      );
    } catch (err: unknown) {
      const axiosError = err as {
        response?: { data?: { error?: string } };
      };
      error.value =
        axiosError.response?.data?.error || 'Error al cambiar ejercicio';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updatePrescription(
    sessionId: number,
    blockId: number,
    prescriptionId: number,
    fields: PrescriptionUpdate,
  ): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.patch(
        `/admin/sessions/${sessionId}/blocks/${blockId}/exercises/${prescriptionId}`,
        fields,
      );
    } catch (err: unknown) {
      const axiosError = err as {
        response?: { data?: { error?: string } };
      };
      error.value =
        axiosError.response?.data?.error ||
        'Error al actualizar prescripcion';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function changeBlockFormat(
    sessionId: number,
    blockId: number,
    formatId: number,
    formatName: string,
  ): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.patch(
        `/admin/sessions/${sessionId}/blocks/${blockId}/format`,
        { formatId, formatName },
      );
    } catch (err: unknown) {
      const axiosError = err as {
        response?: { data?: { error?: string } };
      };
      error.value =
        axiosError.response?.data?.error || 'Error al cambiar formato';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function addExercise(
    sessionId: number,
    blockId: number,
    exerciseId: number,
  ): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.post(
        `/admin/sessions/${sessionId}/blocks/${blockId}/exercises`,
        { exerciseId },
      );
    } catch (err: unknown) {
      const axiosError = err as {
        response?: { data?: { error?: string } };
      };
      error.value =
        axiosError.response?.data?.error || 'Error al agregar ejercicio';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function removeExercise(
    sessionId: number,
    blockId: number,
    prescriptionId: number,
  ): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.delete(
        `/admin/sessions/${sessionId}/blocks/${blockId}/exercises/${prescriptionId}`,
      );
    } catch (err: unknown) {
      const axiosError = err as {
        response?: { data?: { error?: string } };
      };
      error.value =
        axiosError.response?.data?.error || 'Error al eliminar ejercicio';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function resetToAlgorithm(sessionId: number): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.post(`/admin/sessions/${sessionId}/reset`);
    } catch (err: unknown) {
      const axiosError = err as {
        response?: { data?: { error?: string } };
      };
      error.value =
        axiosError.response?.data?.error ||
        'Error al restaurar sesion original';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function fetchCompatibleFormats(params: {
    blockRole: string;
    level: string;
    intensity: number;
  }): Promise<CompatibleFormatsResponse> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<CompatibleFormatsResponse>(
        '/admin/formats/compatible',
        { params },
      );
      return data;
    } catch (err: unknown) {
      const axiosError = err as {
        response?: { data?: { error?: string } };
      };
      error.value =
        axiosError.response?.data?.error ||
        'Error cargando formatos compatibles';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function fetchPreview(
    sessionId: number,
    memberLevel?: string,
  ): Promise<SessionPreview> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<SessionPreview>(
        `/admin/sessions/${sessionId}/preview`,
        { params: memberLevel ? { memberLevel } : undefined },
      );
      return data;
    } catch (err: unknown) {
      const axiosError = err as {
        response?: { data?: { error?: string } };
      };
      error.value =
        axiosError.response?.data?.error ||
        'Error cargando vista previa';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    fetchExercisePool,
    swapExercise,
    updatePrescription,
    changeBlockFormat,
    addExercise,
    removeExercise,
    resetToAlgorithm,
    fetchCompatibleFormats,
    fetchPreview,
  };
}
