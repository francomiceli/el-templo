/**
 * Agrupa la grilla de clases de una sede para mostrarla compacta (pagina de
 * sede, fase 195). Funcion PURA: sin Vue, sin Nuxt, sin fechas del sistema.
 *
 * Reglas:
 * - Dentro de un dia, una entrada por actividad (y duracion) con sus horas de
 *   inicio ordenadas.
 * - Dos dias se agrupan si tienen exactamente las mismas entradas (misma
 *   actividad, mismas horas, misma duracion).
 * - Los dias agrupados se escriben como "Lunes a viernes" (3+ consecutivos),
 *   "Lunes y martes" (2 consecutivos) o "Lunes, miercoles y viernes".
 * - Orden lunes -> domingo (por el primer dia de cada grupo). Dias sin clases
 *   no aparecen.
 * - La duracion se muestra cuando no es de 60 min, o cuando una misma
 *   actividad tiene duraciones distintas (para no ambiguar las entradas).
 *
 * Solo `import type` de los tipos: el archivo corre tal cual en Node para los
 * tests (scripts/group-schedule.test.mjs).
 */
import type { WebScheduleSlot } from "~/data/web-data.types";

export interface ScheduleActivityRow {
  activity: string;
  /** Horas de inicio "HH:MM", ordenadas. */
  times: string[];
  /** Minutos de duracion, o null si no se pudo calcular. */
  durationMinutes: number | null;
  /** "45 min", "2 h", "1 h 30 min"; null si no hay que mostrarla. */
  durationLabel: string | null;
}

export interface ScheduleGroup {
  /** Dias del grupo (1 = lunes .. 7 = domingo), ascendentes. */
  days: number[];
  /** "Lunes a viernes", "Sábado", "Lunes, miércoles y viernes". */
  label: string;
  rows: ScheduleActivityRow[];
}

const DAY_NAMES: Record<number, string> = {
  1: "lunes",
  2: "martes",
  3: "miércoles",
  4: "jueves",
  5: "viernes",
  6: "sábado",
  7: "domingo",
};

const STANDARD_DURATION_MINUTES = 60;

function toMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Minutos entre inicio y fin (si el fin es <= inicio, cruza medianoche). */
function durationOf(slot: WebScheduleSlot): number | null {
  const start = toMinutes(slot.startTime);
  const end = toMinutes(slot.endTime);
  if (start === null || end === null) return null;
  const diff = end > start ? end - start : end + 24 * 60 - start;
  return diff;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function dayName(day: number | undefined): string {
  return (day !== undefined && DAY_NAMES[day]) || "";
}

/** "lunes", "lunes y martes", "lunes a viernes", "lunes a miercoles y viernes". */
export function formatDays(days: number[]): string {
  // Corridas de dias consecutivos.
  const runs: number[][] = [];
  for (const day of days) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === day - 1) last.push(day);
    else runs.push([day]);
  }
  // 3+ consecutivos -> "x a y"; el resto, uno por uno.
  const parts: string[] = [];
  for (const run of runs) {
    if (run.length >= 3) {
      parts.push(`${dayName(run[0])} a ${dayName(run[run.length - 1])}`);
    } else {
      for (const day of run) parts.push(dayName(day));
    }
  }
  const text =
    parts.length <= 1
      ? (parts[0] ?? "")
      : `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
  return capitalize(text);
}

interface DayEntry {
  activity: string;
  durationMinutes: number | null;
  times: string[];
}

function entriesOfDay(slots: WebScheduleSlot[]): DayEntry[] {
  const byKey = new Map<string, DayEntry>();
  for (const slot of slots) {
    const durationMinutes = durationOf(slot);
    const key = `${slot.activity}|${durationMinutes ?? "?"}`;
    const entry = byKey.get(key) ?? {
      activity: slot.activity,
      durationMinutes,
      times: [],
    };
    if (!entry.times.includes(slot.startTime)) entry.times.push(slot.startTime);
    byKey.set(key, entry);
  }
  const entries = [...byKey.values()];
  for (const entry of entries) entry.times.sort();
  // Cronologico por primera hora; desempate estable por nombre y duracion.
  return entries.sort(
    (a, b) =>
      (a.times[0] ?? "").localeCompare(b.times[0] ?? "") ||
      a.activity.localeCompare(b.activity) ||
      (a.durationMinutes ?? -1) - (b.durationMinutes ?? -1),
  );
}

function signatureOf(entries: DayEntry[]): string {
  return JSON.stringify(
    entries.map((e) => [e.activity, e.durationMinutes, e.times]),
  );
}

export function groupSchedule(schedule: WebScheduleSlot[]): ScheduleGroup[] {
  // Actividades con mas de una duracion en toda la grilla: mostrar siempre.
  const durationsByActivity = new Map<string, Set<number | null>>();
  for (const slot of schedule) {
    const set = durationsByActivity.get(slot.activity) ?? new Set();
    set.add(durationOf(slot));
    durationsByActivity.set(slot.activity, set);
  }

  const days = [...new Set(schedule.map((s) => s.dayOfWeek))]
    .filter((d) => d in DAY_NAMES)
    .sort((a, b) => a - b);

  const bySignature = new Map<
    string,
    { days: number[]; entries: DayEntry[] }
  >();
  for (const day of days) {
    const entries = entriesOfDay(schedule.filter((s) => s.dayOfWeek === day));
    const signature = signatureOf(entries);
    const group = bySignature.get(signature) ?? { days: [], entries };
    group.days.push(day);
    bySignature.set(signature, group);
  }

  return [...bySignature.values()]
    .sort((a, b) => (a.days[0] ?? 0) - (b.days[0] ?? 0))
    .map((group) => ({
      days: group.days,
      label: formatDays(group.days),
      rows: group.entries.map((entry) => {
        const mixed = (durationsByActivity.get(entry.activity)?.size ?? 0) > 1;
        const showDuration =
          entry.durationMinutes !== null &&
          (mixed || entry.durationMinutes !== STANDARD_DURATION_MINUTES);
        return {
          activity: entry.activity,
          times: entry.times,
          durationMinutes: entry.durationMinutes,
          durationLabel:
            showDuration && entry.durationMinutes !== null
              ? formatDuration(entry.durationMinutes)
              : null,
        };
      }),
    }));
}
