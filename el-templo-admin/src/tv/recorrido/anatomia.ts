/**
 * Geometría anatómica de la intro "el recorrido de hoy" (hombre/mujer, frente/espalda).
 *
 * Los paths salen de react-native-body-highlighter v3.2.0
 * (https://github.com/HichamELBSI/react-native-body-highlighter) — MIT License,
 * Copyright (c) ELABBASSI Hicham. El aviso viaja también dentro del JSON (`_licencia`).
 * 2026-10-27: proporciones modificadas (cuerpos más comunes). El JSON lo genera
 * `tools/anatomia/generar-cuerpos.mjs` a partir de `tools/anatomia/anatomia-original.json`:
 * no se edita a mano.
 *
 * Cada path trae precalculados (sketch 004) el ángulo de su eje principal, la elongación
 * y el centroide: con eso se orientan las fibras y se ubican los puntos de los rótulos
 * sin medir nada en el televisor.
 *
 * El JSON (~170 KB) se carga con `import()` dinámico la primera vez que se muestra el
 * recorrido: la pantalla de clase no lo paga si nadie toca el botón.
 */

/** [d, anguloEje, elongacion, cx, cy] */
export type PathAnatomico = [string, number, number, number, number];

export interface GrupoAnatomico {
  slug: string;
  p: PathAnatomico[];
}

export type FiguraKey = 'mFront' | 'mBack' | 'fFront' | 'fBack';

export interface Anatomia {
  mFront: GrupoAnatomico[];
  mBack: GrupoAnatomico[];
  fFront: GrupoAnatomico[];
  fBack: GrupoAnatomico[];
  /** [contornoFrente, contornoEspalda] */
  mOutline: string[];
  fOutline: string[];
}

function esPath(x: unknown): x is PathAnatomico {
  return (
    Array.isArray(x) &&
    x.length === 5 &&
    typeof x[0] === 'string' &&
    typeof x[1] === 'number' &&
    typeof x[2] === 'number' &&
    typeof x[3] === 'number' &&
    typeof x[4] === 'number'
  );
}

function esFigura(x: unknown): x is GrupoAnatomico[] {
  if (!Array.isArray(x)) return false;
  for (const g of x) {
    if (typeof g !== 'object' || g === null) return false;
    const grupo = g as { slug?: unknown; p?: unknown };
    if (typeof grupo.slug !== 'string' || !Array.isArray(grupo.p)) return false;
    for (const p of grupo.p) if (!esPath(p)) return false;
  }
  return true;
}

function esContornos(x: unknown): x is string[] {
  return Array.isArray(x) && x.length === 2 && typeof x[0] === 'string' && typeof x[1] === 'string';
}

/** Valida la forma del JSON: un archivo roto tiene que fallar acá, no dibujar basura. */
export function parseAnatomia(raw: unknown): Anatomia {
  if (typeof raw !== 'object' || raw === null) throw new Error('anatomia: no es un objeto');
  const o = raw as Record<string, unknown>;
  const { mFront, mBack, fFront, fBack, mOutline, fOutline } = o;
  if (!esFigura(mFront) || !esFigura(mBack) || !esFigura(fFront) || !esFigura(fBack)) {
    throw new Error('anatomia: figura con forma inválida');
  }
  if (!esContornos(mOutline) || !esContornos(fOutline)) {
    throw new Error('anatomia: contornos con forma inválida');
  }
  return { mFront, mBack, fFront, fBack, mOutline, fOutline };
}

let cache: Promise<Anatomia> | null = null;

export function cargarAnatomia(): Promise<Anatomia> {
  if (cache === null) {
    cache = import('./anatomia.json').then((m: { default: unknown }) => parseAnatomia(m.default));
    // Si falla (chunk no disponible tras un deploy), el próximo intento reintenta.
    cache.catch(() => {
      cache = null;
    });
  }
  return cache;
}
