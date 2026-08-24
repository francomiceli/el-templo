/**
 * Phase 110: Branch access control.
 *
 * Exports:
 *   - canAccessBranch(scope, branchId, db): pure async predicate.
 *     Eval order per CONTEXT D-01, REVISADO por la fase 173 (D-14, ADO-07):
 *       0. el SELECT de la sede filtra por GIMNASIO (tenantWhere) — una sede
 *          de otro gimnasio no matchea y ni siquiera llega a las reglas de
 *          abajo. Esto es lo que cierra el bypass histórico de la Regla 1.
 *       1. branch.isVirtual=true        → true (Templo Online, PERO del PROPIO
 *                                          gimnasio: el filtro de arriba ya lo
 *                                          garantiza)
 *       2. scope.isOwner=true           → true (owner bypass by role)
 *       3. admin/gestion same country   → true (scope.country === branch.country;
 *                                          el gimnasio YA decidió arriba — el
 *                                          país filtra ADENTRO del gimnasio, ya
 *                                          no es lo que aísla. Cuando
 *                                          scope.country=null por corrupción de
 *                                          datos, esto es siempre false →
 *                                          default-deny lateral)
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
 *
 * Fase 173 (D-14, ADO-07) — LOS DOS BYPASSES CROSS-TENANT QUE ESTE PLAN CIERRA
 * -----------------------------------------------------------------------------
 * Hasta acá, el SELECT que resuelve la sede NO tenía ningún filtro de
 * gimnasio: leía CUALQUIER `branches.id`, de cualquier tenant. Eso abría DOS
 * bypasses, no uno:
 *   (1) Regla 1 (`isVirtual → true`): una sede virtual de OTRO gimnasio
 *       devolvía `true` ANTES de mirar el país. Con el `tenantWhere` en el
 *       SELECT, esa sede ajena ni siquiera existe para esta función — la
 *       Regla 1 NO SE BORRA, deja de poder aplicarse a una sede que no es del
 *       gimnasio del actor.
 *   (2) Regla 3 (admin/gestión): el PAÍS decidía el aislamiento. El doc 07 §5
 *       lo llama "el aislador alternativo que nadie nombra" — mientras el país
 *       siguiera siendo el único filtro, una batería de aislamiento (fase
 *       171/173-26) podía dar verde sin que la capa de tenancy hiciera nada,
 *       porque dos gimnasios del mismo país igual "se veían" distintos. Ahora
 *       el GIMNASIO decide primero (vía el filtro del SELECT) y el país sigue
 *       filtrando, pero ADENTRO del gimnasio ya resuelto — deja de ser un
 *       aislador alternativo.
 *
 * `assertTenant` es el ÚNICO puente permitido entre `scope.tenantId`
 * (`CountryScope`, `number | null`) y la firma que exige `tenantWhere` /
 * `resolveBranchDelGimnasio` (`TenantContext`, `tenantId: number`). Cuando
 * `scope.tenantId` es `null` (corrupción de datos — la FK `fk_users_tenant` lo
 * vuelve casi imposible en la práctica), el criterio es DENY, igual que el
 * resto de este archivo: nunca un `!`, nunca un `?? 1`, nunca "todos los
 * gimnasios".
 */

import type {
  FastifyRequest,
  FastifyReply,
  preHandlerHookHandler,
} from "fastify";
import { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import type { CountryScope } from "./country-scope";
import { assertTenant, type TenantContext } from "./tenant";
import { resolveBranchDelGimnasio } from "./branch-consistency";
import { AppError } from "./errors";

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
 *
 * Fase 173 (D-14): el filtro de gimnasio corre PRIMERO, antes de cualquier
 * regla. Reusa `resolveBranchDelGimnasio` (D-05a) en vez de un segundo SELECT
 * a `branches` — una sede de otro gimnasio no matchea y esta función jamás
 * llega a mirarla.
 */
export async function canAccessBranch(
  scope: CountryScope,
  branchId: number,
  db: MySql2Database<typeof schema>,
): Promise<boolean> {
  // `assertTenant` es el ÚNICO puente permitido entre `scope.tenantId`
  // (`number | null`) y el `TenantContext` (`tenantId: number`) que exige
  // `resolveBranchDelGimnasio`. `scope.tenantId === null` es corrupción de
  // datos (la FK `fk_users_tenant` lo vuelve casi imposible) — el criterio acá
  // es DENY, igual que el resto del archivo: ni `!`, ni `?? 1`, ni "todos los
  // gimnasios".
  let ctx: TenantContext;
  try {
    ctx = assertTenant(scope, "branch-access.canAccessBranch");
  } catch (err: unknown) {
    if (err instanceof AppError) return false;
    throw err;
  }

  // Regla 0 (D-14): el gimnasio decide ANTES que cualquier otra regla. Una
  // sede de OTRO gimnasio no matchea el `tenantWhere` de
  // `resolveBranchDelGimnasio` y vuelve `null` — exactamente igual que una
  // sede inexistente. Esto CIERRA el bypass histórico de la Regla 1: una sede
  // virtual ajena ya no llega a leerse, mucho menos a evaluarse.
  const branch = await resolveBranchDelGimnasio(ctx, branchId, db);
  if (!branch) {
    return false;
  }

  // Rule 1: virtual sedes (Templo Online) DEL PROPIO GIMNASIO son globalmente
  // accesibles (REQ-10). Ya no puede aplicar a una sede ajena — el filtro de
  // arriba garantiza que, si llegamos acá, `branch` es del gimnasio de `ctx`.
  if (branch.isVirtual) {
    return true;
  }

  // Rule 2: owner bypass.
  if (scope.isOwner) {
    return true;
  }

  // Rule 3: admin/gestion — el gimnasio YA decidió arriba; el país sigue
  // filtrando ADENTRO del gimnasio resuelto, pero deja de ser lo que aísla
  // (D-14, doc 07 §5: "el aislador alternativo que nadie nombra"). Cuando
  // scope.country=null (data-corruption fail-closed path), esto es siempre
  // false → default-deny lateral.
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
