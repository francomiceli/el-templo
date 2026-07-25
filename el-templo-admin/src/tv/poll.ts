/**
 * Runtime de red del kiosco `/tv/`: vinculacion, ciclo de poll, correccion de reloj y
 * actualizacion por version.
 *
 * Este archivo NO toca el DOM. Habla con el API y le entrega el resultado a `render.ts`
 * por callbacks que cablea `boot.ts`. La separacion importa: el modo de falla del kiosco
 * es una sede sin wifi, y ahi la unica regla que hay que respetar es **no tocar el estado
 * en memoria cuando el poll falla** — el timer sigue corriendo local con el ultimo estado
 * conocido (regla de oro del UI-SPEC) y la pantalla no parpadea.
 *
 * Reglas duras (valen para todo `src/tv/`, el tsconfig del kiosco rechaza varias en
 * compilacion): sin `?.`, sin `??`, sin el relleno nativo de strings ni las utilidades de
 * objeto de ES2017, sin el cancelador de fetch (Chromium 66, mas nuevo que el piso D-20) y
 * sin observer de redimension. Nada de HTML crudo: aca no se dibuja.
 *
 * Los tres tiempos del kiosco los crea `boot.ts` (un intervalo cada uno, una sola vez):
 * poll 2500 ms, tick de relojes 250 ms, chequeo de version 60 s. Este modulo solo expone
 * las funciones que esos intervalos llaman.
 */

/* La base del API se importa de `diag.ts` en vez de resolverse una segunda vez: dos
   criterios distintos para armar la URL es exactamente como se rompe un kiosco en una sede
   y no en la maquina del que programa (nota que dejo el plan 164-06 en `tvApiBase`).
   Deriva del host que sirve la pagina, con override por `?api=` para probar en la sede. */
import { tvApiBase } from './diag';
import { createTvLogger } from './logger';
import type { TimerClock, TimerSpec } from './timer';

const log = createTvLogger('poll');

// =============================================================================
// Contrato duplicado de el-templo-api/src/modules/tv/types.ts
// =============================================================================
//
// Mismo trade-off que `timer.ts`: el kiosco es un bundle autonomo y no puede importar del
// backend. `TvTimerState` se arma sobre `TimerClock` de `timer.ts` para no escribir por
// tercera vez los mismos cuatro campos de la pausa.

/** Que esta mostrando el TV. `idle` es tambien el reposo silencioso de D-09. */
export type TvScreen = 'idle' | 'class' | 'closing';

/** Sesion de semana vs. sabado ROM (D-23). */
export type TvClassMode = 'regular' | 'rom';

/** Una entrada del roster de bloques (los dots "BLOQUE n / M"). */
export interface TvBlockSummary {
  role: string;
  title: string;
  shared: boolean;
}

/** Una linea de la lista. `videoUrl` null = el kiosco dibuja el placeholder. */
export interface TvExercise {
  name: string;
  rx: string;
  videoUrl: string | null;
}

/** Estado del timer publicado al TV. D-19: `soundEnabled` arranca en false. */
export interface TvTimerState extends TimerClock {
  spec: TimerSpec;
  soundEnabled: boolean;
}

/** El bloque en vivo. `null` en la respuesta cuando `screen !== "class"`. */
export interface TvClassPayload {
  mode: TvClassMode;
  levels: string[];
  level: string;
  levelLabel: string;
  blocks: TvBlockSummary[];
  blockRole: string;
  blockIndex: number;
  title: string;
  listHeader: string;
  mobilityLine: string | null;
  exercises: TvExercise[];
  exerciseIndex: number;
  timer: TvTimerState;
}

/** Respuesta de `GET /api/tv/state`. */
export interface TvPollResponse {
  serverNow: number;
  branch: { name: string; utcOffsetMinutes: number; dateLabel: string };
  screen: TvScreen;
  class: TvClassPayload | null;
}

/** Pantalla logica del kiosco: las tres del payload mas la de vinculacion. */
export type TvKioskScreen = TvScreen | 'pairing';

