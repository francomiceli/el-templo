/**
 * Cohort range + bucket helpers (Phase 120 FUND-05).
 *
 * Every strategic metric block (the ticket in Plan 04, then phases 121-123)
 * windows its data over a date range and buckets it weekly or monthly. This
 * module is the single shared place that range + bucket contract lives.
 *
 * HALF-OPEN RANGE (FUND-05): the panel passes `[from, to)`. The lower bound is
 * INCLUSIVE (`>= from`) and the upper bound is EXCLUSIVE (`< to`) — `to` itself is
 * NEVER included. This is the deliberate correction of the legacy INCLUSIVE
 * `<= dateTo` finance filter (advanced-finance-service.ts:186-195): an inclusive
 * upper bound double-counts boundary rows when two adjacent windows abut (the
 * `to` of window N == the `from` of window N+1), so the new cohort engine uses a
 * strict `<` upper bound to make windows tile without overlap.
 *
 * The default bucket (weekly vs monthly) is the CALLER'S choice — this module
 * imposes none.
 *
 * SQL-injection (T-120-07): range + bucket expressions are Drizzle `sql`
 * templates bound to a typed `AnyColumn` and parameterized `from`/`to` values;
 * `CohortBucket` is a constrained string-literal union — no raw user string is
 * ever interpolated into SQL.
 *
 * The UTC-anchored `dayDiff` and the month helpers (`monthStart`, `monthEnd`,
 * `nextMonth`) are copied from advanced-finance-service.ts:76-107 and re-exported
 * here so cohort math has ONE source. They use UTC midnight so DST / timezone
 * never shifts a count.
 *
 * No DB access, no logging, no `any`.
 */
import { sql, type SQL, type AnyColumn } from "drizzle-orm";

/** The selectable cohort bucketing granularity. */
export type CohortBucket = "daily" | "weekly" | "monthly";

const MS_PER_DAY = 86_400_000;

/**
 * Whole-day difference `b − a` (both `YYYY-MM-DD`). Positive when `b` is after
 * `a`. Uses UTC midnight so DST / timezone never shifts the count. Copied from
 * advanced-finance-service.ts:76-79 so cohort math has one source.
 *
 * @param a the earlier date (`YYYY-MM-DD`).
 * @param b the later date (`YYYY-MM-DD`).
 * @returns the signed whole-day delta `b − a`.
 */
export function dayDiff(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / MS_PER_DAY);
}

/**
 * First day of `month` (`YYYY-MM`) as `YYYY-MM-DD`. Copied from
 * advanced-finance-service.ts:89-92.
 *
 * @param month the month (`YYYY-MM`).
 * @returns the first day of that month (`YYYY-MM-DD`).
 */
export function monthStart(month: string): string {
  return `${month}-01`;
}

/**
 * Last day of `month` (`YYYY-MM`) as `YYYY-MM-DD`. Copied from
 * advanced-finance-service.ts:94-100.
 *
 * @param month the month (`YYYY-MM`).
 * @returns the last day of that month (`YYYY-MM-DD`).
 */
export function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  // Day 0 of the next month = last day of this month.
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Advance `YYYY-MM` to the next month. Copied from
 * advanced-finance-service.ts:102-107.
 *
 * @param month the month (`YYYY-MM`).
 * @returns the following month (`YYYY-MM`).
 */
export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1)); // m is 1-based → Date month index = m → next month
  return d.toISOString().slice(0, 7);
}

/**
 * Build the HALF-OPEN `[from, to)` range WHERE fragments for `dateColumn`
 * (FUND-05). The lower bound is INCLUSIVE (`>= from`) and the upper bound is
 * EXCLUSIVE (`< to`) — `to` itself is NEVER matched. Either bound is optional: an
 * undefined `from`/`to` simply omits that side (an unbounded window on that end).
 *
 * This is the deliberate departure from the legacy INCLUSIVE `<= dateTo` finance
 * filter (advanced-finance-service.ts:186-195) — there is NO `<=` against `to`
 * here, only a strict `<`.
 *
 * @param dateColumn the date/datetime column to bound.
 * @param from inclusive lower bound (`YYYY-MM-DD`), or `undefined` for no lower bound.
 * @param to EXCLUSIVE upper bound (`YYYY-MM-DD`), or `undefined` for no upper bound.
 * @returns the WHERE fragments to spread into the query's `and(...)`.
 */
