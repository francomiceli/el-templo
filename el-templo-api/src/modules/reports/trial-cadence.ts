/**
 * Motor de cadencia de mensajes en Sesiones de Prueba (brief Nacho,
 * 2026-09-26). Funciones PURAS — sin DB, sin reloj propio (`now` siempre
 * inyectado) — para que sean unit-testeables sin MySQL. Ver
 * `test/reports/trial-cadence.test.ts`.
 *
 * Fuente de reglas: SPEC en scratchpad (sección "DECISIONES DE FRANCO"
 * MANDA sobre el diseño original). Puntos clave:
 *   - NO existe el estado "Asistencia sin cargar". Antes del fin de la clase
 *     → Agendada. Clase TERMINADA sin presente → No asistió (D-01).
 *   - Ganada/Perdida se derivan de `users.lead_status` aplicado a la ÚLTIMA
 *     sesión de la cadena de reagendas; las sesiones ancestro (con hija)
 *     muestran Reagendada SIEMPRE, incluso si el lead ya es ganado/perdido.
 *   - Faltar a la última reagenda PERMITIDA (sin más reagendas disponibles)
 *     deriva Perdida automáticamente, sin mensaje ni motivo (D-02).
 *   - Días hábiles para M1: lun-vie mañana+tarde, sáb solo mañana, dom nada
 *     (constante en código, D-04).
 *
 * Días hábiles: lun-vie ambos turnos, sáb solo mañana, dom ninguno. Ver
 * {@link hasMorningShift} / {@link hasAfternoonShift}.
 */
import { buildClassDateTime, addDays } from "../shared/date-utils";

// ─── Turnos por sede ────────────────────────────────────────────────────────

/** Franjas de turno de una sede (columnas `branches.trial_*`), "HH:MM" o "HH:MM:SS". */
export interface TrialShiftConfig {
  morningStart: string;
  morningEnd: string;
  afternoonStart: string;
  afternoonEnd: string;
}

/** Normaliza "HH:MM:SS" (lo que devuelve MySQL TIME) a "HH:MM" para `buildClassDateTime`. */
function hhmm(t: string): string {
  return t.slice(0, 5);
}

/** ISO día de semana (1=lun..7=dom) de una fecha "YYYY-MM-DD", noon-UTC. */
function isoDow(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00Z").getUTCDay(); // 0=dom..6=sáb
  return d === 0 ? 7 : d;
}

/** Lun-sáb tienen turno mañana; domingo no (brief §"Fin de semana"). */
export function hasMorningShift(dow: number): boolean {
  return dow >= 1 && dow <= 6;
}

/** Solo lun-vie tienen turno tarde — sábado es "solo mañana" (D-04). */
export function hasAfternoonShift(dow: number): boolean {
  return dow >= 1 && dow <= 5;
}

export type ShiftName = "morning" | "afternoon";

/** Un turno concreto: fecha + cuál de los dos. */
export interface ShiftRef {
  date: string;
  shift: ShiftName;
}

/** Instante UTC de inicio/fin de un turno concreto, en la tz de la sede. */
function shiftBounds(
  ref: ShiftRef,
  shifts: TrialShiftConfig,
  tz: string,
): { start: Date; end: Date } {
  const [startStr, endStr] =
    ref.shift === "morning"
      ? [shifts.morningStart, shifts.morningEnd]
      : [shifts.afternoonStart, shifts.afternoonEnd];
  return {
    start: buildClassDateTime(ref.date, hhmm(startStr), tz),
    end: buildClassDateTime(ref.date, hhmm(endStr), tz),
  };
}

/**
 * El turno hábil más reciente estrictamente ANTERIOR a (date, 'morning') —
 * "el último turno hábil anterior a la sesión" (brief §4.1). Usado por M1
 * cuando la sesión es de mañana. Acotado a 8 pasos hacia atrás (domingo es el
 * único día sin turnos, nunca dos seguidos).
 */
function previousBusinessShift(date: string): ShiftRef {
  let cursor = date;
  for (let i = 0; i < 8; i++) {
    cursor = addDays(cursor, -1);
    const dow = isoDow(cursor);
    if (hasAfternoonShift(dow)) return { date: cursor, shift: "afternoon" };
    if (hasMorningShift(dow)) return { date: cursor, shift: "morning" };
    // domingo: sin turnos, seguir retrocediendo.
  }
  // Inalcanzable con las reglas actuales (nunca hay 8 días sin turno hábil).
  throw new Error(`No se encontró turno hábil anterior a ${date}`);
}

/**
 * Recorre turnos hábiles desde HOY (en la tz de la sede) hacia adelante y
 * devuelve el fin del PRIMERO cuyo fin sea >= `now` — el turno "actual o
 * siguiente" (brief §4.3 "Pendientes de este turno": "fuera de franja → el
 * próximo turno"). Acotado a 14 días.
 */
