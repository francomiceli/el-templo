/**
 * Contrato de datos + corrección de reloj de la pantalla TV (`/pantalla-tv`).
 *
 * Este archivo NO habla con la red: el fetch autenticado lo hace `useTvApi.getScreen`
 * (que ya usa el `api` de `src/boot/axios`, con interceptores de JWT+refresh). Lo que
 * queda acá es la fuente única de los TIPOS de la respuesta del poll — que consumen
 * tanto `render.ts` como `useTvApi.ts` — y `nowCorrected()`, que el render usa para
 * dibujar el reloj de la sede y el timer local sin volver a golpear el server en cada
 * tick de 250 ms.
 *
 * Fue el runtime de red completo del kiosco estático (`/tv/`, retirado en el pase a
 * pantalla autenticada): vinculación RFC 8628, ciclo de poll con reintentos, telemetría
 * de errores y chequeo de versión. Todo eso lo reemplaza la sesión del admin — la
 * página ahora es dueña del ciclo de vida (setInterval propio) y de la autenticación.
 */

import type { TimerClock, TimerSpec } from './timer';

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
  /** DEUTEROS_1/DEUTEROS_2 colapsan a un solo bloque visual: usar estos dos
   *  (no `blockIndex`/`blocks.length`) para "BLOQUE n / M" y los puntitos. */
  visualBlockIndex: number;
  visualBlockCount: number;
  title: string;
  listHeader: string;
  mobilityLine: string | null;
  exercises: TvExercise[];
  exerciseIndex: number;
  timer: TvTimerState;
}

/** Respuesta de `GET /api/admin/tv/control/screen`. */
export interface TvPollResponse {
  serverNow: number;
  branch: { name: string; utcOffsetMinutes: number; dateLabel: string };
  screen: TvScreen;
  class: TvClassPayload | null;
}

// =============================================================================
// Reloj corregido (Pattern 6)
// =============================================================================

/** Muestras del desvio de reloj que se promedian (Pattern 6 del RESEARCH). */
const OFFSET_SAMPLES = 5;
/** Salto mas grande que un ajuste fino: se descarta la media y se realinea de una. */
const OFFSET_JUMP_MS = 5000;

let clockOffsetMs = 0;
const clockOffsetSamples: number[] = [];

/**
 * Ahora, corregido con el desvio contra el servidor.
 *
 * Todo calculo de tiempo de la pantalla pasa por aca: el reloj de pared de un televisor
 * de sede puede estar corrido, y `startedAt` viene en la escala del servidor.
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
export function applyServerNow(serverNow: number): void {
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
