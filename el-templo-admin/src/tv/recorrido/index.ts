/**
 * "El recorrido de hoy": la pantalla de inicio (FLEXIBILIDAD - INICIO, `screen === 'idle'`
 * con `recorrido` en el poll) cuando hay plani aprobada (2026-10-13: antes era una intro
 * que el profe disparaba durante PYROS). La TV presenta los bloques de la clase sobre
 * dos cuerpos de mármol (H/M) con las zonas de cada bloque en su color.
 *
 * Diseño: sketch 004, variante D (escultura + puntos con rótulo + fundido frente/espalda).
 * Coreografía "bloque a bloque" (UAT 2026-10-05/13): todos los bloques se ven siempre y
 * el que se explica queda en foco (el resto atenuado). Cada bloque arranca con el cuerpo
 * de frente: 4 s de frente y 4 s de espalda (fundido). Al terminar, todos parejos
 * alternando frente y espalda unos segundos y la vuelta arranca de nuevo, en loop hasta
 * que el profe inicia la clase.
 *
 * Mismas reglas que `render.ts`: el DOM se arma UNA vez por contenido (clave = bloques) y
 * después solo se alternan clases; los textos del server entran por `textContent`; lo
 * único que se anima es `opacity`/`transform` de capas enteras. Los timers son propios y
 * se cortan en `ocultarRecorrido` (cambio de pantalla) y `resetRecorrido` (desmontaje).
 */

import { createTvLogger } from '../logger';
import type { TvRecorridoBloque, TvRecorridoPayload } from '../poll';
import { cargarAnatomia } from './anatomia';
import type { Anatomia, FiguraKey } from './anatomia';
import {
  coloresDeBloques,
  contornoDe,
  Defs,
  FIGURAS,
  mezclar,
  svgBase,
  svgBloque,
  puntosDeZonas,
  ZONA_ES,
} from './figuras';
import type { FiguraDef, PuntoZona, Vista } from './figuras';

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
/** Vueltas frente/espalda del resumen (todo encendido) con el que arranca cada vuelta. */
const VUELTAS_FINAL = 1;

const SVG_NS = 'http://www.w3.org/2000/svg';

interface Montaje {
  host: HTMLElement;
  bloques: TvRecorridoBloque[];
  figs: HTMLElement[];
  /** Por bloque, las vistas en las que tiene zonas para pintar (`vistasDe`). */
  vistas: Vista[][];
  /** Contenedor de los cuerpos (lleva `back` con la vista de espalda). */
  cuerpos: HTMLElement;
  /** "RUTAS DEL DÍA" / "BLOQUES DEL DÍA" debajo del título. */
  subtitulo: HTMLElement;
  /** Leyenda: ventana de alto fijo y la pista que se desplaza adentro. */
  ventana: HTMLElement;
  pista: HTMLElement;
}

/**
 * Vistas en las que un bloque pinta algo (UAT 2026-10-13): un bloque de solo zonas de
 * atrás (Nordic Curl: lumbares, glúteos, isquios) de frente no mostraba NADA. Con zonas
 * de los dos lados: frente y después espalda; de un solo lado: solo ese; sin zonas: frente.
 */
function vistasDe(an: Anatomia, zonas: readonly string[]): Vista[] {
  const pinta = (keys: readonly FiguraKey[]): boolean =>
    keys.some((k) => an[k].some((g) => zonas.indexOf(g.slug) >= 0));
  const frente = pinta(['mFront', 'fFront']);
  const espalda = pinta(['mBack', 'fBack']);
  if (frente && espalda) return ['frente', 'espalda'];
  if (espalda) return ['espalda'];
  return ['frente'];
}

