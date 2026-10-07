// deploy: fase 194 — el push del fix de tests tras CI rojo tiene que redeployar la app.
/**
 * Formato único del código de invitación / de socio (Fase 194, LO-10).
 *
 * Mismo formato que acepta el servidor (`code`: 1..24, `[A-Za-z0-9-]`): `PREFIJO-XXXX`.
 * Antes vivía copiado en `pending-invitation.ts` y `signup-code.ts`; ahora los dos importan de acá.
 */

export const INVITATION_CODE_MAX_LENGTH = 24

/** Código ya normalizado (mayúsculas): 1 a 24 caracteres de `A-Z`, `0-9` y guion. */
export const INVITATION_CODE_PATTERN = new RegExp(`^[A-Z0-9-]{1,${INVITATION_CODE_MAX_LENGTH}}$`)

/** Todo lo que NO es parte de un código (para limpiar lo que tipea o pega la persona). */
export const INVITATION_CODE_DISALLOWED = /[^A-Z0-9-]/g
