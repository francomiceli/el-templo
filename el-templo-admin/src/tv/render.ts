/**
 * Dibujo del kiosco `/tv/`: las cuatro pantallas, el reloj de pared y el timer.
 *
 * Este archivo es lo que ven los socios. Tres reglas lo gobiernan:
 *
 * 1. **Idempotencia.** Los nodos del DOM viven en `index.html` y aca solo se ACTUALIZAN.
 *    Un televisor prendido 14 horas hace ~200.000 ticks: reconstruir la lista en cada uno
 *    es la fuga de memoria de Pitfall 13. Cada bloque de render compara contra lo ultimo
 *    pintado y sale temprano si no cambio nada.
 * 2. **Nada de HTML crudo.** Los nombres de ejercicios y las prescripciones salen de la
 *    DB (T-164-46): todo texto entra por `textContent` o por nodos de texto creados a
 *    mano. Los unicos elementos que se crean son los items de la lista, los dots y los
 *    tramos de las frases — y solo cuando su contenido cambia.
 * 3. **El tiempo no viaja por la red.** `tickTimer` calcula fase y digitos con
 *    `timer.ts` y el reloj corregido de `poll.ts`; el API solo publica el sello de
 *    arranque. Con el wifi caido la pantalla sigue contando sola.
 *
 * Compatibilidad (D-20, piso Chromium 53): el reloj de la sede se arma con
 * `getUTCHours/Minutes/Seconds` sobre `ahora + utcOffsetMinutes` y NUNCA con el formateador
 * de fechas por zona horaria — la ICU de un televisor puede venir recortada y devolver la
 * hora del server, o directamente tirar. Sin `?.`, sin `??`, sin utilidades de ES2017.
 */

import { beep } from './audio';
import { createTvLogger } from './logger';
import { nowCorrected } from './poll';
import type { TvClassPayload, TvPollResponse } from './poll';
/* El relleno a dos digitos vive en `scale.ts`: es el unico helper de relleno de todo
   `src/tv/` (reloj, timer y logger). El metodo nativo del string es ES2017 — Pitfall 5. */
import { pad2 } from './scale';
import type { TimerFrame } from './timer';
import { elapsedFrom, formatDigits, phaseAt } from './timer';
import type { SessionQuote } from '../utils/pdf/quotes';

const log = createTvLogger('render');

/**
 * Simbolos de nivel que el API manda YA embebidos en `listHeader` (`NIVEL Δ | …`).
 *
 * Se pintan dentro de un `<span class="glyph">` porque la fuente del kiosco no garantiza
 * el griego (Pitfall 6), y el de kairos (☉) lo DIBUJA el CSS con un circulo y un punto —
 * por eso ese span va vacio: el caracter no existe en ninguna fuente del televisor.
 */
const LEVEL_SYMBOLS = '☉αΔΣ';
const KAIROS_SYMBOL = '☉';

/** Separador que usa el API entre el rol y el formato: `NUCLEUS · TABATA 20"/10" ×8`. */
const TITLE_SEPARATOR = ' · ';

/** Cada cuanto rota la frase de reposo/cierre (D-06/D-08). */
const QUOTE_ROTATION_MS = 60 * 1000;

/** Lista de mas de esto = modo compacto (UI-SPEC). */
const COMPACT_OVER = 5;

// =============================================================================
// Nodos: se buscan UNA vez y se guardan
// =============================================================================

interface ClockNodes {
  head: Text;
  seg: HTMLElement;
}

