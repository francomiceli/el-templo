/**
 * Motor de tiempo del kiosco `/tv/`.
 *
 * `phaseAt` es un **port 1:1 de `el-templo-api/src/modules/tv/timer-phase.ts`**. La regla
 * de oro del UI-SPEC dice que el tiempo NO viaja por la red: el API publica el sello de
 * arranque y cada televisor calcula fase, ronda y digitos localmente. Eso obliga a tener
 * la misma aritmetica de los dos lados.
 *
 * Contrato de mantenimiento (T-164-28): **cualquier cambio va PRIMERO al API** —ahi estan
 * los tests de vitest— y despues se copia aca. La divergencia no se detecta leyendo: la
 * detectan los vectores dorados (`test/tv/__fixtures__/timer-vectors.json`, que el build
 * copia a `/tv/timer-vectors.json`) corriendo en el televisor real con `/tv/?selftest=1`.
 *
 * Los tipos `TimerSpec` / `TimerFrame` estan **duplicados a proposito**: el kiosco es un
 * bundle autonomo (ES2015, sin Vue ni Node) y no puede importar nada del backend. Son la
 * copia exacta de `modules/tv/types.ts`; si alla cambia una forma, el selftest empieza a
 * fallar en la sede, que es justamente el aviso que se busca.
 *
 * Reglas de compatibilidad (valen para todo `src/tv/`): sin el relleno nativo de strings
 * (ES2017 / Chromium 57), sin utilidades de objeto de ES2017, sin `?.` ni `??`. El
 * tsconfig del kiosco las rechaza en compilacion.
 *
 * Las tres funciones son PURAS: el "ahora" entra siempre por parametro (`nowCorrected`),
 * nunca se lee el reloj de pared adentro de este archivo. Ese reloj puede estar corrido en
 * un TV de sede, y quien corrige el desvio con el sello del servidor es el runtime del
 * poll (plan 164-11, Pattern 6 del RESEARCH).
 */

/* El relleno a dos digitos vive en `scale.ts`: es el unico helper de relleno de todo
   `src/tv/` (reloj, timer y logger). El metodo nativo del string es ES2017 — Pitfall 5. */
import { pad2 } from './scale';

// =============================================================================
// Contrato duplicado de modules/tv/types.ts (ver docblock del archivo)
// =============================================================================

/** Copia de `TimerSpec`: las ~50 variantes de formato colapsan a estas 4 formas. */
export type TimerSpec =
  /** Ciclos trabajo/descanso: tabata, interval, hiit, rom (`workMs = 0`). */
  | { kind: 'work_rest'; workMs: number; restMs: number; rounds: number }
  /** Una cuenta regresiva por ronda: emom, every_x_seconds, on_the_x. */
  | { kind: 'interval'; intervalMs: number; rounds: number }
  /** Una sola cuenta regresiva: amrap, time_cap, for_tech. */
  | { kind: 'countdown'; totalMs: number }
  /** Cronometro libre: standard, chipper, for_time sin cap. */
  | { kind: 'countup' };

/** Copia de `TvTimerPhase`. */
export type TvTimerPhase = 'work' | 'rest' | 'run' | 'done';

/** Copia de `TvTimerStatus`. Terminar NO es un estado: se deriva del tiempo. */
export type TvTimerStatus = 'idle' | 'running' | 'paused';

/** Copia de `TimerFrame`: todo lo que dibuja la zona del timer. */
export interface TimerFrame {
  phase: TvTimerPhase;
  displayMs: number;
  round: number;
  totalRounds: number;
  progress: number;
  finished: boolean;
}

/**
 * Lo que `elapsedFrom` necesita del estado del timer que publica el poll.
 *
 * Es un subconjunto estructural de `TvTimerState`: el objeto del poll entra tal cual, sin
 * adaptador, pero el selftest puede armar un estado a mano sin inventar `spec` ni sonido.
 */
