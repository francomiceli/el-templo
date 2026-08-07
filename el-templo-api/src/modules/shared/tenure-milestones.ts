/**
 * Aniversarios de permanencia ("hitos de tenure") — lógica pura y compartida.
 *
 * Un alumno cumple hitos de antigüedad en El Templo a partir de su alta
 * (users.createdAt): 3 meses, 6 meses, 1 año, y de ahí en más cada aniversario
 * ANUAL (2 años, 3 años, ...). No hay hitos "y medio" después del año.
 *
 * Igual que `computeSeniority` (Fase 136) y el Sello de Veterano, esto NUNCA se
 * persiste como estado propio: se deriva on-the-fly de createdAt. La ÚNICA marca
 * persistida es el asiento en `aura_transactions` que deja el job de push+Aura
 * (referenceType="tenure_milestone", referenceId=<meses>), que sirve además como
 * candado de idempotencia — no hace falta una tabla de "logros".
 *
 * Precisión: se compara a nivel de fecha CALENDARIO en UTC (mismo criterio naive
 * que computeSeniority). Para un alta cerca de medianoche puede haber ±1 día de
 * corrimiento respecto de la hora local de la sede; es una tolerancia aceptada
 * para un feature de reconocimiento (igual que la aproximación de importados
 * legacy: para ellos createdAt es la fecha de import, no la real).
 */

/** Meses de los dos primeros hitos sub-anuales. */
const SUB_YEAR_MILESTONES = [3, 6] as const;

/**
 * ¿`months` es un hito de aniversario válido?
 * Válidos: 3, 6, y cualquier múltiplo de 12 desde 12 (1 año, 2 años, ...).
 */
export function isMilestone(months: number): boolean {
  if (!Number.isInteger(months) || months <= 0) return false;
  if (SUB_YEAR_MILESTONES.includes(months as 3 | 6)) return true;
  return months >= 12 && months % 12 === 0;
}

/**
 * Puntos de Aura que regala cada hito (decisión Franco 2026-08-06):
 * 3m=50, 6m=100, 1 año=250, y cada año siguiente=250 fijo. El default supera
 * al premio automático más alto que existía (racha de 100 días = 200), para que
 * el aniversario se sienta como el reconocimiento más grande.
 */
export function milestoneAura(months: number): number {
  if (months === 3) return 50;
  if (months === 6) return 100;
  return 250; // 12, 24, 36, ...
}

/**
 * Label corto y humano del hito en español: "3 meses", "6 meses", "1 año",
 * "2 años", ... Se usa tal cual en la línea de asistencia, el push y la
 * descripción del asiento de Aura, para que la copy sea consistente.
 */
export function formatMilestoneLabel(months: number): string {
  if (months < 12) return `${months} meses`;
  const years = Math.floor(months / 12);
  return years === 1 ? "1 año" : `${years} años`;
}

// ─── Aritmética de calendario (UTC, sin dependencias externas) ───────────────

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Normaliza una fecha (Date | string ISO | "YYYY-MM-DD") a "YYYY-MM-DD" en UTC.
 * Devuelve null si es inválida o nula (defensivo, igual que computeSeniority).
 */
export function toUtcDateStr(
  value: Date | string | null | undefined,
): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  const ms = d.getTime();
  if (Number.isNaN(ms)) return null;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate(),
  )}`;
}

/**
 * Suma `months` meses a una fecha "YYYY-MM-DD", recortando el día al último día
 * del mes destino cuando corresponde (ej: 31-ene + 1 mes = 28/29-feb). Este
 * recorte es la semántica estándar de "aniversario mensual": para un alta el 31,
 * los meses de 30 días caen el 30 y febrero el 28/29.
 */
export function addMonthsClamped(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const monthIndex = m - 1 + months;
  const ty = y + Math.floor(monthIndex / 12);
  const tm = ((monthIndex % 12) + 12) % 12; // 0-indexed, seguro para negativos
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const td = Math.min(d, lastDay);
  return `${ty}-${pad2(tm + 1)}-${pad2(td)}`;
}

/**
 * Si `toStr` es EXACTAMENTE el aniversario de `fromStr` a los N meses (con el
 * recorte de fin de mes de addMonthsClamped), devuelve N; si no, null.
 */
export function monthsElapsedExact(
  fromStr: string,
  toStr: string,
): number | null {
  const [fy, fm] = fromStr.split("-").map(Number);
  const [ty, tm] = toStr.split("-").map(Number);
  const n = (ty - fy) * 12 + (tm - fm);
  if (n <= 0) return null;
  return addMonthsClamped(fromStr, n) === toStr ? n : null;
}

// ─── Detección de hitos ──────────────────────────────────────────────────────

export interface Milestone {
  /** Meses de antigüedad del hito (3, 6, 12, 24, ...). */
  months: number;
  /** Label corto ("6 meses", "1 año"). */
  label: string;
  /** Puntos de Aura del hito. */
  aura: number;
}

function makeMilestone(months: number): Milestone {
  return {
    months,
    label: formatMilestoneLabel(months),
    aura: milestoneAura(months),
  };
}

/**
 * ¿El alumno con alta `createdAt` cumple un hito EXACTAMENTE en `targetDate`?
 * Devuelve el hito o null. Usado por la cartelera y el job (comparación de día).
 */
export function milestoneOnDate(
  createdAt: Date | string | null | undefined,
  targetDate: string,
): Milestone | null {
  const createdStr = toUtcDateStr(createdAt);
  if (createdStr === null) return null;
  const n = monthsElapsedExact(createdStr, targetDate);
  if (n === null || !isMilestone(n)) return null;
  return makeMilestone(n);
}

/**
 * Hito más significativo cuyo aniversario cae en la ventana `(fromExclusive,
 * toInclusive]`. Devuelve el de MAYOR antigüedad si hay más de uno (ausencia
 * larga que cruza varios), null si ninguno.
 *
 * Esta es la mecánica de la línea de asistencia: la ventana va desde la clase
 * anterior del alumno (exclusiva) hasta la clase de hoy (inclusiva). Así el
 * aviso aparece el día justo si vino, o en su PRÓXIMA clase si el día exacto
 * cayó en falta — y exactamente una vez, sin persistir nada (los límites son
 * asistencias, que sí son hechos persistidos).
 */
export function milestoneInWindow(
  createdAt: Date | string | null | undefined,
  fromExclusive: string,
  toInclusive: string,
): Milestone | null {
  const createdStr = toUtcDateStr(createdAt);
  if (createdStr === null) return null;
  if (fromExclusive >= toInclusive) return null;

  // Antigüedad (en meses enteros) al final de la ventana: cota superior de los
  // hitos a considerar. Si es < 3, no hay ningún hito posible todavía.
  const [cy, cm] = createdStr.split("-").map(Number);
  const [ty, tm, td] = toInclusive.split("-").map(Number);
  let maxMonths = (ty - cy) * 12 + (tm - cm);
  if (td < Number(createdStr.split("-")[2])) maxMonths -= 1; // aún no llegó al día
  if (maxMonths < 3) return null;

  let best: Milestone | null = null;
  for (let months = 3; months <= maxMonths; months = nextMilestone(months)) {
    const anniv = addMonthsClamped(createdStr, months);
    if (anniv > fromExclusive && anniv <= toInclusive) {
      best = makeMilestone(months); // el loop es ascendente → queda el mayor
    }
  }
  return best;
}

/** Siguiente hito después de `months` en la secuencia 3, 6, 12, 24, 36, ... */
function nextMilestone(months: number): number {
  if (months === 3) return 6;
  if (months === 6) return 12;
  return months + 12;
}
