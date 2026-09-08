/**
 * "Mi jornada" — check-in/check-out de staff con el QR físico de la sede
 * (mismo texto plano firmado que escanean los socios). Wrapper delgado sobre
 * `/api/admin/staff-attendance/*`, mismo criterio que `useTvApi.ts`: refs
 * `loading`/`error`, `api` de `boot/axios`, `extractError` para los mensajes
 * y un `cleanup()` que resetea el estado (el llamador es dueño del ciclo de
 * vida, este composable NO registra hooks de unmount de Vue).
 *
 * Contrato fijo (acordado con el agente que implementa el API en paralelo):
 * ver el docblock de cada función para la forma exacta de request/response.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';

/** Una jornada abierta (sin check-out todavía). */
export interface StaffAttendanceOpenShift {
  id: number;
  branchId: number;
  branchName: string;
  checkedInAt: string;
}

/** Ítem del checklist de cierre de jornada. */
export interface StaffAttendanceChecklistItem {
  key: 'cobros' | 'espacio' | 'lote';
  label: string;
}

/** Respuesta de `GET /admin/staff-attendance/me`. */
export interface StaffAttendanceMe {
  open: StaffAttendanceOpenShift | null;
  checklist: StaffAttendanceChecklistItem[];
}

/** Jornada devuelta por check-in/check-out (forma común con `StaffAttendanceOpenShift`). */
export interface StaffAttendanceShift {
  id: number;
  branchId: number;
  branchName: string;
  checkedInAt: string;
}

/** Jornada cerrada, con los campos que agrega el check-out. */
export interface StaffAttendanceClosedShift extends StaffAttendanceShift {
  checkedOutAt: string;
  durationMinutes: number;
}

/** Valores del checklist al cerrar jornada — las 3 claves fijas del contrato. */
export interface StaffAttendanceChecklistValues {
  cobros: boolean;
  espacio: boolean;
  /** Lote del posnet: solo miércoles y sábados (lo decide el server por sede). */
  lote?: boolean;
}

/** Una fila del registro (`GET /admin/staff-attendance/shifts`). */
export interface StaffAttendanceShiftRow {
  id: number;
  userId: number;
  userName: string;
  branchId: number;
  branchName: string;
  shiftDate: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  durationMinutes: number | null;
  checklist: StaffAttendanceChecklistValues | null;
}

export function useStaffAttendanceApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  /**
   * GET /admin/staff-attendance/me — jornada abierta del usuario autenticado
   * (o `null` si no tiene ninguna) + las etiquetas del checklist de cierre.
   */
  async function getMe(): Promise<StaffAttendanceMe> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<StaffAttendanceMe>('/admin/staff-attendance/me');
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo cargar el estado de tu jornada');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * POST /admin/staff-attendance/check-in — abre una jornada con el QR de
   * sede escaneado. Errores esperables (400 QR inválido, 403 sede sin
   * acceso, 409 ya hay jornada abierta) llegan con `{ message }`.
   */
  async function checkIn(qrToken: string): Promise<StaffAttendanceShift> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ shift: StaffAttendanceShift }>(
        '/admin/staff-attendance/check-in',
        { qrToken }
      );
      return data.shift;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo registrar el check-in');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * POST /admin/staff-attendance/check-out — cierra la jornada abierta con
   * el QR de sede escaneado + el checklist completo. Errores esperables: 400
   * (QR inválido / QR de otra sede / checklist incompleto), 403, 409 (sin
   * jornada abierta).
   */
  async function checkOut(
    qrToken: string,
    checklist: StaffAttendanceChecklistValues
  ): Promise<StaffAttendanceClosedShift> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ shift: StaffAttendanceClosedShift }>(
        '/admin/staff-attendance/check-out',
        { qrToken, checklist }
      );
      return data.shift;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo registrar el check-out');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * GET /admin/staff-attendance/shifts?branchId=NN&from=YYYY-MM-DD&to=YYYY-MM-DD
   * — registro de jornadas por sede/fechas (solo owner/admin/gestion en el
   * API; rango máx 62 días). Usado por la sección "Registro" de JornadaPage.
   */
  async function getShifts(opts: {
    branchId: number;
    from: string;
    to: string;
  }): Promise<StaffAttendanceShiftRow[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ shifts: StaffAttendanceShiftRow[] }>(
        '/admin/staff-attendance/shifts',
        { params: { branchId: opts.branchId, from: opts.from, to: opts.to } }
      );
      return data.shifts;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo cargar el registro de jornadas');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    getMe,
    checkIn,
    checkOut,
    getShifts,
    cleanup,
  };
}
