/**
 * Reports API composable.
 * Provides methods for fetching 4 report types (access, charges, expiring, inactive)
 * and their corresponding Excel exports.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type {
  AccessReportRow,
  ChargeReportRow,
  ExpiringReportRow,
  InactiveReportRow,
  PaginatedResult,
  AccessReportParams,
  ChargeReportParams,
  ExpiringReportParams,
  InactiveReportParams,
} from 'src/types/report';

export function useReportsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ─── Data Methods ──────────────────────────────────────────────────────

  async function getAccessLog(
    params: AccessReportParams = {}
  ): Promise<PaginatedResult<AccessReportRow>> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<PaginatedResult<AccessReportRow>>('/admin/reports/access', {
        params,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando reporte de accesos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getChargeHistory(
    params: ChargeReportParams = {}
  ): Promise<PaginatedResult<ChargeReportRow>> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<PaginatedResult<ChargeReportRow>>('/admin/reports/charges', {
        params,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando historial de cobros');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getExpiringMemberships(
    params: ExpiringReportParams = {}
  ): Promise<ExpiringReportRow[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<ExpiringReportRow[]>('/admin/reports/expiring', { params });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando vencimientos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getInactiveMembers(
    params: InactiveReportParams = {}
  ): Promise<InactiveReportRow[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<InactiveReportRow[]>('/admin/reports/inactive', { params });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando miembros inactivos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Export Methods ────────────────────────────────────────────────────

  async function exportAccessLog(params: AccessReportParams = {}): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/admin/reports/access/export', {
        params,
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando accesos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function exportChargeHistory(params: ChargeReportParams = {}): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/admin/reports/charges/export', {
        params,
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando cobros');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function exportExpiringMemberships(params: ExpiringReportParams = {}): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/admin/reports/expiring/export', {
        params,
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando vencimientos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function exportInactiveMembers(params: InactiveReportParams = {}): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/admin/reports/inactive/export', {
        params,
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando inactivos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    getAccessLog,
    getChargeHistory,
    getExpiringMemberships,
    getInactiveMembers,
    exportAccessLog,
    exportChargeHistory,
    exportExpiringMemberships,
    exportInactiveMembers,
    cleanup,
  };
}