/** Lo que el runtime le entrega al render. Lo cablea `boot.ts`. */
export interface PollHandlers {
  /** Llega un estado nuevo del API (o el primero despues de vincular). */
  onState: (payload: TvPollResponse) => void;
  /** El TV no esta vinculado: hay que mostrar el codigo (o nada si todavia no llego). */
  onPairing: (userCode: string | null) => void;
}

// =============================================================================
// Constantes
// =============================================================================

/** Token del dispositivo. Se emite una sola vez al vincular y vive solo aca. */
const TOKEN_KEY = 'tv.deviceToken';
/** Secreto del pairing en curso (RFC 8628). Con el se retira el token, una vez. */
const CODE_KEY = 'tv.deviceCode';
/**
 * Codigo VISIBLE del pairing en curso.
 *
 * Tercera clave, ademas de las dos del plan: `GET /pair/status` no devuelve el `userCode`,
 * asi que sin persistirlo un corte de luz antes de que el staff reclame el TV dejaria la
 * pantalla de vinculacion en blanco (el kiosco tendria el secreto pero no que mostrar).
 * No es un secreto: es justamente lo que se ve en la pared.
 */
const USER_CODE_KEY = 'tv.userCode';

/** Muestras del desvio de reloj que se promedian (Pattern 6 del RESEARCH). */
const OFFSET_SAMPLES = 5;
/** Salto mas grande que un ajuste fino: se descarta la media y se realinea de una. */
const OFFSET_JUMP_MS = 5000;
/** Reinicio preventivo de memoria (Pitfall 13), siempre en reposo. */
const UPTIME_LIMIT_MS = 12 * 60 * 60 * 1000;
/** Como maximo un `client-log` por minuto: un kiosco en loop no puede inundar el server. */
const ERROR_THROTTLE_MS = 60 * 1000;
/** Techo del mensaje que acepta `POST /api/tv/client-log`. */
const CLIENT_LOG_MAX = 500;

// =============================================================================
// Estado del modulo
// =============================================================================

let handlers: PollHandlers | null = null;
let token: string | null = null;
let userCode: string | null = null;
/** Un solo pedido de red a la vez: en una sede con wifi lento los polls se apilarian. */
let inFlight = false;
/** Desvio suavizado contra el reloj del servidor. */
let clockOffsetMs = 0;
const clockOffsetSamples: number[] = [];
let lastPayload: TvPollResponse | null = null;
let pendingNewVersion = false;
const bootedAt = Date.now();
let lastErrorReportAt = 0;

// =============================================================================
// localStorage (un TV puede tener el storage deshabilitado o lleno)
// =============================================================================

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    log.warn('no se pudo escribir en localStorage', { key: key });
  }
}

function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* sin storage no hay nada que borrar */
  }
}

// =============================================================================
// Reloj corregido (Pattern 6)
// =============================================================================

/**
 * Ahora, corregido con el desvio contra el servidor.
 *
 * TODO calculo de tiempo del kiosco pasa por aca: el reloj de pared de un televisor de
 * sede puede estar corrido meses, y `startedAt` viene en la escala del servidor.
 */
export function nowCorrected(): number {
  return Date.now() + clockOffsetMs;
}

/**
 * Incorpora el `serverNow` de un poll al desvio.
 *
 * Se promedian las ultimas muestras en vez de asignar la ultima: el `serverNow` incluye la
 * latencia del viaje, que varia poll a poll, y asignarlo crudo haria saltar los digitos
 * del timer hacia adelante y hacia atras varias veces por minuto. Un salto grande (mas de
 * OFFSET_JUMP_MS) no es latencia sino que el reloj se movio de verdad —el TV sincronizo
 * por NTP, cambio la hora de verano—: ahi se tira la media y se realinea de una.
 */
