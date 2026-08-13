export type CheckInQuestionType = "energy" | "soreness" | "sleep";

export type EnergyValue = "bajo" | "normal" | "alto";
export type SorenessValue = "ninguna" | "leve" | "moderada";
export type SleepValue = "mal" | "ok" | "bien";

export type BodyArea = "hombros" | "espalda" | "piernas" | "core" | "general";

export interface CheckInAnswer {
  questionType: CheckInQuestionType;
  value: string;
  bodyArea?: string;
}

export interface TodayCheckInState {
  answers: Record<
    CheckInQuestionType,
    { value: string; bodyArea: string | null } | null
  >;
}

export const VALID_VALUES: Record<CheckInQuestionType, readonly string[]> = {
  energy: ["bajo", "normal", "alto"],
  soreness: ["ninguna", "leve", "moderada"],
  sleep: ["mal", "ok", "bien"],
};

export const VALID_BODY_AREAS: readonly string[] = [
  "hombros",
  "espalda",
  "piernas",
  "core",
  "general",
];

export const QUESTION_TYPES: readonly CheckInQuestionType[] = [
  "energy",
  "soreness",
  "sleep",
];

// =============================================================================
// Vista admin (Registro del día en Feedback) — ver admin-service.ts
// =============================================================================

export interface AdminCheckInsFilters {
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  branchId?: number;
  /** Acota summary y listado a un solo tipo de pregunta. */
  questionType?: CheckInQuestionType;
  page?: number;
  limit?: number;
}

/**
 * Conteo por tipo y valor: `{ energy: { bajo: 12, normal: 30, alto: 8 }, ... }`.
 * Siempre trae TODOS los valores posibles, en 0 si nadie los eligió.
 */
export type CheckInSummary = Record<
  CheckInQuestionType,
  Record<string, number>
>;

/** Una respuesta suelta dentro del día de un socio. */
export interface AdminCheckInEntry {
  questionType: CheckInQuestionType;
  value: string;
  bodyArea: string | null;
}

/** Una fila del listado = todo lo que un socio registró un día. */
export interface AdminCheckInDayRow {
  userId: number;
  memberName: string;
  branchName: string | null;
  date: string;
  entries: AdminCheckInEntry[];
}

export interface AdminCheckInsResult {
  summary: CheckInSummary;
  bodyAreas: Array<{ area: string; count: number }>;
  rows: AdminCheckInDayRow[];
  total: number;
  page: number;
  limit: number;
}

/** Scope de país del staff (espejo de ProposalsScope / RatingsScope). */
export interface CheckInScope {
  isOwner: boolean;
  country: string | null;
}

// =============================================================================
// Registro del día para el staff operativo
// (línea en la lista de asistencia + card "Registros del día" en Horarios)
// =============================================================================

/**
 * El registro diario más reciente de un socio dentro de una ventana (por defecto
 * los últimos 7 días). Es lo que ve el profe: cómo llegó el alumno a la clase.
 *
 * `daysAgo` = 0 → registró el día de referencia (hoy, o el día de la clase);
 * `daysAgo` > 0 → es un registro anterior que se muestra como último dato
 * disponible ("hace 2 días"), el fallback que pidió Franco cuando no hay registro
 * del día. Los valores son los mismos strings que guarda `submitAnswer`
 * (`energy`: bajo/normal/alto, `sleep`: mal/ok/bien, `soreness`:
 * ninguna/leve/moderada + zona).
 */
export interface DayCheckIn {
  /** Fecha del registro mostrado (YYYY-MM-DD). */
  date: string;
  /** Días entre la fecha de referencia y el registro. 0 = del día. */
  daysAgo: number;
  energy: string | null;
  soreness: string | null;
  sorenessBodyArea: string | null;
  sleep: string | null;
}

/** Una fila del roster de registros del día (card de Horarios). */
export interface CheckInRosterEntry {
  memberId: number;
  memberName: string;
  checkIn: DayCheckIn;
}

export interface CheckInRosterResult {
  /** Solo los asistentes CON un registro reciente, ordenados: primero los que
   * llegaron peor (energía baja / mal sueño / molestia), luego por recencia. */
  entries: CheckInRosterEntry[];
  /** Cuántos alumnos asisten ese día en la sede (con reserva o asistencia). */
  attendeeCount: number;
}
