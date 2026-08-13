/**
 * Dibujo de la pantalla TV (`/pantalla-tv`): las tres pantallas (clase, reposo, cierre),
 * el reloj de pared y el timer.
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
 * El reloj de la sede se arma con `getUTCHours/Minutes/Seconds` sobre
 * `ahora + utcOffsetMinutes` y NUNCA con el formateador de fechas por zona horaria (D-20,
 * heredado del piso Chromium 53 del kiosco estático retirado — este archivo ahora corre
 * dentro del bundle del admin, pero el cálculo manual sigue siendo el correcto: evita
 * depender de que la ICU del navegador conozca el huso de la sede).
 */

import { beep } from './audio';
import { createTvLogger } from './logger';
import { nowCorrected } from './poll';
import type { TvClassPayload, TvExercise, TvPollResponse } from './poll';
/* El relleno a dos digitos vive en `scale.ts`: es el unico helper de relleno de todo
   `src/tv/` (reloj, timer y logger). El metodo nativo del string es ES2017 — Pitfall 5. */
import { pad2 } from './scale';
import type { TimerFrame } from './timer';
import { elapsedFrom, formatDigits, phaseAt } from './timer';
import type { SessionQuote } from '../utils/pdf/quotes';

const log = createTvLogger('render');

/**
 * Simbolos de nivel que el API manda YA embebidos en `TvLevelColumn.header` (`NIVEL Δ | …`).
 *
 * Se pintan dentro de un `<span class="glyph">` porque la fuente del kiosco no garantiza
 * el griego (Pitfall 6), y el de kairos (☉) lo DIBUJA el CSS con un circulo y un punto —
 * por eso ese span va vacio: el caracter no existe en ninguna fuente del televisor.
 */
const LEVEL_SYMBOLS = '☉αΔΣ';
const KAIROS_SYMBOL = '☉';

/** Cada cuanto rota la frase de reposo/cierre (D-06/D-08). */
const QUOTE_ROTATION_MS = 60 * 1000;

/** Lista de mas de esto = modo compacto (UI-SPEC). */
const COMPACT_OVER = 5;

// =============================================================================
// Nodos: se buscan UNA vez y se guardan
// =============================================================================

interface ClockNodes {
  head: Text;
}

interface Nodes {
  fecha: HTMLElement;
  reloj: ClockNodes;
  titulo: HTMLElement;
  formato: HTMLElement;
  movilidad: HTMLElement;
  bloqueNum: HTMLElement;
  dots: HTMLElement;
  /** Contenedor de las columnas de nivel: `paintList` lo llena a mano por
   *  cada poll (1 o 2 `.lista-col`), no viene fijo en la plantilla. */
  stage: HTMLElement;
  timerPanel: HTMLElement;
  digitos: HTMLElement;
  sub: HTMLElement;
  progreso: HTMLElement;
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
 * Prepara un reloj: un nodo de texto para `HH:MM` (el reloj de sede va SIN segundero).
 *
 * Se construye una sola vez, en vez de reusar los nodos de la plantilla, para no depender
 * de como quede el espaciado del HTML despues de formatearlo.
 */
function clockNodes(host: HTMLElement): ClockNodes {
  clear(host);
  const head = document.createTextNode('--:--');
  host.appendChild(head);
  return { head: head };
}

function ensureNodes(): Nodes {
  if (nodes) {
    return nodes;
  }
  nodes = {
    fecha: byId('fecha'),
    reloj: clockNodes(byId('reloj')),
    titulo: byId('titulo'),
    formato: byId('formato'),
    movilidad: byId('movilidad'),
    bloqueNum: byId('bloqueNum'),
    dots: byId('dots'),
    stage: byId('stage'),
    timerPanel: byId('timerPanel'),
    digitos: byId('digitos'),
    sub: byId('sub'),
    progreso: byId('progreso'),
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
/**
 * Pinta texto plano de un header, coloreando aparte el porcentaje de esfuerzo
 * ("NN%", `.pct`) — el resto queda en el color de la cabecera.
 */
function appendPlain(host: HTMLElement, text: string): void {
  const parts = text.split(/(\d+%)/);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.length === 0) {
      continue;
    }
    if (/^\d+%$/.test(part)) {
      const span = document.createElement('span');
      span.className = 'pct';
      span.textContent = part;
      host.appendChild(span);
    } else {
      host.appendChild(document.createTextNode(part));
    }
  }
}

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
      appendPlain(host, plano);
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
    appendPlain(host, plano);
  }
}

