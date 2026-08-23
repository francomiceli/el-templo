/**
 * Client-side normalization for the unified signup code field (D-02/D-03).
 *
 * Mirrors the server's normalization (referral-partners/code-resolver.ts,
 * phase 179-02): upper + strip everything that isn't [A-Z0-9] + clamp to 24
 * chars. Normalizing here too means a user who pastes a code with a trailing
 * space never sees a false "codigo no reconocido" — the client sends the
 * exact same string the server would have produced anyway.
 */
const MAX_LENGTH = 24

export function normalizeSignupCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, MAX_LENGTH)
}
