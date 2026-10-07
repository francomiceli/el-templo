// Módulo: subscriptions — aritmética de fechas del prorrateo hasta fin de mes
//
// Funciones puras (sin I/O) extraídas de `service.ts` en 194-18 sin cambios de
// comportamiento: las comparten el alta prorrateada, su preview, la renovación
// prorrateada y la resolución de la base heredada (`renewal-base.ts`).

export function daysBetween(fromIso: string, toIso: string): number {
  const fromMs = new Date(fromIso).getTime();
  const toMs = new Date(toIso).getTime();
  return Math.round((toMs - fromMs) / (1000 * 60 * 60 * 24));
}

/**
 * Prorrateo hasta fin de mes de un alta. Dado un `startDate` "YYYY-MM-DD",
 * devuelve el último día de ese mes calendario (la vigencia del alta) y cuántos
 * días se cobran — el día del alta INCLUIDO — sobre los días del mes. Ej.: alta
 * el 2026-01-20 (enero, 31 días) → 12 días (20..31), endDate 2026-01-31.
 *
 * Parsea las partes de la fecha en vez de `new Date(str)` para no depender de la
 * zona horaria (una "YYYY-MM-DD" se interpreta como UTC y podría correrse un día
 * al construir el string de fin de mes en runtimes con TZ negativa).
 */
export function computeMonthEndProration(startDate: string): {
  endDate: string;
  daysCharged: number;
  daysInMonth: number;
} {
  const [year, month, day] = startDate.split("-").map(Number);
  // `month` viene 1-based del string; Date.UTC lo trata 0-based, así que
  // (year, month, 0) = día 0 del mes siguiente = último día del mes del alta.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const daysCharged = daysInMonth - day + 1;
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(
    daysInMonth,
  ).padStart(2, "0")}`;
  return { endDate, daysCharged, daysInMonth };
}

/**
 * Precio proporcional del alta hasta fin de mes:
 * `round(base * díasCobrados / díasDelMes)`. Fuente única del cálculo, la
 * comparte el endpoint de preview y el alta real.
 */
export function computeProratedPrice(
  basePrice: number,
  startDate: string,
): number {
  const { daysCharged, daysInMonth } = computeMonthEndProration(startDate);
  return Math.round((basePrice * daysCharged) / daysInMonth);
}

/**
 * ¿El período [startDate, endDate] es un prorrateo hasta fin de mes (alta o
 * renovación)? Su huella: vence el último día del mes de su inicio y dura menos
 * que el plan. Un período normal vence exactamente a `startDate + durationDays`,
 * y las pausas y compensaciones de días solo lo alargan. Exigir las DOS
 * condiciones evita confundir con un prorrateo a una sub corta por otro motivo
 * (import legacy, edición manual), que debe seguir heredando su precio. En un
 * período prorrateado `pricePaid` es un proporcional, no el mes completo.
 */
export function isMonthEndProratedPeriod(
  startDate: string,
  endDate: string | null,
  durationDays: number,
): boolean {
  return (
    endDate !== null &&
    endDate === computeMonthEndProration(startDate).endDate &&
    daysBetween(startDate, endDate) < durationDays
  );
}
