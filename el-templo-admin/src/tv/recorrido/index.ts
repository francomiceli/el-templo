/**
 * "El recorrido de hoy": la pantalla de inicio (FLEXIBILIDAD - INICIO, `screen === 'idle'`
 * con `recorrido` en el poll) cuando hay plani aprobada (2026-10-13: antes era una intro
 * que el profe disparaba durante PYROS). La TV presenta los bloques de la clase sobre
 * dos cuerpos de mármol (H/M) con las zonas de cada bloque en su color.
 *
 * Diseño: sketch 004, variante D (escultura + puntos con rótulo + fundido frente/espalda).
 * Coreografía "bloque a bloque" (UAT 2026-10-05): cada bloque dura 8 s — enciende sus
 * zonas con foco, 4 s de frente y 4 s de espalda (fundido). Al terminar quedan todas las
 * zonas coloreadas alternando frente y espalda unos segundos y la vuelta arranca de nuevo,
 * en loop hasta que el profe inicia la clase.
 *
 * Mismas reglas que `render.ts`: el DOM se arma UNA vez por contenido (clave = bloques) y
 * después solo se alternan clases; los textos del server entran por `textContent`; lo
 * único que se anima es `opacity`/`transform` de capas enteras. Los timers son propios y
 * se cortan en `ocultarRecorrido` (cambio de pantalla) y `resetRecorrido` (desmontaje).
 */

import { createTvLogger } from '../logger';
import type { TvRecorridoBloque, TvRecorridoPayload } from '../poll';
import { cargarAnatomia } from './anatomia';
import type { Anatomia } from './anatomia';
import {
  colorDeBloque,
  contornoDe,
  Defs,
  FIGURAS,
  mezclar,
  svgBase,
  svgBloque,
  svgCallout,
  ZONA_ES,
} from './figuras';
import type { Caja, FiguraDef, Vista } from './figuras';

const log = createTvLogger('recorrido');

/** Alto del cuerpo masculino en rem (1rem = 1% del ancho del TV; el marco mide 56.25rem). */
const ALTO_FIGURA_REM = 50;

// Tiempos de la coreografía (ms), calibrados en el sketch 004.
const T_PAUSA_INICIAL = 250;
const T_ESCALON_FIGURAS = 220;
const T_ENTRADA_FIGURAS = 1300;
const T_FUNDIDO = 1500;
const T_ESCALON_FUNDIDO = 120;
/** Cada bloque dura 8 s: la mitad de frente y la mitad de espalda (fundido incluido).
 *  El final alterna las vistas con el mismo ritmo. */
const T_MEDIO_BLOQUE = 4000;
/** Vueltas frente/espalda del final (todo encendido) antes de reiniciar el loop. */
const VUELTAS_FINAL = 2;

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Montaje {
  host: HTMLElement;
  bloques: TvRecorridoBloque[];
  figs: HTMLElement[];
}

let montaje: Montaje | null = null;
/** Clave del contenido montado: si el poll trae lo mismo, no se toca nada. */
let claveActual = '';
/** Generación de la corrida: cada `ocultar`/`mostrar` la invalida (cancela awaits). */
let corrida = 0;
let timeouts: number[] = [];
let vista: Vista = 'frente';

function espera(ms: number): Promise<void> {
  return new Promise((resolve) => {
    timeouts.push(window.setTimeout(resolve, ms));
  });
}

function cortarTimers(): void {
  for (const t of timeouts) window.clearTimeout(t);
  timeouts = [];
}