// =============================================================================
// Estado de lo ultimo pintado (la base de la idempotencia)
// =============================================================================

let quotes: SessionQuote[] = [];
let last: TvPollResponse | null = null;
let lastListKey = '';
let lastDotsKey = '';
let lastQuoteKey = '';
let lastBeepKey: string | null = null;

/**
 * Olvida los nodos cacheados y todo el estado de idempotencia.
 *
 * El kiosco estatico nunca se desmontaba (una pagina entera por televisor), asi que
 * `nodes` y los `last*` podian ser modulo-globales cacheados una sola vez. En el SPA la
 * pantalla es una ruta que se monta y desmonta: sin este reset, un segundo montaje
 * (navegar afuera de `/pantalla-tv` y volver) reusaria los `nodes` viejos —ya despegados
 * del DOM— y los `last*` cortarian el primer repintado por "no cambio nada", dejando la
 * pantalla en blanco. La pagina lo llama en `onMounted`, antes del primer render.
 */
export function resetRender(): void {
  nodes = null;
  last = null;
  lastListKey = '';
  lastDotsKey = '';
  lastQuoteKey = '';
  lastBeepKey = null;
}

/** Las frases del PDF, que la pantalla pasa una vez al montar (D-06/D-08). */
export function setQuotes(next: SessionQuote[]): void {
  quotes = next;
}

// =============================================================================
// Render del estado
// =============================================================================

/** El bloque en curso, o `null` si el payload no trae clase (reposo o cierre). */
function classOf(payload: TvPollResponse): TvClassPayload | null {
  return payload.screen === 'class' ? payload.class : null;
}

/**
 * Fecha calendario de la sede: DÍA DD DE MES AAAA (ej. `MARTES 12 DE AGOSTO 2026`).
 *
 * Se arma a mano con `getUTC*` sobre `ahora + utcOffsetMinutes`, NUNCA con
 * `toLocaleDateString`: misma razón que el reloj (D-20) — la ICU de un televisor de sede
 * puede venir recortada y devolver otra fecha o directamente tirar.
 */
const DIAS_SEMANA = [
  'DOMINGO',
  'LUNES',
  'MARTES',
  'MIÉRCOLES',
  'JUEVES',
  'VIERNES',
  'SÁBADO',
];
const MESES = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];
function formatFecha(nowMs: number, utcOffsetMinutes: number): string {
  const d = new Date(nowMs + utcOffsetMinutes * 60000);
  return (
    DIAS_SEMANA[d.getUTCDay()] +
    ' ' +
    d.getUTCDate() +
    ' DE ' +
    MESES[d.getUTCMonth()] +
    ' DE ' +
    d.getUTCFullYear()
  );
}

/**
 * Puntitos "BLOQUE n / M": cuentan sobre el bloque VISUAL (`visualBlockCount`/
 * `visualBlockIndex`), no sobre `c.blocks`/`c.blockIndex` — DEUTEROS_1 y
 * DEUTEROS_2 son dos caminos del mismo bloque y pintan un solo punto.
 */
function paintDots(n: Nodes, c: TvClassPayload): void {
  const key = c.visualBlockCount + ':' + c.visualBlockIndex;
  if (key === lastDotsKey) {
    return;
  }
  lastDotsKey = key;
  clear(n.dots);
  for (let i = 0; i < c.visualBlockCount; i++) {
    const dot = document.createElement('span');
    dot.className =
      'dot' + (i < c.visualBlockIndex ? ' hecho' : i === c.visualBlockIndex ? ' activo' : '');
    n.dots.appendChild(dot);
  }
}

/**
 * Un item de ejercicio: nombre arriba, badge de contraccion + dosis abajo
 * (mismo layout que `CompactExerciseList.vue` de la app — fase 164 rediseño).
 * Sin badge/dosis cuando el formato dicta el volumen (`dose` vacio) y la
 * prescripcion no trae contraccion.
 */
