/**
 * Reglas puras de tiempo y frecuencia del push de estiramiento post-clase
 * (fase 213). Sin base de datos y sin leer el reloj: `now` entra por parametro.
 *
 * D-10 (momento y disparador):
 *   - El push sale a fin de clase + offset del grupo (30 o 60 min).
 *   - Horario de silencio 21:30-08:00 hora de la sede. Si el calculo cae despues
 *     de las 21:30 se adelanta a las 21:30 solo si todavia quedan 15 min desde el
 *     fin de la clase; si no, no se manda. Nunca se pasa a la manana siguiente.
 *   - Interpretacion del silencio 21:30-08:00 para clases muy tempranas: una
 *     clase que termina antes de las 08:00 no recibe el push dentro del silencio
 *     de la manana; se corre a las 08:00 si todavia esta dentro de la ventana de
 *     120 min desde el fin, si no, no se manda.
 *   - Ventana de disparo: fin <= ahora < fin + 120 min.
 *
 * D-11 (tope de frecuencia):
 *   - Maximo 3 pushes encolados en los ultimos 7 dias locales ([hoy-6, hoy]).
 *   - Pausa de 14 dias tras 4 pushes seguidos sin abrir.
 *
 * D-16 (grupos del experimento): grupo fijo por alumno con
 *   crc32("stretch-v1:" + userId) % 100: 0-19 control, 20-59 push_30, 60-99 push_60.
 *
 * El job del push (plan 07) orquesta las consultas; toda la logica con casos
 * borde (zona horaria, 21:30, Madrid) vive aca.
 */
import { crc32 } from "node:zlib";
import type { StretchArm } from "../../db/schema/stretch";
import { buildClassDateTime, todayInTz } from "../shared/date-utils";
import { shiftDate } from "../shared/week-dates";

export const STRETCH_ARM_SALT = "stretch-v1:";
export const STRETCH_PUSH_OFFSET_MINUTES: Readonly<
  Record<"push_30" | "push_60", number>
> = { push_30: 30, push_60: 60 };
export const STRETCH_QUIET_START = "21:30";
export const STRETCH_QUIET_END = "08:00";
export const STRETCH_MIN_MINUTES_AFTER_END = 15;
export const STRETCH_PUSH_WINDOW_MINUTES = 120;
export const STRETCH_MAX_PUSHES_PER_7_DAYS = 3;
export const STRETCH_UNOPENED_STREAK_FOR_PAUSE = 4;
export const STRETCH_PAUSE_DAYS = 14;

/**
 * Valores de `stretch_offers.push_decision`. Los motivos de NO oferta
 * (actividad, sin horario, ROM, sin modulo) no crean fila y se cuentan en el
 * log del job (SPEC 5.2 "sin oferta").
 */
export type StretchPushDecision =
  | "queued"
  | "control"
  | "ya_empezo"
  | "plantilla_apagada"
  | "sin_token"
  | "categoria_apagada"
  | "tope_semanal"
  | "pausa_sin_abrir"
  | "fuera_de_horario"
  | "error_encolado"
  | "fallo_envio";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Bucket 0-99 del alumno (D-16). */
export function stretchBucket(userId: number): number {
  return crc32(STRETCH_ARM_SALT + userId) % 100;
}

/** Grupo del experimento del alumno (D-16). */
export function stretchArm(userId: number): StretchArm {
  const bucket = stretchBucket(userId);
  if (bucket < 20) return "control";
  if (bucket < 60) return "push_30";
  return "push_60";
}

/**
 * Instante del push (D-10), o null si no corresponde mandarlo.
 * `timezone` es la de la sede; las 21:30 y las 08:00 son hora de pared de la sede.
 */
export function computeStretchPushAt(params: {
  classEndAt: Date;
  offsetMinutes: number;
  timezone: string;
}): Date | null {
  const { classEndAt, offsetMinutes, timezone } = params;
  const endMs = classEndAt.getTime();
  const targetMs = endMs + offsetMinutes * MINUTE_MS;
  const localDate = todayInTz(timezone, classEndAt);

  const quietStart = buildClassDateTime(
    localDate,
    STRETCH_QUIET_START,
    timezone,
  );
  if (targetMs > quietStart.getTime()) {
    return quietStart.getTime() >=
      endMs + STRETCH_MIN_MINUTES_AFTER_END * MINUTE_MS
      ? quietStart
      : null;
  }

  const quietEnd = buildClassDateTime(localDate, STRETCH_QUIET_END, timezone);
  if (targetMs < quietEnd.getTime()) {
    return quietEnd.getTime() < endMs + STRETCH_PUSH_WINDOW_MINUTES * MINUTE_MS
      ? quietEnd
      : null;
  }

  return new Date(targetMs);
}

/** Ventana de disparo (D-10): fin <= ahora < fin + 120 min. */
export function isWithinPushWindow(now: Date, classEndAt: Date): boolean {
  const nowMs = now.getTime();
  const endMs = classEndAt.getTime();
  return (
    nowMs >= endMs && nowMs < endMs + STRETCH_PUSH_WINDOW_MINUTES * MINUTE_MS
  );
}

/**
 * Tope de frecuencia (D-11). `history` es la historia de ofertas del alumno SIN
 * la fila de hoy. Las filas sin `pushQueuedAt` (control, sin token) no cuentan.
 */
export function decideFrequencyBlock(
  history: ReadonlyArray<{
    localDate: string;
    pushQueuedAt: Date | null;
    pushOpenedAt: Date | null;
  }>,
  now: Date,
  todayLocal: string,
): "tope_semanal" | "pausa_sin_abrir" | null {
  const queued = history.filter(
    (h): h is typeof h & { pushQueuedAt: Date } => h.pushQueuedAt !== null,
  );

  const windowStart = shiftDate(todayLocal, -6);
  const inLast7Days = queued.filter((h) => h.localDate >= windowStart).length;
  if (inLast7Days >= STRETCH_MAX_PUSHES_PER_7_DAYS) return "tope_semanal";

  const lastFour = [...queued]
    .sort((a, b) => b.pushQueuedAt.getTime() - a.pushQueuedAt.getTime())
    .slice(0, STRETCH_UNOPENED_STREAK_FOR_PAUSE);
  if (
    lastFour.length === STRETCH_UNOPENED_STREAK_FOR_PAUSE &&
    lastFour.every((h) => h.pushOpenedAt === null) &&
    now.getTime() - lastFour[0].pushQueuedAt.getTime() <
      STRETCH_PAUSE_DAYS * DAY_MS
  ) {
    return "pausa_sin_abrir";
  }

  return null;
}
