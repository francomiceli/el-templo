import axios from 'axios';

/**
 * Extract a user-friendly error message from an Axios error or unknown error.
 * Returns the server-provided message if available, otherwise the fallback.
 */
export function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const message = err.response?.data?.message ?? err.response?.data?.error;
    if (typeof message === 'string') return message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

/**
 * True for user-correctable HTTP errors (4xx with a response): validation,
 * conflicts, not-found, etc. These should not be logged to Sentry as errors.
 */
export function isExpectedClientError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const status = err.response?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

/** Parsed payload of the Phase 111 SUB_HAS_ACTIVE_TRANSACTIONS guard. */
export interface ActiveTransactionsBlock {
  count: number;
  amount: number;
  currency: string;
  /** `amount` pre-formatted as es-AR currency (e.g. "$ 12.000"). */
  formatted: string;
  /** Ready-to-show notify message: "No se puede {verb}: tiene N cobros…". */
  message: string;
}

/**
 * Detect and parse the backend's SUB_HAS_ACTIVE_TRANSACTIONS 4xx body
 * (Phase 111 REQ-3): a subscription with non-voided charge transactions
 * cannot be cancelled/deleted until the admin anula them. Returns null when
 * `err` is any other error, so callers fall through to their generic handler.
 *
 * `verb` completes the sentence ("cancelar", "eliminar") — the only part that
 * differs between the cancel-subscription and delete-member call sites.
 */
export function parseActiveTransactionsBlock(
  err: unknown,
  verb: string
): ActiveTransactionsBlock | null {
  if (!axios.isAxiosError(err)) return null;
  const data = err.response?.data as
    | {
        code?: string;
        details?: {
          transactionIds?: number[];
          totalAmount?: number;
          currency?: string;
        };
      }
    | undefined;
  if (data?.code !== 'SUB_HAS_ACTIVE_TRANSACTIONS') return null;

  const count = data.details?.transactionIds?.length ?? 0;
  const amount = data.details?.totalAmount ?? 0;
  const currency = data.details?.currency ?? 'ARS';
  const formatted = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
  const plural = count === 1 ? '' : 's';
  const message = `No se puede ${verb}: tiene ${count} cobro${plural} activo${plural} por ${formatted}. Anulalos primero en Detalle Financiero → Anular y volvé a intentar.`;

  return { count, amount, currency, formatted, message };
}
