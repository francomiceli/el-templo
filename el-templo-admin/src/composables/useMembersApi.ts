/**
 * Members API composable.
 * Provides CRUD methods for member management, DNI checks,
 * notes CRUD, and branches loading.
 */

import { ref } from 'vue';
import axios from 'axios';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import { createLogger } from 'src/utils/logger';
import type {
  MemberProfile,
  MemberListParams,
  MembersListResponse,
  CreateMemberInput,
  CreateTrialMemberInput,
  CreateTrialMemberResponse,
  CreateAssistedInvitationInput,
  InvitationActivation,
  InvitationFailure,
  InvitationsOverview,
  InvitedByView,
  MembershipKind,
  UpdateMemberInput,
  DniCheckResult,
  MemberNote,
  CreateNoteInput,
  UpdateNoteInput,
  BranchOption,
} from 'src/types/member';

const log = createLogger('members-api');

// Phase 129 (KAIROS-01): kairos added for parity with the widened users.level /
// completed_sessions.session_level enums — a member's session counts may now be
// reported under 'kairos'.
export type SessionLevelKey = 'kairos' | 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan';
export interface SessionLevelCount {
  level: SessionLevelKey;
  count: number;
}

// Phase 114-04: PATCH /admin/leads/:userId payload + response. Mirrors
// el-templo-api/src/modules/members/types.ts (UpdateLeadInput / LeadSnapshot).
// Hotfix 2026-07: 'cerrado' → 'ganado' + "Plan comprado" (purchasedPlanId).
// Invariante server-side: 'ganado' ⇔ plan cargado (409 si no cierra).
export type LeadStatusValue = 'en_seguimiento' | 'ganado' | 'perdido';

export interface UpdateLeadPayload {
  leadStatus?: LeadStatusValue;
  leadNotes?: string | null;
  purchasedPlanId?: number | null;
}

export interface LeadSnapshot {
  userId: number;
  leadStatus: LeadStatusValue | null;
  leadNotes: string | null;
  purchasedPlanId: number | null;
  purchasedPlanName: string | null;
  status: 'freemium' | 'prueba' | 'activo' | 'inactivo' | null;
  createdBy: { userId: number; name: string } | null;
}

// Phase 111 REQ-4: backend contract for /admin/members/check-duplicates.
// Mirrors el-templo-api/src/modules/members/service.ts checkDuplicates()
// response shape exactly — see 111-04-SUMMARY.md.
export interface DuplicateMatch {
  id: number;
  firstName: string | null;
  lastName: string | null;
  branchId: number;
  branchName: string;
  isVirtual: boolean;
  status: string | null;
  deletedAt: string | null;
  matchedField: 'dni' | 'phone';
}

// Lightweight typeahead result from GET /admin/members/search. Mirrors
// el-templo-api MemberSearchItem — only the fields needed to render an option.
export interface MemberSearchResult {
  id: number;
  firstName: string | null;
  lastName: string | null;
  dni: string | null;
  planName: string | null;
  status: 'freemium' | 'prueba' | 'activo' | 'inactivo' | null;
  /**
   * 2026-09-26 (feat/admin-sede-visitantes) — presentes SOLO cuando el
   * caller pasó `includeOtherBranches: true` (admin_sede) Y esta fila es de
   * OTRA sede. `dni` viene enmascarado a los últimos 3 dígitos y
   * `planName`/`status` en null (proyección mínima, ver members/service.ts).
   */
  isOtherBranch?: boolean;
  visitorBranchId?: number;
  visitorBranchName?: string | null;
}

// Phase 158-04 (VIS-03) + Fase 194-19: shape de GET /admin/members/:id/referrals. Espeja
// ReferralOverview / ReferralLinkView de el-templo-api/src/modules/referrals/types.ts.
// El state deriva del server (deriveCoveredUntil, D-28), nunca de users.status.
// `referred`/`referredBy` son los vínculos de descuento (incluye los heredados sin
// invitación); `invitations`/`invitedBy` son el modelo de invitaciones con accesos.
export interface MemberReferralLink {
  userId: number;
  fullName: string;
  state: 'pending' | 'active' | 'suspended';
}

export interface DiscountSideView {
  perLinkPercent: number;
  activeCount: number;
  percent: number;
}

export interface MemberReferralsResponse {
  referralCode: string;
  discount: {
    percent: number;
    activeCount: number;
    perLinkPercent: number;
    capPercent: number;
    /** Mismo descuento abierto por lado: como invitador y como invitado. */
    bySide: { inviter: DiscountSideView; invitee: DiscountSideView };
  };
  referred: MemberReferralLink[];
  referredBy: MemberReferralLink | null;
  invitations: InvitationsOverview;
  invitedBy: InvitedByView | null;
}

