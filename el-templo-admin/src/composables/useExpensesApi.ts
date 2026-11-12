/**
 * Egresos (fase 209): llamadas a /admin/finance/expense-records*.
 *
 * Composable PROPIO de Egresos (DI-17): no se engorda `useTransactionsApi`.
 *
 * - `country` viaja SIEMPRE como `params: { country }`. El server lo respeta
 *   solo para el owner; para el resto usa el país de su scope y lo ignora.
 * - Los errores de la API llegan como `{ error, message }` con `message` en
 *   español: `extractError` lo toma tal cual y queda en `error` para mostrarlo.
 *   Cada función re-lanza el error para que el componente decida qué hacer.
 * - Plata en enteros (D-23). Sin hooks de ciclo de vida: el componente que lo usa llama
 *   a `cleanup()` en el suyo.
 */

import { ref } from 'vue';
import axios from 'axios';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type {
  CreateExpenseRecordInput,
  ExpenseCountry,
  ExpenseFormOptions,
  ExpenseListFilters,
  ExpensePaymentItem,
  ExpenseRecordDetail,
  ExpenseRecordListItem,
  ExpenseSummary,
  ExpenseSummaryDetail,
  PaginatedResult,
  RegisterExpensePaymentInput,
  UpdateExpenseRecordInput,
} from 'src/types/expense';

const BASE = '/admin/finance/expense-records';

/** Filtros del listado (el país va aparte, como primer argumento). */
export type ExpenseListParams = Omit<ExpenseListFilters, 'country'>;

