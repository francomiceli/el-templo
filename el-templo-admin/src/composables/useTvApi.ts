/**
 * TV de sucursal — composable del módulo TV (fase 164, wave 3).
 *
 * Wrapper delgado sobre las rutas de staff `/api/admin/tv` publicadas por el
 * plan 164-03 (ver `164-03-SUMMARY.md`). Espeja la forma de `useFinanceLoadApi`:
 * refs `loading`/`error`, `api` de `boot/axios`, `extractError` para los mensajes
 * y un `cleanup()` que resetea el estado.
 *
 * Per CLAUDE.md: el composable NO registra ningún hook de unmount de Vue (el
 * llamador es dueño del ciclo de vida y llama `cleanup()`); no escribe a la
 * consola del navegador (eso lo hace `createLogger` en la página); nada de `any`.
 *
 * Autoridad: el gate real de rol (`TV_CONTROL_ROLES`, D-01) y de sede
 * (`requireBranchAccess`) vive en el API. Este archivo solo transporta.
 *
 * Este composable NUNCA maneja el device token: el listado no lo devuelve y no
 * existe ruta de staff que lo entregue (D-03 — se corta revocando la fila).
 */

import { ref } from 'vue';
import axios from 'axios';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';

// -- Contrato del código de vinculación (espeja el API) ----------------------

/**
 * Largo del código que muestra la pantalla del TV. Espeja
 * `TV_USER_CODE_LENGTH` de `el-templo-api/src/modules/tv/schemas.ts` — el
 * validador con autoridad es el `pattern` del JSON Schema del servidor; acá solo
 * se usa para no mandar un request que ya se sabe inválido (mismo criterio con
 * el que `templo-config.ts` espeja los sets de roles del API).
 */
export const TV_USER_CODE_LENGTH = 6;

/**
 * Alfabeto del `user_code` (sin I/O/0/1: se confunden leídos desde el fondo de
 * la sala). Espeja `TV_USER_CODE_ALPHABET` del API.
 */
const TV_USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const TV_USER_CODE_RE = new RegExp(`^[${TV_USER_CODE_ALPHABET}]{${TV_USER_CODE_LENGTH}}$`);

/**
 * Normaliza lo que tipea el staff: mayúsculas y sin espacios (el código se dicta
 * en voz alta desde la sala, así que llega con espacios y en minúscula).
 */
export function normalizeUserCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/** True cuando el código ya normalizado tiene la forma que el API acepta. */
export function isValidUserCode(raw: string): boolean {
  return TV_USER_CODE_RE.test(normalizeUserCode(raw));
}

// -- Request / response shapes (espejan control-routes.ts) -------------------

/** Body de POST /admin/tv/pair/claim — el staff tipea el código y elige la sede (D-01). */
export interface TvClaimInput {
  /** Código de 6 caracteres que muestra la pantalla del TV. Se normaliza antes de enviarlo. */
  userCode: string;
  /** Sede a la que queda atado el televisor. Gateada por `requireBranchAccess` server-side. */
  branchId: number;
  /** Etiqueta libre opcional ("TV sala", "TV recepción"). maxLength 100 en el API. */
  name?: string;
}

/**
 * Fila de GET /admin/tv/devices. El response schema del API acota el payload a
 * exactamente estos campos — no viaja ningún secreto por esta ruta (T-164-11).
 */
export interface TvDeviceRow {
  id: number;
  /** null cuando se vinculó sin etiqueta. */
  name: string | null;
  branchId: number;
  /** null solo si la sede se borró (leftJoin). */
  branchName: string | null;
  /** D-03: el device token no expira; `isActive=false` es la única forma de cortarlo. */
  isActive: boolean;
  /** D-05: ISO date-time del último poll del TV. null = nunca reportó. Alimenta el "visto hace X". */
  lastSeenAt: string | null;
  /** ISO date-time del alta del dispositivo. */
  createdAt: string;
}

/**
 * Traduce un error del claim al mensaje que ve el staff. Los dos 4xx que el API
 * distingue son operativos, no bugs: 404 = el código no existe (mal tipeado o de
 * una sesión vieja del kiosco), 409 = ese código ya fue usado por otro claim.
 */
export function describeClaimError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (status === 404) return 'Ese código no existe. Revisá lo que muestra la pantalla del TV.';
    if (status === 409)
      return 'Ese código ya fue usado. Reiniciá el TV para que muestre uno nuevo.';
  }
  return extractError(err, 'No se pudo vincular el televisor. Reintentá.');
}

export function useTvApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  /**
   * POST /admin/tv/pair/claim — vincula el televisor que muestra `userCode` a la
   * sede elegida. El TV se entera solo en su siguiente poll (hasta 3 s): esta
   * llamada no devuelve nada que el staff necesite ver.
   */
  async function claimPairing(input: TvClaimInput): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const body: TvClaimInput = {
        userCode: normalizeUserCode(input.userCode),
        branchId: input.branchId,
      };
      const name = input.name?.trim();
      if (name) body.name = name;
      await api.post('/admin/tv/pair/claim', body);
    } catch (err: unknown) {
      error.value = describeClaimError(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * GET /admin/tv/devices — televisores visibles. Sin `branchId` devuelve los de
   * todas las sedes del scope del usuario (nunca todas las del sistema: el
   * filtro del API es fail-closed).
   */
  async function listDevices(branchId?: number): Promise<TvDeviceRow[]> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<{ devices: TvDeviceRow[] }>('/admin/tv/devices', {
        params: branchId === undefined ? {} : { branchId },
      });
      return data.devices;
    } catch (err: unknown) {
      error.value = extractError(err, 'Error cargando los televisores');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * POST /admin/tv/devices/:id/revoke — corta el acceso de ese televisor (D-03).
   * Idempotente: revocar uno ya revocado responde 200.
   */
  async function revokeDevice(id: number): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.post(`/admin/tv/devices/${id}/revoke`);
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo revocar el televisor. Reintentá.');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    claimPairing,
    listDevices,
    revokeDevice,
    cleanup,
  };
}
