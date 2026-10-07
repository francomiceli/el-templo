/**
 * hreflang entre las paginas equivalentes de Argentina y Espana (fase 195, D-13).
 *
 * Solo las paginas que existen en las dos versiones tienen hreflang. Las sedes
 * NO son equivalentes entre paises (cada pais tiene las suyas): no llevan.
 * Cada pagina del par se lista a si misma y a la otra, y `x-default` apunta a
 * la version de Argentina. El verificador (scripts/verify-seo-output.mjs)
 * tiene su propia copia de la lista: mantenerlas en sync.
 */
import { SITE_URL } from "~/utils/schema-graph";

export interface HreflangPair {
  ar: string;
  es: string;
}

export const HREFLANG_PAIRS: HreflangPair[] = [
  { ar: "/", es: "/es" },
  { ar: "/primera-clase-gratis", es: "/es/primera-clase-gratis" },
  { ar: "/planes", es: "/es/planes" },
];

// `type` (no interface): useHead exige un tipo asignable a sus claves `data-*`.
export type HreflangLink = {
  rel: "alternate";
  hreflang: "es-AR" | "es-ES" | "x-default";
  href: string;
};

/** Ruta sin barra final (salvo la raiz). */
function normalizePath(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? path;
  return clean.length > 1 ? clean.replace(/\/+$/, "") : "/";
}

/** `/` -> `https://eltemplo.org/`, `/es` -> `https://eltemplo.org/es`. */
function absolute(path: string): string {
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

/** Los tres `<link rel="alternate">` de la pagina, o `[]` si no tiene equivalente. */
export function hreflangLinks(path: string): HreflangLink[] {
  const current = normalizePath(path);
  const pair = HREFLANG_PAIRS.find(
    (p) => p.ar === current || p.es === current,
  );
  if (!pair) return [];
  return [
    { rel: "alternate", hreflang: "es-AR", href: absolute(pair.ar) },
    { rel: "alternate", hreflang: "es-ES", href: absolute(pair.es) },
    { rel: "alternate", hreflang: "x-default", href: absolute(pair.ar) },
  ];
}
