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
import type { TimerFrame, TvTimerStatus } from './timer';
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

/** Duración del flourish de arranque (clase `.arranque` sobre el cronómetro). */
const ARRANQUE_MS = 850;

// =============================================================================
// Nodos: se buscan UNA vez y se guardan
// =============================================================================

interface ClockNodes {
  head: Text;
}

interface Nodes {
  fechaL1: HTMLElement;
  fechaL2: HTMLElement;
  cierreFechaL1: HTMLElement;
  cierreFechaL2: HTMLElement;
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
  digitosGhost: HTMLElement;
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
    fechaL1: byId('fechaL1'),
    fechaL2: byId('fechaL2'),
    cierreFechaL1: byId('cierreFechaL1'),
    cierreFechaL2: byId('cierreFechaL2'),
    reloj: clockNodes(byId('reloj')),
    titulo: byId('titulo'),
    formato: byId('formato'),
    movilidad: byId('movilidad'),
    bloqueNum: byId('bloqueNum'),
    dots: byId('dots'),
    stage: byId('stage'),
    timerPanel: byId('timerPanel'),
    digitos: byId('digitos'),
    digitosGhost: byId('digitosGhost'),
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

/**
 * Formato en la cabecera, en DOS líneas cuando el nombre va seguido de un valor
 * numérico (segundos / minutos / rondas): p.ej. `EMOM 10' (60")` → `EMOM` arriba,
 * `10' (60")` abajo; `AMRAP 10' X3` → `AMRAP` / `10' X3`. Sin valor (p.ej.
 * `I GO YOU GO`) queda en una sola línea.
 *
 * El corte es antes del primer token que arranca en dígito o en `X<n>` (rondas),
 * siempre con al menos una palabra de nombre delante — así `5 RFT 10'` corta en
 * `10'` (no en el `5` del nombre). Guard por `lastFormatoRaw`: no toca el DOM si
 * el formato no cambió (mismo criterio que `setText`).
 */
function paintFormato(host: HTMLElement, raw: string): void {
  if (lastFormatoRaw === raw) {
    return;
  }
  lastFormatoRaw = raw;
  clear(host);
  const tokens = raw.split(' ');
  let breakAt = -1;
  for (let i = 1; i < tokens.length; i++) {
    if (/^\d/.test(tokens[i]) || /^[Xx]\d/.test(tokens[i])) {
      breakAt = i;
      break;
    }
  }
  if (breakAt < 0) {
    // Sin número no hay corte forzado: dejamos que envuelva por espacios, pero los
    // guiones de nombres compuestos (Buy-in, Cash-out) NO deben partir la palabra.
    // Cada token va en un span nowrap → "Buy-in /" en una línea y "Cash-out" en la otra.
    for (let i = 0; i < tokens.length; i++) {
      if (i > 0) {
        host.appendChild(document.createTextNode(' '));
      }
      const span = document.createElement('span');
      span.style.whiteSpace = 'nowrap';
      span.textContent = tokens[i];
      host.appendChild(span);
    }
    return;
  }
  host.appendChild(document.createTextNode(tokens.slice(0, breakAt).join(' ')));
  host.appendChild(document.createElement('br'));
  host.appendChild(document.createTextNode(tokens.slice(breakAt).join(' ')));
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
/** Ronda marcada por última vez en la lista (marcador ▸); evita tocar el DOM cada tick. */
let lastMarkerKey: string | null = null;
let lastDotsKey = '';
let lastQuoteKey = '';
let lastBeepKey: string | null = null;
/** Última cadena de formato pintada (con su salto de línea nombre/spec). */
let lastFormatoRaw: string | null = null;
/** Estado del timer en el tick anterior — para detectar el ARRANQUE (idle→running). */
let lastTimerStatus: TvTimerStatus | null = null;
/** `startedAt` visto por última vez — un valor NUEVO marca un arranque real (no un resume). */
let lastStartedAt: number | null = null;
/** Instante (reloj corregido) hasta el que dura el flourish de arranque. */
let arranqueUntil = 0;

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
  lastMarkerKey = null;
  lastDotsKey = '';
  lastQuoteKey = '';
  lastBeepKey = null;
  lastFormatoRaw = null;
  lastTimerStatus = null;
  lastStartedAt = null;
  arranqueUntil = 0;
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

/** Fecha compacta en dos líneas para la topbar: "JUEVES 13" / "AGOSTO 2026". */
function fechaTopbar(nowMs: number, utcOffsetMinutes: number): { l1: string; l2: string } {
  const d = new Date(nowMs + utcOffsetMinutes * 60000);
  return {
    l1: DIAS_SEMANA[d.getUTCDay()] + ' ' + d.getUTCDate(),
    l2: MESES[d.getUTCMonth()] + ' ' + d.getUTCFullYear(),
  };
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

  // El badge de esfuerzo va antes del nombre. El marcador ▸ del ejercicio actual
  // lo pinta el CSS al final de la fila (`.item.actual::after`), sin robar espacio.
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

  // Repeticiones / segundos a la derecha de la fila. El numero va en un span
  // interno para poder agrandarlo (transform: scale) SIN agrandar el chip: el
  // transform es visual, no reflowea, asi que la placa conserva su tamaño.
  if (ex.dose.length > 0) {
    const dosis = document.createElement('span');
    dosis.className = 'dosis';
    const num = document.createElement('span');
    num.className = 'dosis-num';
    num.textContent = ex.dose;
    dosis.appendChild(num);
    item.appendChild(dosis);
  }

  return item;
}

/**
 * Pinta las columnas de nivel (1 o 2, `c.columns` — el rediseño de dos
 * niveles lado a lado). Cada columna trae su propio header (que puede llevar
 * simbolos de nivel, de ahi `paintGlyphText`) y su propia lista.
 */
/**
 * Auto-fit del 2×2: todas las listas comparten UN tamaño de nombre de ejercicio
 * (`--ej-fs`), el mayor que hace entrar hasta el nombre más largo sin que
 * ninguna caja recorte (scrollHeight > alto visible). Corre sólo al reconstruir
 * la lista (no cada frame). Fuera del 2×2 limpia la variable (el CSS usa su
 * default). Medir fuerza reflow; el barrido de ~13 pasos es barato y puntual.
 */
function fitDeuterosFont(n: Nodes): void {
  const stage = n.stage;
  if (stage.getAttribute('data-cols') !== '4') {
    stage.style.removeProperty('--ej-fs');
    return;
  }
  const cajas = Array.from(stage.querySelectorAll('.caja')) as HTMLElement[];
  // Arranca alto y baja hasta el mayor tamaño con el que TODAS las listas entran
  // sin recortar: nombres cortos → grande; una lista con un nombre a dos líneas
  // baja el tamaño de todas por igual.
  const MAX = 2.5;
  const MIN = 1.4;
  const STEP = 0.1;
  // Alto REAL del contenido = suma de los ítems + sus márgenes verticales. No se
  // usa scrollHeight de la caja porque con space-between el último ítem pega al
  // borde y la medición se vuelve ambigua.
  const contentOverflows = (caja: HTMLElement): boolean => {
    const items = Array.from(caja.children) as HTMLElement[];
    if (items.length === 0) return false;
    const cs = getComputedStyle(items[0]);
    const vMargin = parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    let total = 0;
    for (const it of items) total += it.offsetHeight + vMargin;
    return total > caja.clientHeight + 1;
  };
  let fs = MAX;
  stage.style.setProperty('--ej-fs', fs + 'rem');
  while (fs > MIN && cajas.some(contentOverflows)) {
    fs = Math.round((fs - STEP) * 10) / 10;
    stage.style.setProperty('--ej-fs', fs + 'rem');
  }
}

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
  // La lista se reconstruye: el marcador se re-aplica en el próximo tick.
  lastMarkerKey = null;
  clear(n.stage);
  // Marca el layout según la cantidad de columnas (fase 178): con 4 (deuteros
  // regular, I+II × par de niveles) el CSS pasa de fila flex a grilla 2×2. El
  // mismo marcador va en el root para poder achicar la cabecera (título /
  // cronómetro / formato) solo en el 2×2, que está fuera de `.stage`.
  n.stage.setAttribute('data-cols', String(c.columns.length));
  n.stage.closest('#tvScreenRoot')?.setAttribute('data-cols', String(c.columns.length));

  for (let ci = 0; ci < c.columns.length; ci++) {
    const col = c.columns[ci];

    const colEl = document.createElement('section');
    colEl.className = 'col panel lista-col';

    const cab = document.createElement('div');
    cab.className = 'cabCol';
    // Header "NIVEL X | RUTA %": sin separador, con el nivel a la izquierda y la
    // ruta empujada al final de la row (dos zonas, layout por CSS en .cabCol).
    const sepIdx = col.header.indexOf(' | ');
    if (sepIdx >= 0) {
      const nivelEl = document.createElement('span');
      nivelEl.className = 'cabCol__nivel';
      paintGlyphText(nivelEl, col.header.slice(0, sepIdx));
      const rutaEl = document.createElement('span');
      rutaEl.className = 'cabCol__ruta';
      paintGlyphText(rutaEl, col.header.slice(sepIdx + 3));
      cab.appendChild(nivelEl);
      cab.appendChild(rutaEl);
    } else {
      paintGlyphText(cab, col.header);
    }
    colEl.appendChild(cab);

    // Separador dórico: una columna griega tumbada (capitel · fuste · capitel)
    // entre el header nivel/ruta y la lista, en vez de una línea. Las tres piezas
    // van en un wrapper `__piezas` (ahí vive el filter del glow) y la banda de
    // brillo `__brillo` es un overlay HERMANO: si la banda animada quedara adentro
    // del subtree filtrado, los drop-shadow se recalcularían en cada frame del
    // barrido y en el TV la animación se arrastra. Estilos en TvScreenPage.vue.
    const dorica = document.createElement('div');
    dorica.className = 'columnaDorica';
    const piezas = document.createElement('div');
    piezas.className = 'columnaDorica__piezas';
    const capIzq = document.createElement('div');
    capIzq.className = 'columnaDorica__cap columnaDorica__cap--izq';
    const fuste = document.createElement('div');
    fuste.className = 'columnaDorica__fuste';
    const capDer = document.createElement('div');
    capDer.className = 'columnaDorica__cap columnaDorica__cap--der';
    piezas.append(capIzq, fuste, capDer);
    const brillo = document.createElement('div');
    brillo.className = 'columnaDorica__brillo';
    brillo.setAttribute('aria-hidden', 'true');
    dorica.append(piezas, brillo);
    colEl.appendChild(dorica);

    const caja = document.createElement('div');
    // Listas largas (calentamiento): entran todas achicando la tipografia.
    caja.className = col.exercises.length > COMPACT_OVER ? 'caja compacta' : 'caja';
    for (let i = 0; i < col.exercises.length; i++) {
      caja.appendChild(buildItem(col.exercises[i]));
    }
    colEl.appendChild(caja);

    n.stage.appendChild(colEl);
  }

  // Con todas las listas ya en el DOM, ajustar el tamaño común de los nombres
  // para que la más cargada entre sin recortar (2×2 de deuteros).
  fitDeuterosFont(n);
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
 * Cabecera de un lado del 2×2 de deuteros: la etiqueta del deutero ("DEUTEROS
 * I"/"II") arriba y el formato del bloque debajo. Reemplaza al título/formato
 * globales cuando el bloque activo es deuteros (uno a cada lado del timer).
 * La etiqueta llega en `payload.deuteros[n].label` — el header de cada celda
 * NO la repite (sólo NIVEL | RUTA %).
 */
function paintDeuHeader(host: HTMLElement, label: string, formato: string): void {
  clear(host);
  const lab = document.createElement('span');
  lab.className = 'cabDeuLabel';
  lab.textContent = label;
  host.appendChild(lab);
  if (formato) {
    const fmt = document.createElement('span');
    fmt.className = 'cabDeuFormato';
    fmt.textContent = formato;
    host.appendChild(fmt);
  }
}

/**
 * Pie del 2×2: DOS movilidades (una por deutero), izquierda = DEUTEROS I,
 * derecha = DEUTEROS II — alineadas con las columnas de arriba.
 */
function paintDeuMovilidad(
  host: HTMLElement,
  movI: string | null,
  movII: string | null,
): void {
  clear(host);
  const iz = document.createElement('div');
  iz.className = 'movBarCol';
  paintMovilidad(iz, movI);
  const de = document.createElement('div');
  de.className = 'movBarCol';
  paintMovilidad(de, movII);
  host.append(iz, de);
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
  const fechaCorta = fechaTopbar(nowCorrected(), payload.branch.utcOffsetMinutes);
  setText(n.fechaL1, fechaCorta.l1);
  setText(n.fechaL2, fechaCorta.l2);
  setText(n.cierreFechaL1, fechaCorta.l1);
  setText(n.cierreFechaL2, fechaCorta.l2);
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
  const nombre = iSep >= 0 ? c.title.slice(0, iSep) : c.title;
  const formato = iSep >= 0 ? c.title.slice(iSep + sepTitulo.length) : '';

  if (c.deuteros && c.deuteros.length > 0 && c.columns.length === 4) {
    // 2×2 de deuteros: la cabecera se parte en DEUTEROS I (izq, sobre sus dos
    // celdas) y DEUTEROS II (der), cada uno con el formato debajo; el pie lleva
    // las dos movilidades (una por deutero). El título/formato globales no se
    // usan acá.
    const gI = c.deuteros[0];
    const gII = c.deuteros[1] ?? c.deuteros[0];
    n.titulo.className = 'cabTitulo cabDeu';
    n.formato.className = 'cabFormato cabDeu';
    paintDeuHeader(n.titulo, gI.label, formato);
    paintDeuHeader(n.formato, gII.label, formato);
    // Invalidar el guard de paintFormato: al volver a un bloque normal debe
    // re-pintar n.formato aunque el string de formato coincida.
    lastFormatoRaw = null;
    n.movilidad.className = 'movBar movBar--deuteros';
    paintDeuMovilidad(n.movilidad, gI.mobilityLine, gII.mobilityLine);
  } else {
    n.titulo.className = 'cabTitulo';
    n.formato.className = 'cabFormato';
    setText(n.titulo, nombre);
    paintFormato(n.formato, formato);
    n.movilidad.className = 'movBar';
    paintMovilidad(n.movilidad, c.mobilityLine);
  }
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

/** Segundos que faltan para el fin de la fase actual (redondeo hacia arriba, como los dígitos). */
function remainingSeconds(frame: TimerFrame): number {
  const ms = frame.displayMs > 0 ? frame.displayMs : 0;
  return Math.ceil(ms / 1000);
}

/**
 * Clase ' porterminar' cuando quedan pocos segundos de la fase (dígitos en oro
 * titilante): trabajo ≤5", descanso ≤3". Solo aplica a bloques de intervalos
 * (`work_rest`) que cuentan hacia atrás — ROM (`workMs === 0`) cuenta HACIA
 * ADELANTE, así que su fase de trabajo no tiene "últimos segundos".
 */
function endingClass(frame: TimerFrame, threshold: number): string {
  const s = remainingSeconds(frame);
  return s >= 1 && s <= threshold ? ' porterminar' : '';
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
      // Últimos 3" del descanso: oro titilante para anticipar la vuelta al trabajo.
      clase: 'corriendo descanso' + endingClass(frame, 3),
      digitos: formatDigits(frame.displayMs, shortInterval),
      sub: sub,
      hint: '',
      progreso: frame.progress * 100,
    };
  }

  // Últimos 5" del trabajo en oro titilante — solo en intervalos con cuenta
  // regresiva (no ROM, que cuenta hacia adelante).
  const isRom = t.spec.kind === 'work_rest' && t.spec.workMs === 0;
  const trabajoPorTerminar = t.spec.kind === 'work_rest' && !isRom ? endingClass(frame, 5) : '';
  return {
    clase: 'corriendo trabajo' + trabajoPorTerminar,
    digitos: formatDigits(frame.displayMs, shortInterval),
    sub: sub,
    hint: libre ? 'Formato sin tiempos — cronómetro libre' : '',
    progreso: frame.progress * 100,
  };
}

/**
 * Marca (▸ oro) el ejercicio que toca en la ronda actual de un formato con
 * intervalos: ejercicio = (ronda-1) % nº de la columna (así una tabata de 8 con
 * 4 ejercicios repite el 2º en la ronda 6). Los formatos sin rondas
 * (AMRAP/countdown/libre) no tienen ejercicio "actual" → sin marcador. Guard por
 * ronda para no tocar el DOM en cada tick.
 */
function updateMarkers(n: Nodes, c: TvClassPayload, frame: TimerFrame): void {
  const kind = c.timer.spec.kind;
  const active =
    (kind === 'interval' || kind === 'work_rest') &&
    !frame.finished &&
    (c.timer.status === 'running' || c.timer.status === 'paused');
  const key = active ? kind + '|' + frame.round : 'off';
  if (key === lastMarkerKey) {
    return;
  }
  lastMarkerKey = key;

  const cols = n.stage.getElementsByClassName('lista-col');
  for (let ci = 0; ci < cols.length; ci++) {
    const items = cols[ci].getElementsByClassName('item');
    const idx = active && items.length > 0 ? (frame.round - 1) % items.length : -1;
    for (let i = 0; i < items.length; i++) {
      if (i === idx) {
        items[i].classList.add('actual');
      } else {
        items[i].classList.remove('actual');
      }
    }
  }
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

  // ARRANQUE (D-16 sigue: sin cuenta previa): cuando el profe da INICIAR —una
  // transición a `running` con un `startedAt` NUEVO, no un resume— se dispara un
  // flourish de ~0.85 s en los dígitos (oro + vibración + fade-up). El primer
  // tick observado (status previo desconocido) nunca lo dispara: un TV que se
  // reconecta en medio de la clase no tiene que pegar el saltito.
  const t = c.timer;
  const arranco =
    lastTimerStatus !== null &&
    lastTimerStatus !== 'running' &&
    t.status === 'running' &&
    t.startedAt !== null &&
    t.startedAt !== lastStartedAt;
  if (arranco) {
    arranqueUntil = nowCorrected() + ARRANQUE_MS;
    // El número real queda FIJO en su lugar; una copia (este fantasma) sube y se
    // desvanece. Se llena con el número del arranque; la animación la dispara el
    // CSS via la clase `.arranque` del panel (misma ventana que el número real).
    n.digitosGhost.textContent = paint.digitos;
  }
  lastTimerStatus = t.status;
  lastStartedAt = t.startedAt;

  let clase = 'cronometro' + (paint.clase ? ' ' + paint.clase : '');
  if (nowCorrected() < arranqueUntil) {
    clase += ' arranque';
  }
  setClass(n.timerPanel, clase);
  setText(n.digitos, paint.digitos);
  updateMarkers(n, c, frame);
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
