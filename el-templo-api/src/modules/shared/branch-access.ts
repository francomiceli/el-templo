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
 *                                          garantiza. NO aplica a los roles de
 *                                          alcance forzado — isBranchScopedRole)
 *       2. scope.isOwner=true           → true (owner bypass by role)
 *       3. admin/gestion same country   → true (scope.country === branch.country;
 *                                          el gimnasio YA decidió arriba — el
 *                                          país filtra ADENTRO del gimnasio, ya
 *                                          no es lo que aísla. Cuando
 *                                          scope.country=null por corrupción de
 *                                          datos, esto es siempre false →
 *                                          default-deny lateral)
 *       4. coach/recepción/inversor in branchIds → true
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
import { and, eq } from "drizzle-orm";
import { assertTenant, tenantWhere, type TenantContext } from "./tenant";
import { resolveBranchDelGimnasio } from "./branch-consistency";
import { AppError, NotFoundError } from "./errors";
import { INVERSOR_ROLE, TV_ACCOUNT_ROLE } from "./permissions";

export const BRANCH_OUT_OF_SCOPE = "BRANCH_OUT_OF_SCOPE";

/**
 * 2026-09-08 — código estable del 400 con el que se corta un listado/agregado
 * que un actor de alcance forzado (`isBranchScopedRole`) pidió SIN elegir sede
 * teniendo más de una asignada. Mismo contrato que `BRANCH_OUT_OF_SCOPE`: una
 * constante exportada para que el frontend matchee exacto en vez de parsear el
 * mensaje. No es 403 a propósito — el actor SÍ puede ver esas sedes, lo que
 * falta es que diga cuál.
 */
