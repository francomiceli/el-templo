import { sql, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "./tenant";

/**
 * Build a robust SQL condition to search members by name/email/DNI.
 *
 * Rules:
 *  - Whitespace-separated tokens are combined with AND.
 *  - Each token matches if it appears in firstName, lastName, email, dni,
 *    or the concatenated "firstName lastName".
 *
 * This lets admins find members by first name alone ("Martin"), last name
 * alone ("Figueras"), full name in either order ("Martin Figueras" /
 * "Figueras Martin"), email, or DNI.
 *
 * Returns null if the search string has no meaningful tokens.
 *
 * Fase 173 (ADO-02, T-173-05-01): `ctx` es el PRIMER parámetro. Esta es LA
 * query que más caro salió en el piloto — la que busca por NOMBRE. Un id
 * ajeno simplemente no matchea nunca; un nombre que CUALQUIER gimnasio va a
 * tener ("Martin", "Garcia") devuelve la fila del primer gimnasio que la
 * tenga, SILENCIOSAMENTE — sin 403, sin error, el staff ve un socio ajeno y
 * no tiene forma de notarlo. Con un solo tenant activo esto es invisible
 * (mismo comportamiento con o sin filtro), y por eso el piloto lo encontró
 * recién al sembrar el segundo gimnasio (analogía "Templo Online" del
 * fallback de `coach-load-routes.ts`).
 *
 * `tenantWhere(schema.users, ctx)` va ADENTRO de la condición devuelta (no
 * como un elemento aparte que cada llamador tendría que acordarse de sumar):
 * así el próximo call site que use esta condición nace scopeado sin que
 * nadie tenga que recordar agregar el filtro por separado (T-173-05-04). NO
 * lo dupliques en el llamador — el mismo statement con el filtro dos veces
 * es ruido, no defensa.
 */
export function buildMemberNameSearchCondition(
  ctx: TenantContext,
  search: string,
  options: { includeDni?: boolean } = {},
): SQL | null {
  const includeDni = options.includeDni ?? true;
  const tokens = search
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return null;

  // El lint de tenancy razona por STATEMENT (hallazgo 172-02/173-05): cada
  // `return sql\`...\`` de este `.map()` es su PROPIO statement, así que el
  // `tenantWhere` del `return` final (más abajo) no los cubre. Va INLINE acá
  // también — redundante en el SQL final (queda AND-eado varias veces), pero
  // es la única forma de que el análisis estático vea el gimnasio en el sitio
  // exacto donde se nombra `users` (mismo criterio que el join en el ON).
  const tokenConditions = tokens.map((token) => {
    const pattern = `%${token}%`;
    if (includeDni) {
      return sql`(${tenantWhere(schema.users, ctx)} AND (${schema.users.firstName} LIKE ${pattern}
        OR ${schema.users.lastName} LIKE ${pattern}
        OR ${schema.users.email} LIKE ${pattern}
        OR ${schema.users.dni} LIKE ${pattern}
        OR CONCAT_WS(' ', ${schema.users.firstName}, ${schema.users.lastName}) LIKE ${pattern}))`;
    }
    return sql`(${tenantWhere(schema.users, ctx)} AND (${schema.users.firstName} LIKE ${pattern}
      OR ${schema.users.lastName} LIKE ${pattern}
      OR ${schema.users.email} LIKE ${pattern}
      OR CONCAT_WS(' ', ${schema.users.firstName}, ${schema.users.lastName}) LIKE ${pattern}))`;
  });

  const nameCondition =
    tokenConditions.length === 1
      ? tokenConditions[0]
      : sql.join(tokenConditions, sql` AND `);

  return sql`(${tenantWhere(schema.users, ctx)} AND ${nameCondition})`;
}
