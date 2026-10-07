/**
 * Días hábiles (Fase 194, D-15 / D-26d).
 *
 * REGLAS
 * ------
 * - Hábil = lunes a SÁBADO (el domingo no cuenta) y que no sea feriado.
 * - Los feriados son los del país de la SEDE del invitado (tabla `holidays`, por
 *   tenant y país).
 * - D-26d: el día de activación NO cuenta. Se empieza a contar desde el día
 *   siguiente, y `addBusinessDays(from, 10, ...)` devuelve el décimo día hábil
 *   posterior. La fecha devuelta es INCLUSIVA: es el último día en que el
 *   invitado puede reservar/entrenar (`end_date` de la sub, que el bloqueo de
 *   reservas compara con `date <= coveredUntil`).
 * - `n = 0` devuelve `from` (el propio día de activación).
 *
 * NOTA SOBRE LA EXPIRACIÓN EN UTC (preexistente, NO se cambia en la fase 194)
 * -------------------------------------------------------------------------
 * `autoExpireSubscriptions` compara `endDate < today` con `today` en UTC y
 * `recomputeUserStatus` usa `CURDATE()` de MySQL. En AR (UTC-3) cualquier sub
 * vence a las 21:00 locales de su `end_date`. Para el invitado, una clase de las
 * 21 h del último día hábil puede fallar en el check-in QR. Se mitiga con el
 * check-in forzado del profe; no se toca la expiración global.
 *
 * Las fechas son strings 'YYYY-MM-DD' en el calendario de la sede. La función es
 * PURA (sin reloj): quien la llama pasa `from` (normalmente `todayInTz(tz sede)`).
 */
import { and, eq, gte, lte } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type * as schema from "../../db/schema";
import { holidays } from "../../db/schema";
import { addDays } from "./date-utils";
import { tenantWhere, type TenantContext } from "./tenant";

type DbInstance = MySql2Database<typeof schema>;

/**
 * N-ésimo día hábil (lun-sáb, sin feriados) contando desde el día SIGUIENTE a
 * `fromDate` (D-26d). `holidays` son strings 'YYYY-MM-DD'.
 */
export function addBusinessDays(
  fromDate: string,
  n: number,
  holidays: ReadonlySet<string>,
): string {
  let d = fromDate;
  let count = 0;
  while (count < n) {
    d = addDays(d, 1);
    // getUTCDay: 0 = domingo. addDays opera a mediodía UTC, sin corrimientos.
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && !holidays.has(d)) count++;
  }
  return d;
}

/**
 * Días corridos máximos a cargar de feriados para resolver `n` días hábiles:
 * el peor caso (todo domingo + feriados) cabe holgado en `n * 2 + 14`. El
 * consumidor usa este número para el `toDate` de {@link loadHolidaySet} en vez
 * de inventar el suyo.
 */
export function businessDaysHorizon(n: number): number {
  return n * 2 + 14;
}

/**
 * Feriados del tenant en `country` entre `fromDate` y `toDate` (inclusivos),
 * en UNA sola query (sin N+1). Devuelve un Set de 'YYYY-MM-DD'.
 */
export async function loadHolidaySet(
  db: DbInstance,
  ctx: TenantContext,
  country: string,
  fromDate: string,
  toDate: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ date: holidays.date })
    .from(holidays)
    .where(
      and(
        tenantWhere(holidays, ctx),
        eq(holidays.country, country),
        gte(holidays.date, fromDate),
        lte(holidays.date, toDate),
      ),
    );
  return new Set(rows.map((r) => r.date));
}
