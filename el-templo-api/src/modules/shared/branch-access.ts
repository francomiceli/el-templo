/**
 * Phase 110: Branch access control.
 *
 * Exports:
 *   - canAccessBranch(scope, branchId, db): pure async predicate.
 *     Eval order per CONTEXT D-01:
 *       1. branch.isVirtual=true        → true (Templo Online global)
 *       2. scope.isOwner=true           → true (owner bypass by role)
 *       3. admin/gestion same country   → true (scope.country === branch.country;
 *                                          when scope.country=null due to data
 *                                          corruption fail-closed path, this is
 *                                          always false → default-deny lateral)
 *       4. coach/recepción in branchIds → true
 *       5. member same branch           → true (branchId === scope.userBranchId)
 *       6. default                      → false
 *   - requireBranchAccess({ from, optional? }): Fastify preHandler factory.
 *     Reads branchId from the declared location (D-02 — no auto-detection),
 *     short-circuits with 403 + structured warn log on access denial
 *     (D-04, D-05, D-06).
 *     `optional` (default `false`) controls behavior when branchId is absent:
 *       - false → 400 (fail-closed; routes that always require a branch).
 *       - true  → no-op (owner aggregate views explicitly opt in).
 *   - BRANCH_OUT_OF_SCOPE: stable error-code string for frontend exact match.
 *
 * Design notes:
 *   - canAccessBranch is pure: no Fastify dep, no req/reply — testable
 *     standalone with a Drizzle DB instance.
 *   - The preHandler reads request.user (post-authenticate) and request.scope
 *     (post-attachCountryScope), so route registration order matters:
 *       onRequest: [authenticate]
 *       preHandler: [attachCountryScope, requireBranchAccess({ from })]
 *     Module plugins that already register an `addHook("onRequest")` calling
 *     attachCountryScope can chain requireBranchAccess as a per-route
 *     preHandler.
 *   - 403 (permission) + 400 (data inconsistency from Phase 98 D-03) coexist —
 *     this preHandler owns 403; existing service-layer 400s remain.
 *   - Member rule (Rule 5) reads `scope.userBranchId` (populated server-side
 *     by attachCountryScope from `users.branch_id`). The JWT payload does NOT
 *     carry branchId (plugins/auth.ts:7-8) — that's intentional: scope is
 *     resolved per request so permission changes take effect without re-login.
 */

import type {
  FastifyRequest,
  FastifyReply,
  preHandlerHookHandler,
} from "fastify";
import { MySql2Database } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import type { CountryScope } from "./country-scope";

export const BRANCH_OUT_OF_SCOPE = "BRANCH_OUT_OF_SCOPE";

/**
 * Locations where requireBranchAccess can read the branchId from.
 * NOTE: 'params.id' is intentionally excluded — `:id` is a semantic trap
 * (could be userId, memberId, scheduleId — NOT typed as a branchId).
 * Routes whose `:id` IS a branchId should rename the param to `:branchId`.
 */
export type BranchIdLocation =
  | "query.branchId"
  | "params.branchId"
  | "body.branchId";

/**
 * Pure async predicate. Returns true iff the actor described by `scope` may
 * operate on the branch identified by `branchId`. See file-level eval order.
 */
export async function canAccessBranch(
  scope: CountryScope,
  branchId: number,
  db: MySql2Database<typeof schema>,
): Promise<boolean> {
  // Single SELECT — branch row carries the data needed for all rules.
  const [branch] = await db
    .select({
      id: schema.branches.id,
      country: schema.branches.country,
      isVirtual: schema.branches.isVirtual,
    })
    .from(schema.branches)
    .where(eq(schema.branches.id, branchId))
    .limit(1);

  if (!branch) {
    return false;
  }

  // Rule 1: virtual sedes (Templo Online) are globally accessible (REQ-10).
  if (branch.isVirtual) {
    return true;
  }

  // Rule 2: owner bypass.
  if (scope.isOwner) {
    return true;
  }

  // Rule 3: admin/gestion — same country only. When scope.country=null
  // (data-corruption fail-closed path from country-scope hook), this is
  // always false → default-deny lateral.
  if (scope.role === "admin" || scope.role === "gestion") {
    return scope.country !== null && branch.country === scope.country;
  }

  // Rule 4: coach/recepción — branch must be in operational set.
  if (scope.role === "coach" || scope.role === "recepcion") {
    return scope.branchIds.includes(branchId);
  }

  // Rule 5: member — branch must equal the actor's personal training branch.
  // Uses scope.userBranchId (populated by attachCountryScope from
  // users.branch_id) because the JWT payload doesn't carry branchId.
  if (scope.role === "member") {
    return scope.userBranchId !== null && branchId === scope.userBranchId;
  }

  // Rule 6: default deny.
  return false;
}

/**
 * Read a numeric branchId from a Fastify request location (D-02 — no
 * auto-detection; caller declares the location).
 *
 * Returns null when the field is absent or non-numeric. Caller decides
 * whether absence means "skip the check" or "reject the request".
 */
function readBranchId(
  request: FastifyRequest,
  from: BranchIdLocation,
): number | null {
  const [bag, key] = from.split(".") as ["query" | "params" | "body", string];
  const obj = request[bag] as Record<string, unknown> | undefined;
  const raw = obj?.[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Fastify preHandler factory. Apply per-route on endpoints that consume a
 * branchId. On access denial: 403 + BRANCH_OUT_OF_SCOPE + structured warn log.
 *
 * Usage:
 *   fastify.get("/foo", {
 *     schema: fooSchema,
 *     preHandler: [requireBranchAccess({ from: "query.branchId" })],
 *   }, handler);
 *
 * Options:
 *   - from: where to read branchId from the request payload.
 *   - optional: when true, missing branchId is allowed (owner aggregate views
 *     that legitimately accept "no filter"). When false (default — fail-closed),
 *     missing branchId returns 400.
 */
export function requireBranchAccess(opts: {
  from: BranchIdLocation;
  optional?: boolean;
}): preHandlerHookHandler {
  const optional = opts.optional ?? false;
  return async function preHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const branchId = readBranchId(request, opts.from);
    if (branchId == null) {
      if (optional) return; // explicit opt-in: no branchId in payload → no check
      return reply.code(400).send({
        error: "Bad Request",
        message: "branchId requerido",
      });
    }

    const ok = await canAccessBranch(
      request.scope,
      branchId,
      request.server.db,
    );
    if (!ok) {
      request.log.warn(
        {
          userId: request.user?.userId,
          role: request.user?.role,
          branchId,
          scope: request.scope,
        },
        BRANCH_OUT_OF_SCOPE,
      );
      return reply.code(403).send({
        error: "Forbidden",
        message: "No tenés acceso a esta sede",
        code: BRANCH_OUT_OF_SCOPE,
      });
    }
  };
}
