/**
 * SVG de la intro "el recorrido de hoy" (sketch 004, variante D ganadora): cuerpos de
 * mármol con relieve por músculo, vetas recortadas a la silueta y las zonas de cada
 * bloque "encendidas" con un degradé del color del bloque.
 *
 * Funciones PURAS que devuelven markup SVG. Ningún texto que venga del server entra acá:
 * los rótulos de los puntos salen de `ZONA_ES` (fijo) y los colores de `COLORES_BLOQUE`
 * (fijo). Los títulos de bloque se pintan en `index.ts` con `textContent`.
 *
 * Presupuesto de TV (incidentes f655466c / 750e11f58): todo lo "detallado" es ESTÁTICO
 * (degradés, vetas) y se rasteriza una vez; lo que se anima es la `opacity` de cada capa
 * `<svg>` entera, que el navegador compone sin repintar el cuerpo. Sin filter, sin blend.
 */

import type { TvZonaMuscular } from '../poll';
import type { Anatomia, FiguraKey, GrupoAnatomico, PathAnatomico } from './anatomia';

/** Paleta de la plani TV, en orden de bloque (TvScreenPage.vue `#tvScreenRoot`):
 *  terracota, ámbar, carbón (`--navy`), oro (`--gold`), piedra (`--trans-apagado-dia`). */
export const COLORES_BLOQUE = ['#96593a', '#d4a843', '#3d3732', '#b08d6e', '#6f6455'];

/**
 * Color de cada bloque, en orden, de la paleta. DEUTEROS I y II comparten color (UAT
 * 2026-10-13: son el mismo tramo de la clase), así el color que liberan pasa al bloque
 * siguiente.
 */
export function coloresDeBloques(bloques: ReadonlyArray<{ role: string }>): string[] {
  const colores: string[] = [];
  let siguiente = 0;
  bloques.forEach((b, i) => {
    const previo = bloques[i - 1];
    if (b.role === 'DEUTEROS_2' && previo?.role === 'DEUTEROS_1') {
      colores.push(colores[i - 1] as string);
      return;
    }
    colores.push(COLORES_BLOQUE[siguiente % COLORES_BLOQUE.length] as string);
    siguiente++;
  });
  return colores;
}

export const ZONA_ES: Record<TvZonaMuscular, string> = {
  chest: 'PECHO',
  deltoids: 'HOMBROS',
  triceps: 'TRÍCEPS',
  biceps: 'BÍCEPS',
  forearm: 'ANTEBRAZOS',
  trapezius: 'TRAPECIO',
  'upper-back': 'DORSALES',
  'lower-back': 'LUMBARES',
  abs: 'ABDOMINALES',
  obliques: 'OBLICUOS',
  gluteal: 'GLÚTEOS',
  quadriceps: 'CUÁDRICEPS',
  hamstring: 'ISQUIOS',
  adductors: 'ADUCTORES',
  calves: 'GEMELOS',
};

export type Vista = 'frente' | 'espalda';

export interface FiguraDef {
  id: 'm' | 'f';
  frente: FiguraKey;
  espalda: FiguraKey;
  /** Lado de ADENTRO (hacia el otro cuerpo): de ahí salen las líneas a la leyenda
   *  central de zonas (UAT 2026-10-13). */
  lado: 'izq' | 'der';
  /** Alto relativo al de `ALTO_FIGURA_REM`. */
  escala: number;
}

export const FIGURAS: FiguraDef[] = [
  // Orden en pantalla de izquierda a derecha (UAT 2026-10-13: mujer a la izquierda).
  // La mujer un 5 % más grande: su caja incluye la cola de pelo y, a la misma caja, el
  // cuerpo quedaba más bajo que el del hombre (UAT 2026-10-13: "misma altura").
  { id: 'f', frente: 'fFront', espalda: 'fBack', lado: 'der', escala: 1.05 },
  { id: 'm', frente: 'mFront', espalda: 'mBack', lado: 'izq', escala: 1 },
];

export function contornoDe(an: Anatomia, fig: FiguraDef, vista: Vista): string {
  const par = fig.id === 'm' ? an.mOutline : an.fOutline;
  return (vista === 'frente' ? par[0] : par[1]) as string;
}

// =============================================================================
// Color
// =============================================================================

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mezcla lineal `h → hacia` en proporción `t` (0..1). */
export function mezclar(h: string, hacia: string, t: number): string {
  const a = hexRgb(h);
  const b = hexRgb(hacia);
  const c = a.map((v, i) => Math.round(v + ((b[i] as number) - v) * t));
  return 'rgb(' + c.join(',') + ')';
}

// =============================================================================
// Defs (degradés y recortes): se registran una vez en un <defs> compartido
// =============================================================================

export class Defs {
  private hechos = new Set<string>();
  markup = '';

  private add(id: string, svg: string): string {
    if (!this.hechos.has(id)) {
      this.hechos.add(id);
      this.markup += svg;
    }
    return id;
  }

  /** Luz de arriba-izquierda: cada músculo es una "almohada" con su propio relieve. */
  radial(id: string, stops: Array<[number, string]>): string {
    let s = `<radialGradient id="${id}" cx=".42" cy=".36" r=".74" fx=".34" fy=".26">`;
    for (const [o, c] of stops) s += `<stop offset="${o}" stop-color="${c}"/>`;
    return this.add(id, s + '</radialGradient>');
  }

  marmol(): string {
    return this.radial('recMar', [
      [0, '#fdfbf7'],
      [0.55, '#ece5d9'],
      [1, '#c7baa6'],
    ]);
  }