export function resolveActiveShiftEnd(
  now: Date,
  tz: string,
  shifts: TrialShiftConfig,
): Date {
  const todayLocal = now.toLocaleDateString("en-CA", { timeZone: tz });
  let cursor = todayLocal;
  for (let i = 0; i < 14; i++) {
    const dow = isoDow(cursor);
    const candidates: ShiftName[] = [];
    if (hasMorningShift(dow)) candidates.push("morning");
    if (hasAfternoonShift(dow)) candidates.push("afternoon");
    for (const shift of candidates) {
      const { end } = shiftBounds({ date: cursor, shift }, shifts, tz);
      if (end.getTime() >= now.getTime()) return end;
    }
    cursor = addDays(cursor, 1);
  }
  throw new Error("No se encontró un turno futuro dentro de 14 días");
}

// ─── computeNextAction ──────────────────────────────────────────────────────

export type TrialMessageCode = "M1" | "M2a" | "M2b" | "M3a" | "M3b";
export type TrialActionStatus = "upcoming" | "due" | "overdue";

export interface TrialNextAction {
  code: TrialMessageCode;
  /** ISO instant desde cuando corresponde el mensaje. */
  dueAt: string;
  /**
   * ISO instant del cierre "duro" de la ventana (fin de turno), o `null`
   * cuando el mensaje no tiene ventana propia (M3: "sin próxima acción" recién
   * después de enviarlo, no hay un cierre automático — SPEC no define uno).
   * Deviación documentada: `status` solo puede ser 'overdue' cuando
   * `windowEnd` existe y ya pasó; para M3 el status se mantiene en 'due'
   * indefinidamente tras `dueAt` — el front decide cómo mostrar "vencido hace
   * X" a partir del propio `dueAt`.
   */
  windowEnd: string | null;
  status: TrialActionStatus;
}

/** Resolución YA aplicada a la sesión — corta toda cadencia (brief §5/§7). */
export type TrialSessionResolution = "ganada" | "perdida" | "reagendada" | null;

export interface TrialCadenceSession {
  /** `bookings.booking_date`, "YYYY-MM-DD". */
  bookingDate: string;
  /** `schedules.start_time`, "HH:MM". */
  startTime: string;
  /** `schedules.end_time`, "HH:MM". */
  endTime: string;
  /** `bookings.booked_at` — cuándo se agendó (para "vence ahora" de M1). */
  bookedAt: Date;
  /** IANA tz de la sede. */
  timezone: string;
}

export interface TrialCadenceFollowup {
  m1SentAt: Date | null;
  m2SentAt: Date | null;
  m3SentAt: Date | null;
  respondedAt: Date | null;
}

export interface ComputeNextActionInput {
  session: TrialCadenceSession;
  followup: TrialCadenceFollowup;
  /** `true`=Asistió, `false`=No asistió (clase terminada sin presente), `null`=clase no terminó (D-01: NO existe "asistencia sin cargar"). */
  attended: boolean | null;
  /** Resolución ya aplicada — `null` si la sesión sigue "en juego". */
  resolution: TrialSessionResolution;
  shifts: TrialShiftConfig;
  /** `system_settings trials.followup_retry_hours` (default 24). */
  retryHours: number;
  /**
   * `true` cuando esta sesión es la última reagenda PERMITIDA (profundidad de
   * cadena == límite) — M3b no se ofrece ahí (brief §6 "al llegar al límite").
   * Guardia explícita además de `resolution`: el caller normalmente ya deriva
   * `resolution='perdida'` en ese caso (ver `deriveSessionStatus`), pero esta
   * bandera cubre el mensaje textual del SPEC ("M3b no aplica...") como regla
   * independiente, defensa en profundidad.
   */
  isFinalAllowedSession: boolean;
  /** `system_settings trials.cadence_start_date` — `null` = sin corte. */
  cadenceStartDate: string | null;
  now: Date;
}

/**
 * Calcula la próxima acción de UNA sesión de prueba, o `null` si no
 * corresponde ninguna (brief §4.3 / §7, SPEC "Reglas del motor").
 */
