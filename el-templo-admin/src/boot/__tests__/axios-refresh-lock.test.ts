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

import { createAuthErrorHandler, runRefresh, __resetRefreshLock } from '../axios';

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
    expect(a).toBe('new-access');
    expect(refreshCallCount).toBe(1);
    store[REFRESH_KEY] = 'refresh-2';
    const b = await runRefresh();
    expect(b).toBe('new-access');
    expect(refreshCallCount).toBe(2);
  });
});
