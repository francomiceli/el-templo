/**
 * Autotest del timer sobre el hardware real: `/tv/?selftest=1`.
 *
 * El admin no tiene test runner y nadie puede abrir devtools de un televisor de sede. Los
 * vectores dorados son la UNICA verificacion automatica que puede correr sobre ese
 * hardware: los emite el test de vitest del API (`test/tv/tv-timer-phase.test.ts`), el
 * build los copia a `/tv/timer-vectors.json` y esta pantalla los corre contra el `phaseAt`
 * del kiosco (T-164-28). Si el port de `timer.ts` se desincroniza del API, o si un motor
 * viejo hace algo raro con la aritmetica, sale FAIL en la pantalla del televisor y se
 * arregla antes de la clase — no en el medio.
 *
 * Reglas duras de este archivo:
 * - Se dibuja con `createElement` + `textContent`, NUNCA con la propiedad de HTML crudo:
 *   entran strings del entorno (user agent) y del archivo de vectores (T-164-30).
 * - Sin cancelacion de la peticion (el cancelador de fetch es Chromium 66, mas nuevo que
 *   el piso D-20) y sin nada de ES2017: el tsconfig del kiosco lo rechaza en compilacion.
 * - Autocontenido: NO arranca el poll, ni el video, ni el kiosco. Se puede dejar abierto
 *   en la sede y no consume nada.
 */

import { createTvLogger } from './logger';
import { elapsedFrom, formatDigits, phaseAt } from './timer';
import type { TimerFrame, TimerSpec } from './timer';

const log = createTvLogger('selftest');

/** Ruta relativa: el archivo lo deja el build al lado del `index.html` del kiosco. */
const VECTORS_URL = 'timer-vectors.json';

/** Cuantas fallas se listan en pantalla: mas no entran legibles a 4 metros. */
const MAX_FAILURES_SHOWN = 10;

const COLOR_BG = '#101418';
const COLOR_FG = '#f2ebe1';
const COLOR_LABEL = '#b08d6e';
const COLOR_OK = '#7fd18b';
const COLOR_FAIL = '#ff7b6b';
const COLOR_INFO = '#9aa7b4';

// =============================================================================
// Forma del archivo de vectores (validada en runtime: es un archivo generado)
// =============================================================================

/** Un sample del fixture: el frame que el API afirma para ese `elapsedMs`. */
interface VectorSample {
  elapsedMs: number;
  phase: string;
  displayMs: number;
  round: number;
  totalRounds: number;
  finished: boolean;
}

interface TimerVector {
  name: string;
  spec: TimerSpec;
  samples: VectorSample[];
}

