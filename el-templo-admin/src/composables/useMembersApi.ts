/**
 * Members API composable.
 * Provides CRUD methods for member management, DNI checks,
 * notes CRUD, and branches loading.
 */

import { ref } from 'vue';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type {
  MemberListItem,
  MemberProfile,
  MemberListParams,
  CreateMemberInput,
  UpdateMemberInput,
  DniCheckResult,
  MemberNote,
  CreateNoteInput,
  UpdateNoteInput,
  BranchOption,
} from 'src/types/member';

export function useMembersApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ─── Members CRUD ─────────────────────────────────────────────────────

  async function getMembers(
    params?: MemberListParams
  ): Promise<{ members: MemberListItem[]; total: number }> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ members: MemberListItem[]; total: number }>(
        '/admin/members',
        { params }
      );
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

  async function toggleMemberStatus(userId: number, isActive: boolean): Promise<MemberProfile> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.patch<MemberProfile>(`/admin/members/${userId}/status`, {
        isActive,
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error actualizando estado');
      throw err;
    } finally {
      loading.value = false;
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
  }

  async function getPlans(includeArchived = false): Promise<PlanOption[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ plans: PlanOption[] }>('/admin/subscriptions/plans', {
        params: { isActive: true, ...(includeArchived ? { includeArchived: true } : {}) },
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
    updateMember,
    toggleMemberStatus,
    checkDni,
    getPlans,
    bulkMigratePlan,
    getNotes,
    createNote,
    updateNote,
    deleteNote,
    getBranches,
    cleanup,
  };
}
