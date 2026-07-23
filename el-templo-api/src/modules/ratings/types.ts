/**
 * Ratings module — public types (Phase 143).
 *
 * Three decoupled flows:
 *  1. Roster write (owner/coach assigns ONE coach per branch/ISO-week/day/slot).
 *  2. Member pending + submit (attribution resolved server-side from the roster).
 *  3. Owner view (per-coach average + recent ratings; owner-only, D-M3).
 *
 * The slot is the turn derived from a schedule's startTime: "morning" when
 * startTime < "12:00", else "afternoon" (D-A1), the same split ReservasPage uses.
 */

export type ClassSlot = "morning" | "afternoon";

/** Input to assign/replace a coach in a single roster slot (D-A1). */
export interface RosterAssignmentInput {
  branchId: number;
  /** Monday of the ISO week ("YYYY-MM-DD"). */
  weekStartDate: string;
  /** 1=Monday .. 6=Saturday (ISO). */
  dayOfWeek: number;
  slot: ClassSlot;
  coachId: number;
}

/** One roster cell with the assigned coach's name (for the admin grid). */
export interface RosterWeekRow {
  id: number;
  branchId: number;
  weekStartDate: string;
  dayOfWeek: number;
  slot: ClassSlot;
  coachId: number;
  coachName: string;
}

/** A coach option for a branch (roster assignment dropdown). */
export interface CoachOption {
  id: number;
  firstName: string;
  lastName: string;
}

/**
 * The class the member is being asked to rate. Deliberately exposes NOTHING
 * about the coach (no coachId/name/photo) — the pop-up is built around the
 * CLASS, not the professor (D-A3). Null when there is nothing to rate.
 */
export interface PendingRating {
  sessionDate: string;
  branchId: number;
  scheduleId: number;
  activityName: string;
  dayOfWeek: number;
}

/** Member's rating submission. */
export interface SubmitRatingInput {
  sessionDate: string;
  scheduleId: number;
  /** Profe rating 1–5 (backs /puntuaciones). */
  stars: number;
  /** Class rating 1–5 (backs the "Clases" analytics tab). */
  classStars: number;
  comment?: string;
}

/** Per-coach aggregate for the owner view (D-O1). */
export interface OwnerCoachRatingSummary {
  coachId: number;
  coachName: string;
  averageStars: number;
  ratingCount: number;
  /**
   * Promedio de la nota de CLASE (class_stars). null cuando el profe no tiene
   * ninguna fila con class_stars (todas sus puntuaciones son pre-split).
   * AVG de MySQL ignora los NULL, así que el promedio es sobre las filas que
   * SÍ tienen nota de clase (classRatingCount).
   */
  classAverageStars: number | null;
  classRatingCount: number;
}

/** A single rating row for the owner view (D-O1). */
export interface OwnerRecentRating {
  id: number;
  coachId: number;
  coachName: string;
  stars: number;
  /** Nota de clase 1–5; null en filas pre-split (solo existía la del profe). */
  classStars: number | null;
  comment: string | null;
  sessionDate: string;
  activityName: string | null;
  branchName: string | null;
}

/**
 * Filtros del owner view: rango de fechas sobre sessionDate (la fecha de la
 * clase puntuada, no la del submit) + sucursal + paginación del listado.
 * Los promedios per-coach respetan fecha/sucursal; la paginación solo aplica
 * al listado de puntuaciones individuales.
 *
 * withComments es un filtro de LECTURA del listado y NO toca los promedios: el
 * "Promedio profe" es sobre todas las clases puntuadas, y dejarlo caer solo
 * sobre las que además dejaron comentario lo convertiría en otra métrica
 * (sesgada al que se toma el trabajo de escribir) sin que se note en la UI.
 */
export interface OwnerRatingsFilters {
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  branchId?: number;
  withComments?: boolean;
  /**
   * Notas a mostrar en el listado (1-5). Mismo criterio que withComments: filtra
   * SOLO el listado, nunca los promedios. Vacío o undefined = sin filtro.
   */
  stars?: number[];
  /**
   * Sobre qué dimensión aplica `stars`. "coach" (default) usa coach_ratings.stars;
   * "class" usa class_stars, que es NULL en las puntuaciones previas al split de
   * dimensiones — esas filas quedan fuera del listado al filtrar por clase.
   */
  starsDimension?: "coach" | "class";
  page?: number;
  limit?: number;
}

export interface OwnerRatingsResult {
  perCoach: OwnerCoachRatingSummary[];
  ratings: {
    rows: OwnerRecentRating[];
    total: number;
    page: number;
    limit: number;
  };
}

/** Scope passed from the route guard (mirrors CoachService scope shape). */
export interface RatingsScope {
  role: string;
  isOwner: boolean;
  country: "AR" | "ES" | null;
  branchIds: number[];
}
