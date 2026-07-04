/**
 * Shared date-range helpers for the Caja tabs (Phase 152, D-03).
 *
 * The `{ dateFrom, dateTo }` contract (both 'YYYY-MM-DD' or undefined) is what
 * `loadTransactions` / `loadHistory` consume, so both the month mode and the
 * day mode of `DateRangeFilter.vue` emit the SAME shape. Extracted here so the
 * two tabs and the shared control derive the default month identically (DRY —
 * the block used to be byte-duplicated across MovimientosTab / MovEgresosTab).
 */

export interface DateRangeValue {
  dateFrom: string | undefined;
  dateTo: string | undefined;
}

/** First/last calendar day of a 'YYYY-MM' month as a { dateFrom, dateTo } range. */
export function monthToRange(month: string): DateRangeValue {
  if (!month) return { dateFrom: undefined, dateTo: undefined };
  const [year, m] = month.split('-').map(Number);
  const dateFrom = `${year}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(year, m, 0).getDate();
  const dateTo = `${year}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { dateFrom, dateTo };
}

/** Range covering the current calendar month — the default of the date filter. */
export function currentMonthRange(): DateRangeValue {
  return monthToRange(new Date().toISOString().slice(0, 7));
}
