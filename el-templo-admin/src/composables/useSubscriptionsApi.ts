/**
 * Subscriptions API composable.
 * Provides methods for plans CRUD and subscription lifecycle management.
 */

import { ref } from 'vue';
import axios from 'axios';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type {
  PlanListItem,
  CreatePlanInput,
  UpdatePlanInput,
  SubscriptionDetail,
  SubscriptionHistoryItem,
  AssignPlanInput,
  RenewSubscriptionInput,
  PricingPreview,
  ChangePlanPreview,
  PriceType,
  ClassUsageInfo,
} from 'src/types/subscription';

export function useSubscriptionsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ─── Plans CRUD ──────────────────────────────────────────────────────

  async function getPlans(isActive?: boolean): Promise<PlanListItem[]> {
    loading.value = true;
    error.value = null;
    try {
      const params: Record<string, unknown> = {};
      if (isActive !== undefined) params.isActive = isActive;
      const { data } = await api.get<{ plans: PlanListItem[] }>('/admin/subscriptions/plans', {
        params,
      });
      return data.plans;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando planes');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getPlan(planId: number): Promise<PlanListItem> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<PlanListItem>(`/admin/subscriptions/plans/${planId}`);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando plan');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function createPlan(input: CreatePlanInput): Promise<PlanListItem> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<PlanListItem>('/admin/subscriptions/plans', input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error creando plan');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updatePlan(planId: number, input: UpdatePlanInput): Promise<PlanListItem> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.put<PlanListItem>(`/admin/subscriptions/plans/${planId}`, input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error actualizando plan');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function deactivatePlan(planId: number): Promise<PlanListItem> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.patch<PlanListItem>(
        `/admin/subscriptions/plans/${planId}/deactivate`
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error desactivando plan');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Subscriptions ───────────────────────────────────────────────────

  async function getMemberSubscription(userId: number): Promise<SubscriptionDetail | null> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<SubscriptionDetail>(
        `/admin/subscriptions/members/${userId}/subscription`
      );
      return data;
    } catch (err: unknown) {
      // 404 means no active subscription — not an error
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return null;
      }
      error.value = extractError(err, 'Error cargando suscripcion');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getMemberSubscriptionHistory(userId: number): Promise<SubscriptionHistoryItem[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ subscriptions: SubscriptionHistoryItem[] }>(
        `/admin/subscriptions/members/${userId}/subscription/history`
      );
      return data.subscriptions;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando historial de suscripciones');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function assignPlan(userId: number, input: AssignPlanInput): Promise<SubscriptionDetail> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<SubscriptionDetail>(
        `/admin/subscriptions/members/${userId}/subscription/assign`,
        input
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error asignando plan');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function changePlan(userId: number, input: AssignPlanInput): Promise<SubscriptionDetail> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<SubscriptionDetail>(
        `/admin/subscriptions/members/${userId}/subscription/change-plan`,
        input
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cambiando plan');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function pauseSubscription(userId: number): Promise<SubscriptionDetail> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<SubscriptionDetail>(
        `/admin/subscriptions/members/${userId}/subscription/pause`,
        {}
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error pausando suscripcion');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function resumeSubscription(userId: number): Promise<SubscriptionDetail> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<SubscriptionDetail>(
        `/admin/subscriptions/members/${userId}/subscription/resume`,
        {}
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error reanudando suscripcion');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function renewSubscription(
    userId: number,
    input: RenewSubscriptionInput
  ): Promise<SubscriptionDetail> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<SubscriptionDetail>(
        `/admin/subscriptions/members/${userId}/subscription/renew`,
        input
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error renovando suscripcion');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function cancelSubscription(userId: number, notes?: string): Promise<SubscriptionDetail> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<SubscriptionDetail>(
        `/admin/subscriptions/members/${userId}/subscription/cancel`,
        { notes }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cancelando suscripcion');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getPricingPreview(
    userId: number,
    planId: number,
    priceType: PriceType,
    auraSpend?: number
  ): Promise<PricingPreview> {
    loading.value = true;
    error.value = null;
    try {
      const params: Record<string, unknown> = { planId, priceType };
      if (auraSpend !== undefined) params.auraSpend = auraSpend;
      const { data } = await api.get<PricingPreview>(
        `/admin/subscriptions/members/${userId}/subscription/pricing-preview`,
        { params }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error obteniendo preview de precio');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Class Usage ─────────────────────────────────────────────────────

  async function getClassUsage(userId: number): Promise<ClassUsageInfo> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<ClassUsageInfo>(
        `/admin/subscriptions/members/${userId}/class-usage`
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando uso de clases');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Change Plan Preview ────────────────────────────────────────────

  async function getChangePlanPreview(
    userId: number,
    targetPlanId: number
  ): Promise<ChangePlanPreview> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<ChangePlanPreview>(
        `/admin/subscriptions/members/${userId}/subscription/change-plan-preview`,
        { params: { targetPlanId } }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error obteniendo preview de cambio');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    getPlans,
    getPlan,
    createPlan,
    updatePlan,
    deactivatePlan,
    getMemberSubscription,
    getMemberSubscriptionHistory,
    assignPlan,
    changePlan,
    renewSubscription,
    pauseSubscription,
    resumeSubscription,
    cancelSubscription,
    getPricingPreview,
    getChangePlanPreview,
    getClassUsage,
    cleanup,
  };
}
