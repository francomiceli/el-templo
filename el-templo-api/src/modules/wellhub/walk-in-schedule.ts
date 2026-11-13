/**
 * Check-in de Wellhub SIN reserva: ¿a qué clase vino?
 *
 * El aviso `checkin` de Wellhub solo trae persona, sede, hora y producto
 * ("Clases"), nunca la clase. Cuando la persona no reservó, la única pista es
 * la hora. Regla (la misma del check-in QR del socio):
 *
 *   - candidatas: los horarios de la sede que Wellhub VENDE ese día
 *     (`loadPublishableSchedules` + `loadSkippedDates`, el criterio del sync:
 *     actividad activa, `wellhub_enabled`, no especial, sin excepción ni
 *     feriado);
 *   - la visita cae en la candidata cuyo INICIO esté a ≤ `CHECKIN_WINDOW_MS`
 *     (±20 min) de la hora del check-in;
 *   - si hay más de una, gana la de inicio más cercano; empate exacto → la que
 *     está por empezar (la persona llegó para esa);
 *   - si ninguna entra en la ventana, NO se adivina: la visita queda sin
 *     horario (vino fuera de clase, p. ej. el mediodía de Alberti).
 *
 * Solo se usa cuando NO hay reserva Wellhub del día: si la hay, manda la
 * reserva, como siempre.
 */
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
import type { TenantContext } from "../shared/tenant";
import { buildClassDateTime, dowInTz } from "../shared/date-utils";
import { CHECKIN_WINDOW_MS } from "../shared/checkin-window";
import { loadPublishableSchedules, loadSkippedDates } from "./eligibility";

type Db = MySql2Database<typeof schema>;

export interface WalkInCandidate {
  id: number;
  startTime: string;
}

/**
 * Elige la clase para un check-in sin reserva. Pura: recibe las candidatas ya
 * filtradas por día, excepciones y feriados.
 *
 * @param todayStr fecha local de la sede (YYYY-MM-DD) del check-in
 * @param tz zona horaria de la sede
 * @param now instante del check-in
 */
export function pickWalkInSchedule(
  candidates: WalkInCandidate[],
  todayStr: string,
  tz: string,
  now: Date,
  windowMs: number = CHECKIN_WINDOW_MS,
): number | null {
  let best: { id: number; distance: number; upcoming: boolean } | null = null;
  for (const c of candidates) {
    const start = buildClassDateTime(todayStr, c.startTime, tz).getTime();
    const diff = start - now.getTime();
    const distance = Math.abs(diff);
    if (distance > windowMs) continue;
    const upcoming = diff >= 0;
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && upcoming && !best.upcoming)
    ) {
      best = { id: c.id, distance, upcoming };
    }
  }
  return best?.id ?? null;
}

/**
 * Busca en la DB las clases que Wellhub vende hoy en la sede y elige la del
 * check-in. `null` = fuera de clase (o feriado, o sede sin grilla publicable).
 */
export async function resolveWalkInSchedule(
  db: Db,
  ctx: TenantContext,
  branch: { id: number; timezone: string; country: string },
  todayStr: string,
  now: Date,
): Promise<number | null> {
  const isoDow = dowInTz(branch.timezone, now);
  const todays = (await loadPublishableSchedules(db, ctx, branch.id)).filter(
    (s) => s.dayOfWeek === isoDow,
  );
  if (todays.length === 0) return null;

  const { exceptionKeys, holidayDates } = await loadSkippedDates(
    db,
    ctx,
    todays.map((s) => s.id),
    branch.country,
    todayStr,
    todayStr,
  );
  if (holidayDates.has(todayStr)) return null;

  const candidates = todays.filter(
    (s) => !exceptionKeys.has(`${s.id}:${todayStr}`),
  );
  return pickWalkInSchedule(candidates, todayStr, branch.timezone, now);
}
