import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { Notify } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';

const log = createLogger('useFranchiseAdminApi');

export interface FranchiseApplication {
  id: number;
  nombre: string;
  email: string;
  telefono: string;
  ciudadPais: string;
  modelo: string;
  experiencia: string;
  capital: string;
  origen: string;
  mensaje: string | null;
  status: string;
  notes: string | null;
  aiStrategy: string | null;
  aiOutreach: string | null;
  aiFollowup: string | null;
  aiNegotiation: string | null;
  createdAt: string;
}

export interface FranchiseListResponse {
  applications: FranchiseApplication[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ListParams {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface UpdateApplicationData {
  status?: string;
  notes?: string;
}

export function useFranchiseAdminApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function listApplications(params?: ListParams): Promise<FranchiseListResponse> {
    loading.value = true;
    error.value = null;
    try {
      const queryParams: Record<string, unknown> = {};
      if (params?.page != null) queryParams.page = params.page;
      if (params?.limit != null) queryParams.limit = params.limit;
      if (params?.status && params.status !== 'all') queryParams.status = params.status;
      if (params?.search) queryParams.search = params.search;
      if (params?.sortBy) queryParams.sortBy = params.sortBy;
      if (params?.sortDir) queryParams.sortDir = params.sortDir;

      const { data } = await api.get<FranchiseListResponse>('/franchise/admin/applications', {
        params: queryParams,
      });
      return data;
    } catch (err: unknown) {
      const message = extractError(err, 'Error cargando solicitudes');
      error.value = message;
      log.error('Failed to fetch franchise applications', { error: message });
      Notify.create({ type: 'negative', message });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getApplication(id: number): Promise<FranchiseApplication> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<FranchiseApplication>(`/franchise/admin/applications/${id}`);
      return data;
    } catch (err: unknown) {
      const message = extractError(err, 'Error cargando solicitud');
      error.value = message;
      log.error('Failed to fetch franchise application', {
        id,
        error: message,
      });
      Notify.create({ type: 'negative', message });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updateApplication(
    id: number,
    data: UpdateApplicationData
  ): Promise<FranchiseApplication> {
    loading.value = true;
    error.value = null;
    try {
      const { data: application } = await api.patch<FranchiseApplication>(
        `/franchise/admin/applications/${id}`,
        data
      );
      return application;
    } catch (err: unknown) {
      const message = extractError(err, 'Error actualizando solicitud');
      error.value = message;
      log.error('Failed to update franchise application', {
        id,
        error: message,
      });
      Notify.create({ type: 'negative', message });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function generateAiContent(
    id: number,
    agentType: string
  ): Promise<{ agentType: string; content: string }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ agentType: string; content: string }>(
        `/franchise/admin/applications/${id}/generate`,
        { agentType }
      );
      return data;
    } catch (err: unknown) {
      const message = extractError(err, 'Error generando contenido AI');
      error.value = message;
      log.error('Failed to generate AI content', {
        id,
        agentType,
        error: message,
      });
      Notify.create({ type: 'negative', message });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    listApplications,
    getApplication,
    updateApplication,
    generateAiContent,
  };
}
