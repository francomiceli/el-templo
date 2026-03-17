/**
 * Settings API composable.
 * Provides methods for system settings management (grace period, etc.).
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type { GracePeriodSetting } from 'src/types/settings';

export function useSettingsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ─── Grace Period ──────────────────────────────────────────────────

  async function getGracePeriod(): Promise<GracePeriodSetting> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<GracePeriodSetting>('/admin/settings/grace-period');
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando periodo de gracia');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function setGracePeriod(days: number): Promise<GracePeriodSetting> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.put<GracePeriodSetting>('/admin/settings/grace-period', {
        gracePeriodDays: days,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error guardando periodo de gracia');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Cleanup ───────────────────────────────────────────────────────

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    getGracePeriod,
    setGracePeriod,
    cleanup,
  };
}
