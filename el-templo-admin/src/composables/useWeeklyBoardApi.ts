/**
 * Weekly Board API composable — Tablero semanal de gerencia (admin), fase 206-08.
 * Mismo patrón que `useRenewalsApi.ts`: refs de loading/error locales,
 * `extractError` para mensajes legibles y `cleanup()` expuesto (la página llama
 * `cleanup()` desde su propio `onUnmounted` — el composable no usa `onUnmounted`).
 *
 * `cleanup()` además cancela los pedidos en vuelo (AbortController): un pedido
 * cancelado rechaza con un error de cancelación, que la página ignora con
 * `isCanceled(err)`. Pedir otra semana mientras la anterior viaja cancela la vieja.
 */

import { ref } from 'vue';
import axios from 'axios';
import { api } from 'src/boot/axios';
import { createLogger } from 'src/utils/logger';
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
import type {
  LeadsUpsertInput,
  LeadsUpsertResult,
  WeeklyBoardResponse,
} from 'src/types/weekly-board';

const log = createLogger('useWeeklyBoardApi');

/** Solo mensaje y status: nunca el cuerpo de la respuesta (son números de gerencia). */
function logSafeError(err: unknown): Record<string, unknown> {
  if (axios.isAxiosError(err)) return { status: err.response?.status, message: err.message };
  if (err instanceof Error) return { message: err.message };
  return {};
}

export function useWeeklyBoardApi() {
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  let boardController: AbortController | null = null;
  const saveControllers = new Set<AbortController>();

  function isCanceled(err: unknown): boolean {
    return axios.isCancel(err);
  }

  /** Matriz de una semana. Sin `weekStart`, el API devuelve la semana en curso. */
  async function getBoard(weekStart?: string): Promise<WeeklyBoardResponse> {
    boardController?.abort();
    const controller = new AbortController();
    boardController = controller;
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<WeeklyBoardResponse>('/admin/weekly-board', {
        params: weekStart ? { weekStart } : {},
        signal: controller.signal,
      });
      return data;
    } catch (err: unknown) {
      if (!isCanceled(err)) {
        error.value = extractError(err, 'Error cargando el tablero');
        if (!isExpectedClientError(err)) {
          log.error('Error cargando el tablero', logSafeError(err));
        }
      }
      throw err;
    } finally {
      // Si otro pedido tomó la posta, él se ocupa del loading.
      if (boardController === controller) {
        loading.value = false;
        boardController = null;
      }
    }
  }

  /** Guarda (o borra con `leads: null`) los leads de una sede para una semana. */
  async function saveLeads(input: LeadsUpsertInput): Promise<LeadsUpsertResult> {
    const controller = new AbortController();
    saveControllers.add(controller);
    saving.value = true;
    error.value = null;
    try {
      const { data } = await api.put<LeadsUpsertResult>('/admin/weekly-board/leads', input, {
        signal: controller.signal,
      });
      return data;
    } catch (err: unknown) {
      if (!isCanceled(err)) {
        error.value = extractError(err, 'No se pudieron guardar los leads');
        if (!isExpectedClientError(err)) {
          log.error('No se pudieron guardar los leads', logSafeError(err));
        }
      }
      throw err;
    } finally {
      saveControllers.delete(controller);
      saving.value = saveControllers.size > 0;
    }
  }

  function cleanup() {
    boardController?.abort();
    boardController = null;
    saveControllers.forEach((c) => c.abort());
    saveControllers.clear();
    loading.value = false;
    saving.value = false;
    error.value = null;
  }

  return {
    loading,
    saving,
    error,
    getBoard,
    saveLeads,
    isCanceled,
    cleanup,
  };
}