interface Nodes {
  sede: HTMLElement;
  fecha: HTMLElement;
  reloj: ClockNodes;
  titulo: HTMLElement;
  movilidad: HTMLElement;
  bloqueNum: HTMLElement;
  dots: HTMLElement;
  cabNivel: HTMLElement;
  listaBox: HTMLElement;
  timerPanel: HTMLElement;
  timerCab: HTMLElement;
  fase: HTMLElement;
  digitos: HTMLElement;
  sub: HTMLElement;
  progreso: HTMLElement;
  hint: HTMLElement;
  cabVideo: HTMLElement;
  video: HTMLVideoElement | null;
  videoVacio: HTMLElement;
  pantallaPairing: HTMLElement;
  pairingCodigo: HTMLElement;
  pairingInstruccion: HTMLElement;
  pantallaReposo: HTMLElement;
  reposoReloj: ClockNodes;
  reposoFecha: HTMLElement;
  reposoQuote: HTMLElement;
  reposoAutor: HTMLElement;
  pantallaCierre: HTMLElement;
  cierreTitulo: HTMLElement;
  cierreReloj: ClockNodes;
  cierreQuote: HTMLElement;
  cierreAutor: HTMLElement;
}

let nodes: Nodes | null = null;

/**
 * Nodo por id. Si faltara (plantilla editada, id renombrado) devuelve un elemento suelto
 * que absorbe las escrituras: en un televisor es preferible una pantalla con un dato de
 * menos que una excepcion que corta el render entero.
 */
function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (el) {
    return el;
  }
  log.warn('falta un nodo de la plantilla', { id: id });
  return document.createElement('div');
}

function clear(el: Element): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

/**
 * Prepara un reloj: un nodo de texto para `HH:MM:` y un span para el segundero en oro.
 *
 * Se construye una sola vez, en vez de reusar los nodos de la plantilla, para no depender
 * de como quede el espaciado del HTML despues de formatearlo.
 */
function clockNodes(host: HTMLElement): ClockNodes {
  clear(host);
  const head = document.createTextNode('--:--:');
  const seg = document.createElement('span');
  seg.className = 'seg';
  seg.textContent = '--';
  host.appendChild(head);
  host.appendChild(seg);
  return { head: head, seg: seg };
}

function ensureNodes(): Nodes {
  if (nodes) {
    return nodes;
  }
  const video = document.querySelector('.videoCol video');
  nodes = {
    sede: byId('sede'),
    fecha: byId('fecha'),
    reloj: clockNodes(byId('reloj')),
    titulo: byId('titulo'),
    movilidad: byId('movilidad'),
    bloqueNum: byId('bloqueNum'),
    dots: byId('dots'),
    cabNivel: byId('cabNivel'),
    listaBox: byId('listaBox'),
    timerPanel: byId('timerPanel'),
    timerCab: byId('timerCab'),
    fase: byId('fase'),
    digitos: byId('digitos'),
    sub: byId('sub'),
    progreso: byId('progreso'),
    hint: byId('hint'),
    cabVideo: byId('cabVideo'),
    video: video ? (video as HTMLVideoElement) : null,
    videoVacio: byId('videoVacio'),
    pantallaPairing: byId('pantallaPairing'),
    pairingCodigo: byId('pairingCodigo'),
    pairingInstruccion: byId('pairingInstruccion'),
    pantallaReposo: byId('pantallaReposo'),
    reposoReloj: clockNodes(byId('reposoReloj')),
    reposoFecha: byId('reposoFecha'),
    reposoQuote: byId('reposoQuote'),
    reposoAutor: byId('reposoAutor'),
    pantallaCierre: byId('pantallaCierre'),
    cierreTitulo: byId('cierreTitulo'),
    cierreReloj: clockNodes(byId('cierreReloj')),
    cierreQuote: byId('cierreQuote'),
    cierreAutor: byId('cierreAutor'),
  };
  if (!nodes.video) {
    log.warn('la plantilla no tiene <video> en la columna derecha');
  }
  // El video del ejercicio puede fallar (R2 caido, mp4 corrupto): ahi vale el mismo
  // criterio que la app — placeholder, nunca un panel negro sin explicacion.
  if (nodes.video) {
    nodes.video.addEventListener('error', function () {
      log.warn('el video no cargo', { url: lastVideoUrl ? lastVideoUrl : '' });
      showPlaceholder(true);
    });
  }
  return nodes;
}

// =============================================================================
// Helpers de escritura idempotente
// =============================================================================

