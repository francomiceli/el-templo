import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AxiosError, AxiosInstance } from 'axios';

// --- Mocks installed BEFORE importing the module under test --------------

// In-memory localStorage driving the dual-key storage in axios.ts.
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (k: string): string | null => (k in store ? store[k] : null),
  setItem: (k: string, v: string): void => {
    store[k] = v;
  },
  removeItem: (k: string): void => {
    delete store[k];
  },
  clear: (): void => {
    for (const k of Object.keys(store)) delete store[k];
  },
};

let refreshCallCount = 0;

/**
 * Cómo responde POST /auth/refresh en el caso actual:
 * - 'ok': tokens nuevos.
 * - número: AxiosError con ese status (401/403 = rechazo, 5xx/429 = transitorio).
 * - 'network': AxiosError SIN response (sin señal / timeout).
 */
let refreshOutcome: 'ok' | 'network' | number = 'ok';

// Stub window (jsdom is not guaranteed; provide a minimal redirect target).
const locationMock = { pathname: '/dashboard', href: '' };

vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('window', { location: locationMock });

// Mock the logger so no console noise / Sentry in tests.
vi.mock('src/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock axios.create so both `api` and the internal `refreshClient` are
// controllable. We track how many times POST /auth/refresh is called.
vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');

  function makeInstance() {
    const instance = (async (config: Record<string, unknown>) => {
      const url = String(config.url);
      if (url.includes('/auth/refresh')) {
        refreshCallCount += 1;
        await new Promise((r) => setTimeout(r, 10));
        return { data: { accessToken: 'new-access', refreshToken: 'refresh-2' } };
      }
      if ((config.headers as Record<string, string>)?.Authorization?.includes('new-access')) {
        return { data: { ok: true }, config };
      }
      const err = new actual.AxiosError('Unauthorized');
      err.response = {
        status: 401,
        data: {},
        statusText: '',
        headers: {},
        config: config as never,
      };
      err.config = config as never;
      throw err;
    }) as unknown as AxiosInstance & {
      post: (url: string, body?: unknown) => Promise<unknown>;
      interceptors: {
        request: { use: () => void };
        response: { use: () => void };
      };
    };
    instance.post = async (url: string) => {
      if (url.includes('/auth/refresh')) {
        refreshCallCount += 1;
        await new Promise((r) => setTimeout(r, 10));
        if (refreshOutcome === 'network') {
          throw new actual.AxiosError('Network Error', 'ERR_NETWORK');
        }
        if (typeof refreshOutcome === 'number') {
          const err = new actual.AxiosError('Request failed');
          err.response = {
            status: refreshOutcome,
            data: {},
            statusText: '',
            headers: {},
            config: {} as never,
          };
          throw err;
        }
        return { data: { accessToken: 'new-access', refreshToken: 'refresh-2' } };
      }
      return { data: {} };
    };
    instance.interceptors = {
      request: { use: () => {} },
      response: { use: () => {} },
    };
    return instance;
  }

  return {
    ...actual,
    default: { ...actual.default, create: () => makeInstance() },
    AxiosError: actual.AxiosError,
  };
});

import {
  createAuthErrorHandler,
  runRefresh,
  isSessionEndedError,
  __resetRefreshLock,
} from '../axios';

const ACCESS_KEY = 'adminAccessToken';
const REFRESH_KEY = 'adminRefreshToken';
const LEGACY_KEY = 'adminToken';

function make401(url: string): AxiosError {
  const err = new Error('Unauthorized') as AxiosError;
  err.isAxiosError = true;
  err.config = { url, headers: {} } as never;
  err.response = {
    status: 401,
    data: {},
    statusText: '',
    headers: {},
    config: err.config as never,
  };
  return err;
}

