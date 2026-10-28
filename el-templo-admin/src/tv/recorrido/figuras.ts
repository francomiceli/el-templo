/**
 * SVG de la intro "el recorrido de hoy" (sketch 004, variante D): los cuerpos y las zonas
 * de cada bloque "encendidas". 2026-10-27: el cuerpo es el MISMO de la Guía del app
 * (`FIGURA_BASE` = `$fig-*` de su _brand.scss) y las zonas se encienden con el terracota de
 * la Guía, un solo color para todos los bloques (antes, mármol con vetas y un color por bloque).
 *
 * Funciones PURAS que devuelven markup SVG. Ningún texto que venga del server entra acá:
 * los rótulos de los puntos salen de `ZONA_ES` (fijo) y los colores de `FIGURA_BASE` y
 * `COLOR_RECORRIDO` (fijos). Los títulos de bloque se pintan en `index.ts` con `textContent`.
 *
 * Presupuesto de TV (incidentes f655466c / 750e11f58): todo lo "detallado" es ESTÁTICO
 * (degradés) y se rasteriza una vez; lo que se anima es la `opacity` de cada capa
 * `<svg>` entera, que el navegador compone sin repintar el cuerpo. Sin filter, sin blend.
 */

import type { TvZonaMuscular } from '../poll';
import type { Anatomia, FiguraKey, GrupoAnatomico, PathAnatomico } from './anatomia';

/**
 * Cuerpo y encendido de la figura: MISMOS valores que `$fig-*` de el-templo-app/src/css/_brand.scss
 * (lo verifica el API en test/anatomy/sync-front.test.ts).
 */
export const FIGURA_BASE = {
  muscle: '#e2d7c8',
  'muscle-edge': '#c9bba8',
  skin: '#ece4d8',
  'skin-edge': '#b9a993',
  'lit-a': '#c47a52',
  'lit-b': '#8a4e30',
  'lit-edge': '#7e4529',
};

/** Color de la lista de bloques y de los rótulos de zona (2026-10-27: uno solo para todos los
 *  bloques, el terracota de la marca; antes cada bloque tenía el suyo). */
export const COLOR_RECORRIDO = '#96593a';

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
  // Misma escala que el hombre (UAT 2026-10-13: se probaron 1.05, 1.03 y 0.93).
  { id: 'f', frente: 'fFront', espalda: 'fBack', lado: 'der', escala: 1 },
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
// Defs (degradés): se registran una vez en un <defs> compartido
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

  /** Encendido de la Guía: degradé terracota en diagonal, por path (como BodyFigure.vue). */
  encendido(): string {
    return this.add(
      'recLit',
      '<linearGradient id="recLit" x1="0" y1="0" x2="1" y2="1">' +
        `<stop offset="0" stop-color="${FIGURA_BASE['lit-a']}"/>` +
        `<stop offset="1" stop-color="${FIGURA_BASE['lit-b']}"/>` +
        '</linearGradient>'
    );
  }
}

// =============================================================================
// Capas
// =============================================================================

/** Partes no musculares: se pintan como piel (mismo set que `NON_MUSCLE_SLUGS` del app). */
const NO_MUSCULARES = ['hair', 'head', 'neck', 'hands', 'feet', 'ankles', 'knees'];

function path(d: string, fill: string, stroke: string, w: number): string {
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round"/>`;
}

/**
 * Cuerpo base, como la Guía: contorno con relleno de piel debajo y los músculos encima.
 * `.anat` envuelve todo: su bbox es el que fija el viewBox.
 */
export function svgBase(an: Anatomia, key: FiguraKey, contorno: string): string {
  let s =
    `<g class="anat"><path d="${contorno}" fill="${FIGURA_BASE.skin}" ` +
    `stroke="${FIGURA_BASE['skin-edge']}" stroke-width="1.2"/>`;
  for (const g of an[key]) {
    const muscular = NO_MUSCULARES.indexOf(g.slug) < 0;
    for (const p of g.p) {
      s += muscular
        ? path(p[0], FIGURA_BASE.muscle, FIGURA_BASE['muscle-edge'], 0.6)
        : `<path d="${p[0]}" fill="${FIGURA_BASE.skin}"/>`;
    }
  }
  return s + '</g>';
}

/** Capa de un bloque: solo sus zonas, con el encendido de la Guía. */
export function svgBloque(
  defs: Defs,
  an: Anatomia,
  key: FiguraKey,
  zonas: TvZonaMuscular[]
): string {
  const fill = `url(#${defs.encendido()})`;
  let s = '<g>';
  for (const g of an[key]) {
    if ((zonas as string[]).indexOf(g.slug) < 0) continue;
    for (const p of g.p) s += path(p[0], fill, FIGURA_BASE['lit-edge'], 0.6);
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
