/**
 * Programs API composable.
 * Provides methods for micro-program CRUD, enrollment lifecycle, and analytics.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type {
  Program,
  ProgramDetail,
  CreateProgramPayload,
  ContentBlockInput,
  ProgramEnrollment,
  ProgramAnalytics,
} from 'src/types/program';

export function useProgramsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ─── Program CRUD ───────────────────────────────────────────────────

  async function getPrograms(): Promise<Program[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ programs: Program[] }>('/admin/programs');
      return data.programs;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando programas');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getProgramDetail(programId: number): Promise<ProgramDetail> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<ProgramDetail>(`/admin/programs/${programId}`);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando detalle del programa');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function createProgram(input: CreateProgramPayload): Promise<number> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ id: number }>('/admin/programs', input);
      return data.id;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error creando programa');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updateProgram(programId: number, input: Partial<Program>): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.put(`/admin/programs/${programId}`, input);
    } catch (err: unknown) {
      error.value = extractError(err, 'Error actualizando programa');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function addContentBlocks(programId: number, blocks: ContentBlockInput[]): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.post(`/admin/programs/${programId}/content`, { blocks });
    } catch (err: unknown) {
      error.value = extractError(err, 'Error agregando contenido');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function deactivateProgram(programId: number): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.post(`/admin/programs/${programId}/deactivate`);
    } catch (err: unknown) {
      error.value = extractError(err, 'Error desactivando programa');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Enrollment Management ──────────────────────────────────────────

  async function cancelEnrollment(enrollmentId: number): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.post(`/admin/programs/enrollments/${enrollmentId}/cancel`);
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cancelando inscripcion');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function advanceWeek(enrollmentId: number): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.post(`/admin/programs/enrollments/${enrollmentId}/advance`);
    } catch (err: unknown) {
      error.value = extractError(err, 'Error avanzando semana');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getUserEnrollments(userId: number): Promise<ProgramEnrollment[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ enrollments: ProgramEnrollment[] }>(
        `/admin/programs/enrollments/user/${userId}`
      );
      return data.enrollments;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando inscripciones');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Analytics ──────────────────────────────────────────────────────

  async function getAnalytics(): Promise<ProgramAnalytics> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<ProgramAnalytics>('/admin/programs/analytics');
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando analiticas de programas');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────────────

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    getPrograms,
    getProgramDetail,
    createProgram,
    updateProgram,
    addContentBlocks,
    deactivateProgram,
    cancelEnrollment,
    advanceWeek,
    getUserEnrollments,
    getAnalytics,
    cleanup,
  };
}
