/**
 * Pricing settings API composable (Phase 154, Plan 03).
 *
 * Thin wrapper over the Plan 01 settings plugin
 * (`/api/admin/settings/pricing/card-surcharge`, see 154-01-SUMMARY.md). Mirrors
 * the `useFinanceLoadApi` shape: `loading`/`error` refs, `api` from boot/axios,
 * `extractError` for messages, and a `cleanup()` that resets state.
 *
 * Per CLAUDE.md: the composable registers NO Vue unmount hook (callers own the
 * lifecycle and call `cleanup()`); no `console.*` (use createLogger if needed);
 * no `any`.
 *
 * Access model (D-04): the GET is staff-readable (the profe PoS consumes the
 * value), the PUT is owner-only server-side (403 otherwise). This composable only
 * forwards the request; the server is the authority.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';

/** Response shape of GET/PUT /admin/settings/pricing/card-surcharge. */
interface CardSurchargeResponse {
  enabled: boolean;
}

export function usePricingSettingsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  /**
   * GET /admin/settings/pricing/card-surcharge — read whether the card surcharge
   * rule is on. Staff-readable (D-04). Defaults to OFF server-side when the key
   * does not exist.
   */
  async function getCardSurchargeEnabled(): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<CardSurchargeResponse>(
        '/admin/settings/pricing/card-surcharge'
      );
      return data.enabled;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando la regla de recargo por tarjeta');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * PUT /admin/settings/pricing/card-surcharge — turn the card surcharge rule
   * on/off. Owner-only server-side (403 for non-owners); the UI hides the page
   * from non-owners but the server is the real gate.
   */
  async function setCardSurchargeEnabled(enabled: boolean): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.put<CardSurchargeResponse>('/admin/settings/pricing/card-surcharge', { enabled });
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo guardar la regla de recargo por tarjeta');
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
    getCardSurchargeEnabled,
    setCardSurchargeEnabled,
    cleanup,
  };
}
