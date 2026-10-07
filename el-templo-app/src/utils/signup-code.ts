/**
 * Client-side normalization for the unified signup code field (D-02/D-03).
 *
 * Upper + strip everything that isn't [A-Z0-9-] + clamp to 24 chars. El GUION se
 * preserva (Fase 194): el código de socio tiene formato `PREFIJO-XXXX` y el servidor
 * lo resuelve por igualdad exacta (`resolveSignupCode`, rama socio: solo trim + upper),
 * así que sacarlo hacía que un código de socio nunca se reconociera. Las ramas
 * partner/promo del servidor vuelven a normalizar (`normalizeCode` strippea el guion),
 * por lo que mandarlo no les cambia nada. Normalizing here too means a user who pastes
 * a code with a trailing space never sees a false "codigo no reconocido".
 */
const MAX_LENGTH = 24

export function normalizeSignupCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, MAX_LENGTH)
}
