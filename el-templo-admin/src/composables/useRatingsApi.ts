/**
 * Ratings API composable (admin).
 *
 * Powers two admin surfaces of Phase 143:
 *  - Surface 1 (HorariosPage): weekly roster — assign ONE coach per
 *    (sucursal, día, turno), with immediate persistence (no Save button).
 *  - Surface 3 (tab Profes de FeedbackPage): owner-only view — per-coach average +
 *    recent individual ratings.
 *
 * Mirrors the shape of useCoachApi.ts (loading/error refs, extractError,
 * `throw err` in catch, `finally`). All API enforcement (owner-only view,
 * branch-scope on roster writes) lives server-side; this client is not the
 * security boundary.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';

export type ClassSlot = 'morning' | 'afternoon';

/** A coach option for a branch (roster assignment dropdown). */
export interface CoachOption {
  id: number;
  firstName: string;
  lastName: string;
}

/** One roster cell with the assigned coach's name (admin grid). */
export interface RosterWeekRow {
  id: number;
  branchId: number;
  weekStartDate: string;
  dayOfWeek: number;
  slot: ClassSlot;
  coachId: number;
  coachName: string;
}

/** Payload to assign/replace a coach in a single roster slot. */
export interface AssignCoachPayload {
  branchId: number;
  /** Monday of the ISO week ("YYYY-MM-DD"). */
  weekStartDate: string;
  /** 1=Monday .. 6=Saturday (ISO). */
  dayOfWeek: number;
  slot: ClassSlot;
  coachId: number;
}

/** Per-coach aggregate for the owner view. */
export interface OwnerCoachRatingSummary {
  coachId: number;
  coachName: string;
  averageStars: number;
  ratingCount: number;
  /** Promedio de la nota de CLASE; null si el profe no tiene filas post-split. */
  classAverageStars: number | null;
  classRatingCount: number;
}

/** A single rating row for the owner view. */
export interface OwnerRecentRating {
  id: number;
  coachId: number;
  coachName: string;
  stars: number;
  /** Nota de clase 1–5; null en filas pre-split. */
  classStars: number | null;
  comment: string | null;
  sessionDate: string;
  activityName: string | null;
  branchName: string | null;
}

/**
 * Filtros del owner view: fechas sobre sessionDate + sucursal + paginación.
 * withComments filtra solo el listado — los promedios por profe siguen siendo
 * sobre todas las puntuaciones.
 */
export interface OwnerRatingsFilters {
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  branchId?: number;
  withComments?: boolean;
  page?: number;
  limit?: number;
}

export interface OwnerRatings {
  perCoach: OwnerCoachRatingSummary[];
  ratings: {
    rows: OwnerRecentRating[];
    total: number;
    page: number;
    limit: number;
  };
}

export function useRatingsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function getCoachesForBranch(branchId: number): Promise<CoachOption[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<CoachOption[]>('/admin/ratings/coaches', {
        params: { branchId },
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando profes');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getRosterWeek(branchId: number, weekStart: string): Promise<RosterWeekRow[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<RosterWeekRow[]>('/admin/ratings/roster', {
        params: { branchId, weekStart },
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando el roster');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function assignCoach(payload: AssignCoachPayload): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.post('/admin/ratings/roster', payload);
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo asignar el profe');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getOwnerRatings(filters: OwnerRatingsFilters = {}): Promise<OwnerRatings> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<OwnerRatings>('/admin/ratings', { params: filters });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando las puntuaciones');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    getCoachesForBranch,
    getRosterWeek,
    assignCoach,
    getOwnerRatings,
  };
}
