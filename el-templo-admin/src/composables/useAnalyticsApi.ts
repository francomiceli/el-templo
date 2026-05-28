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
  UniqueMembersMetric,
  CheckInAdoptionRow,
  EngagementAnalytics,
  FunnelAnalytics,
  RetentionAnalytics,
  AdvancedFinanceAnalytics,
} from 'src/types/analytics';

function buildParams(filters: AnalyticsFilters): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (filters.branchId !== undefined) params.branchId = filters.branchId;
  if (filters.country !== undefined) params.country = filters.country;
  if (filters.dateFrom !== undefined) params.dateFrom = filters.dateFrom;
  if (filters.dateTo !== undefined) params.dateTo = filters.dateTo;
  if (filters.planId !== undefined) params.planId = filters.planId;
  if (filters.entryOrigin !== undefined) params.entryOrigin = filters.entryOrigin;
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

  // -- Phase 117 new endpoints (Plans 03/04) -----------------------------

  async function getUniqueMembers(filters: AnalyticsFilters = {}): Promise<UniqueMembersMetric> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<UniqueMembersMetric>(
        '/admin/analytics/attendance/unique-members',
        { params: buildParams(filters) }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando miembros unicos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getCheckInAdoption(filters: AnalyticsFilters = {}): Promise<CheckInAdoptionRow[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<CheckInAdoptionRow[]>(
        '/admin/analytics/attendance/checkin-adoption',
        { params: buildParams(filters) }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando adopcion de check-in');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getEngagement(filters: AnalyticsFilters = {}): Promise<EngagementAnalytics> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<EngagementAnalytics>('/admin/analytics/engagement', {
        params: buildParams(filters),
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando engagement');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // -- Phase 118 new endpoints (Plans 02/03/04) --------------------------

  async function getFunnel(filters: AnalyticsFilters = {}): Promise<FunnelAnalytics> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<FunnelAnalytics>('/admin/analytics/funnel', {
        params: buildParams(filters),
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando funnel de conversion');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getRetention(filters: AnalyticsFilters = {}): Promise<RetentionAnalytics> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<RetentionAnalytics>('/admin/analytics/retention', {
        params: buildParams(filters),
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando retencion por ciclos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getAdvancedFinance(
    filters: AnalyticsFilters = {}
  ): Promise<AdvancedFinanceAnalytics> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<AdvancedFinanceAnalytics>(
        '/admin/analytics/advanced-finance',
        { params: buildParams(filters) }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando finanzas avanzadas');
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
    getUniqueMembers,
    getCheckInAdoption,
    getEngagement,
    getFunnel,
    getRetention,
    getAdvancedFinance,
    cleanup,
  };
}
