/**
 * Analytics API composable.
 * Provides methods for fetching KPI stats, member analytics,
 * attendance analytics, and financial analytics.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type {
  KpiStats,
  MemberAnalytics,
  AttendanceAnalytics,
  FinancialAnalytics,
  AnalyticsFilters,
} from 'src/types/analytics';

function buildParams(filters: AnalyticsFilters): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (filters.branchId !== undefined) params.branchId = filters.branchId;
  if (filters.country !== undefined) params.country = filters.country;
  if (filters.dateFrom !== undefined) params.dateFrom = filters.dateFrom;
  if (filters.dateTo !== undefined) params.dateTo = filters.dateTo;
  return params;
}

export function useAnalyticsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function getKpis(filters: AnalyticsFilters = {}): Promise<KpiStats> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<KpiStats>('/admin/analytics', {
        params: buildParams(filters),
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando KPIs');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getMemberAnalytics(filters: AnalyticsFilters = {}): Promise<MemberAnalytics> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<MemberAnalytics>('/admin/analytics/members', {
        params: buildParams(filters),
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando analiticas de miembros');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getAttendanceAnalytics(
    filters: AnalyticsFilters = {}
  ): Promise<AttendanceAnalytics> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<AttendanceAnalytics>('/admin/analytics/attendance', {
        params: buildParams(filters),
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando analiticas de asistencia');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getFinancialAnalytics(
    filters: AnalyticsFilters = {}
  ): Promise<FinancialAnalytics> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<FinancialAnalytics>('/admin/analytics/financial', {
        params: buildParams(filters),
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando analiticas financieras');
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
    getKpis,
    getMemberAnalytics,
    getAttendanceAnalytics,
    getFinancialAnalytics,
    cleanup,
  };
}
