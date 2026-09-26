/**
 * Formateador PURO de la columna "Próxima acción" (cadencia de mensajes en
 * Sesiones de Prueba, brief Nacho 2026-09-26). Sin DB, sin `$q`, sin reloj
 * propio (`now` siempre inyectable) — testeable sin montar el componente.
 *
 * El admin NO tiene infraestructura de tests (vitest no es una dependencia
 * de `el-templo-admin/package.json`, no hay script `test`, y CI no corre
 * tests de admin — a diferencia de `el-templo-app`, que sí los tiene). Por
 * eso esta función vive igual como función pura en `src/utils/` (pedido
 * explícito) pero sin un archivo `__tests__` que nadie podría ejecutar.
 *
 * Formato (ejemplos del brief §4.3 / SPEC):
 *   "M1 · hoy turno mañana"   (upcoming, hoy)
 *   "M3a · vie turno tarde"   (upcoming, otro día — abreviatura de día)
 *   "M2b · ahora"             (due — corresponde YA, dentro de la ventana)
 *   "M3b · vencido hace 3 h"  (overdue — pasó el fin de la ventana)
 *   "—"                       (sin próxima acción)
 */
import { todayInTz } from './tz';
import type { TrialNextAction } from 'src/composables/useReportsApi';

const WEEKDAY_ABBR_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;

/** Hora local (0-23) de un instante en una tz IANA dada. */
function hourInTz(iso: string, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const raw = parts.find((p) => p.type === 'hour')?.value ?? '0';
  return Number(raw) % 24;
}

/** "hoy" si `iso` cae el mismo día que `now` en `tz`; si no, abreviatura de día (lun..dom). */
function formatDayLabel(iso: string, tz: string, now: Date): string {
  const dueYmd = todayInTz(tz, new Date(iso));
  const nowYmd = todayInTz(tz, now);
  if (dueYmd === nowYmd) return 'hoy';
  // noon UTC evita drift de día al leer el weekday de una fecha "YYYY-MM-DD".
  const dow = new Date(`${dueYmd}T12:00:00Z`).getUTCDay(); // 0=dom..6=sáb
  return WEEKDAY_ABBR_ES[dow]!;
}

/** "mañana"/"tarde" a partir de la hora local de referencia (pivote 14:00 — separa 07-11 de 17-21). */
function formatShiftLabel(iso: string, tz: string): 'mañana' | 'tarde' {
  return hourInTz(iso, tz) < 14 ? 'mañana' : 'tarde';
}

/** "3 min" / "3 h" / "3 d" — magnitud gruesa del tiempo vencido, redondeada, mínimo 1. */
function formatElapsed(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return `${days} d`;
}

/**
 * Formatea `nextAction` en español, en el huso horario de la sede de la
 * fila. `now` es inyectable para tests — default `new Date()`.
 */
export function formatNextAction(
  nextAction: TrialNextAction | null,
  timezone: string,
  now: Date = new Date()
): string {
  if (!nextAction) return '—';
  const { code, status } = nextAction;

  if (status === 'overdue') {
    // El "vencido hace" se mide desde el cierre de la ventana (windowEnd) —
    // fallback a dueAt si algún día existiera un código sin ventana (hoy no
    // ocurre, ver comentario de `TrialNextAction.windowEnd` en la API).
    const closedAt = nextAction.windowEnd ?? nextAction.dueAt;
    const elapsedMs = now.getTime() - new Date(closedAt).getTime();
    return `${code} · vencido hace ${formatElapsed(elapsedMs)}`;
  }

  if (status === 'due') {
    return `${code} · ahora`;
  }

  // upcoming: día (hoy / abreviatura) + turno. El turno se lee de windowEnd
  // (fin del turno de referencia) porque siempre representa "ese turno",
  // incluso para M3 (ver trial-cadence.ts en la API) — dueAt solo, en
  // cambio, podría caer justo en el borde de dos turnos.
  const shiftRef = nextAction.windowEnd ?? nextAction.dueAt;
  const dayLabel = formatDayLabel(nextAction.dueAt, timezone, now);
  const shiftLabel = formatShiftLabel(shiftRef, timezone);
  return `${code} · ${dayLabel} turno ${shiftLabel}`;
}
