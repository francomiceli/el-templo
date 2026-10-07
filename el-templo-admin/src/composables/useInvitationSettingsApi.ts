/**
 * Fase 194 (D-10c): parámetros del programa de Invitaciones.
 *
 * Wrapper de GET/PUT `/admin/settings/invitations` (194-07). El GET es legible por
 * cualquier staff; el PUT es de gestion/admin/owner y el servidor es la autoridad
 * (rangos y roles). Mismo molde que `usePricingSettingsApi`: refs `loading`/`error`,
 * `extractError` y `cleanup()` (sin hook de desmontaje: el caller es dueño del ciclo).
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import type { InvitationSettings, InvitationSettingsPatch } from 'src/types/settings';

const log = createLogger('useInvitationSettingsApi');

export function useInvitationSettingsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  /** GET /admin/settings/invitations — parámetros vigentes (con defaults del servidor). */
  async function getSettings(): Promise<InvitationSettings> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<InvitationSettings>('/admin/settings/invitations');
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando los parámetros de invitaciones');
      log.warn('No se pudieron cargar los parámetros de invitaciones', { error: error.value });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** PUT /admin/settings/invitations — patch parcial; devuelve los parámetros resultantes. */
  async function updateSettings(patch: InvitationSettingsPatch): Promise<InvitationSettings> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.put<InvitationSettings>('/admin/settings/invitations', patch);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudieron guardar los parámetros de invitaciones');
      log.warn('No se pudieron guardar los parámetros de invitaciones', { error: error.value });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return { loading, error, getSettings, updateSettings, cleanup };
}