function applyServerNow(serverNow: number): void {
  if (!isFinite(serverNow)) {
    return;
  }
  const sample = serverNow - Date.now();
  if (clockOffsetSamples.length > 0 && Math.abs(sample - clockOffsetMs) > OFFSET_JUMP_MS) {
    clockOffsetSamples.length = 0;
  }
  clockOffsetSamples.push(sample);
  while (clockOffsetSamples.length > OFFSET_SAMPLES) {
    clockOffsetSamples.shift();
  }
  let sum = 0;
  for (let i = 0; i < clockOffsetSamples.length; i++) {
    sum += clockOffsetSamples[i];
  }
  clockOffsetMs = Math.round(sum / clockOffsetSamples.length);
}

// =============================================================================
// Estado visible para el resto del kiosco
// =============================================================================

/** Pantalla logica actual. `pairing` mientras el TV no tenga token ni estado. */
export function currentScreen(): TvKioskScreen {
  if (!token) {
    return 'pairing';
  }
  return lastPayload ? lastPayload.screen : 'idle';
}

// =============================================================================
// Telemetria (POST /api/tv/client-log)
// =============================================================================

/**
 * Reporta una excepcion del kiosco al server.
 *
 * Nadie puede abrir la consola de un televisor colgado a 3 m del piso: este es el unico
 * canal. Como maximo uno por minuto — un TV que falla en cada tick pollea 4 veces por
 * segundo y llenaria el log de la sede entera.
 */
export function reportClientError(message: string, context: string): void {
  if (!token) {
    return;
  }
  const at = Date.now();
  if (at - lastErrorReportAt < ERROR_THROTTLE_MS) {
    return;
  }
  lastErrorReportAt = at;
  if (typeof window.fetch === 'undefined') {
    return;
  }
  window
    .fetch(tvApiBase() + '/api/tv/client-log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Device ' + token,
      },
      body: JSON.stringify({
        level: 'error',
        message: message.slice(0, CLIENT_LOG_MAX),
        context: context.slice(0, 100),
      }),
    })
    .catch(function () {
      /* si no hay red tampoco hay a quien contarselo */
    });
}

/** Corre `fn` y reporta la excepcion en vez de dejar morir el ciclo del kiosco. */
function deliver(what: string, fn: () => void): void {
  try {
    fn();
  } catch (err: unknown) {
    log.error('fallo el ' + what, { detalle: String(err) });
    reportClientError(what + ': ' + String(err), 'poll');
  }
}

// =============================================================================
// Vinculacion (RFC 8628: user_code visible / device_code secreto)
// =============================================================================

/** Olvida el dispositivo: borra `tv.deviceToken` y vuelve a la pantalla de vinculacion. */
function forgetDevice(reason: string): void {
  log.warn('dispositivo desvinculado: ' + reason);
  removeStored(TOKEN_KEY);
  removeStored(CODE_KEY);
  removeStored(USER_CODE_KEY);
  token = null;
  userCode = null;
  lastPayload = null;
  clockOffsetSamples.length = 0;
  if (handlers) {
    handlers.onPairing(null);
  }
}

/** Arranca un pairing nuevo y muestra el codigo. */
function startPairing(): void {
  inFlight = true;
  window
    .fetch(tvApiBase() + '/api/tv/pair/start', { method: 'POST' })
    .then(function (res) {
      if (!res.ok) {
        throw new Error('status ' + res.status);
      }
      return res.json() as Promise<unknown>;
    })
    .then(function (raw) {
      const body = raw as { userCode?: unknown; deviceCode?: unknown };
      if (typeof body.userCode !== 'string' || typeof body.deviceCode !== 'string') {
        throw new Error('respuesta de pair/start sin el par de codigos');
      }
      userCode = body.userCode;
      writeStored(USER_CODE_KEY, body.userCode);
      writeStored(CODE_KEY, body.deviceCode);
      log.info('pairing iniciado');
      if (handlers) {
        const code = userCode;
        deliver('render de vinculacion', function () {
          if (handlers) {
            handlers.onPairing(code);
          }
        });
      }
    })
    .catch(function (err: unknown) {
      log.warn('no se pudo iniciar el pairing', { detalle: String(err) });
    })
    .then(function () {
      inFlight = false;
    });
}

