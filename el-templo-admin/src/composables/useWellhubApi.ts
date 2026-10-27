/**
 * Fase 204: wrapper de los endpoints Wellhub del admin.
 *
 * - GET  /admin/members/:userId/wellhub        -> card de la ficha (`null` sin gympass_id)
 * - POST /admin/members/:userId/app-access     -> "Enviar acceso a la app" (D-26)
 * - POST /admin/members/:userId/wellhub-merge  -> "Unir con alumno existente" (D-05/D-21)
 * - GET  /admin/reports/wellhub                -> reporte Wellhub (D-16)
 *
 * Mismo molde que `useInvitationReportApi`: refs `loading`/`error`, `extractError`,
 * `log.warn` + rethrow y `cleanup()` (sin hook de desmontaje: el caller es dueño
 * del ciclo).
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import type {
  WellhubAppAccessResult,
  WellhubCard,
  WellhubMergeResult,
  WellhubReport,
  WellhubReportParams,
} from 'src/types/wellhub';

const log = createLogger('useWellhubApi');

export function useWellhubApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  /** Card Wellhub de la ficha. `null` si la persona no está vinculada a Wellhub. */
  async function getCard(userId: number): Promise<WellhubCard | null> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ wellhub: WellhubCard | null }>(
        `/admin/members/${userId}/wellhub`
      );
      return data.wellhub;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo cargar Wellhub');
      log.warn('No se pudo cargar la card Wellhub', { error: error.value, userId });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** Manda el acceso a la app (contraseña temporal + mail). Resetea la clave si ya tenía cuenta. */
  async function sendAppAccess(userId: number): Promise<WellhubAppAccessResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<WellhubAppAccessResult>(
        `/admin/members/${userId}/app-access`
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo enviar el acceso a la app');
      log.warn('No se pudo enviar el acceso a la app', { error: error.value, userId });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** Une la ficha Wellhub `sourceUserId` dentro del alumno existente `targetUserId`. */
  async function mergeInto(
    sourceUserId: number,
    targetUserId: number
  ): Promise<WellhubMergeResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<WellhubMergeResult>(
        `/admin/members/${sourceUserId}/wellhub-merge`,
        { targetUserId }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudieron unir las fichas');
      log.warn('No se pudieron unir las fichas', {
        error: error.value,
        sourceUserId,
        targetUserId,
      });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** Reporte Wellhub por mes (`YYYY-MM`) y sede opcional. */
  async function getReport(params: WellhubReportParams): Promise<WellhubReport> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<WellhubReport>('/admin/reports/wellhub', { params });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando el reporte Wellhub');
      log.warn('No se pudo cargar el reporte Wellhub', { error: error.value });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return { loading, error, getCard, sendAppAccess, mergeInto, getReport, cleanup };
}
