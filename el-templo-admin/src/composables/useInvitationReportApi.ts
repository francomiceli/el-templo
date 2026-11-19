/**
 * Fase 194 (D-19 / D-18): reporte del programa de Invitaciones y bandeja de leads.
 *
 * Wrapper de GET /admin/referrals/invitations/report y GET /admin/referrals/invitations
 * (194-20). El reporte es de gestion/admin/owner; la lista de seguimiento (con su
 * contador, el PATCH del seguimiento y las notas) suma a admin_sede. El servidor es
 * la autoridad (403 al resto) y acota por país/sede según el rol. Mismo molde que `useReportsApi`: refs `loading`/`error`,
 * `extractError` y `cleanup()` (sin hook de desmontaje: el caller es dueño del ciclo).
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import type {
  InvitationFollowupUpdateInput,
  InvitationLeadList,
  InvitationLeadListParams,
  InvitationLeadRow,
  InvitationNote,
  InvitationReport,
  InvitationReportParams,
  InvitationsPendingCount,
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

  /** GET /admin/referrals/invitations/pending-count — invitados para contactar (aviso rojo). */
  async function pendingCount(): Promise<InvitationsPendingCount> {
    const { data } = await api.get<InvitationsPendingCount>(
      '/admin/referrals/invitations/pending-count'
    );
    return data;
  }

  /** PATCH /admin/referrals/invitations/:id/followup — devuelve la fila ya actualizada. */
  async function updateFollowup(
    invitationId: number,
    input: InvitationFollowupUpdateInput
  ): Promise<InvitationLeadRow> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.patch<InvitationLeadRow>(
        `/admin/referrals/invitations/${invitationId}/followup`,
        input
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error actualizando el seguimiento');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** POST /admin/referrals/invitations/:id/notes — observación nueva del invitado. */
  async function addNote(invitationId: number, content: string): Promise<InvitationNote> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<InvitationNote>(
        `/admin/referrals/invitations/${invitationId}/notes`,
        { content }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error agregando la observación');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return { loading, error, getReport, listLeads, pendingCount, updateFollowup, addNote, cleanup };
}