/**
 * Fase 194: los errores de reglas de invitación llegan como `{ error, message, reason }`
 * (409/400/404). `extractError` conserva el `message`; esto conserva además el `reason`
 * (cupo agotado, `phone_required`, etc.). `null` si el error no es de reglas de invitación.
 */
export function parseInvitationFailure(err: unknown): InvitationFailure | null {
  if (!axios.isAxiosError(err)) return null;
  const data: unknown = err.response?.data;
  if (typeof data !== 'object' || data === null) return null;
  const { reason, message } = data as { reason?: unknown; message?: unknown };
  if (typeof reason !== 'string' || typeof message !== 'string') return null;
  return { reason, message };
}

// Fase 173: respuesta de POST /admin/members/:id/referrals (atribución
// retroactiva). `status` lo decide el server con el criterio del cobro
// (pricePaid > 0), no el cliente.
export interface AssignReferrerResponse {
  status: 'pending' | 'qualified';
  referrerId: number;
  referredId: number;
}

export function useMembersApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ─── Members CRUD ─────────────────────────────────────────────────────

  async function getMembers(params?: MemberListParams): Promise<MembersListResponse> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<MembersListResponse>('/admin/members', { params });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando miembros');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Lightweight member typeahead for scheduling dialogs. Hits the dedicated
   * /admin/members/search endpoint (id/name/dni + plan/status only) instead of
   * the heavy listing endpoint, which timed out on common substrings.
   * Intentionally does NOT touch the shared loading flag — callers track their
   * own per-typeahead loading state.
   */
  async function searchMembers(
    search: string,
    limit = 10,
    opts: { membershipKind?: MembershipKind; includeOtherBranches?: boolean } = {}
  ): Promise<MemberSearchResult[]> {
    const { data } = await api.get<{ members: MemberSearchResult[] }>('/admin/members/search', {
      params: {
        search,
        limit,
        ...(opts.membershipKind ? { membershipKind: opts.membershipKind } : {}),
        // 2026-09-26 (feat/admin-sede-visitantes): flag explícito del picker —
        // solo lo pasan SlotDetailDialog/CobrosPage cuando el admin_sede activó
        // el toggle "Buscar en otras sedes". No-op server-side para el resto.
        ...(opts.includeOtherBranches ? { includeOtherBranches: true } : {}),
      },
    });
    return data.members;
  }

  async function getMember(userId: number): Promise<MemberProfile> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<MemberProfile>(`/admin/members/${userId}`);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando miembro');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function createMember(input: CreateMemberInput): Promise<MemberProfile> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<MemberProfile>('/admin/members', input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error creando miembro');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Soft register a "sesión de prueba" lead — name + phone + branch only.
   * Email/DNI/etc. are filled in later when the lead converts.
   */
  async function createTrialMember(
    input: CreateTrialMemberInput
  ): Promise<CreateTrialMemberResponse> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<CreateTrialMemberResponse>('/admin/members/trial', input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error creando sesión de prueba');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Convert a self-registered freemium member into a "sesión de prueba" lead.
   * branchId must be a physical sede (the API rejects virtual branches) — that's
   * where the trial session will later be booked.
   */
  async function convertToTrial(userId: number, branchId: number): Promise<MemberProfile> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<MemberProfile>(`/admin/members/${userId}/convert-to-trial`, {
        branchId,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error convirtiendo a sesión de prueba');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updateMember(userId: number, input: UpdateMemberInput): Promise<MemberProfile> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.put<MemberProfile>(`/admin/members/${userId}`, input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error actualizando miembro');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function deleteMember(userId: number): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.delete(`/admin/members/${userId}`);
    } catch (err: unknown) {
      error.value = extractError(err, 'Error eliminando miembro');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Reset a member's password to the shared temp password ("eltemplo2026").
   * Restricted to owner/admin/gestion server-side.
   */
  async function resetMemberPassword(userId: number): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.put(`/admin/members/${userId}/password`);
    } catch (err: unknown) {
      error.value = extractError(err, 'Error reseteando contraseña');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Session Levels (Phase 99) ────────────────────────────────────────

  /**
   * Fetch per-level session completion counts for a member over the last
   * `days` days (default 30). Returns only levels with count > 0.
   * Errors are logged and re-thrown so callers can hide the chip row.
   */
  async function getSessionLevels(userId: number, days = 30): Promise<SessionLevelCount[]> {
    try {
      const { data } = await api.get<{ counts: SessionLevelCount[] }>(
        `/admin/members/${userId}/session-levels`,
        { params: { days } }
      );
      return data.counts;
    } catch (err: unknown) {
      log.error('getSessionLevels failed', {
        err: err instanceof Error ? err.message : String(err),
        userId,
        days,
      });
      throw err;
    }
  }

  // ─── DNI Check ────────────────────────────────────────────────────────

  async function checkDni(dni: string, excludeUserId?: number): Promise<DniCheckResult> {
    loading.value = true;
    error.value = null;
    try {
      const params: Record<string, unknown> = { dni };
      if (excludeUserId !== undefined) params.excludeUserId = excludeUserId;
      const { data } = await api.get<DniCheckResult>('/admin/members/check-dni', {
        params,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error verificando DNI');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Duplicate Check (Phase 111 REQ-4) ───────────────────────────────
  //
  // Multi-criterion lookup against /admin/members/check-duplicates.
  // Returns up to N matches by exact DNI or normalized last-10 phone digits.
  // Used by MemberFormDialog (create mode) on @blur of DNI / phone inputs to
  // surface ghost-twin accounts before the admin submits — see plan 111-04
  // for the backend contract and 111-05 for the UI wiring.

  async function checkDuplicates(opts: {
    dni?: string;
    phone?: string;
  }): Promise<{ matches: DuplicateMatch[] }> {
    loading.value = true;
    error.value = null;
    try {
      const params: Record<string, unknown> = {};
      if (opts.dni) params.dni = opts.dni;
      if (opts.phone) params.phone = opts.phone;
      const { data } = await api.get<{ matches: DuplicateMatch[] }>(
        '/admin/members/check-duplicates',
        { params }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error verificando duplicados');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Leads (Phase 114-04) ────────────────────────────────────────────
  //
  // PATCH /admin/leads/:userId mutates lead_status / lead_notes on a user
  // with status='prueba'. Backend response shape mirrors LeadSnapshot from
  // el-templo-api/src/modules/members/types.ts. leadNotes='' is treated as
  // explicit clear → stored as NULL by the server (D-28).

  async function updateLead(userId: number, payload: UpdateLeadPayload): Promise<LeadSnapshot> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.patch<LeadSnapshot>(`/admin/leads/${userId}`, payload);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error actualizando lead');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Notes ────────────────────────────────────────────────────────────

  async function getNotes(userId: number): Promise<MemberNote[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ notes: MemberNote[] }>(`/admin/members/${userId}/notes`);
      return data.notes;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando notas');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function createNote(userId: number, input: CreateNoteInput): Promise<MemberNote> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<MemberNote>(`/admin/members/${userId}/notes`, input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error creando nota');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updateNote(
    userId: number,
    noteId: number,
    input: UpdateNoteInput
  ): Promise<MemberNote> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.put<MemberNote>(`/admin/members/${userId}/notes/${noteId}`, input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error actualizando nota');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function deleteNote(userId: number, noteId: number): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.delete(`/admin/members/${userId}/notes/${noteId}`);
    } catch (err: unknown) {
      error.value = extractError(err, 'Error eliminando nota');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Invitaciones (Phase 158-04 VIS-03, Fase 194) ─────────────────────
  //
  // GET /admin/members/:id/referrals → ReferralOverview (incluye `invitations` e
  // `invitedBy`). Alimenta la pestaña "Invitaciones" de la ficha
  // (MemberReferralsTab). El guard de rol (MEMBER_LIFECYCLE_ROLES) vive en el
  // backend; el front solo consume.

  async function getReferrals(userId: number): Promise<MemberReferralsResponse> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<MemberReferralsResponse>(`/admin/members/${userId}/referrals`);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando invitaciones');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // POST /admin/members/:id/referrals → atribución retroactiva (fase 173, D-17).
  //
  // El alta pregunta "Invitado por" cuando recepción carga al alumno, pero el
  // dato suele llegar después. Es un vínculo de DESCUENTO sin accesos ni cupo
  // (la invitación con accesos va por createAssistedInvitation). El estado del
  // vínculo lo decide el backend.
  async function assignReferrer(
    userId: number,
    referrerId: number
  ): Promise<AssignReferrerResponse> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<AssignReferrerResponse>(
        `/admin/members/${userId}/referrals`,
        { referrerId }
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error asignando quién lo invitó');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // POST /admin/members/:userId/invitations → canal asistido (Fase 194 D-16): recepción
  // o gestión invita en nombre de un socio, con las mismas reglas que la app (cupo,
  // elegibilidad). Los rechazos traen `{ message, reason }`: ver parseInvitationFailure.
  async function createAssistedInvitation(
    userId: number,
    input: CreateAssistedInvitationInput
  ): Promise<InvitationActivation> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<InvitationActivation>(
        `/admin/members/${userId}/invitations`,
        input
      );
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error creando la invitación');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // POST /admin/members/:userId/invitations/:invitationId/void → anulación (gestión,
  // MEMBER_LIFECYCLE_ROLES). `userId` es el INVITADO de esa invitación. Libera el cupo,
  // cierra los accesos y cancela las reservas futuras.
  async function voidInvitation(
    userId: number,
    invitationId: number,
    reason: string
  ): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.post(`/admin/members/${userId}/invitations/${invitationId}/void`, { reason });
    } catch (err: unknown) {
      error.value = extractError(err, 'Error anulando la invitación');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Plans (lightweight for member creation dialog) ──────────────────

  interface PlanOption {
    id: number;
    name: string;
    planTier: string;
    multiBranch: boolean;
    priceRegular: number;
    durationDays: number;
    classesPerWeek: number | null;
    isArchived: boolean;
    country: 'AR' | 'ES';
    currency: 'ARS' | 'EUR';
  }

  async function getPlans(
    includeArchived = false,
    opts?: { branchId?: number; country?: 'AR' | 'ES' }
  ): Promise<PlanOption[]> {
    loading.value = true;
    error.value = null;
    try {
      const params: Record<string, unknown> = { isActive: true };
      if (includeArchived) params.includeArchived = true;
      if (opts?.branchId !== undefined) params.branchId = opts.branchId;
      if (opts?.country !== undefined) params.country = opts.country;
      const { data } = await api.get<{ plans: PlanOption[] }>('/admin/subscriptions/plans', {
        params,
      });
      return data.plans;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando planes');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Bulk Migration ────────────────────────────────────────────────

  interface BulkMigrateResponse {
    migrated: number;
    skipped: number;
    errors: Array<{ userId: number; error: string }>;
  }

  async function bulkMigratePlan(
    userIds: number[],
    targetPlanId: number,
    targetBranchId: number
  ): Promise<BulkMigrateResponse> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<BulkMigrateResponse>('/admin/subscriptions/bulk-migrate', {
        userIds,
        targetPlanId,
        targetBranchId,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error migrando planes');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Branches ─────────────────────────────────────────────────────────

  /**
   * GET /admin/members/branches — returns active branches scoped to the
   * current user's permissions:
   *   - owner without ?country=  → all branches (real + virtual)
   *   - owner with ?country=AR|ES → that country + virtual
   *   - admin/gestion             → own country + virtual
   *   - coach/recepción           → user_branches + virtual
   *
   * Phase 110 D-07/D-08/D-09: backend filter at members/routes.ts is the
   * single seam — frontend consumes the filtered list transparently. No
   * client-side filtering required (CajaPage, ReportesPage, AnaliticasPage,
   * AlumnosPage, AlumnoDetailPage, HorariosPage, UsuariosPage all consume
   * this composable / endpoint and rely on the backend scope).
   */
  async function getBranches(opts?: { country?: 'AR' | 'ES' }): Promise<BranchOption[]> {
    loading.value = true;
    error.value = null;
    try {
      const params: Record<string, unknown> = {};
      if (opts?.country !== undefined) params.country = opts.country;
      const { data } = await api.get<{ branches: BranchOption[] }>('/admin/members/branches', {
        params,
      });
      return data.branches;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando sucursales');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Photo Upload ────────────────────────────────────────────────────

  async function getPhotoUploadUrl(
    userId: number,
    filename: string
  ): Promise<{ uploadUrl: string; publicUrl: string }> {
    const { data } = await api.post<{ uploadUrl: string; publicUrl: string }>(
      `/admin/members/${userId}/photo/upload-url`,
      { filename }
    );
    return data;
  }

  async function uploadMemberPhoto(userId: number, file: File): Promise<string> {
    const { uploadUrl, publicUrl } = await getPhotoUploadUrl(userId, file.name);
    await axios.put(uploadUrl, file, {
      headers: { 'Content-Type': file.type || 'image/jpeg' },
    });
    return publicUrl;
  }

  // ─── Export ──────────────────────────────────────────────────────────

  async function exportMembers(params?: Omit<MemberListParams, 'page' | 'limit'>): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/admin/members/export', {
        params,
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando miembros');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * GET /admin/members/export-sepa — export mensual de domiciliación
   * bancaria (España). El backend acota siempre a sedes ES; default solo
   * socios activos (computado en vivo desde subscriptions).
   */
  async function exportSepaMembers(params?: {
    branchId?: number;
    status?: 'activo' | 'todos';
  }): Promise<Blob> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get('/admin/members/export-sepa', {
        params,
        responseType: 'blob',
      });
      return data as Blob;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error exportando domiciliación');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    getMembers,
    searchMembers,
    getMember,
    createMember,
    createTrialMember,
    convertToTrial,
    updateMember,
    updateLead,
    deleteMember,
    resetMemberPassword,
    checkDni,
    checkDuplicates,
    getPlans,
    bulkMigratePlan,
    getNotes,
    getReferrals,
    assignReferrer,
    createAssistedInvitation,
    voidInvitation,
    createNote,
    updateNote,
    deleteNote,
    getBranches,
    uploadMemberPhoto,
    exportMembers,
    exportSepaMembers,
    getSessionLevels,
    cleanup,
  };
}