describe('admin axios refresh lock (D-02, Req 10)', () => {
  beforeEach(() => {
    refreshCallCount = 0;
    refreshOutcome = 'ok';
    localStorageMock.clear();
    store[ACCESS_KEY] = 'old-access';
    store[REFRESH_KEY] = 'refresh-1';
    locationMock.pathname = '/dashboard';
    locationMock.href = '';
    __resetRefreshLock();
  });

  it('5 requests 401 concurrentes disparan exactamente UN /auth/refresh y los 5 se reintentan', async () => {
    const retried: string[] = [];
    const retryInstance = (async (config: Record<string, unknown>) => {
      retried.push((config.headers as Record<string, string>).Authorization ?? '');
      return { data: { ok: true } };
    }) as unknown as AxiosInstance;

    const onRedirect = vi.fn(() => {});
    const handler = createAuthErrorHandler(retryInstance, onRedirect);

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => handler(make401(`/protected/${i}`)))
    );

    // Exactly one /auth/refresh fired for the whole storm.
    expect(refreshCallCount).toBe(1);
    // All 5 requests were retried with the rotated access token.
    expect(retried).toHaveLength(5);
    expect(retried.every((h) => h === 'Bearer new-access')).toBe(true);
    // No redirect happened (refresh succeeded).
    expect(onRedirect).not.toHaveBeenCalled();
    expect(results).toHaveLength(5);
    // setTokens wrote the new pair and cleaned up the legacy key (D-03).
    expect(store[ACCESS_KEY]).toBe('new-access');
    expect(store[REFRESH_KEY]).toBe('refresh-2');
    expect(store[LEGACY_KEY]).toBeUndefined();
  });

  it('un 401 de /auth/refresh hace clear+redirect sin re-disparar refresh (loop prevention)', async () => {
    const onRedirect = vi.fn(() => {});
    const retryInstance = (async () => ({ data: {} })) as unknown as AxiosInstance;
    const handler = createAuthErrorHandler(retryInstance, onRedirect);

    const err = make401('/auth/refresh');
    await expect(handler(err)).rejects.toBeDefined();

    expect(refreshCallCount).toBe(0);
    expect(onRedirect).toHaveBeenCalledTimes(1);
    expect((err as AxiosError & { __authRedirected?: boolean }).__authRedirected).toBe(true);
    // The 3 keys were cleared.
    expect(store[ACCESS_KEY]).toBeUndefined();
    expect(store[REFRESH_KEY]).toBeUndefined();
    expect(store[LEGACY_KEY]).toBeUndefined();
  });

  it('sin refreshToken disponible, el handler hace clear+redirect', async () => {
    delete store[REFRESH_KEY];
    const onRedirect = vi.fn(() => {});
    const retryInstance = (async () => ({ data: {} })) as unknown as AxiosInstance;
    const handler = createAuthErrorHandler(retryInstance, onRedirect);

    await expect(handler(make401('/protected/x'))).rejects.toBeDefined();
    expect(refreshCallCount).toBe(0);
    expect(onRedirect).toHaveBeenCalledTimes(1);
  });

  it('runRefresh resetea el lock para permitir un refresh en la siguiente oleada', async () => {
    const a = await runRefresh();
    expect(a).toEqual({ kind: 'ok', token: 'new-access' });
    expect(refreshCallCount).toBe(1);
    store[REFRESH_KEY] = 'refresh-2';
    const b = await runRefresh();
    expect(b).toEqual({ kind: 'ok', token: 'new-access' });
    expect(refreshCallCount).toBe(2);
  });
});

