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