function buildItem(ex: TvExercise): HTMLElement {
  const item = document.createElement('div');
  item.className = 'item';

  // El badge de esfuerzo hace de viñeta: va ANTES del nombre (reemplaza al "•").
  if (ex.contraction.length > 0) {
    const badge = document.createElement('span');
    badge.className = 'badge badge--' + ex.contraction.toLowerCase();
    badge.textContent = ex.contraction;
    item.appendChild(badge);
  }

  const nombre = document.createElement('span');
  nombre.className = 'ej-nombre';
  nombre.textContent = ex.name;
  item.appendChild(nombre);

  // Repeticiones / segundos a la derecha de la fila.
  if (ex.dose.length > 0) {
    const dosis = document.createElement('span');
    dosis.className = 'dosis';
    dosis.textContent = ex.dose;
    item.appendChild(dosis);
  }

  return item;
}

/**
 * Pinta las columnas de nivel (1 o 2, `c.columns` — el rediseño de dos
 * niveles lado a lado). Cada columna trae su propio header (que puede llevar
 * simbolos de nivel, de ahi `paintGlyphText`) y su propia lista.
 */
function paintList(n: Nodes, c: TvClassPayload): void {
  let key = c.blockRole + '|' + c.level + '|' + c.columns.length;
  for (let ci = 0; ci < c.columns.length; ci++) {
    const col = c.columns[ci];
    key += '|' + col.header + '|' + col.exercises.length;
    for (let i = 0; i < col.exercises.length; i++) {
      key += '~' + col.exercises[i].name + '~' + col.exercises[i].contraction + '~' + col.exercises[i].dose;
    }
  }
  if (key === lastListKey) {
    return;
  }
  lastListKey = key;
  clear(n.stage);

  for (let ci = 0; ci < c.columns.length; ci++) {
    const col = c.columns[ci];

    const colEl = document.createElement('section');
    colEl.className = 'col panel lista-col';

    const cab = document.createElement('div');
    cab.className = 'cabCol';
    paintGlyphText(cab, col.header);
    colEl.appendChild(cab);

    const caja = document.createElement('div');
    // Listas largas (calentamiento): entran todas achicando la tipografia.
    caja.className = col.exercises.length > COMPACT_OVER ? 'caja compacta' : 'caja';
    for (let i = 0; i < col.exercises.length; i++) {
      caja.appendChild(buildItem(col.exercises[i]));
    }
    colEl.appendChild(caja);

    n.stage.appendChild(colEl);
  }
}

/**
 * Movilidad al pie: la etiqueta "MOVILIDAD" va en oro (como los headers de
 * NIVEL) y el resto (ejercicios + dosis) en el navy de los ejercicios. El
 * elemento queda vacío (:empty → oculto) cuando el bloque no trae movilidad.
 */
function paintMovilidad(host: HTMLElement, line: string | null): void {
  clear(host);
  if (!line) {
    return;
  }
  const sep = ' · ';
  const i = line.indexOf(sep);
  if (i < 0) {
    host.appendChild(document.createTextNode(line));
    return;
  }
  const label = document.createElement('span');
  label.className = 'movLabel';
  label.textContent = line.slice(0, i);
  host.appendChild(label);
  host.appendChild(document.createTextNode(line.slice(i)));
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
  // La marca es solo el logo + la fecha calendario del día; ya no hay texto "EL TEMPLO"
  // ni el `dateLabel` del API (DÍA · SEMANA n).
  const fecha = formatFecha(nowCorrected(), payload.branch.utcOffsetMinutes);
  setText(n.fecha, fecha);
  setText(n.reposoFecha, fecha);
  setText(n.cierreTitulo, 'SESIÓN COMPLETA');

  const c = classOf(payload);
  setVisible(n.pantallaReposo, 'pantalla dosMitades', !c && payload.screen !== 'closing');
  setVisible(n.pantallaCierre, 'pantalla dosMitades', payload.screen === 'closing');

  if (!c) {
    return;
  }

  // Cambiar de bloque reinicia el timer (y por lo tanto la cadena de beeps).
  const previoC = previo ? classOf(previo) : null;
  if (!previoC || previoC.blockRole !== c.blockRole) {
    lastBeepKey = null;
  }

  // El título del API viene como "NOMBRE · FORMATO"; el nombre va arriba y el
  // formato en la fila de abajo (INITIUM y demás customTitle no traen separador).
  const sepTitulo = ' · ';
  const iSep = c.title.indexOf(sepTitulo);
  setText(n.titulo, iSep >= 0 ? c.title.slice(0, iSep) : c.title);
  setText(n.formato, iSep >= 0 ? c.title.slice(iSep + sepTitulo.length) : '');
  paintMovilidad(n.movilidad, c.mobilityLine);
  // Bloque VISUAL (colapsa DEUTEROS_1/DEUTEROS_2 en uno solo), no la entrada cruda del roster.
  setText(n.bloqueNum, 'BLOQUE ' + (c.visualBlockIndex + 1) + ' / ' + c.visualBlockCount);
  paintDots(n, c);

  paintList(n, c);

  // Que el timer no espere hasta 250 ms para reflejar un start/reset del profe.
  tickTimer();
}

