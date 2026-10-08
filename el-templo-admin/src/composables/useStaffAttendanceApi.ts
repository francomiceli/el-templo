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
  /** Último cierre de caja de ESTA jornada (null si todavía no la contó). */
  cashCountedAt: string | null;
}

/** Ítem del checklist de cierre de jornada. */
export interface StaffAttendanceChecklistItem {
  key: 'cobros' | 'espacio' | 'lote' | 'videos';
  label: string;
  /** false = recordatorio: se ofrece pero no bloquea el cierre. */
  required: boolean;
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

/**
 * Valores del checklist al cerrar jornada — las 3 claves fijas del contrato.
 * `cobros` es opcional al ENVIAR: un rol sin plata (coach_actividad, 2026-10-06)
 * no lo tiene en su checklist. En el registro llega `null` para esas jornadas.
 */
export interface StaffAttendanceChecklistValues {
  cobros?: boolean | null;
  espacio: boolean;
  /** Lote del posnet: solo miércoles y sábados (lo decide el server por sede). */
  lote?: boolean;
  /** Videos de ejercicios para la app (recordatorio de los profes): false = no lo tildó; null/ausente = no aplicaba. */
  videos?: boolean | null;
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

/** Filtros comunes de `GET /shifts` y `GET /dashboard`. */
export interface StaffAttendanceReportParams {
  /** Sin `branchId` = todas las sedes del alcance del usuario. */
  branchId?: number;
  /** Solo lo honra el owner (el admin queda siempre en su país). */
  country?: 'AR' | 'ES';
  from: string;
  to: string;
}

/** Jornada abierta del tablero (`openNow`). */
export interface StaffDashboardOpenShift {
  shiftId: number;
  userId: number;
  userName: string;
  branchId: number;
  branchName: string;
  checkedInAt: string;
}

/** Jornada abierta de un día anterior (sin check-out). */
export interface StaffDashboardStaleShift extends StaffDashboardOpenShift {
  shiftDate: string;
}

export interface StaffDashboardPerson {
  userId: number;
  userName: string;
  branchNames: string[];
  shifts: number;
  totalMinutes: number;
}

/** Respuesta de `GET /admin/staff-attendance/dashboard`. */
export interface StaffAttendanceDashboard {
  branches: { id: number; name: string }[];
  openNow: StaffDashboardOpenShift[];
  staleOpen: StaffDashboardStaleShift[];
  totals: {
    shifts: number;
    closedShifts: number;
    openShifts: number;
    totalMinutes: number;
  };
  byPerson: StaffDashboardPerson[];
}

function reportQuery(opts: StaffAttendanceReportParams): Record<string, string | number> {
  const params: Record<string, string | number> = { from: opts.from, to: opts.to };
  if (opts.branchId !== undefined) params.branchId = opts.branchId;
  if (opts.country !== undefined) params.country = opts.country;
  return params;
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
   * GET /admin/staff-attendance/shifts?from=YYYY-MM-DD&to=YYYY-MM-DD[&branchId=NN][&country=AR|ES]
   * — registro de jornadas (solo owner/admin en el API; rango máx 62 días).
   * Sin `branchId` trae todas las sedes del alcance. Usado por la sección
   * "Registro" de CheckInPage.
   */
  async function getShifts(opts: StaffAttendanceReportParams): Promise<StaffAttendanceShiftRow[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ shifts: StaffAttendanceShiftRow[] }>(
        '/admin/staff-attendance/shifts',
        { params: reportQuery(opts) }
      );
      return data.shifts;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo cargar el registro de jornadas');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * GET /admin/staff-attendance/dashboard — tablero de jornadas: en turno
   * ahora, abiertas sin check-out de días anteriores (ambas sin importar el
   * rango) y totales / horas por persona del rango pedido.
   */
  async function getDashboard(
    opts: StaffAttendanceReportParams
  ): Promise<StaffAttendanceDashboard> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<StaffAttendanceDashboard>(
        '/admin/staff-attendance/dashboard',
        { params: reportQuery(opts) }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo cargar el tablero de jornadas');
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
    getDashboard,
    cleanup,
  };
}
