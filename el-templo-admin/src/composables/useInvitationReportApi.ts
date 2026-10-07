/**
 * Fase 194 (D-19 / D-18): reporte del programa de Invitaciones y bandeja de leads.
 *
 * Wrapper de GET /admin/referrals/invitations/report y GET /admin/referrals/invitations
 * (194-20). Roles gestion/admin/owner: el servidor es la autoridad (403 al resto) y
 * acota por país a admin/gestion. Mismo molde que `useReportsApi`: refs `loading`/`error`,
 * `extractError` y `cleanup()` (sin hook de desmontaje: el caller es dueño del ciclo).
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import type {
  InvitationLeadList,
  InvitationLeadListParams,
  InvitationReport,
  InvitationReportParams,
} from 'src/types/report';

const log = createLogger('useInvitationReportApi');

export function useInvitationReportApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  /** GET /admin/referrals/invitations/report — KPIs por mes (sin params: últimos 12 meses). */
  async function getReport(params: InvitationReportParams = {}): Promise<InvitationReport> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<InvitationReport>('/admin/referrals/invitations/report', {
        params,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando el reporte de invitaciones');
      log.warn('No se pudo cargar el reporte de invitaciones', { error: error.value });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** GET /admin/referrals/invitations — bandeja paginada de leads de invitación. */
  async function listLeads(params: InvitationLeadListParams = {}): Promise<InvitationLeadList> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<InvitationLeadList>('/admin/referrals/invitations', {
        params,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando los leads de invitación');
      log.warn('No se pudieron cargar los leads de invitación', { error: error.value });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return { loading, error, getReport, listLeads, cleanup };
}
