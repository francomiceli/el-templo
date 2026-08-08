import type { FastifyRequest } from "fastify";
import { MySql2Database } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";
import * as schema from "../../db/schema";
import { OWNER_ROLES } from "./permissions";
import { AppError } from "./errors";
import { tenantWhere, type TenantContext } from "./tenant";

export type CountryCode = "AR" | "ES";

/**
 * Fase 166 (FUND-04 / CD-02) — código estable del 403 con el que se corta todo
 * request autenticado de un gimnasio cuyo `tenants.status` no es 'active'.
 *
 * Mismo contrato que `BRANCH_OUT_OF_SCOPE` (branch-access.ts): una constante
 * exportada para que cualquier frontend matchee exacto en vez de parsear el
 * mensaje. Un ÚNICO código para 'suspended' y 'archived' — el cliente ve lo
 * mismo en los dos casos y el estado real viaja sólo en el log estructurado
 * (no filtramos por HTTP si la baja del gimnasio es reversible o definitiva).
 */
export const TENANT_SUSPENDED = "TENANT_SUSPENDED";

export interface CountryScope {
  /**
   * Fase 166 (FUND-03) — gimnasio (tenant) dueño de los datos de este request.
   *
   * Sale SIEMPRE de `users.tenant_id`, resuelto server-side en la misma query
   * que resuelve el país. NUNCA viaja en el JWT (el payload sólo carga
   * `{ userId, email, role }`, ver plugins/auth.ts) y NUNCA se acepta de un
   * valor mandado por el cliente por ningún canal: mandar un id de gimnasio
   * desde afuera no cambia este campo. Corolario de que no está en el token:
   * suspender o mover un gimnasio aplica en el request siguiente, sin re-login.
   *
   * `null` es el estado fail-closed de corrupción de datos — mismo criterio
   * que `country: null`. La FK `fk_users_tenant` lo vuelve imposible en la
   * práctica; si aun así ocurre, el hook escala un `request.log.error`. Todo
   * helper de tenancy (fase 169 en adelante) DEBE tratar `null` como deny,
   * jamás como "todos los gimnasios".
   */
  tenantId: number | null;
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

/**
 * Fase 166 (CD-03) — alias de tipo para la migración gradual de nombres. El
 * scope dejó de ser sólo de país (ahora lleva el gimnasio), pero renombrar el
 * tipo de golpe tocaría los módulos que lo importan; los consumidores nuevos
 * usan `Scope` y los viejos migran módulo a módulo en las fases 172-175.
 */
export type Scope = CountryScope;

declare module "fastify" {
  interface FastifyRequest {
    scope: CountryScope;
  }
}

/**
 * Derives the request's tenant + country scope from the authenticated user.
 *
 * Fase 166 (FUND-03/FUND-04, D-02/D-03): la MISMA query que ya resolvía el
 * país resuelve también el gimnasio (`users.tenant_id`) y su estado comercial
 * (`tenants.status`), y corta el request con 403 `TENANT_SUSPENDED` cuando el
 * gimnasio no está activo. El enforcement vive acá, dentro del hook, y no en
 * un hook aparte: así lo heredan los 22 call sites sin cambiar una línea, y
 * la suspensión alcanza TODA la superficie autenticada (staff y member app),
 * que es la palanca comercial del SaaS (CD-01). El corte ocurre antes de
 * resolver el resto del scope, o sea antes de tocar ningún dato del gimnasio.
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
 *
 * @throws {AppError} 403 con `code = TENANT_SUSPENDED` cuando el gimnasio del
 * usuario no está activo. Al lanzar desde el hook, Fastify responde con su
 * serializador por default, que sí incluye `err.code` en el body — por eso el
 * corte no necesita un parámetro `reply` ni cambia la firma de esta función.
 */
export async function attachScope(
  request: FastifyRequest,
  db: MySql2Database<typeof schema>,
): Promise<void> {
  const role = request.user?.role ?? "";
  const userId = request.user?.userId;
  const isOwner = (OWNER_ROLES as readonly string[]).includes(role);

  let tenantId: number | null = null;
  let country: CountryCode | null = null;
  let branchIds: number[] = [];
  let userBranchId: number | null = null;

  // Single SELECT covers users.tenant_id + tenants.status + users.country +
  // users.branch_id for every role (eliminates the JOIN-to-branches for
  // admin/gestion per D-12, while still populating userBranchId for
  // canAccessBranch Rule 5).
  //
  // Fase 166: el join a `tenants` es LEFT a propósito. Con un join estricto,
  // un gimnasio no resoluble haría desaparecer la fila entera y el hook
  // perdería `country` y `userBranchId` — una regresión de comportamiento
  // para el staff ante un problema de datos que no es suyo. Con LEFT, el
  // resto del scope se resuelve igual que siempre y el gimnasio cae al camino
  // fail-closed de abajo.
  if (typeof userId === "number") {
    const [row] = await db
      .select({
        country: schema.users.country,
        branchId: schema.users.branchId,
        tenantId: schema.users.tenantId,
        tenantStatus: schema.tenants.status,
      })
      .from(schema.users)
      .leftJoin(schema.tenants, eq(schema.users.tenantId, schema.tenants.id))
      .where(eq(schema.users.id, userId))
      .limit(1);
    if (row) {
      // Fase 166 (FUND-03/FUND-04, D-03): el gimnasio se resuelve y se
      // enforcea PRIMERO — antes de country, de branchIds y de cualquier
      // query adicional. Criterio de la fase: un gimnasio no activo no llega
      // a tocar un solo dato del gimnasio.
      tenantId = row.tenantId ?? null;

      if (row.tenantStatus == null) {
        // El join no matcheó: corrupción de datos (la FK fk_users_tenant lo
        // vuelve imposible en la práctica). Se replica exactamente el patrón
        // fail-closed de `country = null` — denegación aguas abajo — en vez
        // de responder 403: una inconsistencia de datos no puede convertirse
        // en una caída masiva del servicio.
        request.log.error(
          { userId, role },
          "attachScope: user has no resolvable tenant (data corruption); scope.tenantId=null (default-deny)",
        );
        tenantId = null;
      } else if (row.tenantStatus !== "active") {
        // 'suspended' (falta de pago, reversible) y 'archived' (baja lógica)
        // cortan igual. La comparación es contra 'active' y no contra la lista
        // de estados malos para que un estado futuro del enum deniegue por
        // default en vez de colarse.
        request.log.warn(
          { userId, role, tenantId, tenantStatus: row.tenantStatus },
          TENANT_SUSPENDED,
        );
        throw new AppError(
          "Acceso suspendido para este gimnasio",
          403,
          TENANT_SUSPENDED,
        );
      }

      userBranchId = row.branchId ?? null;

      // 173-04 (D-02, T-173-04-02): el ctx de tenancy nace de la MISMA fila
      // de `users` que ya resolvió `tenantId` arriba — nunca de
      // `request.user` ni del body. `null` cuando el gimnasio no se pudo
      // resolver (corrupción de datos, la FK fk_users_tenant lo vuelve
      // imposible en la práctica): las dos queries de abajo
      // (`user_branches` y el join de `resolveBranchCountry`) solo agregan
      // el filtro cuando hay un gimnasio real, y jamás caen a `?? 1` ni a un
      // `!` — ese es el guard fail-closed. El PAÍS sigue filtrando adentro
      // (`resolveBranchCountry`, `row.country`) pero ya no es lo que aísla:
      // el aislamiento lo da el gimnasio (mismo movimiento que D-14 hace en
      // `branch-access.ts`, plan 173-11). Ambas queries además ya scopean
      // por `users.id = userId` / `user_branches.user_id = userId`, así que
      // `tenantWhere` acá es un cinturón de defensa en profundidad y no la
      // única barrera contra una fuga entre gimnasios.
      const ctx: TenantContext | null = tenantId === null ? null : { tenantId };

      if (isOwner) {
        // Phase 98 D-18 invariant: owner-without-toggle resolves to their own
        // branch country (NOT hardcoded 'AR'). Toggle wins when present.
        const q = (request.query as Record<string, unknown> | undefined)
          ?.country;
        if (q === "AR" || q === "ES") {
          country = q;
        } else {
          const branchCountry = await resolveBranchCountry(db, ctx, userId);
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
            "attachScope: admin/gestion has no users.country (data corruption); scope.country=null (default-deny)",
          );
          country = null;
        }
      } else if (role === "coach" || role === "recepcion") {
        // Phase 110 REQ-5: load multi-branch operational scope.
        const ubRows = await db
          .select({ branchId: schema.userBranches.branchId })
          .from(schema.userBranches)
          .where(
            ctx
              ? and(
                  tenantWhere(schema.userBranches, ctx),
                  eq(schema.userBranches.userId, userId),
                )
              : eq(schema.userBranches.userId, userId),
          );
        branchIds = ubRows.map((r) => r.branchId).sort((a, b) => a - b);

        // Country derived from the actor's own branch (their personal training
        // sede) — mirrors the previous JOIN behavior for consumers like
        // FinanceService that rely on `scope.country`.
        const branchCountry = await resolveBranchCountry(db, ctx, userId);
        if (branchCountry) country = branchCountry;
      } else {
        // Member (and any future role): preserve pre-Phase-110 JOIN-based behavior.
        const branchCountry = await resolveBranchCountry(db, ctx, userId);
        if (branchCountry) {
          country = branchCountry;
        } else {
          request.log.warn(
            { userId, role },
            "attachScope: non-staff user has no resolvable branch country; scope.country=null",
          );
        }
      }
    }
  }

