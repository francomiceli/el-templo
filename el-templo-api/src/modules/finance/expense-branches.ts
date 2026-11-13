// Módulo: finance — fase 209 (Egresos)
//
// Sedes operativas de Egresos y "hoy" según la zona de las sedes del país.
// Lecturas con `tenantWhere`: las sedes de otro gimnasio nunca son destinos
// (T-209-06).
import { and, asc, eq, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { DEFAULT_TENANT_TIMEZONE, todayInTz } from "../shared/date-utils";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import type { ExpenseCountry } from "./expense-types";

/** Etiqueta del destino sin sede (branch_id NULL en el reparto). */
export const CASA_MATRIZ_LABEL = "Casa Matriz";

/** Casa Matriz es un destino solo de gastos de Argentina (D-05). */
export function casaMatrizAllowed(country: ExpenseCountry): boolean {
  return country === "AR";
}

/**
 * Sedes operativas del país: activas, no virtuales, ordenadas por nombre.
 *
 * Es el ÚNICO criterio de "sedes operativas" de Egresos (destinos válidos del
 * reparto, partes iguales del admin, columnas del Resumen). El orden por
 * nombre (y luego id) define cuál es "la última sede", la que recibe el resto
 * de un reparto en partes iguales o de un prorrateo.
 */
export async function listOperationalBranches(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
  country: ExpenseCountry,
): Promise<Array<{ id: number; name: string; timezone: string }>> {
  return db
    .select({
      id: schema.branches.id,
      name: schema.branches.name,
      timezone: schema.branches.timezone,
    })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, ctx),
        eq(schema.branches.country, country),
        eq(schema.branches.isActive, true),
        eq(schema.branches.isVirtual, false),
      ),
    )
    .orderBy(asc(schema.branches.name), asc(schema.branches.id));
}

/**
 * TODAS las sedes del gimnasio en el país (activas o no, virtuales o no), por
 * id. Sirve para saber si la sede de un cobro es del país (DI-03) y para marcar
 * columnas inactivas o virtuales (DI-06). Con `tenantWhere`: las sedes de otro
 * gimnasio nunca aparecen.
 */
export async function listCountryBranches(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
  country: ExpenseCountry,
): Promise<
  Map<
    number,
    { id: number; name: string; isActive: boolean; isVirtual: boolean }
  >
> {
  const rows = await db
    .select({
      id: schema.branches.id,
      name: schema.branches.name,
      isActive: schema.branches.isActive,
      isVirtual: schema.branches.isVirtual,
    })
    .from(schema.branches)
    .where(
      and(
        tenantWhere(schema.branches, ctx),
        eq(schema.branches.country, country),
      ),
    )
    .orderBy(asc(schema.branches.name), asc(schema.branches.id));
  const result = new Map<
    number,
    { id: number; name: string; isActive: boolean; isVirtual: boolean }
  >();
  for (const r of rows) {
    result.set(r.id, {
      id: r.id,
      name: r.name,
      isActive: !!r.isActive,
      isVirtual: !!r.isVirtual,
    });
  }
  return result;
}

/**
 * Nombre y estado de sedes por id. Incluye inactivas: sirve para mostrar
 * repartos históricos. `ids` vacío devuelve un Map vacío sin consultar.
 */
export async function branchNamesByIds(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
  ids: number[],
): Promise<Map<number, { name: string; isActive: boolean }>> {
  const result = new Map<number, { name: string; isActive: boolean }>();
  if (ids.length === 0) return result;
  const rows = await db
    .select({
      id: schema.branches.id,
      name: schema.branches.name,
      isActive: schema.branches.isActive,
    })
    .from(schema.branches)
    .where(
      and(tenantWhere(schema.branches, ctx), inArray(schema.branches.id, ids)),
    );
  for (const r of rows) {
    result.set(r.id, { name: r.name, isActive: !!r.isActive });
  }
  return result;
}

/**
 * "Hoy" (`YYYY-MM-DD`) en la zona de la primera sede operativa del país, o en
 * `DEFAULT_TENANT_TIMEZONE` si no hay ninguna. Supuesto: todas las sedes de un
 * país comparten zona horaria.
 */
export async function countryToday(
  db: MySql2Database<typeof schema>,
  ctx: TenantContext,
  country: ExpenseCountry,
): Promise<string> {
  const branches = await listOperationalBranches(db, ctx, country);
  const tz = branches[0]?.timezone ?? DEFAULT_TENANT_TIMEZONE;
  return todayInTz(tz);
}
