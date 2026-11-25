// Module: aura
//
// "Aura ganada" (fase 214, D-02): todo lo que el ledger le acreditó a un usuario,
// neto de reversas y ajustes, SIN restar los canjes. Es distinta del saldo
// (`aura_balances.balance`): el saldo baja cuando el socio canjea puntos por un
// descuento de suscripción, y "ganada" no, porque mide lo que la persona se ganó
// entrenando y no lo que le queda para gastar.
//
// Canje = fila `manual_adjustment` con `reference_type = 'subscription'` (la
// registra `AuraService.spend` desde `pricing-benefits.ts`) o `subscription_discount`.
//
// Una sola definición para: `GET /auth/me` (número propio), la respuesta del
// check-in, la lista de anotados (plan 17) y el detalle de movimientos (plan 18).
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";
import { isModuleEnabled } from "../shared/module-flags";
import type { AuraSourceType } from "./types";

type DbInstance = MySql2Database<typeof schema>;

/** `SUM` de MySQL vuelve como string (DECIMAL): se normaliza a número. */
function toAmount(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Condición SQL de las filas del ledger que cuentan como Aura ganada: todas
 * menos `subscription_discount` y los canjes.
 *
 * Se escribe en SQL explícito con `<=>` (igualdad que tolera NULL) y NO con un
 * `ne(referenceType, 'subscription')` suelto: ese descartaría las filas con
 * `reference_type` NULL (onboarding, reversas), que sí son Aura ganada.
 */
export function earnedRowsFilter(): SQL {
  /* tenant-safe: fragmento de WHERE que solo nombra columnas, no lee filas. Quien lo usa lo combina SIEMPRE con tenantWhere(schema.auraTransactions, ctx) (earnedAuraByUsers y los planes 17 y 18) */
  return sql`NOT (${schema.auraTransactions.sourceType} = 'subscription_discount' OR (${schema.auraTransactions.sourceType} = 'manual_adjustment' AND ${schema.auraTransactions.referenceType} <=> 'subscription'))`;
}

/**
 * Aura ganada de N usuarios en UNA consulta. Los ids sin filas valen 0. Lista
 * vacía devuelve un Map vacío sin consultar.
 */
export async function earnedAuraByUsers(
  db: DbInstance,
  ctx: TenantContext,
  userIds: readonly number[],
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  if (userIds.length === 0) return result;

  const ids = [...new Set(userIds)];
  const rows = await db
    .select({
      userId: schema.auraTransactions.userId,
      earned: sql<number>`COALESCE(SUM(${schema.auraTransactions.amount}), 0)`,
    })
    .from(schema.auraTransactions)
    .where(
      and(
        tenantWhere(schema.auraTransactions, ctx),
        inArray(schema.auraTransactions.userId, ids),
        earnedRowsFilter(),
      ),
    )
    .groupBy(schema.auraTransactions.userId);

  for (const id of ids) result.set(id, 0);
  for (const row of rows) result.set(row.userId, toAmount(row.earned));
  return result;
}

/** Aura ganada de un usuario (ver `earnedAuraByUsers`). */
export async function earnedAuraForUser(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
): Promise<number> {
  const map = await earnedAuraByUsers(db, ctx, [userId]);
  return map.get(userId) ?? 0;
}

/**
 * Lo que el ledger registró para una referencia concreta (por ejemplo, una
 * asistencia). 0 si esa referencia no acreditó nada.
 */
export async function auraAwardedForReference(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  sourceType: AuraSourceType,
  referenceType: string,
  referenceId: number,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${schema.auraTransactions.amount}), 0)`,
    })
    .from(schema.auraTransactions)
    .where(
      and(
        tenantWhere(schema.auraTransactions, ctx),
        eq(schema.auraTransactions.userId, userId),
        eq(schema.auraTransactions.sourceType, sourceType),
        eq(schema.auraTransactions.referenceType, referenceType),
        eq(schema.auraTransactions.referenceId, referenceId),
      ),
    );
  return toAmount(row?.total);
}

/**
 * Aura ganada para MOSTRAR al lado de cada persona de una lista: la de anotados de
 * la app y el roster de Horarios del panel. Solo trae los ids con más de 0, y nada
 * si el gimnasio no tiene `templo-gamification`. Quien la usa hace
 * `map.get(id) ?? null`: null = no se muestra.
 */
export async function shownAuraByUsers(
  db: DbInstance,
  ctx: TenantContext,
  userIds: readonly number[],
): Promise<Map<number, number>> {
  const shown = new Map<number, number>();
  if (userIds.length === 0) return shown;
  if (!(await isModuleEnabled(ctx.tenantId, "templo-gamification", db))) {
    return shown;
  }
  const earned = await earnedAuraByUsers(db, ctx, userIds);
  for (const [userId, points] of earned) {
    if (points > 0) shown.set(userId, points);
  }
  return shown;
}
