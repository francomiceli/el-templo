/**
 * Pantalla de diagnostico del kiosco: `/tv/?diag=1`.
 *
 * En una sede NADIE puede abrir devtools de un televisor: no hay teclado, no hay consola
 * remota y el modo de falla tipico de D-20 es pantalla en blanco sin error visible. Esta
 * pantalla es el UNICO instrumento de campo (D-24): alguien abre `/tv/?diag=1` en el TV,
 * saca una foto y de esa foto sale el diagnostico.
 *
 * Reglas duras de este archivo:
 * - Se dibuja con `createElement` + `textContent`. NUNCA con la propiedad de HTML crudo:
 *   acá entran strings del entorno (user agent) y del API (T-164-25).
 * - El token del dispositivo se muestra SOLO con sus ultimos 4 caracteres: la pantalla es
 *   publica y cualquiera puede fotografiarla (T-164-26).
 * - El diag NO arranca el poll ni el video: reemplaza el contenido del marco y se queda
 *   quieto salvo por las dos consultas de red que reporta.
 */

import { getTvLogBuffer } from './logger';
import { pad2, tvWidth } from './scale';

/** Clave del token en localStorage. Misma que usa el poll del kiosco (plan 164-11). */
const TOKEN_KEY = 'tv.deviceToken';

/** Cuantas lineas del buffer del logger se imprimen. */
const LOG_LINES = 20;

const COLOR_BG = '#101418';
const COLOR_FG = '#f2ebe1';
const COLOR_LABEL = '#b08d6e';
const COLOR_OK = '#7fd18b';
const COLOR_FAIL = '#ff7b6b';
const COLOR_INFO = '#9aa7b4';

/**
 * Base del API para la consulta de prueba: el mismo host que sirve el kiosco, con
 * override por `?api=` para probar contra otro backend desde la sede.
 *
 * NOTA para el plan 164-11: el poll debe REUSAR esta funcion (importarla o promoverla a
 * un modulo compartido), no escribir una segunda resolucion de base — dos criterios
 * distintos para armar la URL del API es exactamente como se rompe un kiosco en una sede
 * y no en la maquina del que programa.
 */
export function tvApiBase(): string {
  const search = window.location.search;
  const at = search.indexOf('api=');
  if (at >= 0) {
    let raw = search.substring(at + 4);
    const amp = raw.indexOf('&');
    if (amp >= 0) {
      raw = raw.substring(0, amp);
    }
    if (raw.length > 0) {
      return decodeURIComponent(raw).replace(/\/$/, '');
    }
  }
  return window.location.protocol + '//' + window.location.host;
}

/** Lee el token sin romper si el kiosco corre con storage deshabilitado. */
function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** `CSS.supports` no existe en todos los motores de TV: se pregunta con guarda. */
function cssSupports(prop: string, value: string): boolean {
  const g = window as unknown as {
    CSS?: { supports?: (p: string, v: string) => boolean };
  };
  if (!g.CSS || typeof g.CSS.supports !== 'function') {
    return false;
  }
  try {
    return g.CSS.supports(prop, value);
  } catch {
    return false;
  }
}

function clear(el: Element): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

function makeRow(parent: HTMLElement, label: string, value: string, color: string): HTMLElement {
  const row = document.createElement('div');
  row.style.margin = '0 0 0.35rem';
  row.style.lineHeight = '1.35';
  row.style.wordBreak = 'break-all';

  const tag = document.createElement('span');
  tag.style.color = COLOR_LABEL;
  tag.style.marginRight = '0.6rem';
  tag.textContent = label;

  const val = document.createElement('span');
  val.style.color = color;
  val.textContent = value;

  row.appendChild(tag);
  row.appendChild(val);
  parent.appendChild(row);
  return val;
}

/** Feature requerida por el kiosco: si falta, el TV no sirve. */
function requiredRow(parent: HTMLElement, label: string, present: boolean): void {
  makeRow(parent, label, present ? 'OK' : 'FALTA', present ? COLOR_OK : COLOR_FAIL);
}

/**
 * Feature que el kiosco NO usa: sirve para ubicar la antiguedad del motor.
 * Un "NO" acá es lo esperado en un webOS 4.x y no es una falla.
 */
function engineRow(parent: HTMLElement, label: string, present: boolean): void {
  makeRow(parent, label, present ? 'SI' : 'NO', COLOR_INFO);
}

function makeTitle(parent: HTMLElement, text: string): void {
  const h = document.createElement('div');
  h.style.color = COLOR_LABEL;
  h.style.fontWeight = '700';
  h.style.letterSpacing = '0.14em';
  h.style.margin = '1.1rem 0 0.5rem';
  h.textContent = text;
  parent.appendChild(h);
}