  request.scope = { tenantId, country, branchIds, isOwner, role, userBranchId };
}

/**
 * @deprecated Usar {@link attachScope}. Es exactamente la misma función: el
 * scope dejó de ser sólo de país cuando pasó a resolver y enforcear el
 * gimnasio (fase 166, CD-03). El alias existe para que los 22 call sites
 * hereden el enforcement sin un commit mecánico en la fase fundacional;
 * migran módulo a módulo durante la adopción (fases 172-175).
 */
export const attachCountryScope = attachScope;

/**
 * 173-04 (D-02): `ctx` es `TenantContext | null` y no `TenantContext` a
 * secas — a diferencia de un route handler (que SIEMPRE puede pasar por
 * `assertTenant` en el borde), acá el llamador es el propio `attachScope`
 * TODAVÍA resolviendo el scope, así que un gimnasio no resoluble es un
 * estado legítimo de este punto del código (guard fail-closed de arriba) y
 * no una excepción de programación. `null` NO filtra por tenant — la query
 * sigue scopeada a `users.id = userId`, una sola fila.
 */
async function resolveBranchCountry(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext | null,
  userId: number,
): Promise<CountryCode | null> {
  const [row] = await db
    .select({ country: schema.branches.country })
    .from(schema.users)
    .innerJoin(schema.branches, eq(schema.users.branchId, schema.branches.id))
    .where(
      ctx
        ? and(tenantWhere(schema.users, ctx), eq(schema.users.id, userId))
        : eq(schema.users.id, userId),
    );
  if (row?.country === "AR" || row?.country === "ES") {
    return row.country;
  }
  return null;
}
