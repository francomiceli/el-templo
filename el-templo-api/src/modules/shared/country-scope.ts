import type { FastifyRequest } from "fastify";
import { MySql2Database } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { OWNER_ROLES } from "./permissions";

export type CountryCode = "AR" | "ES";

export interface CountryScope {
  /**
   * Country of management/operation. Nullable to support the fail-closed
   * default-deny path: when an admin/gestion has `users.country IS NULL`
   * (data corruption — backfill bug), the hook escalates a Sentry-grade
   * `request.log.error` and sets `country = null`. canAccessBranch Rule 3
   * then evaluates `branch.country === null` → `false` → 403 (denied access,
   * not lateral data leak).
   */
  country: CountryCode | null;
  /**
   * Branch IDs the actor can operate on, populated for coach/recepción
   * from the `user_branches` join table. Empty array for other roles
   * (admin/gestion use `country` for scope; owner uses isOwner; member
   * uses `userBranchId` directly via canAccessBranch).
   */
  branchIds: number[];
  isOwner: boolean;
  /**
   * Role string mirrored from request.user.role for downstream guards.
   * Empty string when the request is somehow unauthenticated (defense-in-depth
   * — every consumer of `request.scope` runs after fastify.authenticate).
   */
  role: string;
  /**
   * The actor's personal training branch (`users.branch_id`). Populated for
   * EVERY role from the same SELECT that resolves country. Used by canAccessBranch
   * Rule 5 (member) so the helper stays pure and member access is computable
   * from `scope` alone — the JWT payload (plugins/auth.ts:7-8) carries only
   * `{ userId, email, role }` (no branchId), so this field is the canonical
   * server-side source for the member's training sede.
   * `null` only when the user row is missing (defense-in-depth — should not
   * happen in practice).
   */
  userBranchId: number | null;
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
 *   Without the toggle, owner resolves to their own branch country (Phase 98 D-18 —
 *   NEVER hardcoded 'AR').
 * - admin/gestion: country comes directly from `users.country` (Phase 110 D-12 —
 *   replaces the JOIN to branches). When NULL (data corruption), `request.log.error`
 *   escalates to Sentry and `scope.country = null` (canAccessBranch Rule 3 then
 *   default-denies any branch).
 * - coach/recepción: country derived from their own branch's country; branchIds
 *   loaded from `user_branches` (Phase 110 REQ-5).
 * - member (and any other role): country from their branch.
 *
 * The JWT payload only carries `userId`, `email`, and `role` (see plugins/auth.ts).
 * `userBranchId` is therefore populated server-side from `users.branch_id` so
 * canAccessBranch Rule 5 (member) is computable from `scope` alone.
 *
 * Must run AFTER fastify.authenticate because it reads request.user.userId / role.
 */
export async function attachCountryScope(
  request: FastifyRequest,
  db: MySql2Database<typeof schema>,
): Promise<void> {
  const role = request.user?.role ?? "";
  const userId = request.user?.userId;
  const isOwner = (OWNER_ROLES as readonly string[]).includes(role);

  let country: CountryCode | null = null;
  let branchIds: number[] = [];
  let userBranchId: number | null = null;

  // Single SELECT covers users.country + users.branch_id for every role
  // (eliminates the JOIN-to-branches for admin/gestion per D-12, while still
  // populating userBranchId for canAccessBranch Rule 5).
  if (typeof userId === "number") {
    const [row] = await db
      .select({
        country: schema.users.country,
        branchId: schema.users.branchId,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (row) {
      userBranchId = row.branchId ?? null;

      if (isOwner) {
        // Phase 98 D-18 invariant: owner-without-toggle resolves to their own
        // branch country (NOT hardcoded 'AR'). Toggle wins when present.
        const q = (request.query as Record<string, unknown> | undefined)
          ?.country;
        if (q === "AR" || q === "ES") {
          country = q;
        } else {
          const branchCountry = await resolveBranchCountry(db, userId);
          if (branchCountry) country = branchCountry;
          // else: country stays null (no resolvable branch — should not happen
          // for owner; fail-closed if it does).
        }
      } else if (role === "admin" || role === "gestion") {
        // Phase 110 D-12 / REQ-5: read users.country directly (no JOIN).
        if (row.country === "AR" || row.country === "ES") {
          country = row.country;
        } else {
          // Backfill bug / data corruption: ESCALATE to error so Sentry catches
          // (admin/gestion MUST have a country; this is not a 4xx-class event).
          // canAccessBranch Rule 3 will then deny all branches by default
          // (`branch.country === null` is always false). Default-deny lateral.
          request.log.error(
            { userId, role },
            "attachCountryScope: admin/gestion has no users.country (data corruption); scope.country=null (default-deny)",
          );
          country = null;
        }
      } else if (role === "coach" || role === "recepcion") {
        // Phase 110 REQ-5: load multi-branch operational scope.
        const ubRows = await db
          .select({ branchId: schema.userBranches.branchId })
          .from(schema.userBranches)
          .where(eq(schema.userBranches.userId, userId));
        branchIds = ubRows.map((r) => r.branchId).sort((a, b) => a - b);

        // Country derived from the actor's own branch (their personal training
        // sede) — mirrors the previous JOIN behavior for consumers like
        // FinanceService that rely on `scope.country`.
        const branchCountry = await resolveBranchCountry(db, userId);
        if (branchCountry) country = branchCountry;
      } else {
        // Member (and any future role): preserve pre-Phase-110 JOIN-based behavior.
        const branchCountry = await resolveBranchCountry(db, userId);
        if (branchCountry) {
          country = branchCountry;
        } else {
          request.log.warn(
            { userId, role },
            "attachCountryScope: non-staff user has no resolvable branch country; scope.country=null",
          );
        }
      }
    }
  }

  request.scope = { country, branchIds, isOwner, role, userBranchId };
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
