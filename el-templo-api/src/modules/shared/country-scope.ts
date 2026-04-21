import type { FastifyRequest } from "fastify";
import { MySql2Database } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { OWNER_ROLES } from "./permissions";

export type CountryCode = "AR" | "ES";

export interface CountryScope {
  country: CountryCode;
  isOwner: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    scope: CountryScope;
  }
}

/**
 * Derives the request's country scope from the authenticated user.
 *
 * - Owners (role in OWNER_ROLES) may pass `?country=AR|ES` as a query param;
 *   the hook honors it. This enables the Argentina/España toggle in the admin
 *   PlanesPage, CajaPage, ReportesPage, AnaliticasPage, and FinanzasTab (D-06, D-10).
 * - Non-owners' client-supplied `country` is IGNORED (defense in depth per D-02).
 *   Their scope is always derived from their branch's country.
 *
 * The JWT payload only carries `userId`, `email`, and `role` (see plugins/auth.ts),
 * so the user's branch country is resolved via a single JOIN on users -> branches
 * keyed on `request.user.userId`.
 *
 * Must run AFTER fastify.authenticate because it reads request.user.userId / role.
 * Plan 03 handles per-route registration order.
 */
export async function attachCountryScope(
  request: FastifyRequest,
  db: MySql2Database<typeof schema>,
): Promise<void> {
  const role = request.user?.role;
  const userId = request.user?.userId;
  const isOwner = (OWNER_ROLES as readonly string[]).includes(role ?? "");

  let country: CountryCode = "AR";

  if (isOwner) {
    const q = (request.query as Record<string, unknown> | undefined)?.country;
    if (q === "AR" || q === "ES") {
      country = q;
    } else if (typeof userId === "number") {
      const branchCountry = await resolveBranchCountry(db, userId);
      if (branchCountry) country = branchCountry;
    }
  } else if (typeof userId === "number") {
    // Non-owner: IGNORE any client-supplied country, always derive from branch.
    const branchCountry = await resolveBranchCountry(db, userId);
    if (branchCountry) {
      country = branchCountry;
    } else {
      request.log.warn(
        { userId, role },
        "attachCountryScope: non-owner user has no resolvable branch country; defaulting to AR",
      );
    }
  }

  request.scope = { country, isOwner };
}

async function resolveBranchCountry(
  db: MySql2Database<typeof schema>,
  userId: number,
): Promise<CountryCode | null> {
  const [row] = await db
    .select({ country: schema.branches.country })
    .from(schema.users)
    .innerJoin(schema.branches, eq(schema.users.branchId, schema.branches.id))
    .where(eq(schema.users.id, userId));
  if (row?.country === "AR" || row?.country === "ES") {
    return row.country;
  }
  return null;
}