export interface TimerClock {
  status: TvTimerStatus;
  /** Epoch ms del arranque, corregido contra el reloj del servidor. */
  startedAt: number | null;
  /** Epoch ms del momento en que se pauso, o `null` si no esta pausado. */
  pausedAt: number | null;
  /** Suma de todas las pausas anteriores ya reanudadas. */
  pausedAccumMs: number;
}

// =============================================================================
// phaseAt — port 1:1 de modules/tv/timer-phase.ts
// =============================================================================

/** Mas alla de esto el input es un reloj roto, no un bloque real. */
const MAX_ELAPSED_MS = 24 * 60 * 60 * 1000;

/** Las formas de un solo segmento no tienen contador de rondas: queda en 1/1. */
const SINGLE_ROUND = 1;

function clampProgress(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value < 1 ? value : 1;
}

/** BLOQUE COMPLETO: el mismo frame terminal para todo kind que pueda terminar. */
function finishedFrame(totalRounds: number): TimerFrame {
  return {
    phase: 'done',
    displayMs: 0,
    round: totalRounds,
    totalRounds: totalRounds,
    progress: 1,
    finished: true,
  };
}

function countupFrame(elapsedMs: number): TimerFrame {
  return {
    phase: 'run',
    displayMs: elapsedMs,
    round: SINGLE_ROUND,
    totalRounds: SINGLE_ROUND,
    progress: 0,
    finished: false,
  };
}

/**
 * Frame a dibujar para un tiempo transcurrido dado.
 *
 * `elapsedMs` es lo que ya calculo `elapsedFrom` a partir de `startedAt`, `pausedAt` y
 * `pausedAccumMs` (D-17): esta funcion no sabe nada de pausas, solo de cuanto corrio el
 * bloque.
 */
export function phaseAt(elapsedMs: number, spec: TimerSpec): TimerFrame {
  // Pitfall 8 — un TV con el reloj corrido tiene que mostrar 0, nunca basura.
  const elapsed =
    Number.isFinite(elapsedMs) && elapsedMs > 0 && elapsedMs <= MAX_ELAPSED_MS ? elapsedMs : 0;

  switch (spec.kind) {
    case 'work_rest': {
      const cycleMs = spec.workMs + spec.restMs;
      // Defensivo: `toTimerSpec` nunca emite un ciclo de largo cero, pero un spec armado
      // a mano no puede dividir por cero — degrada a cronometro.
      if (cycleMs <= 0) return countupFrame(elapsed);

      const totalMs = cycleMs * spec.rounds;
      if (elapsed >= totalMs) return finishedFrame(spec.rounds);

      const roundIndex = Math.floor(elapsed / cycleMs);
      const offsetMs = elapsed - roundIndex * cycleMs;
      // ROM (`workMs === 0`): el trabajo es libre, asi que la fase queda en TRABAJO y los
      // digitos cuentan HACIA ADELANTE dentro de la ronda en vez de hacia atras.
      const isRom = spec.workMs === 0;
      const inWork = isRom || offsetMs < spec.workMs;

      return {
        phase: inWork ? 'work' : 'rest',
        displayMs: isRom ? offsetMs : inWork ? spec.workMs - offsetMs : cycleMs - offsetMs,
        round: roundIndex + 1,
        totalRounds: spec.rounds,
        progress: clampProgress(elapsed / totalMs),
        finished: false,
      };
    }

    case 'interval': {
      if (spec.intervalMs <= 0) return countupFrame(elapsed);

      const totalMs = spec.intervalMs * spec.rounds;
      if (elapsed >= totalMs) return finishedFrame(spec.rounds);

      const roundIndex = Math.floor(elapsed / spec.intervalMs);
      const offsetMs = elapsed - roundIndex * spec.intervalMs;

      return {
        phase: 'work',
        displayMs: spec.intervalMs - offsetMs,
        round: roundIndex + 1,
        totalRounds: spec.rounds,
        progress: clampProgress(elapsed / totalMs),
        finished: false,
      };
    }

    case 'countdown': {
      if (spec.totalMs <= 0) return finishedFrame(SINGLE_ROUND);
      if (elapsed >= spec.totalMs) return finishedFrame(SINGLE_ROUND);

      return {
        phase: 'run',
        displayMs: spec.totalMs - elapsed,
        round: SINGLE_ROUND,
        totalRounds: SINGLE_ROUND,
        progress: clampProgress(elapsed / spec.totalMs),
        finished: false,
      };
    }

    case 'countup':
      // Un cronometro libre no termina: el profe pasa al bloque siguiente.
      return countupFrame(elapsed);

    default: {
      // Agregar una forma a TimerSpec tiene que romper el build aca.
      const _exhaustive: never = spec;
      void _exhaustive;
      return countupFrame(elapsed);
    }
  }
}

