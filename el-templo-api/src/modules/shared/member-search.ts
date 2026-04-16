import { sql, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";

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
 */
export function buildMemberNameSearchCondition(
  search: string,
  options: { includeDni?: boolean } = {},
): SQL | null {
  const includeDni = options.includeDni ?? true;
  const tokens = search
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return null;

  const tokenConditions = tokens.map((token) => {
    const pattern = `%${token}%`;
    if (includeDni) {
      return sql`(${schema.users.firstName} LIKE ${pattern}
        OR ${schema.users.lastName} LIKE ${pattern}
        OR ${schema.users.email} LIKE ${pattern}
        OR ${schema.users.dni} LIKE ${pattern}
        OR CONCAT_WS(' ', ${schema.users.firstName}, ${schema.users.lastName}) LIKE ${pattern})`;
    }
    return sql`(${schema.users.firstName} LIKE ${pattern}
      OR ${schema.users.lastName} LIKE ${pattern}
      OR ${schema.users.email} LIKE ${pattern}
      OR CONCAT_WS(' ', ${schema.users.firstName}, ${schema.users.lastName}) LIKE ${pattern})`;
  });

  if (tokenConditions.length === 1) {
    return tokenConditions[0];
  }

  return sql.join(tokenConditions, sql` AND `);
}
