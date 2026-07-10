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
  TicketAnalytics,
  ChurnAnalytics,
  MemberFlowsResult,
  ChurnedMemberRow,
  RenewalAnalytics,
  LtvAnalytics,
  FrequencyAnalytics,
  TrialFunnelAnalytics,
  ClassRatingsAnalytics,
} from 'src/types/analytics';

function buildParams(filters: AnalyticsFilters): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (filters.branchId !== undefined) params.branchId = filters.branchId;
  if (filters.country !== undefined) params.country = filters.country;
  if (filters.dateFrom !== undefined) params.dateFrom = filters.dateFrom;
  if (filters.dateTo !== undefined) params.dateTo = filters.dateTo;
  if (filters.planId !== undefined) params.planId = filters.planId;
  if (filters.turno !== undefined) params.turno = filters.turno;
  if (filters.window !== undefined) params.window = filters.window;
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

  // -- Phase 132: v5.0 management metrics (Plans 01/02 backend) -----------

  async function getTicket(filters: AnalyticsFilters = {}): Promise<TicketAnalytics> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<TicketAnalytics>('/admin/analytics/ticket', {
        params: buildParams(filters),
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando ticket promedio');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getChurn(filters: AnalyticsFilters = {}): Promise<ChurnAnalytics> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<ChurnAnalytics>('/admin/analytics/churn', {
        params: buildParams(filters),
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando churn');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getMemberFlows(filters: AnalyticsFilters = {}): Promise<MemberFlowsResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<MemberFlowsResult>('/admin/analytics/member-flows', {
        params: buildParams(filters),
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando altas y bajas');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getChurnedMembers(
    filters: AnalyticsFilters = {}
  ): Promise<{ members: ChurnedMemberRow[] }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ members: ChurnedMemberRow[] }>(
        '/admin/analytics/churned-members',
        { params: buildParams(filters) }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando bajas');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function exportChurnedMembers(filters: AnalyticsFilters = {}): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/admin/analytics/churned-members/export', {
        params: buildParams(filters),
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando bajas');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getRenewal(filters: AnalyticsFilters = {}): Promise<RenewalAnalytics> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<RenewalAnalytics>('/admin/analytics/renewal', {
        params: buildParams(filters),
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando renovación');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getLtv(filters: AnalyticsFilters = {}): Promise<LtvAnalytics> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<LtvAnalytics>('/admin/analytics/ltv', {
        params: buildParams(filters),
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando LTV');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getFrequency(filters: AnalyticsFilters = {}): Promise<FrequencyAnalytics> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<FrequencyAnalytics>('/admin/analytics/frequency', {
        params: buildParams(filters),
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando frecuencia');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getTrialFunnel(filters: AnalyticsFilters = {}): Promise<TrialFunnelAnalytics> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<TrialFunnelAnalytics>('/admin/analytics/trial-funnel', {
        params: buildParams(filters),
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando funnel de prueba');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getClassRatings(filters: AnalyticsFilters = {}): Promise<ClassRatingsAnalytics> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<ClassRatingsAnalytics>('/admin/analytics/class-ratings', {
        params: buildParams(filters),
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando puntuaciones de clase');
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
    getTicket,
    getChurn,
    getMemberFlows,
    getChurnedMembers,
    exportChurnedMembers,
    getRenewal,
    getLtv,
    getFrequency,
    getTrialFunnel,
    getClassRatings,
    cleanup,
  };
}
