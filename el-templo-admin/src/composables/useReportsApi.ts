/**
 * Reports API composable.
 * Provides methods for fetching 4 report types (access, charges, expiring, inactive)
 * and their corresponding Excel exports.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type {
  AccessReportRow,
  ChargeReportRow,
  ExpiringReportRow,
  InactiveReportRow,
  PaginatedResult,
  AccessReportParams,
  ChargeReportParams,
  ExpiringReportParams,
  InactiveReportParams,
  TrialConversionParams,
  TrialConversionReport,
} from 'src/types/report';

// ─── Phase 114-06: Trial Sessions Report types ─────────────────────────

export type TrialAttendedFilter = 'true' | 'false' | 'pending';
export type TrialShiftFilter = 'TM' | 'TT';
// Hotfix 2026-07: 'cerrado' → 'ganado'.
export type TrialLeadStatusValue = 'en_seguimiento' | 'ganado' | 'perdido';

/** Preview del cron de recategorización multisucursal (banner de Reportes). */
export interface MultibranchReassignmentPreview {
  nextRunAt: string;
  daysUntil: number;
  candidates: number;
  wouldReassign: number;
}

// ─── Cadencia de mensajes en Sesiones de Prueba (brief Nacho, 2026-09-26) ──
//
// Ver `el-templo-api/src/modules/reports/trial-cadence.ts` (motor) y
// `types.ts` (contrato) — estos tipos son el espejo cliente de esos.

/** Estado DERIVADO de una sesión (1 fila = 1 booking, no 1 por lead). */
export type TrialSessionStatus =
  | 'agendada'
  | 'asistio'
  | 'no_asistio'
  | 'reagendada'
  | 'ganada'
  | 'perdida';

export type TrialMessageCode = 'M1' | 'M2a' | 'M2b' | 'M3a' | 'M3b';
export type TrialActionStatus = 'upcoming' | 'due' | 'overdue';

export interface TrialNextAction {
  code: TrialMessageCode;
  /** ISO — desde cuándo corresponde el mensaje. */
  dueAt: string;
  /** ISO — cierre "duro" de la ventana (fin de turno). */
  windowEnd: string | null;
  status: TrialActionStatus;
}

export interface TrialFollowupLastMessage {
  code: TrialMessageCode;
  sentAt: string;
  sentBy: { userId: number; name: string } | null;
}

export type TrialLostReason = 'no_responde' | 'precio' | 'horario' | 'distancia' | 'otro';

export interface TrialFollowupSummary {
  lastMessage: TrialFollowupLastMessage | null;
  /** 'venta' (rama Asistió) | 'reagenda' (rama No asistió), solo si ya se marcó M2. */
  m2Kind: 'venta' | 'reagenda' | null;
  respondedAt: string | null;
  respondedBy: { userId: number; name: string } | null;
  lostReason: TrialLostReason | null;
  lostNote: string | null;
}

/** Info mínima de la sesión enlazada por una reagenda (origen o destino). */
export interface TrialRescheduleLinkedSession {
  bookingId: number;
  date: string;
  startTime: string;
  branchName: string;
}

export interface TrialSessionKpis {
  total: number;
  pendingThisShift: number;
  attendanceRate: number | null;
  conversionRate: number | null;
  recoveryRate: number | null;
}

/** Acción discriminada del PATCH de followup — una sola por request. */
export type TrialFollowupAction =
  | { type: 'mark_sent'; code: TrialMessageCode }
  | { type: 'unmark_sent'; code: TrialMessageCode }
  | { type: 'responded'; value: boolean }
  | { type: 'lost'; reason: TrialLostReason; note?: string | null };

export interface TrialShiftsRowClient {
  branchId: number;
  branchName: string;
  morningStart: string;
  morningEnd: string;
  afternoonStart: string;
  afternoonEnd: string;
}

export interface TrialSessionsFiltersClient {
  branchId?: number;
  country?: 'AR' | 'ES';
  dateFrom?: string;
  dateTo?: string;
  shift?: TrialShiftFilter;
  // Owner-only (D-44). Frontend MUST gate sending this; server silently
  // strips it for non-owners but we belt-and-suspenders here.
  gestionaUserId?: number;
  daysWithoutConvertingMin?: number;
  search?: string;
  // Origen de la SP: 'app' = la reservó el socio desde la app; 'admin' = staff.
  origin?: 'app' | 'admin';
  // Sólo SP cuyo seguimiento nadie inició todavía y el lead sigue en juego.
  pendingFollowup?: boolean;
  // Cadencia de mensajes: filtro multi-valor sobre el estado DERIVADO de la
  // sesión — reemplaza a los viejos `leadStatus`/`attended`/`leadStatusSource`
  // como única fuente de "Estado" visible (ver trial-session-status.ts).
  sessionStatus?: TrialSessionStatus[];
  // "Pendientes de este turno" (brief §4.3): la vista de trabajo diaria.
  pendingThisShift?: boolean;
  page?: number;
  limit?: number;
}

