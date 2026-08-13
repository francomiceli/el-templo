/**
 * TV de sucursal — composable del módulo TV (fase 164, wave 3; pase a pantalla
 * autenticada en el plan de retiro del kiosco RFC 8628).
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
 * El kiosco anónimo (RFC 8628: vinculación por código, listado/revocación de
 * dispositivos) se retiró: la pantalla del TV ahora es una vista del admin
 * autenticada (`GET /admin/tv/control/screen`, ver `getScreen` más abajo), así
 * que el device token dejó de existir del todo.
 */

import { ref } from 'vue';
import axios from 'axios';
import { api } from 'src/boot/axios';
import { extractError } from 'src/utils/extract-error';
import type { TvPollResponse } from 'src/tv/poll';

// -- Contrato del control del profe (espeja types.ts del API) ----------------
//
// El admin NO importa del backend (son dos paquetes distintos, sin tipos
// compartidos): estas interfaces son la copia manual de `TvControlContext` y
// compañía de `el-templo-api/src/modules/tv/types.ts`. Renombrar un campo allá
// obliga a tocar acá — el docblock de aquel archivo lo dice explícitamente.

/** Qué está mostrando el TV. `idle` = reposo (D-06); `closing` = cierre (D-08). */
export type TvScreen = 'idle' | 'class' | 'closing';

/**
 * Ciclo de vida del cronómetro. No existe "finished": terminar se deriva del
 * transcurrido contra el formato, y eso lo calcula el televisor, no el control.
 */
export type TvTimerStatus = 'idle' | 'running' | 'paused';

/**
 * Sesión regular de semana vs. sesión ROM del sábado (D-23). En `rom` los
 * niveles son solo dos y se rotulan BÁSICO / AVANZADO, así que el selector se
 * construye SIEMPRE desde `TvControlContext.levels`, nunca de una lista fija.
 */
export type TvClassMode = 'regular' | 'rom';

/**
 * Un bloque del roster del día, con lo que el control necesita para acotar el
 * selector de ejercicio sin pedir nada más: cuántos ejercicios tiene ese bloque
 * en cada nivel (dos niveles del mismo día pueden tener listas de largo
 * distinto).
 */
export interface TvControlBlock {
  role: string;
  title: string;
  /** INITIUM/PYROS: lista compartida, sin niveles ⇒ el selector se deshabilita. */
  shared: boolean;
  exerciseCountByLevel: Record<string, number>;
}

/**
 * Estado crudo de la sede, tal como el control lo necesita (sin strings de
 * render: los arma el televisor). Los sellos de tiempo son epoch ms y los
 * escribe SIEMPRE el server (T-164-43); acá solo se leen para saber si el botón
 * dice PAUSAR o REANUDAR.
 */
export interface TvControlState {
  screen: TvScreen;
  blockRole: string;
  level: string;
  exerciseIndex: number;
  timerStatus: TvTimerStatus;
  timerStartedAt: number | null;
  pausedAt: number | null;
  pausedAccumMs: number;
  /** D-19: arranca apagado; el profe prende los beeps desde el celular. */
  soundEnabled: boolean;
}

/**
 * Todo lo que la botonera ciega (D-13) necesita para dibujarse, en una sola
 * llamada. `sessionApproved: false` es lo que dispara el aviso explícito de
 * D-10 con los controles deshabilitados; `state: null` = la clase de hoy
 * todavía no se inició.
 */
export interface TvControlContext {
  branch: { id: number; name: string };
  sessionApproved: boolean;
  mode: TvClassMode;
  levels: string[];
  blocks: TvControlBlock[];
  state: TvControlState | null;
}

/**
 * Escritura del profe. Todos los campos son ABSOLUTOS y opcionales: la
 * escritura toca solo lo que nombra y repetirla da el mismo resultado.
 *
 * D-18: `timer` es un comando idempotente de exactamente cuatro valores — no
 * existe saltar ni ajustar ronda en v1, así que un doble tap con la red de la
 * sede no puede adelantar nada dos veces. Por el mismo motivo el control manda
 * el `blockRole` destino y el `exerciseIndex` destino, nunca un "el que sigue".
 * `screen: "idle"` no se acepta: volver a reposo es `endClass`.
 */
