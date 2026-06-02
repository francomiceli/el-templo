/**
 * Campaigns API composable (Phase 119 — reusable email-campaign system).
 * Consumes the Plan 04 admin endpoints under /api/campaigns/admin:
 * list / create draft / send (irreversible) / per-campaign funnel / eligible count.
 * Mirrors useAnalyticsApi.ts (api + extractError + ref-based loading/error).
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type {
  CampaignListItem,
  CampaignRecord,
  CampaignFunnel,
  CreateCampaignInput,
  SendResult,
  EligibleCount,
  CampaignCountry,
} from 'src/types/campaign';

function buildCountryParams(country?: CampaignCountry): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (country !== undefined && country !== null) params.country = country;
  return params;
}

export function useCampaignsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function listCampaigns(country?: CampaignCountry): Promise<CampaignListItem[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<CampaignListItem[]>('/campaigns/admin', {
        params: buildCountryParams(country),
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando campañas');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getCampaignFunnel(id: number): Promise<CampaignFunnel> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<CampaignFunnel>(`/campaigns/admin/${id}/funnel`);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando el funnel de la campaña');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function createCampaign(payload: CreateCampaignInput): Promise<CampaignRecord> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<CampaignRecord>('/campaigns/admin', payload);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error creando la campaña');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function sendCampaign(id: number): Promise<SendResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<SendResult>(`/campaigns/admin/${id}/send`);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error enviando la campaña');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getEligibleCount(country?: CampaignCountry): Promise<number> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<EligibleCount>('/campaigns/admin/eligible-count', {
        params: buildCountryParams(country),
      });
      return data.count;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando la audiencia elegible');
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
    listCampaigns,
    getCampaignFunnel,
    createCampaign,
    sendCampaign,
    getEligibleCount,
    cleanup,
  };
}
