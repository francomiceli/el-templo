// Módulo: referrals — detección de clave duplicada (ER_DUP_ENTRY / errno 1062).
//
// Hoja sin dependencias: antes vivía en `referrals/service.ts` y `invitation-link`
// lo importaba de ahí, lo que metía el vínculo de invitación en el ciclo de
// importaciones del servicio (ME-02).

/**
 * Narrowing del error de clave duplicada de mysql2 (ER_DUP_ENTRY / errno 1062).
 * Drizzle envuelve el error de mysql2 en un DrizzleQueryError, así que el código
 * real puede vivir en `err.cause` — se recorre la cadena de causas.
 */
export function isDuplicateKeyError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && current != null; depth++) {
    if (typeof current === "object") {
      const e = current as { code?: string; errno?: number; cause?: unknown };
      if (e.code === "ER_DUP_ENTRY" || e.errno === 1062) {
        return true;
      }
      current = e.cause;
    } else {
      break;
    }
  }
  return false;
}
