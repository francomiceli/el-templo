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