// Hotfix 2026-11-13: dos profes quedaron afuera del admin. Cualquier falla del
// refresh (sin señal, timeout, API reiniciando en un deploy) borraba la sesión.
// Ahora solo un rechazo explícito del servidor (401/403) la cierra.
describe('admin axios: el refresh fallido por red NO cierra la sesión', () => {
  beforeEach(() => {
    refreshCallCount = 0;
    refreshOutcome = 'ok';
    localStorageMock.clear();
    store[ACCESS_KEY] = 'old-access';
    store[REFRESH_KEY] = 'refresh-1';
    locationMock.pathname = '/dashboard';
    locationMock.href = '';
    __resetRefreshLock();
  });

  const neverRetry = (async () => {
    throw new Error('no debería reintentar');
  }) as unknown as AxiosInstance;

  it.each([
    ['sin respuesta (red/timeout)', 'network' as const],
    ['502 (API reiniciando)', 502],
    ['503', 503],
    ['500', 500],
    ['429 (rate limit)', 429],
  ])('refresh %s → conserva tokens, no redirige, marca el error', async (_label, outcome) => {
    refreshOutcome = outcome;
    const onRedirect = vi.fn(() => {});
    const handler = createAuthErrorHandler(neverRetry, onRedirect);
    const err = make401('/protected/x');

    await expect(handler(err)).rejects.toBe(err);

    expect(refreshCallCount).toBe(1);
    expect(onRedirect).not.toHaveBeenCalled();
    expect(err.__authRedirected).toBeUndefined();
    expect(err.__refreshUnavailable).toBe(true);
    expect(store[ACCESS_KEY]).toBe('old-access');
    expect(store[REFRESH_KEY]).toBe('refresh-1');
    // El error de la request original no cuenta como sesión terminada.
    expect(isSessionEndedError(err)).toBe(false);
  });

  it.each([401, 403])('refresh rechazado con %i → clear + redirect', async (status) => {
    refreshOutcome = status;
    const onRedirect = vi.fn(() => {});
    const handler = createAuthErrorHandler(neverRetry, onRedirect);
    const err = make401('/protected/x');

    await expect(handler(err)).rejects.toBe(err);

    expect(onRedirect).toHaveBeenCalledTimes(1);
    expect(err.__authRedirected).toBe(true);
    expect(store[ACCESS_KEY]).toBeUndefined();
    expect(store[REFRESH_KEY]).toBeUndefined();
    expect(isSessionEndedError(err)).toBe(true);
  });

  it('después de una falla de red, la próxima oleada vuelve a refrescar y reintenta', async () => {
    const onRedirect = vi.fn(() => {});
    const retried: string[] = [];
    const retryInstance = (async (config: Record<string, unknown>) => {
      retried.push((config.headers as Record<string, string>).Authorization ?? '');
      return { data: { ok: true } };
    }) as unknown as AxiosInstance;
    const handler = createAuthErrorHandler(retryInstance, onRedirect);

    refreshOutcome = 'network';
    await expect(handler(make401('/protected/a'))).rejects.toBeDefined();

    refreshOutcome = 'ok';
    await expect(handler(make401('/protected/b'))).resolves.toBeDefined();

    expect(refreshCallCount).toBe(2);
    expect(retried).toEqual(['Bearer new-access']);
    expect(onRedirect).not.toHaveBeenCalled();
    expect(store[REFRESH_KEY]).toBe('refresh-2');
  });

  it('un 401 de /auth/login (clave incorrecta) no refresca ni borra nada', async () => {
    const onRedirect = vi.fn(() => {});
    const handler = createAuthErrorHandler(neverRetry, onRedirect);
    const err = make401('/auth/login');

    await expect(handler(err)).rejects.toBe(err);

    expect(refreshCallCount).toBe(0);
    expect(onRedirect).not.toHaveBeenCalled();
    expect(store[REFRESH_KEY]).toBe('refresh-1');
  });

  it('isSessionEndedError: solo 401/403 sin marca de red cierran sesión', () => {
    const withStatus = (status: number): AxiosError => {
      const e = make401('/x');
      (e.response as { status: number }).status = status;
      return e;
    };
    const noResponse = make401('/x');
    noResponse.response = undefined;

    expect(isSessionEndedError(withStatus(401))).toBe(true);
    expect(isSessionEndedError(withStatus(403))).toBe(true);
    expect(isSessionEndedError(withStatus(500))).toBe(false);
    expect(isSessionEndedError(withStatus(502))).toBe(false);
    expect(isSessionEndedError(withStatus(429))).toBe(false);
    expect(isSessionEndedError(noResponse)).toBe(false);
    // Un error que no es de axios no dice nada de la red: se mantiene el
    // comportamiento previo (cerrar).
    expect(isSessionEndedError(new TypeError('x is undefined'))).toBe(true);
  });
});
