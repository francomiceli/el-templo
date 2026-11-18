// Module: aura
//
// Tope del día de la Aura (fase 214, D-64): entre asistir a clase (5), entrenar en
// la app (3) y el plan a medida (3) el día paga solo la de más valor, nunca más de 5.
//
// Estas son las lecturas del ledger que comparten los cierres de la app (plan 08,
// que no acreditan si ya hay asistencia o la otra fuente de la app) y la asistencia
// (plan 10, que acredita solo la diferencia hasta 5 cuando la app fue primero).
//
// "Asistió" = una asistencia que ACREDITÓ Aura: fila de `aura_transactions` con
// `source_type = 'attendance'` y `reference_id = attendance.id` cuya fila de
// `attendance` sigue existiendo ese día. Una visita Wellhub o el auto-registro de un
// profe no acreditan y no cuentan. Una asistencia deshecha borra la fila de
// `attendance`, así que el JOIN deja de encontrarla y deja de contar.
import { and, eq, ne, or, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import { tenantWhere, type TenantContext } from "../shared/tenant";

type DbInstance = MySql2Database<typeof schema>;

/**
 * Fuentes de la app que comparten el tope del día. El ledger las guarda con
 * `reference_id = YYYYMMDD` local (ver `daily-award.ts`).
 */
export const DAY_CAP_APP_SOURCES = [
  { sourceType: "training_completion", referenceType: "training_day" },
  { sourceType: "goal_plan_completion", referenceType: "goal_plan_day" },
] as const;

export type DayCapAppSource =
  (typeof DAY_CAP_APP_SOURCES)[number]["sourceType"];

/** `SUM` de MySQL vuelve como string (DECIMAL): se normaliza a número. */
function toAmount(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Aura que acreditaron las asistencias del socio en el día local `localDate`
 * (`YYYY-MM-DD`). `excludeAttendanceId` deja afuera una asistencia (la que se está
 * acreditando o deshaciendo en ese momento).
 */
export async function attendanceAuraOnLocalDay(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  localDate: string,
  opts?: { excludeAttendanceId?: number },
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${schema.auraTransactions.amount}), 0)`,
    })
    .from(schema.attendance)
    .innerJoin(
      schema.auraTransactions,
      eq(schema.auraTransactions.referenceId, schema.attendance.id),
    )
    .where(
      and(
        tenantWhere(schema.attendance, ctx),
        tenantWhere(schema.auraTransactions, ctx),
        eq(schema.attendance.memberId, userId),
        eq(schema.attendance.sessionDate, localDate),
        eq(schema.auraTransactions.userId, userId),
        eq(schema.auraTransactions.sourceType, "attendance"),
        eq(schema.auraTransactions.referenceType, "attendance"),
        opts?.excludeAttendanceId !== undefined
          ? ne(schema.attendance.id, opts.excludeAttendanceId)
          : undefined,
      ),
    );
  return toAmount(row?.total);
}

/**
 * Aura que el socio ya cobró ese día local por la app (entrenamiento y/o plan a
 * medida). Con `onlySource` se mira una sola de las dos fuentes.
 */
export async function appAuraOnLocalDay(
  db: DbInstance,
  ctx: TenantContext,
  userId: number,
  localDate: string,
  opts?: { onlySource?: DayCapAppSource },
): Promise<number> {
  const sources = DAY_CAP_APP_SOURCES.filter(
    (s) => !opts?.onlySource || s.sourceType === opts.onlySource,
  );
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${schema.auraTransactions.amount}), 0)`,
    })
    .from(schema.auraTransactions)
    .where(
      and(
        tenantWhere(schema.auraTransactions, ctx),
        eq(schema.auraTransactions.userId, userId),
        eq(
          schema.auraTransactions.referenceId,
          Number(localDate.replace(/-/g, "")),
        ),
        or(
          ...sources.map((s) =>
            and(
              eq(schema.auraTransactions.sourceType, s.sourceType),
              eq(schema.auraTransactions.referenceType, s.referenceType),
            ),
          ),
        ),
      ),
    );
  return toAmount(row?.total);
}