/**
 * Pollea el pairing en curso hasta que el staff lo reclame desde el admin.
 *
 * Corre sobre el MISMO intervalo del poll (2.5 s en vez de los 3 s del plan): un televisor
 * encendido un dia entero tiene que crear la menor cantidad de temporizadores posible
 * (Pitfall 13), y `boot.ts` mantiene exactamente tres.
 */
function pairingTick(): void {
  const code = readStored(CODE_KEY);
  if (!code) {
    startPairing();
    return;
  }
  if (userCode === null) {
    userCode = readStored(USER_CODE_KEY);
    if (handlers && userCode !== null) {
      const shown = userCode;
      deliver('render de vinculacion', function () {
        if (handlers) {
          handlers.onPairing(shown);
        }
      });
    }
  }

  inFlight = true;
  window
    .fetch(tvApiBase() + '/api/tv/pair/status?deviceCode=' + encodeURIComponent(code))
    .then(function (res) {
      // 404 = el pairing no existe mas (lo borraron o nunca existio).
      if (res.status === 404) {
        return { status: 'unknown' } as unknown;
      }
      if (!res.ok) {
        throw new Error('status ' + res.status);
      }
      return res.json() as Promise<unknown>;
    })
    .then(function (raw) {
      const body = raw as { status?: unknown; deviceToken?: unknown };
      if (body.status === 'paired' && typeof body.deviceToken === 'string') {
        token = body.deviceToken;
        writeStored(TOKEN_KEY, body.deviceToken);
        // El secreto ya se consumio y el codigo visible ya no se muestra.
        removeStored(CODE_KEY);
        removeStored(USER_CODE_KEY);
        userCode = null;
        log.info('televisor vinculado');
        return;
      }
      if (body.status === 'consumed' || body.status === 'unknown') {
        // El token de este pairing ya se emitio (o el pairing no existe): el codigo de la
        // pantalla no sirve mas, se pide uno nuevo en el proximo tick.
        removeStored(CODE_KEY);
        removeStored(USER_CODE_KEY);
        userCode = null;
        log.warn('pairing invalido, se pide un codigo nuevo', { status: String(body.status) });
      }
    })
    .catch(function (err: unknown) {
      log.warn('no se pudo consultar el pairing', { detalle: String(err) });
    })
    .then(function () {
      inFlight = false;
    });
}

// =============================================================================
// Poll del estado (GET /api/tv/state)
// =============================================================================

/**
 * Valida la FORMA de lo que llego.
 *
 * Un nginx mal configurado devuelve el `index.html` del SPA con status 200; sin esta
 * validacion eso seria un error de tipos invisible en un televisor. Con ella, el poll lo
 * trata como una respuesta rota y el TV se queda con el ultimo estado bueno.
 */
function asPollResponse(raw: unknown): TvPollResponse | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const o = raw as { serverNow?: unknown; screen?: unknown; branch?: unknown };
  if (typeof o.serverNow !== 'number' || typeof o.screen !== 'string' || !o.branch) {
    return null;
  }
  return raw as TvPollResponse;
}

/**
 * Un ciclo de poll. Lo llama el intervalo de 2.5 s de `boot.ts`.
 *
 * Sin token, el mismo tick lleva adelante la vinculacion. Con token:
 *  - 401 → el televisor fue revocado desde el admin (D-03): se olvida el token y vuelve a
 *    la pantalla de codigo, sin que nadie tenga que ir a la sede.
 *  - error de red → se loguea y se reintenta en el proximo tick, SIN tocar `lastPayload`:
 *    el timer sigue corriendo local y la pantalla no parpadea. Al volver el wifi, el
 *    primer poll bueno realinea todo.
 */