export function computeNextAction(
  input: ComputeNextActionInput,
): TrialNextAction | null {
  const {
    session,
    followup,
    attended,
    resolution,
    shifts,
    retryHours,
    isFinalAllowedSession,
    cadenceStartDate,
    now,
  } = input;

  // Cierre de rama: Ganada/Perdida/Reagendada nunca muestran próxima acción.
  if (resolution !== null) return null;

  // Corte go-live: sesiones anteriores a la fecha de aplicación no generan
  // mensajes retroactivos (SPEC "Corte go-live").
  if (cadenceStartDate !== null && session.bookingDate < cadenceStartDate) {
    return null;
  }

  const classStart = buildClassDateTime(
    session.bookingDate,
    session.startTime,
    session.timezone,
  );
  const classEnd = buildClassDateTime(
    session.bookingDate,
    session.endTime,
    session.timezone,
  );

  // ── M1 (recordatorio) ─────────────────────────────────────────────────
  if (followup.m1SentAt === null && now.getTime() < classStart.getTime()) {
    const sessionShift: ShiftName =
      session.startTime < hhmm(shifts.afternoonStart) ? "morning" : "afternoon";
    const windowRef: ShiftRef =
      sessionShift === "afternoon"
        ? { date: session.bookingDate, shift: "morning" }
        : previousBusinessShift(session.bookingDate);
    const window = shiftBounds(windowRef, shifts, session.timezone);
    // "Si la sesión se agendó después de esa ventana → vence ahora": dueAt
    // nunca es anterior al momento en que se creó la sesión.
    const dueAt = new Date(
      Math.max(window.start.getTime(), session.bookedAt.getTime()),
    );
    const status: TrialActionStatus =
      now.getTime() < dueAt.getTime()
        ? "upcoming"
        : now.getTime() > window.end.getTime()
          ? "overdue"
          : "due";
    return {
      code: "M1",
      dueAt: dueAt.toISOString(),
      windowEnd: window.end.toISOString(),
      status,
    };
  }
  // Clase ya empezó sin M1 enviado → se saltea, no bloquea M2 (brief §4.1).

  // Antes de que termine la clase no hay M2 posible (D-01: sin "asistencia
  // sin cargar" — `attended` es `null` solo mientras la clase no terminó).
  if (attended === null) return null;

  // ── M2a / M2b (post-sesión) ───────────────────────────────────────────
  if (followup.m2SentAt === null) {
    const sessionShift: ShiftName =
      session.startTime < hhmm(shifts.afternoonStart) ? "morning" : "afternoon";
    const window = shiftBounds(
      { date: session.bookingDate, shift: sessionShift },
      shifts,
      session.timezone,
    );
    const status: TrialActionStatus =
      now.getTime() > window.end.getTime() ? "overdue" : "due";
    return {
      code: attended ? "M2a" : "M2b",
      dueAt: classEnd.toISOString(),
      windowEnd: window.end.toISOString(),
      status,
    };
  }

  // Respondió → sin reintento, la fila espera resolución manual (brief §4.2).
  if (followup.respondedAt !== null) return null;

  // ── M3a / M3b (reintento) ─────────────────────────────────────────────
  if (followup.m3SentAt === null) {
    if (!attended && isFinalAllowedSession) {
      // M3b no aplica en la última reagenda permitida (brief §6).
      return null;
    }
    const dueAt = new Date(
      followup.m2SentAt!.getTime() + retryHours * 60 * 60 * 1000,
    );
    // Deviación documentada (ver TrialNextAction.windowEnd): M3 no tiene
    // ventana de cierre — status queda en 'due' indefinidamente tras dueAt.
    const status: TrialActionStatus =
      now.getTime() < dueAt.getTime() ? "upcoming" : "due";
    return {
      code: attended ? "M3a" : "M3b",
      dueAt: dueAt.toISOString(),
      windowEnd: null,
      status,
    };
  }

  // Tras M3 → sin próxima acción, espera cron/manual (brief §5).
  return null;
}

// ─── deriveSessionStatus ────────────────────────────────────────────────────

export type TrialSessionStatus =
  | "agendada"
  | "asistio"
  | "no_asistio"
  | "reagendada"
  | "ganada"
  | "perdida";

export interface DeriveSessionStatusInput {
  /** `true` si OTRA sesión de la cadena referencia a ésta como origen (reagenda). */
  hasRescheduleChild: boolean;
  /** `users.lead_status` — bruto, sin resolver "auto en_seguimiento". */
  leadStatus: "en_seguimiento" | "ganado" | "perdido" | null;
  /** `true`=Asistió, `false`=No asistió, `null`=clase no terminó (D-01). */
  attended: boolean | null;
  /**
   * `true` cuando esta sesión es la última reagenda PERMITIDA (profundidad ==
   * límite) — combinado con `attended === false` deriva Perdida automática,
   * motivo implícito "faltó a la última reagenda" (SPEC decisión #2).
   */
  isFinalAllowedSession: boolean;
}

/**
 * Estado derivado de UNA sesión de prueba (brief §5, SPEC decisiones #1/#2).
 * NUNCA se persiste — se recalcula en cada lectura.
 */
export function deriveSessionStatus(
  input: DeriveSessionStatusInput,
): TrialSessionStatus {
  // Reagendada tiene prioridad SIEMPRE, incluso si el lead ya es ganado/
  // perdido (SPEC: "Ganada/Perdida = lead_status aplicado a la ÚLTIMA sesión
  // de la cadena" — las sesiones ancestro muestran Reagendada).
  if (input.hasRescheduleChild) return "reagendada";
  if (input.leadStatus === "ganado") return "ganada";
  if (input.leadStatus === "perdido") return "perdida";
  if (input.attended === true) return "asistio";
  if (input.attended === false) {
    // Faltó a la última reagenda permitida → Perdida automática, sin mensaje
    // ni motivo (SPEC decisión #2).
    return input.isFinalAllowedSession ? "perdida" : "no_asistio";
  }
  return "agendada";
}
