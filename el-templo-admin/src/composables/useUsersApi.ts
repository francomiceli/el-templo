import { ref } from 'vue';
import { api } from 'src/boot/axios';

export interface StaffUser {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  branchId: number;
  branchName: string | null;
  // Phase 103-06 (R11): replaces legacy `isActive`. Semantic inversion:
  // staffDisabled=true means deactivated (cannot log in once Plan 07 ships
  // the staff_disabled login gate); staffDisabled=false means active.
  staffDisabled: boolean;
  // Phase 110 REQ-1: country of management. NULL for owner / coach / recepción / member.
  country: 'AR' | 'ES' | null;
  // Phase 110 REQ-2: operational branch ids (coach/recepción only).
  // Empty array for admin / gestion / owner / member.
  branchIds: number[];
  createdAt: string;
}

export interface CreateStaffInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: 'coach' | 'admin' | 'owner' | 'gestion' | 'recepcion';
  branchId: number;
  // Phase 110: required for admin / gestion (validated server-side per REQ-9).
  country?: 'AR' | 'ES' | null;
  // Phase 110: required (≥ 1) for coach / recepción (validated server-side per REQ-9).
  branchIds?: number[];
}

export interface UpdateStaffInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  role?: 'coach' | 'admin' | 'owner' | 'gestion' | 'recepcion';
  branchId?: number;
  country?: 'AR' | 'ES' | null;
  branchIds?: number[];
}

function extractError(err: unknown, fallback: string): string {
  const axiosErr = err as {
    response?: { data?: { message?: string; error?: string }; status?: number };
  };
  if (axiosErr.response?.status === 409) {
    return axiosErr.response.data?.message ?? 'Email ya registrado';
  }
  if (axiosErr.response?.data?.message) {
    return axiosErr.response.data.message;
  }
  if (axiosErr.response?.data?.error) {
    return axiosErr.response.data.error;
  }
  return err instanceof Error ? err.message : fallback;
}

export function useUsersApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);
  const users = ref<StaffUser[]>([]);

  async function fetchUsers() {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<StaffUser[]>('/admin/users');
      users.value = data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando usuarios');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function createUser(input: CreateStaffInput): Promise<StaffUser> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<StaffUser>('/admin/users', input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error creando usuario');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function updateUser(userId: number, input: UpdateStaffInput): Promise<StaffUser> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.put<StaffUser>(`/admin/users/${userId}`, input);
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error actualizando usuario');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Phase 103-06 (R11): renamed from `toggleUserStatus`. The endpoint
   * payload is now `{ disabled: boolean }` with semantic inversion:
   * `disabled=true` deactivates (writes users.staff_disabled=TRUE);
   * `disabled=false` reactivates. The caller computes the desired state
   * from the current `staffDisabled` value: `disabled: !user.staffDisabled`.
   * Returns the new `staffDisabled` value from the server response.
   */
  async function setStaffDisabled(userId: number, disabled: boolean): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.patch<{ staffDisabled: boolean }>(
        `/admin/users/${userId}/status`,
        { disabled }
      );
      return data.staffDisabled;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cambiando estado');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function cleanup() {
    loading.value = false;
    error.value = null;
    users.value = [];
  }

  return { loading, error, users, fetchUsers, createUser, updateUser, setStaffDisabled, cleanup };
}