  marmolPelo(): string {
    return this.radial('recMarH', [
      [0, '#efe8dc'],
      [1, '#bfb19b'],
    ]);
  }

  color(c: string): string {
    return this.radial('recC' + c.slice(1), [
      [0, mezclar(c, '#ffffff', 0.42)],
      [0.5, c],
      [1, mezclar(c, '#000000', 0.38)],
    ]);
  }

  recorte(id: string, d: string): string {
    return this.add(id, `<clipPath id="${id}"><path d="${d}"/></clipPath>`);
  }
}

// =============================================================================
// Capas
// =============================================================================

const CONTORNO_RELLENO = '#b1a38e';
const CONTORNO_TRAZO = '#8f816c';

function path(d: string, fill: string, stroke: string, w: number): string {
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round"/>`;
}

/** Vetas de mármol: curvas suaves, deterministas por figura, recortadas a la silueta. */
function vetas(defs: Defs, key: FiguraKey, grupos: GrupoAnatomico[], contorno: string): string {
  const clip = defs.recorte('recClip' + key, contorno);
  let seed = key.length * 97 + key.charCodeAt(0);
  const r = (): number => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const xs: number[] = [];
  const ys: number[] = [];
  for (const g of grupos) {
    for (const p of g.p) {
      xs.push(p[3]);
      ys.push(p[4]);
    }
  }
  const x0 = Math.min(...xs) - 80;
  const x1 = Math.max(...xs) + 80;
  const y0 = Math.min(...ys) - 80;
  const y1 = Math.max(...ys) + 80;
  let s = `<g clip-path="url(#${clip})" fill="none">`;
  for (let i = 0; i < 9; i++) {
    const ya = y0 + r() * (y1 - y0);
    const yb = ya + (r() - 0.3) * 380;
    const c1 = `${x0 + (x1 - x0) * 0.3},${ya + (r() - 0.5) * 300}`;
    const c2 = `${x0 + (x1 - x0) * 0.7},${yb + (r() - 0.5) * 300}`;
    const alfa = (0.12 + r() * 0.16).toFixed(2);
    const ancho = (1 + r() * 2.2).toFixed(1);
    s += `<path d="M${x0} ${ya}C${c1} ${c2} ${x1} ${yb}" stroke="rgba(150,136,116,${alfa})" stroke-width="${ancho}"/>`;
  }
  return s + '</g>';
}

/**
 * Cuerpo base de mármol. `.anat` envuelve SOLO la anatomía (sin vetas): su bbox es el que
 * fija el viewBox — las vetas se salen del cuerpo antes del recorte y lo inflarían.
 */
export function svgBase(defs: Defs, an: Anatomia, key: FiguraKey, contorno: string): string {
  const grupos = an[key];
  let s = `<g class="anat"><path d="${contorno}" fill="${CONTORNO_RELLENO}"/>`;
  for (const g of grupos) {
    const fill = `url(#${g.slug === 'hair' ? defs.marmolPelo() : defs.marmol()})`;
    for (const p of g.p) s += path(p[0], fill, 'rgba(143,129,108,.55)', 0.8);
  }
  s += '</g>';
  s += vetas(defs, key, grupos, contorno);
  s += `<path d="${contorno}" fill="none" stroke="${CONTORNO_TRAZO}" stroke-width="2"/>`;
  return s;
}

/** Capa de un bloque: solo sus zonas, con el degradé de su color. */
export function svgBloque(
  defs: Defs,
  an: Anatomia,
  key: FiguraKey,
  zonas: TvZonaMuscular[],
  color: string
): string {
  const fill = `url(#${defs.color(color)})`;
  const trazo = mezclar(color, '#000000', 0.45);
  let s = '<g opacity="0.93">';
  for (const g of an[key]) {
    if ((zonas as string[]).indexOf(g.slug) < 0) continue;
    for (const p of g.p) s += path(p[0], fill, trazo, 1.1);
  }
  return s + '</g>';
}

export function centroX(grupos: GrupoAnatomico[]): number {
  let s = 0;
  let n = 0;
  for (const g of grupos) {
    for (const p of g.p) {
      s += p[3];
      n++;
    }
  }
  return n > 0 ? s / n : 0;
}

/** Punto de una zona sobre la figura, en unidades SVG de su vista. */
export interface PuntoZona {
  x: number;
  y: number;
  zona: TvZonaMuscular;
}

/**
 * Un punto por zona trabajada, en el borde del lado `lado` de la figura (el path más
 * extremo de ese lado del centro). La leyenda central (UAT 2026-10-13) usa el lado de
 * ADENTRO de cada cuerpo (`FiguraDef.lado`): el que mira hacia el otro cuerpo.
 */
export function puntosDeZonas(
  grupos: GrupoAnatomico[],
  zonas: TvZonaMuscular[],
  lado: 'izq' | 'der'
): PuntoZona[] {
  const cx = centroX(grupos);
  const pts: PuntoZona[] = [];
  for (const g of grupos) {
    if ((zonas as string[]).indexOf(g.slug) < 0) continue;
    const cands = g.p.filter((p) => (lado === 'izq' ? p[3] < cx : p[3] > cx));
    if (cands.length === 0) continue;
    let mejor = cands[0] as PathAnatomico;
    for (const q of cands) {
      if (lado === 'izq' ? q[3] < mejor[3] : q[3] > mejor[3]) mejor = q;
    }
    pts.push({ x: mejor[3], y: mejor[4], zona: g.slug as TvZonaMuscular });
  }
  return pts;
}
