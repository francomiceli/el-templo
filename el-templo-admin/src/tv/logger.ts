/**
 * Logger del kiosco /tv.
 *
 * Por que NO usa `src/utils/logger.ts` (el `createLogger` del SPA): ese util importa
 * `@sentry/vue` y lee `import.meta.env`. Traerlo al kiosco arrastraria medio bundle del
 * SPA (Vue + Sentry) a una pagina que tiene que pesar poco y correr en un Chromium 53
 * (Pitfall 12 del RESEARCH). El kiosco es un artefacto separado: se queda con la misma
 * FORMA (`debug/info/warn/error`) para que el codigo se lea igual, pero con implementacion
 * propia y sin dependencias.
 *
 * CLAUDE.md prohibe `console.*` en los frontends. Este archivo es la UNICA excepcion de
 * `src/`: es la implementacion del logger, el equivalente exacto de lo que hace
 * `src/utils/logger.ts`. Ningun otro modulo de `src/tv/` debe llamar a `console` directo.
 *
 * Ademas del `console`, cada linea entra en un buffer circular de 50 entradas
 * (`getTvLogBuffer()`). En una sede nadie puede abrir devtools de un televisor: ese buffer
 * es lo que muestra `/tv/?diag=1` (plan 164-06) y lo que se manda a `POST /api/tv/client-log`
 * para diagnosticar un kiosco a distancia.
 *
 * Reglas de compatibilidad de este archivo (valen para todo `src/tv/`): sin optional
 * chaining, sin `??`, sin spread de objetos, sin `padStart`, sin `Object.entries`.
 */

export type TvLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type TvLogData = Record<string, unknown>;

export interface TvLogEntry {
  /** Epoch ms del momento en que se logueo. */
  at: number;
  level: TvLogLevel;
  /** Modulo que logueo (el `context` de `createTvLogger`). */
  context: string;
  message: string;
  data?: TvLogData;
}

export interface TvLogger {
  debug: (message: string, data?: TvLogData) => void;
  info: (message: string, data?: TvLogData) => void;
  warn: (message: string, data?: TvLogData) => void;
  error: (message: string, data?: TvLogData) => void;
}

/** Cuantas lineas conserva el buffer. Suficiente para ver el ultimo minuto de polls. */
const BUFFER_MAX = 50;

const buffer: TvLogEntry[] = [];

/**
 * Copia de las ultimas lineas logueadas, de la mas vieja a la mas nueva.
 * Devuelve una copia para que un consumidor no pueda mutar el buffer.
 */
export function getTvLogBuffer(): TvLogEntry[] {
  return buffer.slice();
}

/** Vacia el buffer (lo usa el envio a `/api/tv/client-log` despues de un POST exitoso). */
export function clearTvLogBuffer(): void {
  buffer.length = 0;
}

function push(entry: TvLogEntry): void {
  buffer.push(entry);
  while (buffer.length > BUFFER_MAX) {
    buffer.shift();
  }
}

/** `padStart` es ES2017 (Chromium 57) — Pitfall 5. */
function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

/** HH:MM:SS local, que es la referencia util cuando alguien mira el TV de la sede. */
function stamp(at: number): string {
  const d = new Date(at);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

export function createTvLogger(context: string): TvLogger {
  function emit(level: TvLogLevel, message: string, data?: TvLogData): void {
    const at = Date.now();
    const entry: TvLogEntry = { at: at, level: level, context: context, message: message };
    if (data) {
      entry.data = data;
    }
    push(entry);

    const line = '[' + stamp(at) + '] [tv:' + context + '] ' + message;
    // El unico `console` permitido en src/ — ver el docblock del archivo.
    const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    if (data) {
      sink(line, data);
    } else {
      sink(line);
    }
  }

  return {
    debug: function (message: string, data?: TvLogData): void {
      emit('debug', message, data);
    },
    info: function (message: string, data?: TvLogData): void {
      emit('info', message, data);
    },
    warn: function (message: string, data?: TvLogData): void {
      emit('warn', message, data);
    },
    error: function (message: string, data?: TvLogData): void {
      emit('error', message, data);
    },
  };
}
