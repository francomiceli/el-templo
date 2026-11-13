import { boot } from 'quasar/wrappers';
import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { createLogger } from 'src/utils/logger';

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $axios: AxiosInstance;
    $api: AxiosInstance;
  }
}

// Augment the axios request config / error with our retry + redirect flags
// instead of casting through `any` (CLAUDE.md no-any rule).
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    __isRetry?: boolean;
  }
  interface AxiosError {
    __authRedirected?: boolean;
    /** El 401 no se pudo resolver porque el refresh falló por red/servidor: la sesión sigue. */
    __refreshUnavailable?: boolean;
  }
}

const log = createLogger('AdminAxios');

// Storage keys — dual-key with deferred cleanup of the legacy single key (D-03).
const ACCESS_KEY = 'adminAccessToken';
const REFRESH_KEY = 'adminRefreshToken';
const LEGACY_KEY = 'adminToken';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Create API instance with base URL from environment
const api = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Raw axios instance for /auth/refresh — NO interceptors, so a 401 from the
// refresh call itself never re-enters the lock (structural loop prevention).
const refreshClient = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- Token storage helpers (dual-key + legacy fallback, D-03) -------------

function getAccess(): string | null {
  return localStorage.getItem(ACCESS_KEY) ?? localStorage.getItem(LEGACY_KEY);
}

function getRefresh(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
  // Deferred cleanup: legacy key removed on first successful refresh / re-login.
  localStorage.removeItem(LEGACY_KEY);
}

function clearAll(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(LEGACY_KEY);
}

// --- Refresh lock (D-02) --------------------------------------------------
// Module-scope shared promise: the first 401 triggers a single /auth/refresh;
// concurrent requests await the same promise and retry once with the new access.

/**
 * Resultado de un intento de refresh (mismo contrato que la app de socios):
 * - 'ok': tokens rotados.
 * - 'rejected': el servidor rechazó la sesión (401/403) o no hay refresh token.
 * - 'network': sin respuesta (red caída, timeout) o 5xx/429 — p. ej. la API
 *   reiniciando en un deploy. El refresh token PODRÍA seguir siendo válido, así
 *   que NO es motivo para cerrar sesión.
 *
 * Hotfix 2026-11-13: antes cualquier falla del refresh borraba la sesión, y un
 * profe con mala señal en la sede quedaba afuera y tenía que tipear una clave
 * que no escribía hacía semanas.
 */
export type RefreshResult =
  | { kind: 'ok'; token: string }
  | { kind: 'rejected' }
  | { kind: 'network' };

/** 401/403 = el servidor rechazó explícitamente la sesión. Cualquier otro
 * código (o la ausencia de respuesta) es un problema transitorio. */
function isSessionRejectedStatus(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

/**
 * ¿Este error de una request autenticada dice que la sesión terminó?
 * Solo cuando el servidor respondió 401/403 y el refresh no quedó a medias por
 * la red. Sin respuesta, 5xx, 429, o un 401 cuyo refresh falló por red → la
 * sesión sigue (devuelve false). Un error que no es de axios no dice nada de la
 * sesión → true (comportamiento conservador previo: se cierra).
 */
function isSessionEndedError(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return true;
  if (err.__refreshUnavailable) return false;
  return isSessionRejectedStatus(err.response?.status);
}

let refreshPromise: Promise<RefreshResult> | null = null;

async function runRefresh(): Promise<RefreshResult> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async (): Promise<RefreshResult> => {
    const refresh = getRefresh();
    if (!refresh) return { kind: 'rejected' };
    try {
      const { data } = await refreshClient.post<{
        accessToken: string;
        refreshToken: string;
      }>('/auth/refresh', { refreshToken: refresh });
      setTokens(data.accessToken, data.refreshToken);
      return { kind: 'ok', token: data.accessToken };
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (isSessionRejectedStatus(status)) {
        log.warn('Refresh rechazado por el servidor', { status });
        return { kind: 'rejected' };
      }
      // Sin response (red/timeout), 5xx o 429: transitorio. NO se borran los
      // tokens — la próxima request vuelve a refrescar con la red recuperada.
      log.warn('Refresh no se pudo completar (red/servidor); se mantiene la sesión', { status });
      return { kind: 'network' };
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

/** Test seam: reset the module-scope lock between test cases. */
function __resetRefreshLock(): void {
  refreshPromise = null;
}

function redirectToLogin(): void {
  if (window.location.pathname !== '/login') {
    window.location.href = '/login';
  }
}

// Factory so the 401 handler can be unit-tested without booting Quasar.
function createAuthErrorHandler(
  retryInstance: AxiosInstance,
  onRedirect: () => void | Promise<void>
) {
  return async (error: AxiosError): Promise<unknown> => {
    if (error.response?.status !== 401) {
      return Promise.reject(error);
    }

    const config = error.config as InternalAxiosRequestConfig | undefined;
    const url = config?.url ?? '';

    const failAuth = async (): Promise<never> => {
      error.__authRedirected = true;
      clearAll();
      await onRedirect();
      return Promise.reject(error);
    };

    // (a0) Un 401 de /auth/login es "credenciales inválidas", no una sesión
    // vencida: se devuelve tal cual a la pantalla de login. Sin esto, con
    // tokens viejos guardados (p. ej. tras un arranque sin señal) un error de
    // clave disparaba un refresh y un reintento del login con Bearer.
    if (url.includes('/auth/login')) {
      return Promise.reject(error);
    }
    // (a) Whitelist: a 401 from /auth/refresh itself -> clear+redirect, no loop.
    if (url.includes('/auth/refresh')) {
      return failAuth();
    }
    // (b) Already retried once -> give up.
    if (config?.__isRetry) {
      return failAuth();
    }
    // (c) No refresh token available -> nothing to refresh with.
    if (!getRefresh()) {
      return failAuth();
    }

    // (d) Normal case: refresh once (shared lock) and retry the original request.
    const result = await runRefresh();
    if (result.kind === 'network') {
      // Falla transitoria del refresh: se rechaza SOLO esta request, sin tocar
      // tokens ni redirigir a /login. La próxima request vuelve a intentar.
      error.__refreshUnavailable = true;
      return Promise.reject(error);
    }
    if (result.kind === 'rejected') {
      return failAuth();
    }
    if (config) {
      config.__isRetry = true;
      config.headers.Authorization = `Bearer ${result.token}`;
      return retryInstance(config);
    }
    return failAuth();
  };
}

// Request interceptor - add auth token to requests (dual-key read).
api.interceptors.request.use((config) => {
  const token = getAccess();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle 401 with lock + single retry.
api.interceptors.response.use((response) => response, createAuthErrorHandler(api, redirectToLogin));

export default boot(({ app }) => {
  // Make axios available globally via this.$axios and this.$api
  app.config.globalProperties.$axios = axios;
  app.config.globalProperties.$api = api;
});

// Export for use in stores and composables
export { api, createAuthErrorHandler, runRefresh, isSessionEndedError, __resetRefreshLock };
