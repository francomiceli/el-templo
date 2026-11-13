import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api, isSessionEndedError } from 'src/boot/axios';
import type { AdminUser, AdminRole } from 'src/types/admin';

const ADMIN_ROLES: AdminRole[] = [
  'gestion',
  'coach',
  'admin',
  'owner',
  'recepcion',
  'tv',
  'admin_sede',
  // 2026-10-06: profe de actividad (yoga) sin plata.
  'coach_actividad',
];

const ACCESS_KEY = 'adminAccessToken';
const REFRESH_KEY = 'adminRefreshToken';
const LEGACY_KEY = 'adminToken';

interface LoginResponse {
  token: string;
  accessToken: string;
  refreshToken: string;
  user: AdminUser;
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(
    localStorage.getItem(ACCESS_KEY) ?? localStorage.getItem(LEGACY_KEY)
  );
  const user = ref<AdminUser | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => !!token.value && !!user.value);

  async function login(email: string, password: string) {
    loading.value = true;
    error.value = null;

    try {
      const { data } = await api.post<LoginResponse>('/auth/login', { email, password });

      // Verify admin role before accepting login
      if (!ADMIN_ROLES.includes(data.user.role)) {
        throw new Error('Acceso denegado. Solo administradores y coaches.');
      }

      token.value = data.accessToken;
      user.value = data.user;
      localStorage.setItem(ACCESS_KEY, data.accessToken);
      localStorage.setItem(REFRESH_KEY, data.refreshToken);
      // Deferred cleanup of the legacy single-key token (soft migration D-03).
      localStorage.removeItem(LEGACY_KEY);
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
    localStorage.removeItem(LEGACY_KEY);
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }

  async function checkAuth(): Promise<boolean> {
    const storedToken = localStorage.getItem(ACCESS_KEY) ?? localStorage.getItem(LEGACY_KEY);
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
    } catch (err: unknown) {
      // Hotfix 2026-11-13: este chequeo corre en CADA navegación. Antes
      // cualquier error (sin señal, timeout, la API reiniciando en un deploy)
      // borraba la sesión. Ahora solo se cierra si el servidor la rechazó.
      if (isSessionEndedError(err)) {
        await logout();
        return false;
      }
      // Falla transitoria: los tokens quedan. Si ya había usuario cargado se
      // deja navegar (la página mostrará su propio error de red); en un
      // arranque en frío sin usuario se manda a /login, pero sin borrar nada:
      // al recargar con señal la sesión sigue.
      return user.value !== null;
    }
  }

  return { token, user, loading, error, isAuthenticated, login, logout, checkAuth };
});