export function pollTick(): void {
  if (typeof window.fetch === 'undefined') {
    return;
  }
  if (inFlight) {
    return;
  }
  if (!token) {
    pairingTick();
    return;
  }

  inFlight = true;
  window
    .fetch(tvApiBase() + '/api/tv/state', {
      headers: { Authorization: 'Device ' + token },
    })
    .then(function (res) {
      if (res.status === 401) {
        forgetDevice('el API respondio 401');
        return null;
      }
      if (!res.ok) {
        throw new Error('status ' + res.status);
      }
      return res.json() as Promise<unknown>;
    })
    .then(function (raw) {
      if (raw === null) {
        return;
      }
      const payload = asPollResponse(raw);
      if (!payload) {
        throw new Error('el cuerpo no es un estado del TV');
      }
      applyServerNow(payload.serverNow);
      lastPayload = payload;
      deliver('render del estado', function () {
        if (handlers) {
          handlers.onState(payload);
        }
      });
      maybeApplyPendingRefresh();
    })
    .catch(function (err: unknown) {
      // A proposito NO se toca el estado en memoria (T-164-49).
      log.warn('poll fallido, sigue el ultimo estado conocido', { detalle: String(err) });
    })
    .then(function () {
      inFlight = false;
    });
}

// =============================================================================
// Actualizacion por version (D-22) y reinicio preventivo (Pitfall 13)
// =============================================================================

/**
 * Aplica una actualizacion pendiente SOLO en reposo.
 *
 * El unico punto del kiosco que reinicia la pagina. La guarda de `idle` es la razon de ser
 * de D-22: cortar la pantalla en medio de un bloque —con el profe tomando el tiempo— es
 * peor que mostrar una version vieja un rato mas.
 *
 * El mismo momento seguro sirve para el reinicio preventivo de memoria: un televisor
 * encendido mas de 12 h se recicla, siempre fuera de clase.
 */
function maybeApplyPendingRefresh(): void {
  if (currentScreen() !== 'idle') {
    return;
  }
  const viejo = Date.now() - bootedAt > UPTIME_LIMIT_MS;
  if (!pendingNewVersion && !viejo) {
    return;
  }
  log.info('reiniciando la pagina en reposo', {
    version: pendingNewVersion,
    uptime: viejo,
  });
  window.location.reload();
}

/**
 * Compara la version del bundle cargado contra `/tv/version.txt`.
 *
 * Ruta relativa + parametro anti-cache: el `.txt` no matchea el regex `immutable` del
 * nginx del admin, asi que es el unico archivo del kiosco que se puede releer despues de
 * un deploy (Pitfall 7).
 */
export function checkVersion(): void {
  if (typeof window.fetch === 'undefined') {
    return;
  }
  window
    .fetch('version.txt?t=' + Date.now())
    .then(function (res) {
      if (!res.ok) {
        throw new Error('status ' + res.status);
      }
      return res.text();
    })
    .then(function (txt) {
      const remota = txt.replace(/\s+$/, '');
      const local = window.__TV_VERSION__ ? window.__TV_VERSION__ : '';
      if (remota.length === 0 || local.length === 0 || remota === local) {
        maybeApplyPendingRefresh();
        return;
      }
      if (!pendingNewVersion) {
        log.info('hay una version nueva del kiosco', { local: local, remota: remota });
      }
      pendingNewVersion = true;
      maybeApplyPendingRefresh();
    })
    .catch(function (err: unknown) {
      log.warn('no se pudo leer version.txt', { detalle: String(err) });
    });
}

// =============================================================================
// Arranque
// =============================================================================

/**
 * Cablea el runtime y hace el primer ciclo YA (sin esperar los 2.5 s del intervalo): un
 * televisor recien prendido no puede quedarse dos segundos y medio en blanco.
 */
export function startPolling(next: PollHandlers): void {
  handlers = next;
  token = readStored(TOKEN_KEY);
  userCode = readStored(USER_CODE_KEY);
  if (!token) {
    handlers.onPairing(userCode);
  }
  pollTick();
}
