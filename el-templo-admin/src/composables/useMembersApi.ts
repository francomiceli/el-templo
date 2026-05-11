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
  UpdateMemberInput,
  DniCheckResult,
  MemberNote,
  CreateNoteInput,
  UpdateNoteInput,
  BranchOption,
} from 'src/types/member';

const log = createLogger('members-api');

export type SessionLevelKey = 'alfa' | 'delta' | 'sigma' | 'omega' | 'spartan';
export interface SessionLevelCount {
  level: SessionLevelKey;
  count: number;
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
  async function createTrialMember(input: CreateTrialMemberInput): Promise<MemberProfile> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<MemberProfile>('/admin/members/trial', input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error creando sesión de prueba');
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
  async function getBranches(): Promise<BranchOption[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ branches: BranchOption[] }>('/admin/members/branches');
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

  // ─── Cleanup ──────────────────────────────────────────────────────────

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    getMembers,
    getMember,
    createMember,
    createTrialMember,
    updateMember,
    deleteMember,
    resetMemberPassword,
    checkDni,
    checkDuplicates,
    getPlans,
    bulkMigratePlan,
    getNotes,
    createNote,
    updateNote,
    deleteNote,
    getBranches,
    uploadMemberPhoto,
    exportMembers,
    getSessionLevels,
    cleanup,
  };
}
