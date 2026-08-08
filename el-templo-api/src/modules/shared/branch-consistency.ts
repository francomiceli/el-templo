/**
 * Módulo: branch-consistency — el resolvedor único de sede validada por
 * gimnasio (ADO-07, fase 173 plan 11).
 *
 * QUÉ INVARIANTE PROTEGE
 * -----------------------
 * La mina M10 del inventario
 * (`.docs/saas-multitenancy/05-inventario-tablas-2026-07-26.md` líneas
 * 339-343): el par de anclas `user.tenant_id === branch.tenant_id` puede
 * DIVERGIR si un update cruza sedes de distinto gimnasio. Hoy hay 12 sitios
 * que reescriben `users.branch_id` (`branchUpdatedAt`) y 4 que escriben
 * `user_branches.branch_id`, y en TODOS el `branchId` sale del payload del
 * cliente sin que nadie verifique de qué gimnasio es esa sede. Este archivo es
 * la pieza única que esos 16 sitios van a consumir (planes 173-13, 173-14,
 * 173-15, 173-16, 173-18), en vez de escribir la verificación 16 veces.
 *
 * D-08 — ALCANCE: el ancla y sus tablas, no toda tabla con branch_id
 * --------------------------------------------------------------------
 * Este helper protege EXCLUSIVAMENTE `users.branch_id` y
 * `user_branches.branch_id` — las dos columnas que nombra la mina M10. Las
 * demás tablas con `branch_id` (reservas, asistencia, transacciones,
 * horarios, TV) quedan protegidas por su propio `tenant_id` y por el
 * aislamiento de su módulo en las fases 174/175. Este archivo NO es un
 * resolvedor genérico de "sede válida" para cualquier tabla — es el
 * resolvedor del ANCLA.
 *
 * D-06 — CONTRATO DEL RECHAZO: sede inexistente, NUNCA "acceso denegado"
 * ------------------------------------------------------------------------
 * La forma es RESOLVER-CON-FILTRO, no comparar-después: la query hace
 * `WHERE tenantWhere(branches, ctx) AND id = branchId`. La fila de otro
 * gimnasio simplemente NO MATCHEA — cae en la misma rama "sede no encontrada"
 * que cada llamador ya tiene para un id inexistente. Sale casi gratis y es a
 * propósito: un código de rechazo de "permiso denegado" CONFIRMARÍA que la
 * sede existe en otro gimnasio, y ese mismo código sería la fuga
 * (T-173-11-02). Por eso este archivo jamás lanza ni devuelve un código de
 * "acceso denegado" — el único contrato de rechazo es "no encontrada".
 *
 * PROHIBIDO: resolver una sede por NOMBRE sin `tenantWhere`
 * --------------------------------------------------------------
 * La query más peligrosa medida en el piloto (doc 07 §2.4,
 * `coach-load-routes.ts:resolveUserBranchId`) fue la que buscaba la sede
 * "Templo Online" por NOMBRE en vez de por id: con un solo tenant activo es
 * invisible, pero un nombre que TODO gimnasio puede llegar a tener devuelve la
 * fila del PRIMER gimnasio que lo tenga, no la del `ctx` que está llamando.
 * Este archivo resuelve SIEMPRE por `id` + `tenantWhere`. Jamás se agrega acá
 * un fallback por nombre sin su propio `tenantWhere` explícito.
 *
 * FIRMA
 * -----
 * `ctx` PRIMERO (antes de `branchId` y de `db`) — mismo orden que
 * `canAccessBranch(scope, branchId, db)` en `branch-access.ts`, para que el
 * próximo call site no tenga que elegir una convención distinta.
 *
 * `db` acepta el pool O un handle de transacción (`DbOrTx`, mismo patrón que
 * `session-edit-helpers.ts` / `enrollment-service.ts`): los ~10 de los 16
 * sitios que ya envuelven su escritura en `db.transaction(async (tx) => ...)`
 * (`members/service.ts`, `users/service.ts`) necesitan validar la sede DENTRO
 * de esa misma transacción, no en una conexión aparte.
 *
 * `branchId` PUEDE SER `null`
 * ---------------------------
 * Hoy `users.branch_id` es NOT NULL en el schema, pero varios callers
 * construyen su `branchId` a partir de un campo opcional del payload o de un
 * resultado intermedio que puede no estar resuelto todavía. `resolveBranchDelGimnasio`
 * acepta `branchId: number | null` y devuelve `null` de inmediato SIN
 * consultar la base cuando es `null`: una sede nula no viola el invariante
 * `user.tenant_id === branch.tenant_id` (no hay branch con la que comparar).
 * El LLAMADOR decide qué hacer con ese `null` — este archivo no asume que
 * `null` sea un error. `assertBranchDelGimnasio` sí trata `null` como "sede no
 * encontrada", porque todo call site que necesita el `assert` está en un punto
 * donde hace falta una sede concreta (un alta, una edición de ficha).
 */
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import type { TxHandle } from "../finance/balance-service";
import { NotFoundError } from "./errors";
import { tenantWhere, type TenantContext } from "./tenant";

type DbInstance = MySql2Database<typeof schema>;
type DbOrTx = DbInstance | TxHandle;

/** La fila de `branches` ya validada contra el gimnasio del `ctx`. NO exportado. */
type BranchDelGimnasio = {
  id: number;
  tenantId: number;
  country: string;
  isVirtual: boolean;
};

/**
 * Resuelve una sede por id, filtrada por el gimnasio del `ctx` (D-05a).
 *
 * Devuelve `null` en TRES casos, indistinguibles a propósito (D-06):
 *   - `branchId` es `null` (ver docblock de cabecera: el llamador decide);
 *   - la sede no existe;
 *   - la sede existe pero es de OTRO gimnasio.
 * Nunca lanza. Nunca resuelve por nombre. Nunca decide un rechazo de "acceso
 * denegado": el llamador que recibe `null` es quien decide, y D-06 pide que
 * decida "no encontrado".
 */
export async function resolveBranchDelGimnasio(
  ctx: TenantContext,
  branchId: number | null,
  db: DbOrTx,
): Promise<BranchDelGimnasio | null> {
  if (branchId === null) return null;

  const [branch] = await db
    .select({
      id: schema.branches.id,
      tenantId: schema.branches.tenantId,
      country: schema.branches.country,
      isVirtual: schema.branches.isVirtual,
    })
    .from(schema.branches)
    .where(
      and(tenantWhere(schema.branches, ctx), eq(schema.branches.id, branchId)),
    )
    .limit(1);

  return branch ?? null;
}

/**
 * Igual que {@link resolveBranchDelGimnasio}, pero LANZA en vez de devolver
 * `null` cuando la sede no matchea (ajena, inexistente, o `branchId === null`).
 *
 * El error es el mismo `NotFoundError("Sede no encontrada")` que los 16 sitios
 * de escritura de ancla ya mapean a un rechazo de "recurso no encontrado" (ver
 * `members/service.ts:1099`, el precedente vivo) — CERO códigos de "acceso
 * denegado": una sede ajena tiene que verse EXACTAMENTE igual que una sede que
 * no existe (D-06, T-173-11-01/02).
 */
export async function assertBranchDelGimnasio(
  ctx: TenantContext,
  branchId: number | null,
  db: DbOrTx,
): Promise<BranchDelGimnasio> {
  const branch = await resolveBranchDelGimnasio(ctx, branchId, db);
  if (!branch) {
    throw new NotFoundError("Sede no encontrada");
  }
  return branch;
}