function stamp(at: number): string {
  const d = new Date(at);
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

export function renderDiag(): void {
  const tv = document.getElementById('tv');
  if (!tv) {
    return;
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
  // ~1.15% del ancho del marco: legible a 4 m sin que el user agent (que es larguisimo)
  // empuje el resto fuera de la pantalla.
  root.style.fontSize = '1.15rem';
  root.style.textAlign = 'left';
  tv.appendChild(root);

  const titulo = document.createElement('div');
  titulo.style.color = COLOR_LABEL;
  titulo.style.fontSize = '2rem';
  titulo.style.letterSpacing = '0.18em';
  titulo.style.marginBottom = '0.8rem';
  titulo.textContent = 'EL TEMPLO · TV · DIAG';
  root.appendChild(titulo);

  // ── Version y entorno ────────────────────────────────────────────────────
  makeRow(
    root,
    'version:',
    window.__TV_VERSION__ ? window.__TV_VERSION__ : '(sin marcar)',
    COLOR_FG
  );
  const versionTxt = makeRow(root, 'version.txt:', 'consultando…', COLOR_INFO);
  makeRow(root, 'hora local:', stamp(Date.now()), COLOR_FG);
  makeRow(root, 'ua:', navigator.userAgent, COLOR_FG);

  const w = tvWidth();
  makeRow(
    root,
    'ventana:',
    window.innerWidth +
      ' x ' +
      window.innerHeight +
      '  ·  marco ' +
      Math.round(w) +
      ' x ' +
      Math.round(w / (16 / 9)) +
      '  ·  1rem = ' +
      (w / 100).toFixed(2) +
      'px',
    COLOR_FG
  );

  const token = readToken();
  makeRow(
    root,
    'device token:',
    token ? '····' + token.slice(-4) + '  (' + token.length + ' chars)' : 'sin vincular',
    token ? COLOR_OK : COLOR_INFO
  );

  // ── Lo que el kiosco necesita si o si ────────────────────────────────────
  makeTitle(root, 'REQUERIDO POR EL KIOSCO');
  requiredRow(root, 'fetch', typeof window.fetch !== 'undefined');
  requiredRow(root, 'Promise', typeof Promise !== 'undefined');
  requiredRow(
    root,
    'localStorage',
    (function (): boolean {
      try {
        return typeof window.localStorage !== 'undefined';
      } catch {
        return false;
      }
    })()
  );
  requiredRow(root, 'video + object-fit', cssSupports('object-fit', 'cover'));
  requiredRow(root, 'custom properties', cssSupports('--x', '1px'));

  // ── Antiguedad del motor: nada de esto lo usa el kiosco (D-20) ───────────
  makeTitle(root, 'MOTOR (el kiosco NO usa nada de esto)');
  const stringProto = String.prototype as unknown as Record<string, unknown>;
  const objectAny = Object as unknown as { entries?: unknown };
  const winAny = window as unknown as {
    ResizeObserver?: unknown;
    AudioContext?: unknown;
    webkitAudioContext?: unknown;
  };
  engineRow(root, 'String.padStart (ES2017)', 'padStart' in stringProto);
  engineRow(root, 'Object.entries (ES2017)', typeof objectAny.entries !== 'undefined');
  engineRow(root, 'ResizeObserver (Chr 64)', typeof winAny.ResizeObserver !== 'undefined');
  engineRow(root, 'container queries (Chr 105)', cssSupports('container-type', 'size'));
  engineRow(root, 'relacion de aspecto (Chr 88)', cssSupports('aspect-ratio', '16/9'));
  engineRow(root, 'rejilla (Chr 57)', cssSupports('display', 'grid'));
  engineRow(
    root,
    'AudioContext (beeps)',
    typeof winAny.AudioContext !== 'undefined' || typeof winAny.webkitAudioContext !== 'undefined'
  );

  // ── Red ──────────────────────────────────────────────────────────────────
  makeTitle(root, 'RED');
  makeRow(root, 'api base:', tvApiBase(), COLOR_FG);
  const apiRow = makeRow(root, 'GET /api/tv/state:', 'consultando…', COLOR_INFO);

  // ── Ultimas lineas del logger ────────────────────────────────────────────
  makeTitle(root, 'LOG (ultimas ' + LOG_LINES + ')');
  const buffer = getTvLogBuffer();
  const desde = buffer.length > LOG_LINES ? buffer.length - LOG_LINES : 0;
  if (buffer.length === 0) {
    makeRow(root, '', '(vacio)', COLOR_INFO);
  }
  for (let i = desde; i < buffer.length; i++) {
    const e = buffer[i];
    makeRow(
      root,
      stamp(e.at),
      '[' + e.level + '] [' + e.context + '] ' + e.message,
      e.level === 'error' ? COLOR_FAIL : COLOR_FG
    );
  }

  // Las dos consultas de red del diag. No arrancan el poll: son one-shot y solo
  // reportan status y latencia; el payload NUNCA se pinta (puede traer datos de socios).
  if (typeof window.fetch === 'undefined') {
    versionTxt.textContent = 'sin fetch';
    versionTxt.style.color = COLOR_FAIL;
    apiRow.textContent = 'sin fetch';
    apiRow.style.color = COLOR_FAIL;
    return;
  }

  window
    .fetch('version.txt?t=' + Date.now())
    .then(function (res) {
      return res.text();
    })
    .then(function (txt) {
      const remoto = txt.replace(/\s+$/, '');
      const local = window.__TV_VERSION__ ? window.__TV_VERSION__ : '';
      versionTxt.textContent =
        remoto + (remoto === local ? '  (al dia)' : '  (DISTINTA: falta recargar)');
      versionTxt.style.color = remoto === local ? COLOR_OK : COLOR_FAIL;
    })
    .catch(function (err: unknown) {
      versionTxt.textContent = 'error: ' + String(err);
      versionTxt.style.color = COLOR_FAIL;
    });

  const t0 = Date.now();
  const init: RequestInit = {};
  if (token) {
    init.headers = { Authorization: 'Device ' + token };
  }
  window
    .fetch(tvApiBase() + '/api/tv/state', init)
    .then(function (res) {
      const ms = Date.now() - t0;
      const extra = res.status === 401 ? '  (token invalido o revocado)' : '';
      apiRow.textContent = res.status + '  ·  ' + ms + ' ms' + extra;
      apiRow.style.color = res.status >= 200 && res.status < 300 ? COLOR_OK : COLOR_FAIL;
    })
    .catch(function (err: unknown) {
      apiRow.textContent = 'sin respuesta (' + (Date.now() - t0) + ' ms): ' + String(err);
      apiRow.style.color = COLOR_FAIL;
    });
}
