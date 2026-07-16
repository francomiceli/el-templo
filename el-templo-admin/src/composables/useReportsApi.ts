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
  TrialConversionParams,
  TrialConversionReport,
} from 'src/types/report';

// ─── Phase 114-06: Trial Sessions Report types ─────────────────────────

export type TrialAttendedFilter = 'true' | 'false' | 'pending';
export type TrialShiftFilter = 'TM' | 'TT';
// Hotfix 2026-07: 'cerrado' → 'ganado'.
export type TrialLeadStatusValue = 'en_seguimiento' | 'ganado' | 'perdido';

export interface TrialSessionsFiltersClient {
  branchId?: number;
  country?: 'AR' | 'ES';
  dateFrom?: string;
  dateTo?: string;
  leadStatus?: TrialLeadStatusValue[];
  attended?: TrialAttendedFilter;
  shift?: TrialShiftFilter;
  // Phase 164-04 (D-06): origen del estado del lead. 'auto' incluye históricos
  // (lead_status_source NULL); 'manual' matchea el valor exacto. Server-side.
  leadStatusSource?: 'auto' | 'manual';
  // Owner-only (D-44). Frontend MUST gate sending this; server silently
  // strips it for non-owners but we belt-and-suspenders here.
  gestionaUserId?: number;
  daysWithoutConvertingMin?: number;
  search?: string;
  page?: number;
  limit?: number;
}

export interface TrialSessionsRowClient {
  bookingId: number;
  userId: number;
  lead: string;
  bookingDate: string; // YYYY-MM-DD
  bookingCreatedAt: string; // YYYY-MM-DD — fecha de creación de la SP
  startTime: string; // HH:MM
  branchId: number;
  branchName: string;
  attended: 'si' | 'no' | null;
  leadStatus: TrialLeadStatusValue | null;
  leadStatusEffective: TrialLeadStatusValue;
  createdBy: { userId: number; name: string } | null;
  leadNotes: string | null;
  purchasedPlanId: number | null;
  purchasedPlanName: string | null;
  shift: TrialShiftFilter;
  period: string;
  weekRange: string;
  daysSinceTrial: number;
  converted: boolean;
  // Phase 164-04: contador retroactivo de pruebas canceladas del lead
  // (incl. self-service) — proxy de "ruido" de reprogramaciones.
  reschedules: number;
  // Phase 164-04: origen del estado del lead. null = automático/histórico.
  leadStatusSource: 'auto' | 'manual' | null;
}

export interface TrialSessionsResult {
  rows: TrialSessionsRowClient[];
  total: number;
  page: number;
  limit: number;
}

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

  async function getTrialConversion(
    params: TrialConversionParams = {}
  ): Promise<TrialConversionReport> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<TrialConversionReport>('/admin/reports/trial-conversion', {
        params,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando conversión de trials');
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

  // ─── Phase 114-06: Trial Sessions Report ───────────────────────────────
  //
  // Plan 05 SUMMARY documents the API shape:
  //   GET /admin/reports/trial-sessions       (paginated JSON)
  //   GET /admin/reports/trial-sessions/export (CSV with UTF-8 BOM)
  //
  // Multi-value query params (`leadStatus`) must be serialized as REPEATED
  // KEYS (`?leadStatus=a&leadStatus=b`) — that is what the Fastify schema
  // expects. axios v1's default array serializer produces `key[]=` brackets,
  // so we use `paramsSerializer: { indexes: null }` to flatten arrays into
  // repeated keys.

  async function fetchTrialSessions(
    filters: TrialSessionsFiltersClient
  ): Promise<TrialSessionsResult> {
    loading.value = true;
    error.value = null;
    try {
      const params = buildTrialSessionsParams(filters);
      const { data } = await api.get<TrialSessionsResult>('/admin/reports/trial-sessions', {
        params,
        paramsSerializer: { indexes: null },
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando sesiones de prueba');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function exportTrialSessions(filters: TrialSessionsFiltersClient): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const params = buildTrialSessionsParams(filters);
      const { data } = await api.get('/admin/reports/trial-sessions/export', {
        params,
        paramsSerializer: { indexes: null },
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando sesiones de prueba');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Build a clean params record for /trial-sessions and /trial-sessions/export.
   * Strips undefined / null / empty-string values, drops the empty page/limit
   * for the export endpoint (Plan 05 export ignores pagination), and forwards
   * leadStatus as an array so axios serializes it as repeated keys.
   */
  function buildTrialSessionsParams(filters: TrialSessionsFiltersClient): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v === undefined || v === null) continue;
      if (typeof v === 'string' && v.length === 0) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      out[k] = v;
    }
    return out;
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
    getTrialConversion,
    exportAccessLog,
    exportChargeHistory,
    exportExpiringMemberships,
    exportInactiveMembers,
    fetchTrialSessions,
    exportTrialSessions,
    cleanup,
  };
}