/** Lee el `message` de un cuerpo de error JSON que llegó como Blob; null si no se puede. */
async function blobErrorMessage(blob: Blob): Promise<string | null> {
  try {
    const body: unknown = JSON.parse(await blob.text());
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const { message } = body as { message: unknown };
      return typeof message === 'string' ? message : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function useExpensesApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  /** Corre una llamada con `loading`/`error` y re-lanza el error. */
  async function run<T>(fallback: string, call: () => Promise<T>): Promise<T> {
    loading.value = true;
    error.value = null;
    try {
      return await call();
    } catch (err: unknown) {
      error.value = extractError(err, fallback);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** Listado paginado de gastos. Respuesta `{ rows, total, page, limit }`. */
  function listExpenseRecords(
    country: ExpenseCountry,
    params: ExpenseListParams = {}
  ): Promise<PaginatedResult<ExpenseRecordListItem>> {
    return run('Error cargando los gastos', async () => {
      const query: Record<string, string | number | boolean> = { country };
      if (params.month) query.month = params.month;
      if (params.destination !== undefined) query.destination = params.destination;
      if (params.costCenterId !== undefined) query.costCenterId = params.costCenterId;
      if (params.status) query.status = params.status;
      if (params.q && params.q.trim().length > 0) query.q = params.q.trim();
      if (params.includeVoided) query.includeVoided = true;
      if (params.page !== undefined) query.page = params.page;
      if (params.limit !== undefined) query.limit = params.limit;
      const { data } = await api.get<PaginatedResult<ExpenseRecordListItem>>(BASE, {
        params: query,
      });
      return data;
    });
  }

  /** Opciones del formulario: cuentas de pago (sin saldos), destinos, rubros, monedas. */
  function getExpenseFormOptions(country: ExpenseCountry): Promise<ExpenseFormOptions> {
    return run('Error cargando las opciones del formulario', async () => {
      const { data } = await api.get<ExpenseFormOptions>(`${BASE}/form-options`, {
        params: { country },
      });
      return data;
    });
  }

  /** Alta de gasto. `created` es false si la `idempotencyKey` ya existía (la API responde 200). */
  function createExpenseRecord(
    country: ExpenseCountry,
    input: CreateExpenseRecordInput
  ): Promise<{ record: ExpenseRecordDetail; created: boolean }> {
    return run('Error guardando el gasto', async () => {
      const res = await api.post<{ record: ExpenseRecordDetail }>(BASE, input, {
        params: { country },
      });
      return { record: res.data.record, created: res.status === 201 };
    });
  }

  /** Detalle del gasto: reparto, pagos, links e historial. */
  function getExpenseRecord(id: number, country: ExpenseCountry): Promise<ExpenseRecordDetail> {
    return run('Error cargando el gasto', async () => {
      const { data } = await api.get<{ record: ExpenseRecordDetail }>(`${BASE}/${id}`, {
        params: { country },
      });
      return data.record;
    });
  }

  /** Edición parcial del gasto (al menos un campo). */
  function updateExpenseRecord(
    id: number,
    country: ExpenseCountry,
    input: UpdateExpenseRecordInput
  ): Promise<ExpenseRecordDetail> {
    return run('Error guardando los cambios del gasto', async () => {
      const { data } = await api.patch<{ record: ExpenseRecordDetail }>(`${BASE}/${id}`, input, {
        params: { country },
      });
      return data.record;
    });
  }

  /** Anula el gasto (solo owner y admin; sin pagos vigentes). El motivo es obligatorio. */
  function voidExpenseRecord(
    id: number,
    country: ExpenseCountry,
    reason: string
  ): Promise<ExpenseRecordDetail> {
    return run('Error anulando el gasto', async () => {
      const { data } = await api.post<{ record: ExpenseRecordDetail }>(
        `${BASE}/${id}/void`,
        { reason },
        { params: { country } }
      );
      return data.record;
    });
  }

  /** Registra un pago. `created` es false si la `idempotencyKey` ya existía (la API responde 200). */
  function registerExpensePayment(
    id: number,
    country: ExpenseCountry,
    input: RegisterExpensePaymentInput
  ): Promise<{ record: ExpenseRecordDetail; payment: ExpensePaymentItem; created: boolean }> {
    return run('Error registrando el pago', async () => {
      const res = await api.post<{ record: ExpenseRecordDetail; payment: ExpensePaymentItem }>(
        `${BASE}/${id}/payments`,
        input,
        { params: { country } }
      );
      return { record: res.data.record, payment: res.data.payment, created: res.status === 201 };
    });
  }

  /** Anula un pago (solo owner y admin). Devuelve el gasto actualizado. */
  function voidExpensePayment(
    id: number,
    paymentId: number,
    country: ExpenseCountry,
    reason: string
  ): Promise<ExpenseRecordDetail> {
    return run('Error anulando el pago', async () => {
      const { data } = await api.post<{ record: ExpenseRecordDetail }>(
        `${BASE}/${id}/payments/${paymentId}/void`,
        { reason },
        { params: { country } }
      );
      return data.record;
    });
  }

  /** Resumen mensual por destino (sedes, Casa Matriz en Argentina y Total). */
  function getExpenseSummary(country: ExpenseCountry, month: string): Promise<ExpenseSummary> {
    return run('Error cargando el resumen de egresos', async () => {
      const { data } = await api.get<ExpenseSummary>(`${BASE}/summary`, {
        params: { country, month },
      });
      return data;
    });
  }

  /** Detalle del Resumen de un destino (`key` de la columna: id de sede, `casa_matriz` o `total`). */
  function getExpenseSummaryDetail(
    country: ExpenseCountry,
    month: string,
    destination: string
  ): Promise<ExpenseSummaryDetail> {
    return run('Error cargando el detalle del resumen', async () => {
      const { data } = await api.get<ExpenseSummaryDetail>(`${BASE}/summary/detail`, {
        params: { country, month, destination },
      });
      return data;
    });
  }

  /** Excel del Resumen: se baja como blob con el token (un `<a href>` no manda el header). */
  function exportExpenseSummary(country: ExpenseCountry, month: string): Promise<Blob> {
    return run('Error exportando el resumen de egresos', async () => {
      try {
        const { data } = await api.get<Blob>(`${BASE}/summary/export`, {
          params: { country, month },
          responseType: 'blob',
        });
        return data;
      } catch (err: unknown) {
        // Con responseType blob el cuerpo del error también llega como Blob:
        // se lee para mostrar el `message` en español de la API.
        if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
          const message = await blobErrorMessage(err.response.data);
          if (message) throw new Error(message);
        }
        throw err;
      }
    });
  }

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    listExpenseRecords,
    getExpenseFormOptions,
    createExpenseRecord,
    getExpenseRecord,
    updateExpenseRecord,
    voidExpenseRecord,
    registerExpensePayment,
    voidExpensePayment,
    getExpenseSummary,
    getExpenseSummaryDetail,
    exportExpenseSummary,
    cleanup,
  };
}
