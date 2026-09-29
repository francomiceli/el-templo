/**
 * Línea del pase especial (2026-09-29, yoga de Moreno) — FUENTE ÚNICA de la
 * regla "un pase especial solo habilita las actividades especiales de su
 * línea".
 *
 * `activities.special_line` y `subscription_plans.special_line` guardan el
 * mismo texto libre (p.ej. 'Yoga'). NULL es la línea "Actividades con Aura":
 * todas las especiales y pases anteriores a la columna quedan ahí, así que
 * nada cambia para ellos. Las actividades y planes NO especiales siempre
 * tienen NULL (los servicios la limpian al guardar).
 *
 * La comparación ignora mayúsculas y espacios de borde en JS, igual que la
 * collation ai_ci de MySQL en el lado SQL, para que 'yoga' y 'Yoga' nunca
 * queden como dos líneas distintas según qué capa compare.
 */

import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import * as schema from "../../db/schema";

/** Nombre visible de la línea NULL (la de siempre). */
export const DEFAULT_SPECIAL_LINE_LABEL = "Actividades con Aura";

/** Texto libre → valor a persistir: recorta y colapsa vacío a NULL. */
export function normalizeSpecialLine(
  value: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** ¿Misma línea? NULL solo coincide con NULL. */
export function sameSpecialLine(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeSpecialLine(a);
  const nb = normalizeSpecialLine(b);
  if (na === null || nb === null) return na === nb;
  return na.toLowerCase() === nb.toLowerCase();
}

/** Nombre visible de una línea (NULL → "Actividades con Aura"). */
export function specialLineLabel(line: string | null | undefined): string {
  return normalizeSpecialLine(line) ?? DEFAULT_SPECIAL_LINE_LABEL;
}

/**
 * Condición SQL "la columna `special_line` es la línea dada": NULL solo
 * coincide con NULL. Mayúsculas y acentos los resuelve la collation ai_ci.
 */
export function specialLineCondition(
  column: AnyMySqlColumn,
  line: string | null | undefined,
): SQL {
  const normalized = normalizeSpecialLine(line);
  return normalized === null ? isNull(column) : eq(column, normalized);
}

/**
 * Condición SQL "la actividad es del mismo tipo": misma categoría
 * (especial/regular) y, si es especial, misma línea. Tolera el LEFT JOIN a
 * `activities` de las asistencias sin horario (force check-in, self-scan):
 * `is_special` NULL cuenta como regular y `special_line` NULL como la línea
 * de siempre, igual que el `COALESCE` que usaban las guardas diarias.
 *
 * Las regulares tienen `special_line` NULL, así que el `IS NULL` las deja
 * pasar sin tratar el caso aparte.
 */
export function sameActivityKindSql(
  isSpecial: boolean,
  specialLine: string | null,
): SQL {
  /* tenant-safe: fragmento de WHERE, no una consulta. Siempre se compone
     dentro de queries que ya filtran su tabla ancla con tenantWhere (reserva,
     check-in, conteo de pendientes) */
  const kind = sql`COALESCE(${schema.activities.isSpecial}, false) = ${isSpecial}`;
  return and(
    kind,
    specialLineCondition(
      schema.activities.specialLine,
      isSpecial ? specialLine : null,
    ),
  ) as SQL;
}