// =============================================================================
// Reloj de pared (el pedido #1 de los socios)
// =============================================================================

function paintClock(clock: ClockNodes, d: Date): void {
  const head = pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes());
  if (clock.head.data !== head) {
    clock.head.data = head;
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
  clase: string;
  digitos: string;
  sub: string;
  hint: string;
  progreso: number;
}

/**
 * Sub-linea del timer: la ronda/intervalo del bloque. En cuenta regresiva va VACÍA — el
 * "tiempo restante" ya no es un texto, lo dice la barra que arranca llena y se vacía.
 */
function subLine(c: TvClassPayload, round: number, totalRounds: number): string {
  const kind = c.timer.spec.kind;
  if (kind === 'work_rest') {
    return 'RONDA ' + round + ' / ' + totalRounds;
  }
  if (kind === 'interval') {
    return 'INTERVALO ' + round + ' / ' + totalRounds;
  }
  if (kind === 'countdown') {
    return '';
  }
  return 'A RITMO PROPIO';
}

function timerPaint(c: TvClassPayload, frame: TimerFrame): TimerPaint {
  const t = c.timer;
  const sub = subLine(c, frame.round, frame.totalRounds);
  const libre = t.spec.kind === 'countup';
  // Bloques de intervalos (Tabata / HIIT / ROM): los digitos van en segundos crudos
  // (`:20`), para que el segundero se vea grande. Duracion total (AMRAP, cap, libre) → mm:ss.
  const shortInterval = t.spec.kind === 'work_rest';

  // Sin etiqueta de fase (ya no se muestra "LISTOS/TRABAJO"): el estado se lee por la
  // OPACIDAD de los digitos — apagados hasta que corre, plenos cuando arranca (clase
  // `corriendo`) — y por el color del marco (descanso / completo).

  // D-16: sin cuenta previa. En reposo se ven los digitos iniciales del formato.
  if (t.status === 'idle') {
    return {
      clase: '',
      digitos: formatDigits(phaseAt(0, t.spec).displayMs, shortInterval),
      sub: sub,
      hint: libre ? 'Formato sin tiempos — cronómetro libre' : '',
      progreso: 0,
    };
  }

  // D-17: pausa = digitos congelados exactamente donde quedaron (apagados, no corre).
  if (t.status === 'paused') {
    return {
      clase: 'pausa',
      digitos: formatDigits(frame.displayMs, shortInterval),
      sub: sub,
      hint: '',
      progreso: frame.progress * 100,
    };
  }

  if (frame.finished) {
    return {
      clase: 'completo',
      digitos: formatDigits(0, shortInterval),
      sub: '',
      hint: 'El profe avanza al siguiente bloque',
      progreso: 100,
    };
  }

  if (frame.phase === 'rest') {
    return {
      clase: 'corriendo descanso',
      digitos: formatDigits(frame.displayMs, shortInterval),
      sub: sub,
      hint: '',
      progreso: frame.progress * 100,
    };
  }

  return {
    clase: 'corriendo trabajo',
    digitos: formatDigits(frame.displayMs, shortInterval),
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

  setClass(n.timerPanel, 'cronometro' + (paint.clase ? ' ' + paint.clase : ''));
  setText(n.digitos, paint.digitos);
  setText(n.sub, paint.sub);
  // La barra muestra el tiempo QUE QUEDA: arranca llena (100%) y se vacía a medida que
  // corre el bloque (progreso 0→100 ⇒ ancho 100→0).
  const ancho = Math.round(100 - paint.progreso) + '%';
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