// =============================================================================
// elapsedFrom — la pieza que el API deja al consumidor (D-17)
// =============================================================================

/**
 * Cuanto corrio realmente el bloque, a partir del estado publicado por el poll.
 *
 * `nowCorrected` **tiene que venir corregido** con el desvio del servidor (Pattern 6:
 * `serverNow` de cada poll menos el reloj local, suavizado). Pasarle el reloj de pared
 * crudo de un televisor mal configurado es exactamente el bug que el guard de `phaseAt`
 * tapa mostrando 0 (Pitfall 8).
 *
 * Semantica de la pausa (D-17: congela y reanuda exacto donde quedo):
 *  - `running`: `nowCorrected - startedAt - pausedAccumMs` — el reloj sigue corriendo y el
 *    acumulador descuenta todas las pausas ya reanudadas.
 *  - `paused`: `pausedAt - startedAt - pausedAccumMs` — congelado en el instante de la
 *    pausa. Al reanudar, el API suma la pausa a `pausedAccumMs` y el valor no salta.
 *  - `idle`: 0.
 *
 * Nunca devuelve negativo: un `startedAt` en el futuro (reloj del servidor movido entre
 * polls) da 0 en vez de digitos absurdos.
 */
export function elapsedFrom(timer: TimerClock, nowCorrected: number): number {
  if (timer.status === 'idle' || timer.startedAt === null) {
    return 0;
  }

  const accum = Number.isFinite(timer.pausedAccumMs) ? timer.pausedAccumMs : 0;

  let reference: number;
  if (timer.status === 'paused') {
    // Sin `pausedAt` el estado esta incompleto: mejor congelar en 0 que inventar tiempo.
    if (timer.pausedAt === null) return 0;
    reference = timer.pausedAt;
  } else {
    reference = nowCorrected;
  }

  if (!Number.isFinite(reference)) return 0;

  const elapsed = reference - timer.startedAt - accum;
  return elapsed > 0 ? elapsed : 0;
}

// =============================================================================
// formatDigits — los digitos gigantes de la pantalla
// =============================================================================

/**
 * `displayMs` (que ya viene listo para dibujar desde `phaseAt`) como `MM:SS`, o `H:MM:SS`
 * cuando pasa la hora (un AMRAP largo o un cronometro libre de un sabado ROM).
 *
 * Redondea hacia arriba, igual que el mockup v8 validado: en una cuenta regresiva el
 * `00:01` se ve durante todo el ultimo segundo y el `00:00` aparece recien cuando el
 * bloque termino de verdad. La contracara es que un cronometro que cuenta hacia adelante
 * salta a `00:01` apenas arranca; se prefirio la coherencia con la maqueta aprobada y con
 * el caso dominante (los formatos que cuentan hacia atras).
 */
export function formatDigits(displayMs: number): string {
  const ms = Number.isFinite(displayMs) && displayMs > 0 ? displayMs : 0;
  const totalSeconds = Math.ceil(ms / 1000);

  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) {
    return hours + ':' + pad2(minutes) + ':' + pad2(seconds);
  }
  return pad2(minutes) + ':' + pad2(seconds);
}
