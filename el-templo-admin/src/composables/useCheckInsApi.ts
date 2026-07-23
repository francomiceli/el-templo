/**
 * Check-ins API composable (admin) — Registro del día.
 *
 * Alimenta el tab "Registro del día" de FeedbackPage: distribución agregada de
 * energía/molestias/sueño + detalle paginado agrupado por (socio, día).
 *
 * Espeja la forma de useRatingsApi (refs loading/error, extractError, `throw
 * err` en el catch, `finally`). El gate de rol vive en el API
 * (checkInAdminRoutes, ADMIN_ROLES); este cliente no es la frontera de
 * seguridad.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';

export type CheckInQuestionType = 'energy' | 'soreness' | 'sleep';

/** Etiquetas en castellano de cada pregunta (la UI del socio usa estas mismas). */
export const CHECK_IN_TYPE_LABELS: Record<CheckInQuestionType, string> = {
  energy: 'Energía',
  soreness: 'Molestias',
  sleep: 'Sueño',
};

/**
 * Orden de los valores dentro de cada pregunta, de peor a mejor. Fija el orden
 * de las barras: el API devuelve un objeto y las claves no traen semántica.
 */
export const CHECK_IN_VALUE_ORDER: Record<CheckInQuestionType, string[]> = {
  energy: ['bajo', 'normal', 'alto'],
  soreness: ['moderada', 'leve', 'ninguna'],
  sleep: ['mal', 'ok', 'bien'],
};

export interface AdminCheckInsFilters {
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  branchId?: number;
  questionType?: CheckInQuestionType;
  page?: number;
  limit?: number;
}

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

export interface AdminCheckIns {
  /** `{ energy: { bajo: 12, normal: 30, alto: 8 }, ... }`, siempre completo. */
  summary: Record<CheckInQuestionType, Record<string, number>>;
  bodyAreas: Array<{ area: string; count: number }>;
  rows: AdminCheckInDayRow[];
  total: number;
  page: number;
  limit: number;
}

export function useCheckInsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function getAdminCheckIns(filters: AdminCheckInsFilters = {}): Promise<AdminCheckIns> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<AdminCheckIns>('/admin/check-ins', { params: filters });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando el registro del día');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return { loading, error, getAdminCheckIns };
}