export function rangeConditions(
  dateColumn: AnyColumn,
  from: string | undefined,
  to: string | undefined,
): SQL[] {
  const conditions: SQL[] = [];
  if (from !== undefined) {
    conditions.push(sql`${dateColumn} >= ${from}`);
  }
  if (to !== undefined) {
    // EXCLUSIVE upper bound — `to` is never included (half-open [from, to)).
    conditions.push(sql`${dateColumn} < ${to}`);
  }
  return conditions;
}

/**
 * Igual que {@link rangeConditions} pero con el borde superior INCLUSIVO
 * (`<= to`): el rango cerrado `[from, to]` del filtro financiero legacy.
 *
 * Existe por dos motivos, y el segundo es el que la trajo acá (fase 172, D-01):
 *
 *   1. DRY. El par de fragmentos `>= dateFrom` / `<= dateTo` sobre
 *      `financial_transactions.transaction_date` estaba escrito CINCO veces
 *      (`getRevenueTrend`, `getRevenueByMethod`, `getRevenueByBranch`,
 *      `sumRevenue` y `cashTrend`), y las cinco tienen que decir exactamente lo
 *      mismo o los ingresos de una pantalla dejan de cuadrar con los de otra.
 *
 *   2. El lint de tenancy razona por STATEMENT (`lint-tenant.ts`,
 *      `isCompliantText`). Un `sql` crudo que interpola una columna de una tabla
 *      gym-owned cuenta como acceso al statement donde está escrito, así que un
 *      arreglo de condiciones armado en su propio `const` exigía nombrar el
 *      gimnasio DOS veces —una en el arreglo y otra en el `and(...)` de la
 *      query— para quedar limpio. Con el rango acá adentro, la columna llega
 *      como PARÁMETRO: el único statement que nombra la tabla es la query, y
 *      ahí `tenantWhere(...)` va una sola vez y en primer término.
 *
 * NO reemplaza a `rangeConditions`: los dos bordes conviven a propósito porque
 * las métricas de cohorte usan la ventana semiabierta y las de caja la cerrada.
 * Elegir mal cambia la plata de un día entero, así que el nombre lo dice.
 *
 * @param dateColumn the date/datetime column to bound.
 * @param from inclusive lower bound (`YYYY-MM-DD`), or `undefined` for no lower bound.
 * @param to INCLUSIVE upper bound (`YYYY-MM-DD`), or `undefined` for no upper bound.
 * @returns the WHERE fragments to spread into the query's `and(...)`.
 */
export function inclusiveRangeConditions(
  dateColumn: AnyColumn,
  from: string | undefined,
  to: string | undefined,
): SQL[] {
  const conditions: SQL[] = [];
  if (from !== undefined) {
    conditions.push(sql`${dateColumn} >= ${from}`);
  }
  if (to !== undefined) {
    // INCLUSIVE upper bound — `to` SÍ entra (rango cerrado [from, to]).
    conditions.push(sql`${dateColumn} <= ${to}`);
  }
  return conditions;
}

/**
 * The SQL grouping expression that buckets `dateColumn` weekly or monthly.
 *
 *   - "monthly" → `DATE_FORMAT(col, '%Y-%m')` (e.g. `2026-06`).
 *   - "weekly"  → `DATE_FORMAT(col, '%x-W%v')`, the ISO year-week key (`%x` = ISO
 *                 week-based year, `%v` = ISO week number 01..53 with weeks
 *                 starting Monday) — e.g. `2026-W23`.
 *
 * @param dateColumn the date/datetime column to bucket.
 * @param bucket the granularity.
 * @returns the SQL expression to use in both `.select(...)` and `.groupBy(...)`.
 */
export function bucketExpr(
  dateColumn: AnyColumn,
  bucket: CohortBucket,
): SQL<string> {
  if (bucket === "monthly") {
    return sql<string>`DATE_FORMAT(${dateColumn}, '%Y-%m')`;
  }
  if (bucket === "daily") {
    return sql<string>`DATE_FORMAT(${dateColumn}, '%Y-%m-%d')`;
  }
  // weekly: ISO year-week, week starting Monday (%x year-of-week + %v week number).
  return sql<string>`DATE_FORMAT(${dateColumn}, '%x-W%v')`;
}
