/**
 * Coach PoS "Cargar pago" API composable (Phase 140, Wave 3).
 *
 * Thin wrapper over the Wave 2 coach-load plugin
 * (`/api/admin/finance/coach-load`, see 140-02-SUMMARY.md). Mirrors the
 * `useTransactionsApi` shape: `loading`/`error` refs, `api` from boot/axios,
 * `extractError` for messages, and a `cleanup()` that resets state.
 *
 * Per CLAUDE.md: the composable registers NO Vue unmount hook (callers own the
 * lifecycle and call `cleanup()`); no `console.*` (use createLogger if needed);
 * no `any`.
 *
 * Idempotency: this composable does NOT generate the idempotency key. The page
 * owns the key lifecycle (one `crypto.randomUUID()` per confirmation attempt,
 * regenerated only after an acknowledged success) and passes `idempotencyKey`
 * in each body; we only forward it.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type { TransactionListItem, PaymentMethod } from 'src/types/transaction';
import type { PaginatedResult } from 'src/types/report';

// -- Request / response shapes (mirror coach-load-routes.ts) -----------------

/** Body for POST /coach-load/pay-plan (cobro del plan: salda deuda o renueva). */
export interface CoachPayPlanInput {
  userId: number;
  /** Optional partial/edited amount; omitted = full debt (settle) or plan price (renew). */
  amountReceived?: number;
  paymentMethod: PaymentMethod;
  /** Client-generated, one per confirmation attempt (D-09 backstop). */
  idempotencyKey: string;
}

/** Body for POST /coach-load/misc (cobro suelto, advance_payment). */
export interface CoachMiscChargeInput {
  memberId: number;
  amount: number;
  /** Free-text concept → server `notes`. Required server-side. */
  concepto: string;
  paymentMethod: PaymentMethod;
  currency: string;
  /** Client-generated, one per confirmation attempt (D-09 backstop). */
  idempotencyKey: string;
}

/** GET /coach-load/autocompletar/:userId — current plan + amount + currency. */
export interface AutocompletarResult {
  hasRenewable: boolean;
  planName: string | null;
  amount: number | null;
  currency: string | null;
  /**
   * Server-side decision the confirm will take: 'settle' when the current sub
   * has outstanding debt (amount = that debt), 'renew' when it doesn't (amount =
   * plan price). null when there is no plan. The profe never sees this — it only
   * drives the pre-filled amount.
   */
  intent: 'settle' | 'renew' | null;
  /** Outstanding debt on the current sub (0 when none). */
  outstanding: number;
}

/** POST /coach-load/pay-plan → { subscription, transaction } (transaction null on free renewal). */
export interface CoachPayPlanResponse {
  transaction: TransactionListItem | null;
}

/** POST /coach-load/misc → { transaction }. */
export interface CoachMiscChargeResponse {
  transaction: TransactionListItem;
}

export function useFinanceLoadApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  /**
   * GET /coach-load/autocompletar/:userId — resolve the member's current plan,
   * amount and currency to pre-fill the Renovar form. `hasRenewable=false` when
   * the member has no active/paused subscription.
   */
  async function getAutocompletar(userId: number): Promise<AutocompletarResult> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<AutocompletarResult>(
        `/admin/finance/coach-load/autocompletar/${userId}`
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando el plan del socio');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * POST /coach-load/pay-plan — cobro del plan. The server decides whether this
   * settles outstanding debt on the current sub or renews into a new period; the
   * profe just confirms. The charge is born `pendiente` (recorderRole=coach
   * server-side). Idempotent: replaying the same `idempotencyKey` returns the
   * existing transaction (200) instead of charging twice.
   */
  async function payPlan(body: CoachPayPlanInput): Promise<CoachPayPlanResponse> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<CoachPayPlanResponse>(
        '/admin/finance/coach-load/pay-plan',
        body
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo cargar el pago. Reintentá.');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * POST /coach-load/misc — cobro suelto (advance_payment, concepto libre).
   * Idempotent on `idempotencyKey` like renewLoad.
   */
  async function miscCharge(body: CoachMiscChargeInput): Promise<CoachMiscChargeResponse> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<CoachMiscChargeResponse>(
        '/admin/finance/coach-load/misc',
        body
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo cargar el pago. Reintentá.');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * GET /coach-load/mis-cargas — the calling coach's OWN recent loads only
   * (recordedBy forced to self server-side). Used to render the "Mis cargas de
   * hoy" ticket list; re-fetching after a successful submit naturally de-dupes
   * an idempotent no-op (no duplicate row).
   */
  async function listMyLoads(): Promise<PaginatedResult<TransactionListItem>> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<PaginatedResult<TransactionListItem>>(
        '/admin/finance/coach-load/mis-cargas'
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando tus cargas de hoy');
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
    getAutocompletar,
    payPlan,
    miscCharge,
    listMyLoads,
    cleanup,
  };
}