function setText(el: HTMLElement, value: string): void {
  if (el.textContent !== value) {
    el.textContent = value;
  }
}

function setClass(el: HTMLElement, value: string): void {
  if (el.className !== value) {
    el.className = value;
  }
}

function setVisible(el: HTMLElement, base: string, visible: boolean): void {
  setClass(el, visible ? base + ' visible' : base);
}

/**
 * Pinta un texto que puede traer simbolos de nivel, envolviendo cada simbolo en su span.
 * Todo lo demas entra como nodo de texto: sigue sin haber HTML crudo.
 */
function paintGlyphText(host: HTMLElement, text: string): void {
  clear(host);
  let plano = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (LEVEL_SYMBOLS.indexOf(ch) < 0) {
      plano += ch;
      continue;
    }
    if (plano.length > 0) {
      host.appendChild(document.createTextNode(plano));
      plano = '';
    }
    const span = document.createElement('span');
    if (ch === KAIROS_SYMBOL) {
      // El circulo con punto lo dibuja el CSS: el caracter no existe en ninguna fuente.
      span.className = 'glyph kairos';
    } else {
      span.className = 'glyph';
      span.textContent = ch;
    }
    host.appendChild(span);
  }
  if (plano.length > 0) {
    host.appendChild(document.createTextNode(plano));
  }
}

// =============================================================================
// Estado de lo ultimo pintado (la base de la idempotencia)
// =============================================================================

let quotes: SessionQuote[] = [];
let last: TvPollResponse | null = null;
let lastListKey = '';
let lastListHeader = '';
let lastDotsKey = '';
let lastExerciseIndex = -1;
// `undefined` = todavia no se pinto ningun video. NO puede arrancar en `null`: null es
// tambien "este ejercicio no tiene video", y la guardia de paintVideo cortaba por igualdad
// antes de mostrar el cartel — la primera clase con un ejercicio sin video quedaba con el
// hueco vacio, sin video y sin placeholder (visto en el TV de sede, verificacion de 164).
let lastVideoUrl: string | null | undefined = undefined;
let lastQuoteKey = '';
let lastBeepKey: string | null = null;
let itemNodes: HTMLElement[] = [];

/** Las frases del PDF, que `boot.ts` recibe por parametro desde `main.ts` (D-06/D-08). */
export function setQuotes(next: SessionQuote[]): void {
  quotes = next;
}

// =============================================================================
// Pantalla de vinculacion
// =============================================================================

/**
 * TV sin vincular: el codigo gigante, agrupado de a 3 para leerlo desde el mostrador.
 * `null` mientras el kiosco todavia no consiguio uno (sin red, por ejemplo).
 */
export function renderPairing(userCode: string | null): void {
  const n = ensureNodes();
  const code = userCode ? userCode : '';
  const agrupado = code.length === 6 ? code.substring(0, 3) + ' ' + code.substring(3) : code;
  setText(n.pairingCodigo, agrupado.length > 0 ? agrupado : '…');
  setText(
    n.pairingInstruccion,
    agrupado.length > 0
      ? 'Cargá este código en el admin, en Televisores, para vincular esta pantalla a su sede.'
      : 'Conectando…'
  );
  setVisible(n.pantallaPairing, 'pantalla', true);
  setVisible(n.pantallaReposo, 'pantalla', false);
  setVisible(n.pantallaCierre, 'pantalla', false);
  last = null;
  lastBeepKey = null;
}

// =============================================================================
// Render del estado
// =============================================================================

/** El bloque en curso, o `null` si el payload no trae clase (reposo o cierre). */
function classOf(payload: TvPollResponse): TvClassPayload | null {
  return payload.screen === 'class' ? payload.class : null;
}

/** Formato del bloque para el header del timer: lo que sigue al `·` del titulo. */
function formatLabel(title: string): string {
  const at = title.lastIndexOf(TITLE_SEPARATOR);
  return at >= 0 ? title.substring(at + TITLE_SEPARATOR.length) : title;
}

