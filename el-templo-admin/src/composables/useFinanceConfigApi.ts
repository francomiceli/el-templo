/**
 * "Configuración de Caja" API composable (Phase 142, MIG-01).
 *
 * Thin wrapper over the Wave 1 finance config endpoints
 * (`/api/admin/finance/config/overdue-threshold`, see 142-01-SUMMARY.md):
 *   - GET  → { thresholdDays }  (owner/admin only)
 *   - PUT  { thresholdDays } → { thresholdDays }  (owner/admin; 400 if not 1..365)
 *
 * Mirrors the `useFinanceLoadApi` / `useTransactionsApi` shape: `loading`,
 * `saving`, `error` refs, `api` from boot/axios, `extractError` for messages,
 * `createLogger` for error logging (never console.*), and a `cleanup()` that
 * resets state.
 *
 * Path note: the finance plugin is mounted at `/api/admin/finance` and the
 * admin axios baseURL already includes `/api` (boot/axios.ts) — so the full
 * path here starts at `/admin/finance/...`. A bare `/finance/config/...` would 404.
 *
 * Per CLAUDE.md: the composable registers NO Vue unmount hook (the page owns the
 * lifecycle and calls `cleanup()` from its own `onUnmounted`); no `any`.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import { createLogger } from 'src/utils/logger';

const log = createLogger('useFinanceConfigApi');

/** Full path of the finance config endpoint (GET + PUT share it). */
const OVERDUE_THRESHOLD_PATH = '/admin/finance/config/overdue-threshold';

/** Response/body shape of the overdue-threshold config endpoint. */
export interface OverdueThresholdConfig {
  /** Days without validation after which a pendiente fires the Caja alert. */
  thresholdDays: number;
}

export function useFinanceConfigApi() {
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  /**
   * GET /config/overdue-threshold — read the current pending-overdue threshold.
   * The backend always resolves to a value (default fallback to 3), so the page
   * never sees an empty state.
   */
  async function getThreshold(): Promise<number> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<OverdueThresholdConfig>(OVERDUE_THRESHOLD_PATH);
      return data.thresholdDays;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando la configuración');
      log.error('Failed to load overdue threshold', { error: error.value });
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * PUT /config/overdue-threshold — persist a new threshold (integer 1..365).
   * The server re-validates the bounds; an out-of-range value returns 400.
   */
  async function setThreshold(days: number): Promise<void> {
    saving.value = true;
    error.value = null;
    try {
      await api.put<OverdueThresholdConfig>(OVERDUE_THRESHOLD_PATH, {
        thresholdDays: days,
      });
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo guardar. Reintentá.');
      log.error('Failed to save overdue threshold', { error: error.value });
      throw err;
    } finally {
      saving.value = false;
    }
  }

  function cleanup() {
    loading.value = false;
    saving.value = false;
    error.value = null;
  }

  return {
    loading,
    saving,
    error,
    getThreshold,
    setThreshold,
    cleanup,
  };
}