export const BRANCH_REQUIRED = "BRANCH_REQUIRED";

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
  //
  // EXCEPCIÓN (2026-09-08): los roles de alcance FORZADO por sede
  // (`isBranchScopedRole`, hoy `inversor`) NO heredan este atajo. Templo Online
  // es una sede más y sus socios no son de la sucursal del inversor: dejar
  // pasar la Regla 1 le abriría, con un `?branchId=<virtual>`, exactamente los
  // datos que este rol existe para no mostrar. Si algún día un inversor tiene
  // que ver la sede virtual, se le agrega a su `user_branches` y entra por la
  // Regla 4 como cualquier otra sede suya.
  if (branch.isVirtual && !isBranchScopedRole(scope.role)) {
    return true;
  }

  // Rule 2: owner bypass.
  if (scope.isOwner) {
    return true;
  }

  // Rule 2b (2026-09-07): la cuenta dedicada de los televisores ve TODAS las
  // sedes reales del gimnasio. A propósito NO pasa por `user_branches`: una
  // pantalla de pared no puede quedar en 403 porque alguien reescribió las
  // sedes de un usuario desde el admin (incidente TV Alem/Mario Bravo). El
  // gimnasio ya lo decidió la Regla 0 — esto no cruza tenants.
  if (scope.role === TV_ACCOUNT_ROLE) {
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

  // Rule 4: coach/recepción/inversor — branch must be in operational set.
  // `inversor` (2026-09-08, migración 0225) usa EXACTAMENTE el mismo mecanismo
  // que coach/recepción (`user_branches`), pero además tiene alcance FORZADO
  // en los listados — ver `enforcedBranchIds` / `enforceBranchScope` abajo.
  if (
    scope.role === "coach" ||
    scope.role === "recepcion" ||
    scope.role === INVERSOR_ROLE
  ) {
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

// ===========================================================================
// Alcance FORZADO por sede (2026-09-08, rol `inversor`)
// ===========================================================================
//
// EL PROBLEMA QUE RESUELVE. `requireBranchAccess({ optional: true })` sólo mira
// el `branchId` que vino en el request: si el cliente lo omite, no chequea nada
// y el listado cae al filtro por PAÍS (`scope.country`). Para admin/gestión eso
// es correcto (su alcance ES el país). Para un actor cuyo alcance son SUS sedes
// no lo es: omitir `branchId` le mostraría todas las sedes del país.
//
// LA REGLA. Para los roles de `isBranchScopedRole`:
//   - `branchId` presente y ajeno  → 403 BRANCH_OUT_OF_SCOPE (ya lo hace
//     `requireBranchAccess` vía la Regla 4 de `canAccessBranch`).
//   - `branchId` ausente, 1 sede   → se INYECTA su sede en el request.
//   - `branchId` ausente, 0 sedes  → 403 BRANCH_OUT_OF_SCOPE (fail-closed).
//   - `branchId` ausente, N sedes  → 400 BRANCH_REQUIRED (que elija cuál).
//
// POR QUÉ NO SE APLICA A coach/recepción. Hoy esos roles tienen el mismo gap
// (omiten `branchId` y ven el país). Cerrarlo acá regresionaría a recepción, que
// es un flujo vivo en producción — queda documentado como deuda preexistente y
// NO se toca en este cambio.

/**
 * ¿El alcance de este rol son SUS sedes (`user_branches`) Y hay que forzárselo
 * en listados/agregados? Punto ÚNICO de decisión: cualquier rol futuro con
 * alcance por sede forzado se agrega acá y hereda todo lo de abajo.
 */
export function isBranchScopedRole(role: string): boolean {
  return role === INVERSOR_ROLE;
}

/**
 * Sedes a las que hay que acotar sí o sí los datos de este actor.
 * `null` = sin forzado (todos los demás roles conservan su comportamiento
 * histórico: país, owner global, etc.). Un array VACÍO es un estado legítimo
 * (inversor al que todavía no le asignaron sedes) y significa "no ve nada".
 */
export function enforcedBranchIds(scope: CountryScope): number[] | null {
  return isBranchScopedRole(scope.role) ? scope.branchIds : null;
}

/**
 * Fastify preHandler. Encadenar SIEMPRE después de
 * `requireBranchAccess({ from, optional: true })`, que es quien devuelve el 403
 * cuando el `branchId` pedido no es del actor. Este completa la otra mitad: que
 * omitirlo no sea "todo el país".
 *
 * Inocuo para cualquier rol que no esté en `isBranchScopedRole`.
 *
 * Muta `request.query` / `request.params` / `request.body` a propósito: los
 * handlers ya leen el `branchId` de ahí y se lo pasan a los filtros del
 * servicio, así que inyectarlo cubre listado, export, summary y agregados sin
 * tocar una sola query. El cast a `Record<string, unknown>` es el mismo que usa
 * `readBranchId` para leerlos.
 */
export function enforceBranchScope(opts: {
  from: BranchIdLocation;
}): preHandlerHookHandler {
  return async function preHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const branchIds = enforcedBranchIds(request.scope);
    if (branchIds === null) return; // rol sin alcance forzado

    const requested = readBranchId(request, opts.from);
    if (requested !== null) {
      // Defensa en profundidad: `requireBranchAccess` ya cortó las sedes
      // ajenas. Si por algún motivo no corrió, cortamos igual acá.
      if (!branchIds.includes(requested)) {
        request.log.warn(
          {
            userId: request.user?.userId,
            role: request.user?.role,
            branchId: requested,
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
      return;
    }

    if (branchIds.length === 0) {
      request.log.warn(
        { userId: request.user?.userId, role: request.user?.role },
        BRANCH_OUT_OF_SCOPE,
      );
      return reply.code(403).send({
        error: "Forbidden",
        message: "Tu usuario no tiene ninguna sede asignada",
        code: BRANCH_OUT_OF_SCOPE,
      });
    }

    if (branchIds.length > 1) {
      return reply.code(400).send({
        error: "Bad Request",
        message: "Elegí una sede para ver esta información",
        code: BRANCH_REQUIRED,
      });
    }

    const [bag, key] = opts.from.split(".") as [
      "query" | "params" | "body",
      string,
    ];
    const target = request[bag] as Record<string, unknown> | undefined;
    if (target === undefined || target === null) {
      // Sin contenedor donde inyectar (ej. GET sin querystring parseado): el
      // criterio del archivo es deny, nunca "sin filtro".
      return reply.code(400).send({
        error: "Bad Request",
        message: "Elegí una sede para ver esta información",
        code: BRANCH_REQUIRED,
      });
    }
    target[key] = branchIds[0];
  };
}

/**
 * Corta un acceso PUNTUAL por id (una caja, un retiro, la ficha de un socio)
 * cuando el actor tiene alcance forzado y la fila es de otra sede.
 *
 * Lanza `NotFoundError` y NO un 403 a propósito — criterio ISO-03, el mismo que
 * ya usan `DELETE /admin/members/:userId` y el historial financiero: para un
 * actor fuera de alcance, una fila ajena tiene que ser indistinguible de una
 * inexistente. Un 403 le confirmaría que ese id existe en el gimnasio.
 *
 * `enforced` es lo que devuelve `enforcedBranchIds`: `null`/`undefined` = el rol
 * no tiene alcance forzado y esto es un no-op. Una fila SIN sede
 * (`branchId === null`: caja Central, cuenta banco) queda FUERA del alcance de
 * un rol de sede — nunca es "de todas las sedes".
 */
export function assertBranchInEnforcedScope(
  branchId: number | null,
  enforced: number[] | null | undefined,
  message: string,
): void {
  if (enforced === null || enforced === undefined) return;
  if (branchId !== null && enforced.includes(branchId)) return;
  throw new NotFoundError(message);
}

/**
 * Fastify preHandler DE PLUGIN (no de ruta): corta con 404 cualquier request
 * cuyo `:userId` / `:memberId` sea un usuario de otra sede, para los roles de
 * alcance forzado (`isBranchScopedRole`).
 *
 * Por qué a nivel de plugin y no ruta por ruta: los módulos de socios,
 * finanzas y suscripciones tienen DECENAS de rutas direccionadas por id de
 * socio (ficha, notas, baja, reset de contraseña, historial financiero,
 * referidos, asignar/renovar plan…). Enumerarlas era garantía de olvidarse una,
 * y el olvido no se nota: la ruta responde 200 con datos de otra sede. Un hook
 * único es el punto de corte que no se puede omitir.
 *
 * Inocuo para el resto de los roles: sale en la primera línea sin tocar la DB.
 * Para un actor de alcance forzado agrega UN SELECT por request (`users.id`,
 * índice primario).
 *
 * 404 y no 403: criterio ISO-03 — ver `assertBranchInEnforcedScope`. Un usuario
 * inexistente y uno de otra sede tienen que responder igual.
 */
export function enforceMemberBranchScope(
  db: MySql2Database<typeof schema>,
): preHandlerHookHandler {
  return async function preHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const enforced = enforcedBranchIds(request.scope);
    if (enforced === null) return;

    const params = request.params as Record<string, unknown> | undefined;
    const raw = params?.userId ?? params?.memberId;
    const targetId =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" &&
            raw.trim() !== "" &&
            Number.isFinite(Number(raw))
          ? Number(raw)
          : null;
    if (targetId === null) return;

    let ctx: TenantContext;
    try {
      ctx = assertTenant(
        request.scope,
        "branch-access.enforceMemberBranchScope",
      );
    } catch (err: unknown) {
      if (err instanceof AppError) {
        return reply
          .code(404)
          .send({ error: "No encontrado", message: "No encontrado" });
      }
      throw err;
    }

    const [row] = await db
      .select({ branchId: schema.users.branchId })
      .from(schema.users)
      .where(and(tenantWhere(schema.users, ctx), eq(schema.users.id, targetId)))
      .limit(1);
    // Usuario inexistente: no se corta acá — la ruta ya tiene su propio 404 y
    // su propio mensaje.
    if (!row) return;

    if (!enforced.includes(row.branchId)) {
      request.log.warn(
        {
          userId: request.user?.userId,
          role: request.user?.role,
          targetUserId: targetId,
          branchId: row.branchId,
          scope: request.scope,
        },
        BRANCH_OUT_OF_SCOPE,
      );
      return reply
        .code(404)
        .send({ error: "No encontrado", message: "No encontrado" });
    }
  };
}