function paintDots(n: Nodes, c: TvClassPayload): void {
  const key = c.blocks.length + ':' + c.blockIndex;
  if (key === lastDotsKey) {
    return;
  }
  lastDotsKey = key;
  clear(n.dots);
  for (let i = 0; i < c.blocks.length; i++) {
    const dot = document.createElement('span');
    dot.className = 'dot' + (i < c.blockIndex ? ' hecho' : i === c.blockIndex ? ' activo' : '');
    n.dots.appendChild(dot);
  }
}

function paintList(n: Nodes, c: TvClassPayload): void {
  let key = c.blockRole + '|' + c.level + '|' + c.exercises.length;
  for (let i = 0; i < c.exercises.length; i++) {
    key += '|' + c.exercises[i].name + '~' + c.exercises[i].rx;
  }
  if (key !== lastListKey) {
    lastListKey = key;
    lastExerciseIndex = -1;
    clear(n.listaBox);
    itemNodes = [];
    for (let i = 0; i < c.exercises.length; i++) {
      const item = document.createElement('div');
      item.className = 'item';
      const ej = document.createElement('span');
      ej.className = 'ej';
      ej.textContent = c.exercises[i].name;
      const rx = document.createElement('span');
      rx.className = 'rx';
      rx.textContent = c.exercises[i].rx;
      item.appendChild(ej);
      item.appendChild(rx);
      n.listaBox.appendChild(item);
      itemNodes.push(item);
    }
    // Listas largas (calentamiento): entran todas achicando la tipografia.
    setClass(n.listaBox, c.exercises.length > COMPACT_OVER ? 'caja compacta' : 'caja');
  }

  if (c.exerciseIndex !== lastExerciseIndex) {
    lastExerciseIndex = c.exerciseIndex;
    for (let i = 0; i < itemNodes.length; i++) {
      setClass(itemNodes[i], i === c.exerciseIndex ? 'item activo' : 'item');
    }
  }
}

/** Muestra u oculta el cartel de "sin video". El `<video>` siempre es el mismo elemento. */
function showPlaceholder(show: boolean): void {
  if (!nodes) {
    return;
  }
  setVisible(nodes.videoVacio, 'videoVacio', show);
}

function paintVideo(n: Nodes, url: string | null): void {
  if (url === lastVideoUrl) {
    return;
  }
  lastVideoUrl = url;
  if (!n.video) {
    return;
  }
  if (!url) {
    showPlaceholder(true);
    n.video.removeAttribute('src');
    n.video.load();
    return;
  }
  showPlaceholder(false);
  n.video.src = url;
  n.video.load();
  // El autoplay puede estar bloqueado por politica del navegador del TV: se intenta y, si
  // no, queda el primer frame. Nunca puede tirar la pantalla abajo.
  const jugando = n.video.play() as Promise<void> | undefined;
  if (jugando && typeof jugando.catch === 'function') {
    jugando.catch(function () {
      log.debug('autoplay bloqueado, queda el primer frame');
    });
  }
}

/**
 * Pinta un estado nuevo del API. Idempotente: solo escribe lo que cambio.
 *
 * D-09: cuando no hay clase el payload dice `idle` y no trae un solo campo de error — el
 * kiosco tampoco lo inventa: se ve el reposo y nadie parado enfrente puede distinguir "no
 * hay clase ahora" de "la sesion no esta aprobada".
 */
