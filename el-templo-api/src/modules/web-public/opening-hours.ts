// Módulo: web-public — horarios publicados (Fase 195, D-08/D-30).
//
// Funciones PURAS (sin DB) que convierten la grilla de clases en las franjas de
// apertura que se publican. Las consume el endpoint de la web y, desde el plan
// 195-09, el sync de Google Business Profile: así web, schema y ficha de Google
// dicen lo mismo. No duplicar esta lógica en otro lado.
import type { WebOpeningHours } from "./types";

const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Hueco mínimo (minutos) a partir del cual dos franjas NO se fusionan. */
export const DEFAULT_GAP_MIN = 60;

function toMinutes(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function formatMinutes(total: number): string {
  const h = String(Math.floor(total / 60)).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Fusiona franjas horarias solapadas, contiguas o separadas por MENOS de
 * `gapMin` minutos. Descarta sin lanzar las entradas con hora inválida o con
 * fin <= inicio. La salida está ordenada por apertura.
 */
export function mergeIntervals(
  slots: ReadonlyArray<{ start: string; end: string }>,
  gapMin: number = DEFAULT_GAP_MIN,
): Array<{ opens: string; closes: string }> {
  const ranges: Array<[number, number]> = [];
  for (const slot of slots) {
    if (!TIME_PATTERN.test(slot.start) || !TIME_PATTERN.test(slot.end)) continue;
    const start = toMinutes(slot.start);
    const end = toMinutes(slot.end);
    if (end <= start) continue;
    ranges.push([start, end]);
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged: Array<[number, number]> = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start - last[1] < gapMin) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged.map(([start, end]) => ({
    opens: formatMinutes(start),
    closes: formatMinutes(end),
  }));
}

/**
 * Agrupa la grilla por día y devuelve las franjas de apertura fusionadas,
 * ordenadas por día y luego por apertura.
 */
export function computeOpeningHours(
  slots: ReadonlyArray<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }>,
): WebOpeningHours[] {
  const byDay = new Map<number, Array<{ start: string; end: string }>>();
  for (const slot of slots) {
    const list = byDay.get(slot.dayOfWeek) ?? [];
    list.push({ start: slot.startTime, end: slot.endTime });
    byDay.set(slot.dayOfWeek, list);
  }

  const result: WebOpeningHours[] = [];
  const days = [...byDay.keys()].sort((a, b) => a - b);
  for (const dayOfWeek of days) {
    for (const range of mergeIntervals(byDay.get(dayOfWeek) ?? [])) {
      result.push({ dayOfWeek, ...range });
    }
  }
  return result;
}

/**
 * Slug en minúsculas, sin diacríticos, con todo lo no alfanumérico convertido
 * en un único "-" y sin guiones en los bordes.
 */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
