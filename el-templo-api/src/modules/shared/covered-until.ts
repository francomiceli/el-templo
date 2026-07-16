/**
 * Cobertura del socio ("hasta cuándo está pago") como expresión SQL correlacionada.
 *
 * FA-10 advierte que "hasta cuándo está cubierto" debe tener UNA implementación.
 * Tenía cuatro: scheduling, attendance, el listado de socios y su export. Las dos
 * primeras se arreglaron con el bug Joaquim Mas (2026-07-07); las dos de members
 * quedaron afuera y seguían mostrando "Venc" a socios ya renovados (9 de 136 con
 * chip en prod = 6,6% de falsos positivos, caso testigo Patricia Fortina 6627).
 * Este helper es esa única implementación — no escribas una quinta copia.
 *
 * Semántica (idéntica a la que fijó el bug Joaquim Mas):
 * - MÁXIMO `end_date`, no la sub más reciente por `created_at`: al incluir
 *   'scheduled' encadena el successor programado (renovación / cambio de plan
 *   "más adelante"), así un socio cubierto por continuidad NO figura "vence
 *   mañana".
 * - 'paused' se mantiene para no perder el pill de socios pausados. Por eso el
 *   set es más ancho que el de `deriveCoveredUntil` (active+scheduled), que
 *   decide si SUPRIMIR un push y no debe callarse por una sub pausada.
 * - `end_date IS NOT NULL` excluye filas legacy/manuales sin fecha (D-14), así
 *   la cobertura nunca se deriva de un NULL. Devuelve null si no hay ninguna
 *   sub con fecha.
 *
 * Correlaciona contra `users.id`, así que solo sirve en queries cuyo FROM sea
 * `users`. La columna va interpolada vía `schema.users.id` (calificada) porque
 * una columna sin calificar rompe la correlación en Drizzle.
 */

import { sql, type SQL } from "drizzle-orm";
import * as schema from "../../db/schema";

/** Fecha de cobertura (YYYY-MM-DD) del socio de la fila, o null. */
export function memberCoveredUntilSql(): SQL<string | null> {
  return sql<string | null>`(
      SELECT DATE_FORMAT(MAX(s.end_date), '%Y-%m-%d') FROM subscriptions s
      WHERE s.user_id = ${schema.users.id}
        AND s.subscription_status IN ('active','paused','scheduled')
        AND s.end_date IS NOT NULL
    )`;
}