export interface TvStateWrite {
  branchId: number;
  screen?: Exclude<TvScreen, 'idle'>;
  blockRole?: string;
  level?: string;
  exerciseIndex?: number;
  timer?: 'start' | 'pause' | 'resume' | 'reset';
  soundEnabled?: boolean;
}

/**
 * Traduce un error de las rutas de control. El 409 es el único 4xx esperable en
 * uso normal y siempre significa lo mismo: alguien desaprobó (o todavía no
 * aprobó) la sesión mientras el profe tenía el control abierto — el contexto ya
 * lo avisa con `sessionApproved`, así que llegar acá es una carrera.
 */
export function describeControlError(err: unknown): string {
  if (axios.isAxiosError(err) && err.response?.status === 409) {
    return 'La sesión de hoy no está aprobada. Actualizá el control.';
  }
  return extractError(err, 'No se pudo aplicar el cambio. Reintentá.');
}

export function useTvApi() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  /**
   * GET /admin/tv/control/screen?branchId=NN — la lectura de la pantalla fullscreen
   * (`/pantalla-tv`, ver `TvScreenPage.vue`). Reemplaza al viejo `GET /api/tv/state`
   * anónimo del kiosco: el poll de la pantalla ahora pasa por acá, autenticado con
   * el JWT de sesión del admin (renovado solo por los interceptores de `boot/axios`).
   */
  async function getScreen(branchId: number): Promise<TvPollResponse> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<TvPollResponse>('/admin/tv/control/screen', {
        params: { branchId },
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo cargar la pantalla del TV');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * GET /admin/tv/control/context?branchId=NN — la ÚNICA lectura del control.
   *
   * Trae el roster del día, los niveles vigentes, cuántos ejercicios tiene cada
   * (bloque, nivel), si la sesión está aprobada (D-10) y el estado ya clampeado.
   * Con eso alcanza para dibujar la botonera entera: el control es ciego (D-13),
   * no espeja la pantalla del televisor.
   */
  async function getControlContext(branchId: number): Promise<TvControlContext> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<TvControlContext>('/admin/tv/control/context', {
        params: { branchId },
      });
      return data;
    } catch (err: unknown) {
      error.value = extractError(err, 'No se pudo cargar el control del TV');
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * POST /admin/tv/control/state — toda acción del profe pasa por acá.
   *
   * Devuelve el contexto nuevo COMPLETO (no un `ok`): la página reemplaza su
   * estado local con la respuesta y así ve el clamp del servidor sin inferir
   * nada. Las reglas que el control NO implementa porque ya viven en el API:
   * cambiar de bloque resetea ejercicio y timer, el nivel persiste entre
   * bloques, el índice se acota a la lista real y los comandos de timer son
   * idempotentes.
   */
  async function writeState(write: TvStateWrite): Promise<TvControlContext> {
    loading.value = true;
    error.value = null;
    try {
      const { data } = await api.post<TvControlContext>('/admin/tv/control/state', write);
      return data;
    } catch (err: unknown) {
      error.value = describeControlError(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * POST /admin/tv/control/end-class — D-07: el televisor vuelve a reposo.
   * Idempotente: terminar dos veces (o dos profes a la vez) responde 200.
   */
  async function endClass(branchId: number): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.post('/admin/tv/control/end-class', { branchId });
    } catch (err: unknown) {
      error.value = describeControlError(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * GET /admin/ratings/roster/coach-today — sedes donde el coach autenticado
   * está agendado hoy, una por turno (mañana/tarde). Usado para pre-cargar el
   * modal de selección de sedes del día al abrir el control (`TvControlPage`);
   * no toca `loading`/`error` globales porque es una llamada auxiliar con
   * fallback silencioso.
   */
  async function getCoachTodaySchedule(): Promise<{
    morning: number | null;
    afternoon: number | null;
  }> {
    const { data } = await api.get<{
      morning: number | null;
      afternoon: number | null;
    }>('/admin/ratings/roster/coach-today');
    return data;
  }

  function cleanup() {
    loading.value = false;
    error.value = null;
  }

  return {
    loading,
    error,
    getScreen,
    getControlContext,
    writeState,
    endClass,
    getCoachTodaySchedule,
    cleanup,
  };
}