/** Vistas del final (todos parejos): las que pinta algún bloque, en orden frente→espalda. */
function vistasDelFinal(m: Montaje): Vista[] {
  const todas = m.vistas.flat();
  return (['frente', 'espalda'] as Vista[]).filter((v) => todas.indexOf(v) >= 0);
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

/** "Quad Curl · 60 %": la ruta del bloque con su intensidad al lado (UAT 2026-10-13).
 *  La intensidad viaja como rango (cada nivel planifica la suya); si coincide, un valor. */
function rutaDeBloque(b: TvRecorridoBloque): string {
  const partes: string[] = [];
  if (b.subtitle) partes.push(b.subtitle);
  if (b.intensity) {
    const { min, max } = b.intensity;
    partes.push(min === max ? `${min} %` : `${min}–${max} %`);
  }
  return partes.join(' · ');
}

/**
 * Columna del templo al costado de cada fila (UAT 2026-10-13, en vez de la barra de
 * color): las MISMAS piezas que la dórica tumbada de las listas de ejercicios
 * (`columnaDorica__*`, render.ts) en una tira que se rota 90° para quedar parada; su
 * banda de brillo barre así de arriba hacia abajo, una vez, cuando el bloque entra en
 * foco (CSS). El largo de la tira = alto de la fila (`ajustarColumnas`).
 */
function columnaVertical(color: string): HTMLElement {
  const col = div('recColumna');
  // Pintada con el color del bloque: las piezas usan la imagen como máscara (CSS).
  col.style.setProperty('--recColumnaColor', color);
  const tira = div('recColumna__tira');
  const piezas = div('columnaDorica__piezas');
  piezas.append(
    div('columnaDorica__cap columnaDorica__cap--izq'),
    div('columnaDorica__fuste'),
    div('columnaDorica__cap columnaDorica__cap--der')
  );
  tira.append(piezas, div('columnaDorica__brillo'));
  col.appendChild(tira);
  return col;
}

/** Largo de cada tira rotada = alto de su fila (CSS no puede atar el ancho de un
 *  elemento rotado al alto del padre). Se repite cuando terminan de cargar las fuentes. */
function ajustarColumnas(host: HTMLElement): void {
  for (const col of Array.prototype.slice.call(
    host.querySelectorAll('.recColumna')
  ) as HTMLElement[]) {
    const tira = col.firstElementChild as HTMLElement | null;
    if (tira) tira.style.width = col.clientHeight + 'px';
  }
}

/** Subtítulo según el estado (UAT 2026-10-13): resumen = rutas, foco = bloques. */
const SUBTITULO_RESUMEN = 'RUTAS DEL DÍA';
const SUBTITULO_BLOQUES = 'BLOQUES DEL DÍA';

function construirTexto(bloques: TvRecorridoBloque[]): {
  col: HTMLElement;
  subtitulo: HTMLElement;
  ventana: HTMLElement;
  pista: HTMLElement;
} {
  const col = div('recTexto');
  const titulo = div('recTitulo', 'La sesión de hoy');
  const subtitulo = div('recSubtitulo', SUBTITULO_RESUMEN);
  // Ventana de alto fijo con DOS paneles lado a lado en un carril horizontal (UAT
  // 2026-10-13): "RUTAS DEL DÍA" (resumen) y "BLOQUES DEL DÍA". El cambio entre ellos
  // desliza el carril (`.resumen` en la ventana). En el de bloques, la pista se
  // desplaza hasta el bloque en foco y un degradé marca que hay más (`desplazarLeyenda`).
  const ventana = div('recLeyenda');
  const carril = div('recCarril');
  const panelRutas = div('recPanel recPanel--rutas');
  const panelBloques = div('recPanel recPanel--bloques');
  const pista = div('recPista');
  panelBloques.appendChild(pista);
  carril.append(panelRutas, panelBloques);
  ventana.appendChild(carril);
  const colores = coloresDeBloques(bloques);
  const nombreRuta = (x: TvRecorridoBloque): string => x.subtitle ?? x.title;
  bloques.forEach((b, i) => {
    const color = colores[i] as string;
    const tinta = mezclar(color, '#000000', 0.18);

    // Panel de rutas: solo el nombre de la ruta (sin ruta, el del bloque). DEUTEROS I
    // y II van en UNA fila: "ruta I / ruta II".
    const previo = bloques[i - 1];
    const siguiente = bloques[i + 1];
    if (!(b.role === 'DEUTEROS_2' && previo?.role === 'DEUTEROS_1')) {
      const unido = b.role === 'DEUTEROS_1' && siguiente?.role === 'DEUTEROS_2' ? siguiente : null;
      const fila = div('recItem recItem--ruta');
      fila.setAttribute('data-b', String(i));
      const rutaSola = div(
        'recRutaSola',
        unido ? `${nombreRuta(b)} / ${nombreRuta(unido)}` : nombreRuta(b)
      );
      rutaSola.style.color = tinta;
      // En las rutas del día queda la barra de color (UAT 2026-10-13).
      const barraRuta = div('recBarra');
      barraRuta.style.background = color;
      fila.append(barraRuta, rutaSola);
      panelRutas.appendChild(fila);
    }

    // Panel de bloques: nombre, formato y "ruta · %". Las zonas NO van en la leyenda:
    // se rotulan entre los cuerpos ("que no estén dos veces").
    const item = div('recItem');
    item.setAttribute('data-b', String(i));
    const cuerpo = div('recItemCuerpo');
    const rol = div('recRol', b.title);
    rol.style.color = tinta;
    cuerpo.appendChild(rol);
    if (b.format) {
      const metaEl = div('recMeta', b.format);
      metaEl.style.color = mezclar(color, '#000000', 0.12);
      cuerpo.appendChild(metaEl);
    }
    const ruta = rutaDeBloque(b);
    if (ruta) cuerpo.appendChild(div('recSub', ruta));
    item.append(columnaVertical(color), cuerpo);
    pista.appendChild(item);
  });
  // Lista circular (UAT 2026-10-13): arriba del primer bloque asoma el ÚLTIMO y abajo
  // del último el PRIMERO. Son copias (`recItem--eco`, mismo `data-b`: se atenúan con
  // el foco); el centrado apunta siempre al bloque real (`desplazarLeyenda`).
  const reales = Array.prototype.slice.call(pista.children) as HTMLElement[];
  const primero = reales[0];
  const ultimo = reales[reales.length - 1];
  if (primero && ultimo && reales.length > 1) {
    const ecoUltimo = ultimo.cloneNode(true) as HTMLElement;
    const ecoPrimero = primero.cloneNode(true) as HTMLElement;
    ecoUltimo.classList.add('recItem--eco');
    ecoPrimero.classList.add('recItem--eco');
    pista.insertBefore(ecoUltimo, primero);
    pista.appendChild(ecoPrimero);
  }
  col.append(titulo, subtitulo, ventana);
  return { col, subtitulo, ventana, pista };
}

/**
 * Desplaza la lista para que el bloque `i` quede a la vista y marca con degradé si
 * queda contenido fuera arriba/abajo. `i === null` vuelve al principio. Solo anima
 * `transform` (misma regla que el resto de la TV).
 */
function desplazarLeyenda(m: Montaje, i: number | null): void {
  const alto = m.ventana.clientHeight;
  let offset = 0;
  const item =
    i === null
      ? null
      : (m.pista.querySelector(`.recItem:not(.recItem--eco)[data-b="${i}"]`) as HTMLElement | null);
  const primerReal = m.pista.querySelector('.recItem:not(.recItem--eco)') as HTMLElement | null;
  // Sin foco (resumen): la lista arranca en el primer bloque real, no en la copia.
  if (!item && primerReal) offset = primerReal.offsetTop;
  if (item) {
    // El bloque en foco queda en el MEDIO de la ventana, también el primero y el último
    // (UAT 2026-10-13): sin tope en los extremos, la pista puede bajar o subir de más.
    offset = item.offsetTop + item.offsetHeight / 2 - alto / 2;
  }
  m.pista.style.transform = `translateY(${-offset}px)`;
  // En el resumen (rutas del día) no hay degradé: la lista de rutas entra entera.
  m.ventana.classList.toggle('masArriba', item !== null && offset > 1);
  m.ventana.classList.toggle('masAbajo', item !== null && m.pista.scrollHeight - offset - alto > 1);
}

function construirFigura(
  defs: Defs,
  an: Anatomia,
  fig: FiguraDef,
  bloques: TvRecorridoBloque[]
): HTMLElement {
  const el = div('recFig');
  const marco = div('recMarcoFig');
  const colores = coloresDeBloques(bloques);
  for (const v of ['frente', 'espalda'] as Vista[]) {
    const key = v === 'frente' ? fig.frente : fig.espalda;
    const vistaEl = div('recVista recVista--' + v);
    vistaEl.setAttribute('data-key', key);
    vistaEl.appendChild(capaSvg('recCapa recBase', svgBase(defs, an, key, contornoDe(an, fig, v))));
    bloques.forEach((b, i) => {
      const capa = capaSvg(
        'recCapa recOv',
        svgBloque(defs, an, key, b.zonas, colores[i] as string),
        i
      );
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
  const colores = coloresDeBloques(m.bloques);
  const puntos: PuntosPorVista = { frente: [], espalda: [] };
  const pendientes: Array<() => void> = [];
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
    for (const { vi, bb } of medidas) {
      const vb = `${bb.x + bb.width / 2 - W / 2} ${bb.y + bb.height + H * 0.01 - H} ${W} ${H}`;
      const capas = Array.prototype.slice.call(vi.querySelectorAll('svg')) as SVGSVGElement[];
      for (const s of capas) s.setAttribute('viewBox', vb);
      const key = vi.getAttribute('data-key') as keyof Anatomia;
      const grupos =
        key === 'mFront' || key === 'mBack' || key === 'fFront' || key === 'fBack' ? an[key] : [];
      const v: Vista = vi.classList.contains('recVista--espalda') ? 'espalda' : 'frente';
      // SVG de la vista → px dentro de `.recCuerpos` (offsets de layout: no los afecta
      // el `translateY` de entrada de la figura). viewBox y marco tienen el mismo aspecto.
      const vbX = bb.x + bb.width / 2 - W / 2;
      const vbY = bb.y + bb.height + H * 0.01 - H;
      // Se mide DESPUÉS de dimensionar las dos figuras: están centradas, así que la
      // posición de una depende del ancho de la otra.
      pendientes.push(() => {
        const ox = figEl.offsetLeft + (marco?.offsetLeft ?? 0);
        const oy = figEl.offsetTop + (marco?.offsetTop ?? 0);
        const k = (marco?.offsetWidth ?? 0) / W;
        m.bloques.forEach((b, i) => {
          const pts = puntosDeZonas(grupos, b.zonas, fig.lado).map((p) => ({
            ...p,
            x: ox + (p.x - vbX) * k,
            y: oy + (p.y - vbY) * k,
          }));
          const porBloque = puntos[v][i] ?? (puntos[v][i] = { m: [], f: [] });
          porBloque[fig.id] = pts;
        });
      });
    }
  });
  for (const medir of pendientes) medir();
  construirLeyendaZonas(m, puntos, colores);
}

/** Puntos de cada bloque por vista y por figura, en px de `.recCuerpos`. */
type PuntosPorVista = Record<Vista, Array<{ m: PuntoZona[]; f: PuntoZona[] }>>;

const SVG_NS_LEYENDA = 'http://www.w3.org/2000/svg';
/** Cantidad de zonas del cuerpo: un bloque que las marca todas no se rotula. */
const TOTAL_ZONAS = Object.keys(ZONA_ES).length;
/** Tamaño de los rótulos de zona (rem) y separación mínima entre filas. */
const ZONA_FONT_REM = 1.7;
const ZONA_FILA_REM = 3.6;

/**
 * Leyenda de zonas ÚNICA entre los dos cuerpos (UAT 2026-10-13: antes cada cuerpo tenía
 * la suya hacia afuera). Por vista y por bloque, una capa con un rótulo por zona,
 * centrado en el hueco entre las figuras, con una línea al punto de la zona en cada
 * cuerpo. Las capas viven en dos envoltorios (frente/espalda) que se funden con el giro
 * (`.recCuerpos.back`) y se encienden con el foco (`.recCall.on`).
 */
function construirLeyendaZonas(m: Montaje, puntos: PuntosPorVista, colores: string[]): void {
  const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const fontPx = ZONA_FONT_REM * remPx;
  const filaPx = ZONA_FILA_REM * remPx;
  const ancho = m.cuerpos.clientWidth;
  const alto = m.cuerpos.clientHeight;
  // Figuras en el orden de `FIGURAS` (izquierda → derecha): el hueco central va entre
  // el borde derecho de la primera y el izquierdo de la segunda.
  const [figIzq, figDer] = m.figs;
  const [defIzq, defDer] = FIGURAS;
  if (!figIzq || !figDer || !defIzq || !defDer) return;
  const xCentro = (figIzq.offsetLeft + figIzq.offsetWidth + figDer.offsetLeft) / 2;
  for (const v of ['frente', 'espalda'] as Vista[]) {
    const envoltorio = div('recCallVista recCallVista--' + v);
    m.cuerpos.appendChild(envoltorio);
    m.bloques.forEach((b, i) => {
      const p = puntos[v][i];
      if (!p) return;
      // Cuerpo entero (ruta Full Body): marcado, pero sin rotular las 15 zonas
      // (UAT 2026-10-13).
      if (b.zonas.length >= TOTAL_ZONAS) return;
      const svg = document.createElementNS(SVG_NS_LEYENDA, 'svg');
      svg.setAttribute('class', 'recCall');
      svg.setAttribute('data-b', String(i));
      svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);
      envoltorio.appendChild(svg);
      const tinta = mezclar(colores[i] as string, '#000000', 0.3);
      // Una fila por zona, en el orden de la zona en el cuerpo (de arriba a abajo).
      const filas = b.zonas
        .map((zona) => {
          const pIzq = p[defIzq.id].find((q) => q.zona === zona);
          const pDer = p[defDer.id].find((q) => q.zona === zona);
          const ys = [pIzq?.y, pDer?.y].filter((y): y is number => y !== undefined);
          return {
            zona,
            pIzq,
            pDer,
            y: ys.length > 0 ? ys.reduce((a, c) => a + c, 0) / ys.length : -1,
          };
        })
        .filter((f) => f.y >= 0)
        .sort((a, c) => a.y - c.y);
      let ultimo = -1e9;
      for (const fila of filas) {
        const ly = Math.max(fila.y, ultimo + filaPx);
        ultimo = ly;
        const txt = document.createElementNS(SVG_NS_LEYENDA, 'text');
        txt.setAttribute('class', 'recCallTxt');
        txt.setAttribute('x', String(xCentro));
        txt.setAttribute('y', String(ly + fontPx * 0.35));
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-size', String(fontPx));
        txt.setAttribute('letter-spacing', String(fontPx * 0.1));
        txt.setAttribute('fill', tinta);
        txt.textContent = ZONA_ES[fila.zona];
        svg.appendChild(txt);
        // El texto ya está en el DOM: su ancho real marca dónde terminan las líneas.
        const medio = txt.getComputedTextLength() / 2 + fontPx * 0.5;
        const linea = (pt: PuntoZona | undefined, hacia: number): void => {
          if (!pt) return;
          const path = document.createElementNS(SVG_NS_LEYENDA, 'path');
          const codo = hacia + (pt.x < hacia ? -remPx : remPx);
          path.setAttribute('d', `M${pt.x} ${pt.y}L${codo} ${ly}H${hacia}`);
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', tinta);
          path.setAttribute('stroke-width', String(remPx * 0.09));
          const punto = document.createElementNS(SVG_NS_LEYENDA, 'circle');
          punto.setAttribute('cx', String(pt.x));
          punto.setAttribute('cy', String(pt.y));
          punto.setAttribute('r', String(remPx * 0.32));
          punto.setAttribute('fill', '#fffaf2');
          punto.setAttribute('stroke', tinta);
          punto.setAttribute('stroke-width', String(remPx * 0.1));
          svg.insertBefore(path, txt);
          svg.insertBefore(punto, txt);
        };
        linea(fila.pIzq, xCentro - medio);
        linea(fila.pDer, xCentro + medio);
      }
    });
  }
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
  const texto = construirTexto(bloques);
  host.append(defsSvg, texto.col, cuerpos);
  const m: Montaje = {
    host: host,
    bloques: bloques,
    figs: figs,
    vistas: bloques.map((b) => vistasDe(an, b.zonas)),
    cuerpos: cuerpos,
    subtitulo: texto.subtitulo,
    ventana: texto.ventana,
    pista: texto.pista,
  };
  m.ventana.classList.add('resumen');
  ajustarColumnas(host);
  // Las fuentes del TV pueden terminar de cargar después: cambia el alto de las filas.
  if (document.fonts) void document.fonts.ready.then(() => ajustarColumnas(host));
  desplazarLeyenda(m, null);
  medirYRotular(m, an);
  return m;
}

// =============================================================================
// Estados (solo clases)
// =============================================================================

function todos(m: Montaje, selector: string): Element[] {
  return Array.prototype.slice.call(m.host.querySelectorAll(selector)) as Element[];
}

/** Enciende todos los bloques (zonas e ítems de la leyenda): se ven SIEMPRE, el foco
 *  solo atenúa a los que no se están explicando (UAT 2026-10-13). */
function encenderTodo(m: Montaje): void {
  for (const el of todos(m, '.recOv, .recItem')) el.classList.add('on');
}

/** `i === null` → todos parejos, sin rótulos. */
function foco(m: Montaje, i: number | null): void {
  for (const el of todos(m, '.recOv, .recItem')) {
    const b = Number(el.getAttribute('data-b'));
    // Las copias de la lista circular nunca toman el foco: quedan atenuadas.
    const eco = el.classList.contains('recItem--eco');
    el.classList.toggle('dim', i !== null && (b !== i || eco));
    el.classList.toggle('focus', i !== null && b === i && !eco);
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
  // Sin bloque en foco = resumen: la lista muestra solo las rutas.
  m.ventana.classList.toggle('resumen', i === null);
  m.subtitulo.textContent = i === null ? SUBTITULO_RESUMEN : SUBTITULO_BLOQUES;
  desplazarLeyenda(m, i);
}

async function cambiarVista(m: Montaje, v: Vista): Promise<void> {
  if (vista === v) return;
  vista = v;
  m.cuerpos.classList.toggle('back', v === 'espalda');
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

  encenderTodo(m);

  // Loop de la pantalla de inicio (2026-10-13): corre mientras no haya clase. Cada
  // vuelta: el resumen con todos parejos, después bloque a bloque (8 s cada uno), y
  // vuelve a empezar. Cada bloque se muestra SOLO en las vistas donde pinta algo
  // (`vistasDe`): con las dos, 4 s de frente y 4 s de espalda; con una, 8 s en esa. El
  // giro a su primera vista termina ANTES de poner el foco, así el bloque nunca se
  // presenta con el cuerpo del lado equivocado (UAT 2026-10-13).
  while (viva()) {
    // Cada vuelta ARRANCA con el resumen (todo marcado, solo las rutas en la lista)
    // el tiempo suficiente para leerlo (UAT 2026-10-13: duraba muy poco).
    foco(m, null);
    const finales = vistasDelFinal(m);
    for (let k = 0; k < VUELTAS_FINAL * 2; k++) {
      const v =
        finales.length > 1 ? (vista === 'frente' ? 'espalda' : 'frente') : (finales[0] ?? vista);
      await sostener(m, v, T_MEDIO_BLOQUE);
      if (!viva()) return;
    }
    for (let i = 0; i < m.bloques.length; i++) {
      const vistas = m.vistas[i] ?? ['frente'];
      await cambiarVista(m, vistas[0] ?? 'frente');
      if (!viva()) return;
      foco(m, i);
      if (vistas.length > 1) {
        await espera(T_MEDIO_BLOQUE);
        if (!viva()) return;
        await sostener(m, vistas[1] ?? 'espalda', T_MEDIO_BLOQUE);
      } else {
        await espera(2 * T_MEDIO_BLOQUE);
      }
      if (!viva()) return;
    }
  }
}

/** Sin movimiento (`?sobrio=1` / reduced-motion): estado final quieto, todo encendido. */
function estadoQuieto(m: Montaje): void {
  for (const f of m.figs) f.classList.add('in');
  encenderTodo(m);
  foco(m, null);
  // Quieto en la vista que más pinta: si nada se ve de frente, de espalda.
  const finales = vistasDelFinal(m);
  if (finales.length === 1 && finales[0] === 'espalda') {
    vista = 'espalda';
    for (const f of m.figs) f.classList.add('back');
    m.cuerpos.classList.add('back');
  }
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
