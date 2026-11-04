/**
 * Sedes que cargan leads en el Tablero (fase 206, D-24/D-25): las sedes ACTIVAS
 * y FÍSICAS del gimnasio. Las virtuales (Online) no tienen leads. Es la misma
 * regla que `saveLeads` aplica al guardar y la que dibuja la fila de leads (una
 * celda por sede física visible). Fuente única: la usan `saveLeads` y el
 * detector de Oficina "leads sin cargar" (`office/auto-topics.ts`).
 */
import { and, asc, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";

/** `true` si una sede carga leads: activa y no virtual. */
export function isLeadsBranch(branch: {
  isActive: boolean;
  isVirtual: boolean;
}): boolean {
  return branch.isActive && !branch.isVirtual;
}

/**
 * Sedes del gimnasio que cargan leads, por nombre. Sin filtro de país ni de
 * rol: es la lista del gimnasio entero (la vista del Tablero la recorta por
 * rol, pero un tema de Oficina es del gimnasio, no de un país).
 */
export async function loadLeadsBranches(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
): Promise<Array<{ id: number; name: string }>> {
  return db
    .select({ id: schema.branches.id, name: schema.branches.name })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, ctx),
        eq(schema.branches.isActive, true),
        eq(schema.branches.isVirtual, false),
      ),
    )
    .orderBy(asc(schema.branches.name), asc(schema.branches.id));
}
