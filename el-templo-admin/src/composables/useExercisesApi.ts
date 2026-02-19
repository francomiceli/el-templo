import { ref } from 'vue';
import axios from 'axios';
import { api } from 'src/boot/axios';
import { Notify } from 'quasar';
import { createLogger } from 'src/utils/logger';
import type { Exercise, ExerciseListResponse, ExerciseFilters } from 'src/types/exercise';

const log = createLogger('useExercisesApi');

function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const message = err.response?.data?.error;
    if (typeof message === 'string') return message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

/** Cached full exercise list for bulk matching (shared across composable instances) */
let allExercisesCache: Exercise[] | null = null;

export function useExercisesApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  /**
   * Fetch all exercises in a single API call for bulk matching.
   * Results are cached so repeated dialog opens don't re-fetch.
   */
  async function fetchAllExercises(forceRefresh = false): Promise<Exercise[]> {
    if (allExercisesCache && !forceRefresh) {
      return allExercisesCache;
    }

    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<ExerciseListResponse>('/admin/exercises', {
        params: { limit: 2000 },
      });
      allExercisesCache = data.exercises;
      return data.exercises;
    } catch (err: unknown) {
      const message = extractError(err, 'Error cargando ejercicios');
      error.value = message;
      log.error('Failed to fetch all exercises', { error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function fetchExercises(filters: Partial<ExerciseFilters>): Promise<ExerciseListResponse> {
    loading.value = true;
    error.value = null;
    try {
      // Only include non-empty filter values in the query
      const params: Record<string, unknown> = {};
      if (filters.page != null) params.page = filters.page;
      if (filters.limit != null) params.limit = filters.limit;
      if (filters.search) params.search = filters.search;
      if (filters.category) params.category = filters.category;
      if (filters.level) params.level = filters.level;
      if (filters.route) params.route = filters.route;
      if (filters.effort) params.effort = filters.effort;
      if (filters.hasVideo != null) params.hasVideo = filters.hasVideo;

      const { data } = await api.get<ExerciseListResponse>('/admin/exercises', {
        params,
      });
      return data;
    } catch (err: unknown) {
      const message = extractError(err, 'Error cargando ejercicios');
      error.value = message;
      log.error('Failed to fetch exercises', { error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function deleteVideo(exerciseId: number): Promise<void> {
    try {
      await api.delete(`/admin/exercises/${exerciseId}/video`);
    } catch (err: unknown) {
      const message = extractError(err, 'Error al eliminar video');
      log.error('Failed to delete video', { exerciseId, error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    }
  }

  return {
    loading,
    error,
    fetchExercises,
    fetchAllExercises,
    deleteVideo,
  };
}