export function renderState(payload: TvPollResponse): void {
  const n = ensureNodes();
  const previo = last;
  last = payload;

  // Topbar (se ve en la pantalla de clase; en reposo/cierre queda tapada por el overlay).
  setText(n.sede, 'EL TEMPLO ' + payload.branch.name);
  setText(n.fecha, payload.branch.dateLabel);
  setText(n.reposoFecha, payload.branch.dateLabel);
  setText(n.cierreTitulo, 'SESIÓN COMPLETA');

  const c = classOf(payload);
  setVisible(n.pantallaPairing, 'pantalla', false);
  setVisible(n.pantallaReposo, 'pantalla', !c && payload.screen !== 'closing');
  setVisible(n.pantallaCierre, 'pantalla', payload.screen === 'closing');

  if (!c) {
    return;
  }

  // Cambiar de bloque reinicia el timer (y por lo tanto la cadena de beeps).
  const previoC = previo ? classOf(previo) : null;
  if (!previoC || previoC.blockRole !== c.blockRole) {
    lastBeepKey = null;
  }

  setText(n.titulo, c.title);
  setText(n.movilidad, c.mobilityLine ? c.mobilityLine : '');
  setText(n.bloqueNum, 'BLOQUE ' + (c.blockIndex + 1) + ' / ' + c.blocks.length);
  paintDots(n, c);

  if (c.listHeader !== lastListHeader) {
    lastListHeader = c.listHeader;
    paintGlyphText(n.cabNivel, c.listHeader);
  }

  paintList(n, c);

  const actual = c.exercises[c.exerciseIndex];
  setText(n.cabVideo, actual ? actual.name : '');
  setText(n.timerCab, formatLabel(c.title));
  paintVideo(n, actual ? actual.videoUrl : null);

  // Que el timer no espere hasta 250 ms para reflejar un start/reset del profe.
  tickTimer();
}

// =============================================================================
// Reloj de pared (el pedido #1 de los socios)
// =============================================================================

function paintClock(clock: ClockNodes, d: Date): void {
  const head = pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) + ':';
  const seg = pad2(d.getUTCSeconds());
  if (clock.head.data !== head) {
    clock.head.data = head;
  }
  if (clock.seg.textContent !== seg) {
    clock.seg.textContent = seg;
  }
}

/**
 * Hora de la SEDE, cada 250 ms para que el segundero no salte.
 *
 * Se calcula desplazando el instante corregido por el offset que publica el API y leyendo
 * el resultado en UTC. No se usa el formateador por zona horaria a proposito (ver el
 * docblock del archivo).
 */
export function tickClock(): void {
  if (!last) {
    return;
  }
  const n = ensureNodes();
  const d = new Date(nowCorrected() + last.branch.utcOffsetMinutes * 60000);
  paintClock(n.reloj, d);

  if (last.screen === 'idle') {
    paintClock(n.reposoReloj, d);
    paintQuote(n.reposoQuote, n.reposoAutor, 'reposo');
  } else if (last.screen === 'closing') {
    paintClock(n.cierreReloj, d);
    paintQuote(n.cierreQuote, n.cierreAutor, 'cierre');
  }
}

/**
 * Frase del PDF en reposo/cierre (D-06/D-08).
 *
 * Rota cada minuto con una eleccion derivada del reloj —no aleatoria—: asi todos los
 * televisores de la sede muestran la misma frase y ninguna cambia en medio de un tick.
 */
function paintQuote(host: HTMLElement, autor: HTMLElement, pantalla: string): void {
  if (quotes.length === 0) {
    return;
  }
  const idx = Math.floor(nowCorrected() / QUOTE_ROTATION_MS) % quotes.length;
  const key = pantalla + ':' + idx;
  if (key === lastQuoteKey) {
    return;
  }
  lastQuoteKey = key;
  const quote = quotes[idx];
  clear(host);
  host.appendChild(document.createTextNode(quote.text));
  if (quote.goldText.length > 0) {
    const oro = document.createElement('span');
    oro.className = 'oro';
    oro.textContent = quote.goldText;
    host.appendChild(oro);
  }
  setText(autor, '– ' + quote.author);
}

// =============================================================================
// Timer local
// =============================================================================

interface TimerPaint {
  fase: string;
  clase: string;
  digitos: string;
  sub: string;
  hint: string;
  progreso: number;
}

/** Sub-linea del timer: la que dice en que ronda o intervalo va el bloque. */
function subLine(c: TvClassPayload, round: number, totalRounds: number): string {
  const kind = c.timer.spec.kind;
  if (kind === 'work_rest') {
    return 'RONDA ' + round + ' / ' + totalRounds;
  }
  if (kind === 'interval') {
    return 'INTERVALO ' + round + ' / ' + totalRounds;
  }
  if (kind === 'countdown') {
    return 'TIEMPO RESTANTE';
  }
  return 'A RITMO PROPIO';
}

