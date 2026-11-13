import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AxiosError } from 'axios';
import { createPinia, setActivePinia } from 'pinia';

/**
 * Hotfix 2026-11-13: `checkAuth` corre en CADA navegación del admin (guard
 * `beforeEach`). Antes cualquier error de GET /auth/me (sin señal, timeout, la
 * API reiniciando en un deploy) borraba la sesión y el profe tenía que volver a
 * tipear la clave. Ahora solo la cierra un rechazo del servidor.
 */

const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string): string | null => (k in store ? store[k] : null),
  setItem: (k: string, v: string): void => {
    store[k] = v;
  },
  removeItem: (k: string): void => {
    delete store[k];
  },
});
vi.stubGlobal('window', { location: { pathname: '/alumnos', href: '' } });

vi.mock('quasar/wrappers', () => ({ boot: (fn: unknown) => fn }));
vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { api } from 'src/boot/axios';
import { useAuthStore } from '../useAuthStore';

const ACCESS_KEY = 'adminAccessToken';
const REFRESH_KEY = 'adminRefreshToken';

const COACH = { id: 30, email: 'coach@test.com', role: 'coach', firstName: 'C', lastName: 'L' };

function axiosErr(status?: number, flags: { refreshUnavailable?: boolean } = {}): AxiosError {
  const err = new AxiosError(status ? `status ${status}` : 'Network Error');
  if (status) {
    err.response = { status, data: {}, statusText: '', headers: {}, config: {} as never };
  }
  if (flags.refreshUnavailable) err.__refreshUnavailable = true;
  return err;
}

describe('useAuthStore.checkAuth', () => {
  const getSpy = vi.spyOn(api, 'get');

  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    store[ACCESS_KEY] = 'access-1';
    store[REFRESH_KEY] = 'refresh-1';
    setActivePinia(createPinia());
    getSpy.mockReset();
  });

  it('/auth/me OK → true y carga el usuario', async () => {
    getSpy.mockResolvedValueOnce({ data: COACH });
    const auth = useAuthStore();

    await expect(auth.checkAuth()).resolves.toBe(true);
    expect(auth.user?.id).toBe(30);
  });

  it.each([
    ['sin respuesta (sin señal / timeout)', axiosErr()],
    ['502 (API reiniciando)', axiosErr(502)],
    ['500', axiosErr(500)],
    ['401 cuyo refresh falló por red', axiosErr(401, { refreshUnavailable: true })],
  ])('%s en arranque en frío → false pero CONSERVA los tokens', async (_label, err) => {
    getSpy.mockRejectedValueOnce(err);
    const auth = useAuthStore();

    await expect(auth.checkAuth()).resolves.toBe(false);
    expect(store[ACCESS_KEY]).toBe('access-1');
    expect(store[REFRESH_KEY]).toBe('refresh-1');
  });

  it('falla de red con el usuario ya cargado → deja navegar y conserva la sesión', async () => {
    const auth = useAuthStore();
    getSpy.mockResolvedValueOnce({ data: COACH });
    await auth.checkAuth();

    getSpy.mockRejectedValueOnce(axiosErr());
    await expect(auth.checkAuth()).resolves.toBe(true);
    expect(auth.user?.id).toBe(30);
    expect(store[REFRESH_KEY]).toBe('refresh-1');
  });

  it.each([401, 403])('rechazo del servidor %i → cierra sesión', async (status) => {
    getSpy.mockRejectedValueOnce(axiosErr(status));
    const auth = useAuthStore();

    await expect(auth.checkAuth()).resolves.toBe(false);
    expect(store[ACCESS_KEY]).toBeUndefined();
    expect(store[REFRESH_KEY]).toBeUndefined();
    expect(auth.user).toBeNull();
  });

  it('rol que no es de admin → cierra sesión', async () => {
    getSpy.mockResolvedValueOnce({ data: { ...COACH, role: 'member' } });
    const auth = useAuthStore();

    await expect(auth.checkAuth()).resolves.toBe(false);
    expect(store[REFRESH_KEY]).toBeUndefined();
  });

  it('sin token guardado → false sin llamar a la API', async () => {
    delete store[ACCESS_KEY];
    const auth = useAuthStore();

    await expect(auth.checkAuth()).resolves.toBe(false);
    expect(getSpy).not.toHaveBeenCalled();
  });
});