function vaciar(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function div(clase: string, texto?: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = clase;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

/** `<svg>` de una capa a partir de markup PROPIO (sin textos del server). */
function capaSvg(clase: string, markup: string, bloque?: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', clase);
  if (bloque !== undefined) svg.setAttribute('data-b', String(bloque));
  svg.innerHTML = markup;
  return svg;
}

// =============================================================================
// Construcción
// =============================================================================

/** Una zona trabajada por varios bloques muestra el color del PRIMERO (el que la
 *  abre en la clase): las capas se apilan al revés del orden de los bloques. El
 *  bloque en foco sube por encima de todas (`Z_FOCO`). */
const Z_FOCO = 60;
function zBloque(i: number, total: number): number {
  return total - i + 1;
}

function construirTexto(bloques: TvRecorridoBloque[]): HTMLElement {
  const col = div('recTexto');
  const kicker = div('recKicker');
  kicker.textContent = 'HOY RECORREMOS';
  const titulo = div('recTitulo');
  titulo.append(
    document.createTextNode('El cuerpo'),
    document.createElement('br'),
    document.createTextNode('en clase')
  );
  const leyenda = div('recLeyenda');
  bloques.forEach((b, i) => {
    const color = colorDeBloque(i);
    const item = div('recItem');
    item.setAttribute('data-b', String(i));
    const barra = div('recBarra');
    barra.style.background = color;
    const cuerpo = div('recItemCuerpo');
    const rol = div('recRol', b.title);
    rol.style.color = mezclar(color, '#000000', 0.18);
    cuerpo.appendChild(rol);
    if (b.subtitle) cuerpo.appendChild(div('recSub', b.subtitle));
    if (b.zonas.length > 0) {
      const zonas = div('recZonas', b.zonas.map((z) => ZONA_ES[z]).join(' · '));
      zonas.style.color = mezclar(color, '#000000', 0.12);
      cuerpo.appendChild(zonas);
    }
    item.append(barra, cuerpo);
    leyenda.appendChild(item);
  });
  col.append(kicker, titulo, leyenda);
  return col;
}

function construirPie(bloques: TvRecorridoBloque[]): HTMLElement {
  const pie = div('recPie', 'Entrada en calor completa · arranca ');
  const primero = bloques[0];
  if (primero) {
    const b = document.createElement('b');
    b.textContent = primero.title;
    pie.appendChild(b);
  }
  return pie;
}

function construirFigura(
  defs: Defs,
  an: Anatomia,
  fig: FiguraDef,
  bloques: TvRecorridoBloque[]
): HTMLElement {
  const el = div('recFig');
  const marco = div('recMarcoFig');
  for (const v of ['frente', 'espalda'] as Vista[]) {
    const key = v === 'frente' ? fig.frente : fig.espalda;
    const vistaEl = div('recVista recVista--' + v);
    vistaEl.setAttribute('data-key', key);
    vistaEl.appendChild(capaSvg('recCapa recBase', svgBase(defs, an, key, contornoDe(an, fig, v))));
    bloques.forEach((b, i) => {
      const capa = capaSvg('recCapa recOv', svgBloque(defs, an, key, b.zonas, colorDeBloque(i)), i);
      capa.style.zIndex = String(zBloque(i, bloques.length));
      vistaEl.appendChild(capa);
    });
    marco.appendChild(vistaEl);
  }
  el.appendChild(marco);
  return el;
}

/**
 * Con el DOM ya visible: viewBox común por género (frente y espalda comparten caja, así el
 * fundido no "salta"; pies apoyados en la base), tamaño en rem y capas de rótulos.
 */
function medirYRotular(m: Montaje, an: Anatomia): void {
  FIGURAS.forEach((fig, fi) => {
    const figEl = m.figs[fi];
    if (!figEl) return;
    const vistas = Array.prototype.slice.call(figEl.querySelectorAll('.recVista')) as HTMLElement[];
    const medidas = vistas.map((vi) => {
      const anat = vi.querySelector('.anat') as SVGGraphicsElement | null;
      const bb = anat ? anat.getBBox() : { x: 0, y: 0, width: 1, height: 1 };
      return { vi: vi, bb: bb };
    });
    const H = Math.max(...medidas.map((o) => o.bb.height)) * 1.015;
    const W = Math.max(...medidas.map((o) => o.bb.width)) * 1.04;
    const alto = ALTO_FIGURA_REM * fig.escala;
    const marco = figEl.querySelector('.recMarcoFig') as HTMLElement | null;
    if (marco) {
      marco.style.height = alto + 'rem';
      marco.style.width = (alto * W) / H + 'rem';
    }
    const u = H / alto; // unidades SVG por rem
    for (const { vi, bb } of medidas) {
      const vb = `${bb.x + bb.width / 2 - W / 2} ${bb.y + bb.height + H * 0.01 - H} ${W} ${H}`;
      const capas = Array.prototype.slice.call(vi.querySelectorAll('svg')) as SVGSVGElement[];
      for (const s of capas) s.setAttribute('viewBox', vb);
      const key = vi.getAttribute('data-key') as keyof Anatomia;
      const grupos =
        key === 'mFront' || key === 'mBack' || key === 'fFront' || key === 'fBack' ? an[key] : [];
      const partes = Array.prototype.slice.call(
        vi.querySelectorAll('.recBase .anat > path')
      ) as SVGGraphicsElement[];
      // La primera es el contorno relleno: no cuenta como "parte" para la columna de rótulos.
      const cajas: Caja[] = partes.slice(1).map((p) => {
        const b = p.getBBox();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      });
      m.bloques.forEach((b, i) => {
        const markup = svgCallout(grupos, b.zonas, colorDeBloque(i), fig.lado, u, cajas);
        const capa = capaSvg('recCapa recCall', markup, i);
        capa.style.zIndex = String(Z_FOCO + 10); // los rótulos siempre arriba
        capa.setAttribute('viewBox', vb);
        vi.appendChild(capa);
      });
    }
  });
}

function construir(host: HTMLElement, an: Anatomia, bloques: TvRecorridoBloque[]): Montaje {
  vaciar(host);
  const defs = new Defs();
  const cuerpos = div('recCuerpos');
  const figs = FIGURAS.map((fig) => construirFigura(defs, an, fig, bloques));
  for (const f of figs) cuerpos.appendChild(f);
  // <defs> compartidos: sin display:none (algunos motores dejan de resolver url(#id)).
  const defsSvg = capaSvg('recDefs', '<defs>' + defs.markup + '</defs>');
  defsSvg.setAttribute('width', '0');
  defsSvg.setAttribute('height', '0');
  defsSvg.setAttribute('aria-hidden', 'true');
  host.append(defsSvg, construirTexto(bloques), cuerpos, construirPie(bloques));
  const m: Montaje = {
    host: host,
    bloques: bloques,
    figs: figs,
  };
  medirYRotular(m, an);
  return m;
}

// =============================================================================
// Estados (solo clases)
// =============================================================================

function todos(m: Montaje, selector: string): Element[] {
  return Array.prototype.slice.call(m.host.querySelectorAll(selector)) as Element[];
}

function encender(m: Montaje, i: number): void {
  for (const el of todos(m, `.recOv[data-b="${i}"], .recItem[data-b="${i}"]`))
    el.classList.add('on');
}

/** Apaga todas las zonas e ítems: arranque de una nueva vuelta del loop. */
function apagarTodo(m: Montaje): void {
  for (const el of todos(m, '.recOv, .recItem')) el.classList.remove('on');
}

/** `i === null` → todos parejos, sin rótulos. */
function foco(m: Montaje, i: number | null): void {
  for (const el of todos(m, '.recOv, .recItem')) {
    const b = Number(el.getAttribute('data-b'));
    el.classList.toggle('dim', i !== null && b !== i);
    el.classList.toggle('focus', i !== null && b === i);
  }
  for (const el of todos(m, '.recOv')) {
    const b = Number(el.getAttribute('data-b'));
    (el as SVGSVGElement).style.zIndex = String(
      i !== null && b === i ? Z_FOCO : zBloque(b, m.bloques.length)
    );
  }
  for (const el of todos(m, '.recCall')) {
    el.classList.toggle('on', i !== null && Number(el.getAttribute('data-b')) === i);
  }
}

async function cambiarVista(m: Montaje, v: Vista): Promise<void> {
  if (vista === v) return;
  vista = v;
  m.figs.forEach((f, k) => {
    timeouts.push(
      window.setTimeout(() => f.classList.toggle('back', v === 'espalda'), k * T_ESCALON_FUNDIDO)
    );
  });
  await espera(T_FUNDIDO + T_ESCALON_FUNDIDO);
}

/**
 * Pasa a la vista `v` (fundido incluido) y la sostiene hasta completar `ms` desde que se
 * pidió: el fundido CUENTA dentro del tiempo de la vista, así cada mitad de bloque dura
 * exactamente lo pactado.
 */
async function sostener(m: Montaje, v: Vista, ms: number): Promise<void> {
  const inicio = Date.now();
  await cambiarVista(m, v);
  const resto = ms - (Date.now() - inicio);
  if (resto > 0) await espera(resto);
}

async function coreografia(m: Montaje, id: number): Promise<void> {
  const viva = (): boolean => id === corrida;
  await espera(T_PAUSA_INICIAL);
  if (!viva()) return;
  m.figs.forEach((f, k) => {
    timeouts.push(window.setTimeout(() => f.classList.add('in'), k * T_ESCALON_FIGURAS));
  });
  await espera(T_ENTRADA_FIGURAS);
  if (!viva()) return;

  // Loop de la pantalla de inicio (2026-10-13): corre mientras no haya clase. Cada
  // vuelta: bloque a bloque (8 s cada uno, sus zonas con foco, 4 s de frente y 4 s
  // de espalda), después el final con todas las zonas coloreadas alternando frente y
  // espalda, y vuelve a empezar desde cero.
  while (viva()) {
    apagarTodo(m);
    for (let i = 0; i < m.bloques.length; i++) {
      encender(m, i);
      foco(m, i);
      await sostener(m, 'frente', T_MEDIO_BLOQUE);
      if (!viva()) return;
      await sostener(m, 'espalda', T_MEDIO_BLOQUE);
      if (!viva()) return;
    }
    foco(m, null);
    for (let k = 0; k < VUELTAS_FINAL * 2; k++) {
      await sostener(m, vista === 'frente' ? 'espalda' : 'frente', T_MEDIO_BLOQUE);
      if (!viva()) return;
    }
  }
}

/** Sin movimiento (`?sobrio=1` / reduced-motion): estado final quieto, todo encendido. */
function estadoQuieto(m: Montaje): void {
  for (const f of m.figs) f.classList.add('in');
  m.bloques.forEach((_b, i) => encender(m, i));
  foco(m, null);
}

// =============================================================================
// API para render.ts
// =============================================================================

/**
 * Muestra (o mantiene) el recorrido. Idempotente: con los mismos bloques no toca nada;
 * con bloques nuevos (el profe editó la plani en vivo) rearma y vuelve a empezar.
 * `host` tiene que estar VISIBLE: las medidas salen de `getBBox()`.
 */
export function mostrarRecorrido(
  host: HTMLElement,
  payload: TvRecorridoPayload,
  sinMovimiento: boolean
): void {
  const clave = JSON.stringify(payload.bloques);
  // Mismo contenido ya montado (o cargándose): nada que hacer.
  if (clave === claveActual) return;
  ocultarRecorrido();
  claveActual = clave;
  const id = ++corrida;
  cargarAnatomia()
    .then((an) => {
      if (id !== corrida) return;
      vista = 'frente';
      montaje = construir(host, an, payload.bloques);
      if (sinMovimiento) estadoQuieto(montaje);
      else void coreografia(montaje, id);
    })
    .catch((err: unknown) => {
      claveActual = '';
      log.error('no se pudo armar el recorrido', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

/** Saca el recorrido: corta timers y libera el DOM (la próxima vez arranca de cero). */
export function ocultarRecorrido(): void {
  if (montaje === null && claveActual === '') return;
  corrida++;
  cortarTimers();
  if (montaje !== null) vaciar(montaje.host);
  montaje = null;
  claveActual = '';
  vista = 'frente';
}

/** Desmontaje de la página (`resetRender`). */
export function resetRecorrido(): void {
  ocultarRecorrido();
}