export interface TrialSessionsRowClient {
  bookingId: number;
  userId: number;
  lead: string;
  bookingDate: string; // YYYY-MM-DD
  bookingCreatedAt: string; // YYYY-MM-DD — fecha de creación de la SP
  startTime: string; // HH:MM
  branchId: number;
  branchName: string;
  attended: 'si' | 'no' | null;
  leadStatus: TrialLeadStatusValue | null;
  leadStatusEffective: TrialLeadStatusValue;
  createdBy: { userId: number; name: string } | null;
  leadNotes: string | null;
  purchasedPlanId: number | null;
  purchasedPlanName: string | null;
  shift: TrialShiftFilter;
  period: string;
  weekRange: string;
  daysSinceTrial: number;
  converted: boolean;
  // Phase 164-04: contador retroactivo de pruebas canceladas del lead
  // (incl. self-service) — proxy de "ruido" de reprogramaciones.
  reschedules: number;
  // Phase 164-04: origen del estado del lead. null = automático/histórico.
  leadStatusSource: 'auto' | 'manual' | null;
  // Phase 165-03 (D-06): teléfono del lead. null para leads legacy sin teléfono.
  phone: string | null;
  // Origen de la SP: 'app' cuando la reservó el socio desde la app
  // (bookings.source='self_service'), 'admin' en cualquier otro caso.
  origin: 'app' | 'admin';
  // ISO timestamp de cuándo gestión inició el seguimiento de esta SP de app, o
  // null si todavía nadie la tomó. Sólo relevante con origin='app'.
  followupStartedAt: string | null;
  // ── Cadencia de mensajes (brief Nacho, 2026-09-26) ──────────────────────
  /** Estado derivado de ESTA sesión — única fuente visible en la tabla. */
  sessionStatus: TrialSessionStatus;
  /** Último mensaje + respuesta + motivo de Perdida manual, o `null` si nunca se marcó nada. */
  followup: TrialFollowupSummary | null;
  /** Próxima acción calculada por el motor, o `null` si no corresponde ninguna. */
  nextAction: TrialNextAction | null;
  /** Teléfono normalizado a E.164 (mismo criterio que Renovaciones), `null` si no se pudo normalizar. */
  phoneE164: string | null;
  /** Presente solo cuando `sessionStatus === 'reagendada'`: la sesión nueva de la cadena. */
  rescheduledTo: TrialRescheduleLinkedSession | null;
  /** Presente cuando esta sesión VINO de una reagenda: la sesión de la que viene. */
  rescheduledFrom: TrialRescheduleLinkedSession | null;
  /** Profundidad de ESTA sesión en su cadena de reagendas (original=0, r1=1, r2=2...). */
  rescheduleDepth: number;
  /**
   * `true` si se puede reagendar esta fila: sesión no cerrada (no
   * Ganada/Perdida/Reagendada) Y `rescheduleDepth < trials.max_reschedules`
   * (mismo límite que el guard 409 del backend).
   */
  canReschedule: boolean;
}

export interface TrialSessionsResult {
  rows: TrialSessionsRowClient[];
  total: number;
  page: number;
  limit: number;
  kpis: TrialSessionKpis;
}

