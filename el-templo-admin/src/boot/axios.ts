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
let refreshPromise: Promise<string | null> | null = null;

async function runRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async (): Promise<string | null> => {
    const refresh = getRefresh();
    if (!refresh) return null;
    try {
      const { data } = await refreshClient.post<{
        accessToken: string;
        refreshToken: string;
      }>('/auth/refresh', { refreshToken: refresh });
      setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      log.warn('Refresh token rejected', { message });
      return null;
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
    const newAccess = await runRefresh();
    if (!newAccess) {
      return failAuth();
    }
    if (config) {
      config.__isRetry = true;
      config.headers.Authorization = `Bearer ${newAccess}`;
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
export { api, createAuthErrorHandler, runRefresh, __resetRefreshLock };
