import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface AuthUser {
  id: number;
  email: string;
  role: 'member' | 'coach' | 'admin' | 'superadmin';
}

export const useAuthStore = defineStore('auth', () => {
  // State
  const token = ref<string | null>(localStorage.getItem('authToken'));
  const user = ref<AuthUser | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const isAuthenticated = computed(() => !!token.value);
  const isCoach = computed(() => user.value?.role === 'coach' || user.value?.role === 'admin' || user.value?.role === 'superadmin');
  const isAdmin = computed(() => user.value?.role === 'admin' || user.value?.role === 'superadmin');
  const isSuperadmin = computed(() => user.value?.role === 'superadmin');

  // Actions
  function setAuth(newToken: string, newUser: AuthUser) {
    token.value = newToken;
    user.value = newUser;
    localStorage.setItem('authToken', newToken);
    error.value = null;
  }

  function clearAuth() {
    token.value = null;
    user.value = null;
    localStorage.removeItem('authToken');
  }

  function setError(message: string) {
    error.value = message;
  }

  function setLoading(state: boolean) {
    loading.value = state;
  }

  // Hydrate user from token on app start (will be implemented in Phase 2)
  async function hydrateFromToken() {
    if (!token.value) return;

    // TODO: Phase 2 - Call /api/auth/me to get user from token
    // For now, just check if token exists
  }

  return {
    // State
    token,
    user,
    loading,
    error,
    // Getters
    isAuthenticated,
    isCoach,
    isAdmin,
    isSuperadmin,
    // Actions
    setAuth,
    clearAuth,
    setError,
    setLoading,
    hydrateFromToken,
  };
});