export function useReportsApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ─── Data Methods ──────────────────────────────────────────────────────

  async function getAccessLog(
    params: AccessReportParams = {}
  ): Promise<PaginatedResult<AccessReportRow>> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<PaginatedResult<AccessReportRow>>('/admin/reports/access', {
        params,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando reporte de accesos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getChargeHistory(
    params: ChargeReportParams = {}
  ): Promise<PaginatedResult<ChargeReportRow>> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<PaginatedResult<ChargeReportRow>>('/admin/reports/charges', {
        params,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando historial de cobros');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getExpiringMemberships(
    params: ExpiringReportParams = {}
  ): Promise<ExpiringReportRow[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<ExpiringReportRow[]>('/admin/reports/expiring', { params });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando vencimientos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getInactiveMembers(
    params: InactiveReportParams = {}
  ): Promise<InactiveReportRow[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<InactiveReportRow[]>('/admin/reports/inactive', { params });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando miembros inactivos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getTrialConversion(
    params: TrialConversionParams = {}
  ): Promise<TrialConversionReport> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<TrialConversionReport>('/admin/reports/trial-conversion', {
        params,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando conversión de trials');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getMultibranchReassignmentPreview(): Promise<MultibranchReassignmentPreview> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<MultibranchReassignmentPreview>(
        '/admin/reports/multibranch-reassignment-preview'
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando la recategorización');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Export Methods ────────────────────────────────────────────────────

  async function exportAccessLog(params: AccessReportParams = {}): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/admin/reports/access/export', {
        params,
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando accesos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function exportChargeHistory(params: ChargeReportParams = {}): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/admin/reports/charges/export', {
        params,
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando cobros');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function exportExpiringMemberships(params: ExpiringReportParams = {}): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/admin/reports/expiring/export', {
        params,
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando vencimientos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function exportInactiveMembers(params: InactiveReportParams = {}): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/admin/reports/inactive/export', {
        params,
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando inactivos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Phase 114-06: Trial Sessions Report ───────────────────────────────
  //
  // Plan 05 SUMMARY documents the API shape:
  //   GET /admin/reports/trial-sessions       (paginated JSON)
  //   GET /admin/reports/trial-sessions/export (CSV with UTF-8 BOM)
  //
  // Multi-value query params (`leadStatus`) must be serialized as REPEATED
  // KEYS (`?leadStatus=a&leadStatus=b`) — that is what the Fastify schema
  // expects. axios v1's default array serializer produces `key[]=` brackets,
  // so we use `paramsSerializer: { indexes: null }` to flatten arrays into
  // repeated keys.

  async function fetchTrialSessions(
    filters: TrialSessionsFiltersClient
  ): Promise<TrialSessionsResult> {
    loading.value = true;
    error.value = null;
    try {
      const params = buildTrialSessionsParams(filters);
      const { data } = await api.get<TrialSessionsResult>('/admin/reports/trial-sessions', {
        params,
        paramsSerializer: { indexes: null },
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando sesiones de prueba');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function exportTrialSessions(filters: TrialSessionsFiltersClient): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const params = buildTrialSessionsParams(filters);
      const { data } = await api.get('/admin/reports/trial-sessions/export', {
        params,
        paramsSerializer: { indexes: null },
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando sesiones de prueba');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Build a clean params record for /trial-sessions and /trial-sessions/export.
   * Strips undefined / null / empty-string values, drops the empty page/limit
   * for the export endpoint (Plan 05 export ignores pagination), and forwards
   * leadStatus as an array so axios serializes it as repeated keys.
   */
  function buildTrialSessionsParams(filters: TrialSessionsFiltersClient): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v === undefined || v === null) continue;
      if (typeof v === 'string' && v.length === 0) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      out[k] = v;
    }
    return out;
  }

  /**
   * Contador de la "pelotita": SP creadas desde la app pendientes de que
   * gestión inicie el seguimiento (dentro del país del usuario). El backend
   * resuelve el país desde el token, así que no lleva params.
   */
  async function fetchAppTrialsPendingCount(): Promise<number> {
    const { data } = await api.get<{ count: number }>(
      '/admin/reports/trial-sessions/app-pending-count'
    );
    return data.count;
  }

  /**
   * Sella el inicio del seguimiento de una SP de app (baja la pelotita).
   * Idempotente server-side. Devuelve el timestamp vigente.
   */
  async function startTrialFollowup(userId: number): Promise<string> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<{ followupStartedAt: string }>(
        `/admin/leads/${userId}/start-followup`
      );
      return data.followupStartedAt;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo iniciar el seguimiento');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Cadencia de mensajes en Sesiones de Prueba (brief Nacho, 2026-09-26) ─

  /**
   * `PATCH /trial-sessions/:bookingId/followup` — marca/desmarca un mensaje,
   * alterna "Respondió" o marca Perdida+motivo. Devuelve la fila completa
   * recalculada (server-side) para reemplazar la fila local sin un segundo GET.
   * Los 409 de guardrail (SESSION_CLOSED, M2_BEFORE_CLASS_END, etc.) llegan acá
   * como AxiosError — `extractError` ya toma `message` del body, que es el
   * texto en español que hay que mostrar tal cual (SPEC).
   */
  async function updateTrialFollowup(
    bookingId: number,
    action: TrialFollowupAction
  ): Promise<TrialSessionsRowClient> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.patch<TrialSessionsRowClient>(
        `/admin/reports/trial-sessions/${bookingId}/followup`,
        { action }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo actualizar el seguimiento');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** `GET /trial-sessions/shifts` — franjas de turno por sede (solo owner/admin). */
  async function getTrialShifts(): Promise<TrialShiftsRowClient[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<TrialShiftsRowClient[]>(
        '/admin/reports/trial-sessions/shifts'
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudieron cargar los turnos');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /** `PUT /trial-sessions/shifts/:branchId` — actualiza la franja de UNA sede. */
  async function updateTrialShifts(
    branchId: number,
    body: Partial<{
      morningStart: string;
      morningEnd: string;
      afternoonStart: string;
      afternoonEnd: string;
    }>
  ): Promise<TrialShiftsRowClient> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.put<TrialShiftsRowClient>(
        `/admin/reports/trial-sessions/shifts/${branchId}`,
        body
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo actualizar el turno');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Cleanup ───────────────────────────────────────────────────────────

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    getAccessLog,
    getChargeHistory,
    getExpiringMemberships,
    getInactiveMembers,
    getTrialConversion,
    getMultibranchReassignmentPreview,
    exportAccessLog,
    exportChargeHistory,
    exportExpiringMemberships,
    exportInactiveMembers,
    fetchTrialSessions,
    exportTrialSessions,
    fetchAppTrialsPendingCount,
    startTrialFollowup,
    updateTrialFollowup,
    getTrialShifts,
    updateTrialShifts,
    cleanup,
  };
}
