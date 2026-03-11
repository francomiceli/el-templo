import axios from 'axios'

/**
 * Extract a user-friendly error message from an Axios error or unknown error.
 * Returns the server-provided message if available, otherwise the fallback.
 */
export function extractError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const message = err.response?.data?.error ?? err.response?.data?.message
    if (typeof message === 'string') return message
  }
  if (err instanceof Error) return err.message
  return fallback
}