function timerPaint(c: TvClassPayload, frame: TimerFrame): TimerPaint {
  const t = c.timer;
  const sub = subLine(c, frame.round, frame.totalRounds);
  const libre = t.spec.kind === 'countup';

  // D-16: sin cuenta previa. En reposo se ven los digitos iniciales del formato y al
  // iniciar arranca TRABAJO al instante.
  if (t.status === 'idle') {
    return {
      fase: 'LISTOS',
      clase: '',
      digitos: formatDigits(phaseAt(0, t.spec).displayMs),
      sub: sub,
      hint: libre ? 'Formato sin tiempos — cronómetro libre' : '',
      progreso: 0,
    };
  }

  // D-17: pausa = digitos congelados exactamente donde quedaron.
  if (t.status === 'paused') {
    return {
      fase: 'PAUSA',
      clase: '',
      digitos: formatDigits(frame.displayMs),
      sub: sub,
      hint: '',
      progreso: frame.progress * 100,
    };
  }

  if (frame.finished) {
    return {
      fase: 'BLOQUE COMPLETO',
      clase: 'completo',
      digitos: formatDigits(0),
      sub: '',
      hint: 'El profe avanza al siguiente bloque',
      progreso: 100,
    };
  }

  if (frame.phase === 'rest') {
    return {
      fase: 'DESCANSO',
      clase: 'descanso',
      digitos: formatDigits(frame.displayMs),
      sub: sub,
      hint: '',
      progreso: frame.progress * 100,
    };
  }

  return {
    fase: libre ? 'CRONÓMETRO' : 'TRABAJO',
    clase: 'trabajo',
    digitos: formatDigits(frame.displayMs),
    sub: sub,
    hint: libre ? 'Formato sin tiempos — cronómetro libre' : '',
    progreso: frame.progress * 100,
  };
}

/**
 * Repinta el timer con el reloj corregido, cada 250 ms.
 *
 * No consulta la red: el API publica `startedAt` y el kiosco deriva todo lo demas, asi que
 * con el wifi caido la pantalla sigue contando igual.
 */
export function tickTimer(): void {
  if (!last) {
    return;
  }
  const c = classOf(last);
  if (!c) {
    return;
  }
  const n = ensureNodes();
  const frame = phaseAt(elapsedFrom(c.timer, nowCorrected()), c.timer.spec);
  const paint = timerPaint(c, frame);

  setClass(n.timerPanel, 'panel timerCaja' + (paint.clase ? ' ' + paint.clase : ''));
  setText(n.fase, paint.fase);
  setText(n.digitos, paint.digitos);
  setText(n.sub, paint.sub);
  setText(n.hint, paint.hint);
  const ancho = Math.round(paint.progreso) + '%';
  if (n.progreso.style.width !== ancho) {
    n.progreso.style.width = ancho;
  }

  maybeBeep(c, frame);
}

/**
 * Beep en cada cambio de fase y al terminar el bloque (D-19).
 *
 * Nunca suena en el primer pintado de una fase recien cargada (por eso la primera clave
 * solo se recuerda): un TV que se reconecta en medio de una ronda no tiene que pegar un
 * grito. Solo con el timer corriendo y el sonido activado desde el celular del profe.
 */
function maybeBeep(c: TvClassPayload, frame: TimerFrame): void {
  if (c.timer.status !== 'running') {
    lastBeepKey = null;
    return;
  }
  const key = frame.phase + ':' + frame.round + ':' + (frame.finished ? 'fin' : 'sigue');
  if (key === lastBeepKey) {
    return;
  }
  const primera = lastBeepKey === null;
  lastBeepKey = key;
  if (primera) {
    return;
  }
  beep(frame.finished ? 'end' : 'phase', c.timer.soundEnabled);
}
