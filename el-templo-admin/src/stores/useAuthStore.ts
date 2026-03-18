import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from 'src/boot/axios';
import type { AdminUser, AdminRole } from 'src/types/admin';

const ADMIN_ROLES: AdminRole[] = ['recepcionista', 'coach', 'admin', 'superadmin'];

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('adminToken'));
  const user = ref<AdminUser | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => !!token.value && !!user.value);

  async function login(email: string, password: string) {
    loading.value = true;
    error.value = null;

    try {
      const { data } = await api.post('/auth/login', { email, password });

      // Verify admin role before accepting login
      if (!ADMIN_ROLES.includes(data.user.role)) {
        throw new Error('Acceso denegado. Solo administradores y coaches.');
      }

      token.value = data.token;
      user.value = data.user;
      localStorage.setItem('adminToken', data.token);
    } catch (err: unknown) {
      const axiosError = err as { message?: string; response?: { data?: { error?: string } } };
      error.value =
        axiosError.message || axiosError.response?.data?.error || 'Error de inicio de sesion';
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function logout() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('adminToken');
  }

  async function checkAuth(): Promise<boolean> {
    const storedToken = localStorage.getItem('adminToken');
    if (!storedToken) return false;

    try {
      const { data } = await api.get('/auth/me');
      if (!ADMIN_ROLES.includes(data.role)) {
        await logout();
        return false;
      }
      user.value = data;
      token.value = storedToken;
      return true;
    } catch {
      await logout();
      return false;
    }
  }

  return { token, user, loading, error, isAuthenticated, login, logout, checkAuth };
});