/** Resultado de un caso, listo para contar y para pintar. */
interface CaseResult {
  ok: boolean;
  label: string;
  expected: string;
  got: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSample(value: unknown): value is VectorSample {
  if (!isRecord(value)) return false;
  return (
    typeof value.elapsedMs === 'number' &&
    typeof value.phase === 'string' &&
    typeof value.displayMs === 'number' &&
    typeof value.round === 'number' &&
    typeof value.totalRounds === 'number' &&
    typeof value.finished === 'boolean'
  );
}

/**
 * Valida la forma del JSON bajado. Es un archivo generado por el build, pero un `/tv/`
 * servido por un nginx mal configurado puede devolver el `index.html` del SPA con un 200:
 * mejor un mensaje claro en pantalla que un TypeError invisible en un televisor.
 */
function toVectors(raw: unknown): TimerVector[] {
  if (!Array.isArray(raw)) {
    throw new Error('el archivo de vectores no es una lista');
  }
  const out: TimerVector[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item: unknown = raw[i];
    if (!isRecord(item) || typeof item.name !== 'string' || !isRecord(item.spec)) {
      throw new Error('vector ' + i + ' sin nombre o sin spec');
    }
    if (typeof item.spec.kind !== 'string') {
      throw new Error('vector ' + i + ' con spec sin kind');
    }
    if (!Array.isArray(item.samples) || item.samples.length === 0) {
      throw new Error('vector ' + i + ' sin samples');
    }
    const samples: VectorSample[] = [];
    for (let j = 0; j < item.samples.length; j++) {
      const sample: unknown = item.samples[j];
      if (!isSample(sample)) {
        throw new Error('vector ' + i + ' sample ' + j + ' incompleto');
      }
      samples.push(sample);
    }
    // El `kind` ya se verifico como string; el spec lo consume `phaseAt`, que tiene su
    // propio cierre exhaustivo y degrada a cronometro ante cualquier forma que no conozca.
    out.push({ name: item.name, spec: item.spec as unknown as TimerSpec, samples: samples });
  }
  return out;
}

// =============================================================================
// Casos
// =============================================================================

/** Los 5 campos que el fixture afirma (el `progress` no viaja en los vectores). */
function describeFrame(f: {
  phase: string;
  displayMs: number;
  round: number;
  totalRounds: number;
  finished: boolean;
}): string {
  return (
    f.phase +
    ' ' +
    f.displayMs +
    'ms ronda ' +
    f.round +
    '/' +
    f.totalRounds +
    (f.finished ? ' fin' : '')
  );
}

function checkSample(vector: TimerVector, sample: VectorSample): CaseResult {
  const frame: TimerFrame = phaseAt(sample.elapsedMs, vector.spec);
  const ok =
    frame.phase === sample.phase &&
    frame.displayMs === sample.displayMs &&
    frame.round === sample.round &&
    frame.totalRounds === sample.totalRounds &&
    frame.finished === sample.finished;
  return {
    ok: ok,
    label: vector.name + ' · ' + sample.elapsedMs + 'ms',
    expected: describeFrame(sample),
    got: describeFrame(frame),
  };
}

function checkValue(label: string, expected: string | number, got: string | number): CaseResult {
  return {
    ok: expected === got,
    label: label,
    expected: String(expected),
    got: String(got),
  };
}

/**
 * Casos que NO estan en los vectores del API porque son del consumidor (D-17): el calculo
 * de `elapsedMs` a partir del estado del poll y el formato de los digitos.
 */
function localCases(): CaseResult[] {
  const startedAt = 1_000_000;

  return [
    // Corriendo: el acumulador de pausas anteriores se descuenta del tiempo de pared.
    checkValue(
      'elapsedFrom · corriendo con 5 s de pausas previas',
      55_000,
      elapsedFrom(
        { status: 'running', startedAt: startedAt, pausedAt: null, pausedAccumMs: 5_000 },
        startedAt + 60_000
      )
    ),
    // Pausado: congelado en el instante de la pausa por mucho que avance el reloj (D-17).
    checkValue(
      'elapsedFrom · pausado congela (D-17)',
      25_000,
      elapsedFrom(
        {
          status: 'paused',
          startedAt: startedAt,
          pausedAt: startedAt + 30_000,
          pausedAccumMs: 5_000,
        },
        startedAt + 999_000
      )
    ),
    // Sin arrancar: el timer del mockup muestra el bloque en cero, no el reloj del TV.
    checkValue(
      'elapsedFrom · idle',
      0,
      elapsedFrom(
        { status: 'idle', startedAt: null, pausedAt: null, pausedAccumMs: 0 },
        startedAt + 999_000
      )
    ),
    checkValue('formatDigits · 0', '00:00', formatDigits(0)),
    checkValue('formatDigits · 65 s', '01:05', formatDigits(65_000)),
    checkValue('formatDigits · 1 h 2 m 5 s', '1:02:05', formatDigits(3_725_000)),
  ];
}

// =============================================================================
// Pantalla
// =============================================================================

function clear(el: Element): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

function makeLine(parent: HTMLElement, text: string, color: string, size: string): HTMLElement {
  const row = document.createElement('div');
  row.style.color = color;
  row.style.fontSize = size;
  row.style.lineHeight = '1.35';
  row.style.margin = '0 0 0.35rem';
  row.style.wordBreak = 'break-all';
  row.textContent = text;
  parent.appendChild(row);
  return row;
}

interface Screen {
  /** Titular gigante: `PASS n/n` o `FAIL`. */
  result: HTMLElement;
  /** Detalle debajo del titular (fallas, o el motivo de que no se pudo correr). */
  detail: HTMLElement;
}

function renderShell(): Screen | null {
  const tv = document.getElementById('tv');
  if (!tv) {
    return null;
  }
  clear(tv);

  const root = document.createElement('div');
  root.style.position = 'absolute';
  root.style.left = '0';
  root.style.top = '0';
  root.style.right = '0';
  root.style.bottom = '0';
  root.style.overflow = 'auto';
  root.style.background = COLOR_BG;
  root.style.color = COLOR_FG;
  root.style.padding = '1.6rem 2rem';
  root.style.fontFamily = 'monospace';
  root.style.fontWeight = '700';
  root.style.textAlign = 'left';
  tv.appendChild(root);

  makeLine(root, 'EL TEMPLO · TV · SELFTEST DEL TIMER', COLOR_LABEL, '2rem');

  const result = makeLine(root, 'CORRIENDO…', COLOR_INFO, '6rem');
  result.style.letterSpacing = '0.06em';
  result.style.margin = '0.6rem 0 0.8rem';

  const detail = document.createElement('div');
  detail.style.fontSize = '1.15rem';
  root.appendChild(detail);

  makeLine(
    root,
    'version: ' + (window.__TV_VERSION__ ? window.__TV_VERSION__ : '(sin marcar)'),
    COLOR_INFO,
    '1.15rem'
  ).style.marginTop = '1.2rem';
  makeLine(root, 'ua: ' + navigator.userAgent, COLOR_INFO, '1.15rem');

  return { result: result, detail: detail };
}

function paint(screen: Screen, cases: CaseResult[]): void {
  let failed = 0;
  for (let i = 0; i < cases.length; i++) {
    if (!cases[i].ok) failed++;
  }
  const passed = cases.length - failed;

  if (failed === 0) {
    screen.result.textContent = 'PASS ' + passed + '/' + cases.length;
    screen.result.style.color = COLOR_OK;
    log.info('selftest PASS', { casos: cases.length });
    return;
  }

  screen.result.textContent = 'FAIL ' + failed + '/' + cases.length;
  screen.result.style.color = COLOR_FAIL;

  let shown = 0;
  for (let i = 0; i < cases.length && shown < MAX_FAILURES_SHOWN; i++) {
    const c = cases[i];
    if (c.ok) continue;
    shown++;
    makeLine(
      screen.detail,
      c.label + '  ·  esperado ' + c.expected + '  ·  obtenido ' + c.got,
      COLOR_FAIL,
      '1.15rem'
    );
  }
  if (failed > shown) {
    makeLine(screen.detail, '… y ' + (failed - shown) + ' fallas mas', COLOR_INFO, '1.15rem');
  }
  log.error('selftest FAIL', { fallas: failed, casos: cases.length });
}

function paintError(screen: Screen, message: string): void {
  screen.result.textContent = 'FAIL';
  screen.result.style.color = COLOR_FAIL;
  makeLine(screen.detail, message, COLOR_FAIL, '1.15rem');
  log.error('selftest no pudo correr', { motivo: message });
}

// =============================================================================
// Entrada
// =============================================================================

export function runSelfTest(): void {
  const screen = renderShell();
  if (!screen) {
    log.error('selftest sin marco #tv: no hay donde dibujar');
    return;
  }

  const cases = localCases();

  if (typeof window.fetch === 'undefined') {
    paintError(screen, 'este browser no tiene fetch: el kiosco no puede funcionar aca');
    return;
  }

  // Cache-buster: el nginx del admin cachea agresivo y un vector viejo daria un FAIL
  // fantasma en la sede. Sin cancelacion: el cancelador de fetch es mas nuevo que el piso.
  window
    .fetch(VECTORS_URL + '?t=' + Date.now())
    .then(function (res) {
      if (!res.ok) {
        throw new Error('HTTP ' + res.status + ' al bajar ' + VECTORS_URL);
      }
      return res.json();
    })
    .then(function (raw: unknown) {
      const vectors = toVectors(raw);
      const all = cases.slice();
      for (let i = 0; i < vectors.length; i++) {
        const v = vectors[i];
        for (let j = 0; j < v.samples.length; j++) {
          all.push(checkSample(v, v.samples[j]));
        }
      }
      log.info('vectores cargados', { vectores: vectors.length, casos: all.length });
      paint(screen, all);
    })
    .catch(function (err: unknown) {
      paintError(screen, String(err instanceof Error ? err.message : err));
    });
}
