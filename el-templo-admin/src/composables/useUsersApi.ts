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
  isActive: boolean;
  createdAt: string;
}

export interface CreateStaffInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: 'coach' | 'admin' | 'owner' | 'gestion' | 'recepcion';
  branchId: number;
}

export interface UpdateStaffInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  role?: 'coach' | 'admin' | 'owner' | 'gestion' | 'recepcion';
  branchId?: number;
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

  async function toggleUserStatus(userId: number): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.patch<{ isActive: boolean }>(`/admin/users/${userId}/status`);
      return data.isActive;
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

  return { loading, error, users, fetchUsers, createUser, updateUser, toggleUserStatus, cleanup };
}
