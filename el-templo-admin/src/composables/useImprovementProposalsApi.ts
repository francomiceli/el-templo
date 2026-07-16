/**
 * Improvement Proposals API composable (admin).
 *
 * Powers el tab Sugerencias de FeedbackPage: listado paginado de sugerencias enviadas por
 * los socios (filtros fecha/sucursal/keyword) + export xlsx con los mismos
 * filtros. Mirrors the shape of useRatingsApi (loading/error refs,
 * extractError, `throw err` in catch, `finally`). El enforcement de roles
 * (MEMBER_LIFECYCLE_ROLES) y el country-scope viven server-side.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';

export interface AdminProposalRow {
  id: number;
  memberName: string;
  branchName: string;
  proposal: string;
  /** ISO timestamp del envío. */
  createdAt: string;
}

export interface AdminProposalsFilters {
  dateFrom?: string;
  dateTo?: string;
  branchId?: number;
  /** Búsqueda por palabra clave sobre el texto de la propuesta. */
  q?: string;
  page?: number;
  limit?: number;
}

export interface AdminProposalsResult {
  rows: AdminProposalRow[];
  total: number;
  page: number;
  limit: number;
}

export function useImprovementProposalsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function getProposals(
    filters: AdminProposalsFilters = {}
  ): Promise<AdminProposalsResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<AdminProposalsResult>('/admin/improvement-proposals', {
        params: filters,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando las propuestas');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function exportProposals(
    filters: Omit<AdminProposalsFilters, 'page' | 'limit'> = {}
  ): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/admin/improvement-proposals/export', {
        params: filters,
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando las propuestas');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function cleanup() {
    // No subscriptions or timers to clean up
  }

  return { loading, error, getProposals, exportProposals, cleanup };
}
