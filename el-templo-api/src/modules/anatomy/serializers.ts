/**
 * Fase 200 P3/D14: el recorte por audiencia vive acá (seguridad de contenido,
 * no UI). La vista de alumno no lleva códigos de ruta, antagonista, banderas ni
 * ficha de profe; notaInterna no sale en ninguna vista (T21).
 *
 * Módulo PURO (sin DB, sin Fastify): `vistaProfe` recibe los ejercicios del
 * catálogo por ruta (los lee el endpoint, con tenant) y `vistaAlumno` no recibe
 * nada. Los nombres de ruta salen de `getRouteLabel` (R3).
 */
import { ROUTE_PROGRESSION_MAP } from "../exercises/route-progression-map";
import { getRouteLabel } from "../tv/route-labels";
import { BANDERAS } from "./content/banderas";
import { CITAS, LEYENDA_MARCAS } from "./content/citas";
import {
  GLOSARIO_CONTRACCIONES,
  GLOSARIO_PRECISION,
  GLOSARIO_ROLES,
} from "./content/glosario";
import { GRUPOS_ALUMNO } from "./content/grupos-alumno";
import { MUSCULOS } from "./content/musculos";
import { REGIONES } from "./content/regiones";
import type { ZonaSlug } from "./content/regiones";
import { RUTAS } from "./content/rutas";
import { normalizarCodigo } from "./projection";
import { GRUPO_DE_ROL, ROLES, esPendiente } from "./types";
import type {
  Afirmacion,
  BanderaDef,
  CitaDef,
  FichaProfe,
  GlosarioEntrada,
  GlosarioRol,
  GrupoAlumno,
  GrupoZona,
  Marca,
  MusculoDef,
  NivelBandera,
  Patron,
  Pendiente,
  Precision,
  RegionDef,
  Rol,
  RutaContenido,
  Seccion,
  Vista,
} from "./types";

// =============================================================================
// Tipos del payload (los espejan el admin y el app)
// =============================================================================

export interface RegionVista {
  slug: ZonaSlug;
  nombre: string;
  vista: Vista;
  grupo: GrupoZona;
  /** Ids de los músculos con esta zona, en el orden de MUSCULOS (>1 = grupo). */
  musculos: string[];
}

export interface ZonaMusculo {
  slug: ZonaSlug;
  vista: Vista;
}

export interface MusculoProfe {
  id: string;
  nombre: string;
  zona: ZonaMusculo | null;
  precision: Precision | null;
  nota: Afirmacion | null;
  /** Códigos de ruta por rol (índice inverso de las relaciones, orden RUTAS). */
  roles: Record<Rol, string[]>;
}

export interface RelacionVista {
  m: string;
  nombre: string;
  c: Marca[];
  nota: string | null;
}

/** Bandera del catálogo global (una vez cada una). SIN notaInterna. */
export interface BanderaProfe {
  id: string;
  nivel: NivelBandera;
  senal: string;
  accion: string;
  fuente: string;
  umbralH: boolean;
}

export type FichaProfeVista = Omit<FichaProfe, "escalones"> & {
  escalones: string[] | Pendiente;
};

export interface RutaProfe {
  code: string;
  nombre: string;
  slug: string;
  patron: Patron;
  categoria: string;
  estado: "borrador";
  nEjercicios: number;
  ejercicios: string[];
  relaciones: Record<Rol, RelacionVista[]>;
  zonasFicha: { slug: ZonaSlug; vista: Vista; rol: Rol }[];
  sinDibujo: { m: string; nombre: string; rol: Rol }[];
  /** Ids de `VistaProfe.banderas` que aplican a la ruta (las de "todas" y las que la nombran). */
  banderaIds: string[];
  fichaProfe: FichaProfeVista | null;
}

export interface VistaProfe {
  estado: "borrador";
  regiones: RegionVista[];
  musculos: MusculoProfe[];
  rutas: RutaProfe[];
  /** Catálogo global de banderas (una vez cada una); las rutas llevan solo ids. */
  banderas: BanderaProfe[];
  glosario: {
    roles: GlosarioRol[];
    contracciones: GlosarioEntrada[];
    precision: GlosarioEntrada[];
  };
  citas: CitaDef[];
  leyenda: Record<"C" | "M" | "R" | "H" | "N", string>;
}

export interface MusculoAlumno {
  id: string;
  nombre: string;
  zona: ZonaMusculo | null;
  queHace: string;
  /** Slugs de ruta (nunca códigos). */
  grupos: { fuerte: string[]; sostiene: string[]; estira: string[] };
}

export interface FichaCortaAlumno {
  que: string | null;
  siente: string | null;
  tips: string[] | null;
  errores: { error: string; texto: string }[] | null;
}

export interface RutaAlumno {
  slug: string;
  nombre: string;
  patron: Patron;
  zonas: { slug: ZonaSlug; vista: Vista; grupo: "fuerte" | "sostiene" }[];
  /** Nombres de músculos. */
  fuerte: string[];
  sostiene: string[];
  fichaCorta: FichaCortaAlumno | null;
}

export interface VistaAlumno {
  regiones: RegionVista[];
  musculos: MusculoAlumno[];
  rutas: RutaAlumno[];
  grupos: { id: GrupoAlumno; frase: string; definicion: string }[];
}

// =============================================================================
// Índices del contenido (se calculan una vez al cargar el módulo)
// =============================================================================

const MUSCULOS_DEF: readonly MusculoDef[] = MUSCULOS;
const REGIONES_DEF: readonly RegionDef[] = REGIONES;
const BANDERAS_DEF: readonly BanderaDef[] = BANDERAS;

const MUSCULO_POR_ID: ReadonlyMap<string, MusculoDef> = new Map(
  MUSCULOS_DEF.map((m) => [m.id, m]),
);

/** Slug de región ya tipado (el catálogo de regiones es la fuente del tipo). */
const SLUG_DE_REGION: ReadonlyMap<string, ZonaSlug> = new Map(
  REGIONES.map((r): [string, ZonaSlug] => [r.slug, r.slug]),
);

/** Zona de un músculo con el slug validado contra las regiones; `null` si es profundo. */
function zonaDe(m: MusculoDef): ZonaMusculo | null {
  if (!m.zona) return null;
  const slug = SLUG_DE_REGION.get(m.zona.slug);
  return slug ? { slug, vista: m.zona.vista } : null;
}

function nombreDe(id: string): string {
  return MUSCULO_POR_ID.get(id)?.nombre ?? id;
}

/** Posición de cada rol en `ROLES` (menor = más prioridad). */
function prioridad(rol: Rol): number {
  return ROLES.indexOf(rol);
}

/** Rol de mayor prioridad entre dos. */
function mejorRol(a: Rol | undefined, b: Rol): Rol {
  return a === undefined || prioridad(b) < prioridad(a) ? b : a;
}

function rolesVacios(): Record<Rol, string[]> {
  return {
    motor: [],
    sinergista: [],
    estabilizador: [],
    antagonista: [],
    estira: [],
  };
}

/** Índice inverso músculo → códigos de ruta por rol (orden RUTAS). */
function rolesPorMusculo(): Map<string, Record<Rol, string[]>> {
  const out = new Map<string, Record<Rol, string[]>>();
  for (const ruta of RUTAS) {
    for (const rol of ROLES) {
      for (const rel of ruta.relaciones[rol]) {
        const fila = out.get(rel.m) ?? rolesVacios();
        if (!fila[rol].includes(ruta.code)) fila[rol].push(ruta.code);
        out.set(rel.m, fila);
      }
    }
  }
  return out;
}

/** Regiones con los ids de los músculos que las usan (orden MUSCULOS). */
function regionesVista(): RegionVista[] {
  return REGIONES_DEF.flatMap((r): RegionVista[] => {
    const slug = SLUG_DE_REGION.get(r.slug);
    if (!slug) return [];
    return [
      {
        slug,
        nombre: r.nombre,
        vista: r.vista,
        grupo: r.grupo,
        musculos: MUSCULOS_DEF.filter((m) => m.zona?.slug === r.slug).map(
          (m) => m.id,
        ),
      },
    ];
  });
}

/** Un rol por músculo en la ruta: (músculo, rol) en el orden de ROLES. */
function musculosDeRuta(ruta: RutaContenido): { m: string; rol: Rol }[] {
  return ROLES.flatMap((rol) =>
    ruta.relaciones[rol].map((rel) => ({ m: rel.m, rol })),
  );
}

/**
 * D11: por cada (zona, vista) de un músculo de la ruta, el rol de MAYOR
 * prioridad entre los músculos que la comparten. Orden: el de las regiones.
 */
function zonasFichaDe(
  ruta: RutaContenido,
): { slug: ZonaSlug; vista: Vista; rol: Rol }[] {
  const porClave = new Map<
    string,
    { slug: ZonaSlug; vista: Vista; rol: Rol }
  >();
  for (const { m, rol } of musculosDeRuta(ruta)) {
    const def = MUSCULO_POR_ID.get(m);
    const zona = def ? zonaDe(def) : null;
    if (!zona) continue;
    const clave = `${zona.slug}|${zona.vista}`;
    const actual = porClave.get(clave);
    porClave.set(clave, {
      slug: zona.slug,
      vista: zona.vista,
      rol: mejorRol(actual?.rol, rol),
    });
  }
  const orden = REGIONES_DEF.map((r) => r.slug);
  return [...porClave.values()].sort(
    (a, b) =>
      orden.indexOf(a.slug) - orden.indexOf(b.slug) ||
      a.vista.localeCompare(b.vista),
  );
}

/** D11: músculos de la ruta que no están en el dibujo (zona null). */
function sinDibujoDe(
  ruta: RutaContenido,
): { m: string; nombre: string; rol: Rol }[] {
  return musculosDeRuta(ruta).flatMap(({ m, rol }) => {
    const def = MUSCULO_POR_ID.get(m);
    return def && !def.zona ? [{ m, nombre: def.nombre, rol }] : [];
  });
}

/** `"ADV TUCK"` → `"Adv tuck"`. */
function sentenceCase(texto: string): string {
  const t = texto.trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Escalones de la ficha: del mapa de progresión, propios o pendientes. */
function escalonesDe(ruta: RutaContenido): string[] | Pendiente {
  const e = ruta.fichaProfe?.escalones;
  if (!e) {
    return { pendiente: "Ficha en preparación", quien: "fuente" };
  }
  if (esPendiente(e)) return e;
  if (e.fuente === "ficha") return [...e.pasos];
  const steps = ROUTE_PROGRESSION_MAP[ruta.code]?.steps;
  if (!steps || steps.length === 0) {
    return {
      pendiente: "La ruta no tiene escalones en el mapa de progresión",
      quien: "fuente",
    };
  }
  return steps.map(sentenceCase);
}

/** Catálogo global de banderas, en el orden de BANDERAS. SIN notaInterna. */
function catalogoBanderas(): BanderaProfe[] {
  return BANDERAS_DEF.map((b) => ({
    id: b.id,
    nivel: b.nivel,
    senal: b.senal,
    accion: b.accion,
    fuente: b.fuente,
    umbralH: b.umbralH,
  }));
}

/** Ids de las banderas que aplican a la ruta (las de "todas" y las que la nombran). */
function banderaIdsDe(code: string): string[] {
  return BANDERAS_DEF.filter(
    (b) => b.rutas === "todas" || b.rutas.includes(code),
  ).map((b) => b.id);
}

/** Una sección pendiente viaja como `null` ("Pronto") en la vista de alumno. */
function seccionAlumno<T>(s: Seccion<T>): T | null {
  return esPendiente(s) ? null : s;
}

// =============================================================================
// Vista de profe
// =============================================================================

function rutaProfe(
  ruta: RutaContenido,
  ejerciciosPorRuta: ReadonlyMap<string, readonly string[]>,
): RutaProfe {
  const ejercicios = [...(ejerciciosPorRuta.get(ruta.code) ?? [])];
  const vista = (rol: Rol): RelacionVista[] =>
    ruta.relaciones[rol].map((rel) => ({
      m: rel.m,
      nombre: nombreDe(rel.m),
      c: [...rel.c],
      nota: rel.nota ?? null,
    }));
  const relaciones: Record<Rol, RelacionVista[]> = {
    motor: vista("motor"),
    sinergista: vista("sinergista"),
    estabilizador: vista("estabilizador"),
    antagonista: vista("antagonista"),
    estira: vista("estira"),
  };
  return {
    code: ruta.code,
    nombre: getRouteLabel(ruta.code),
    slug: ruta.slug,
    patron: ruta.patron,
    categoria: ruta.categoria,
    estado: ruta.estado,
    nEjercicios: ejercicios.length,
    ejercicios,
    relaciones,
    zonasFicha: zonasFichaDe(ruta),
    sinDibujo: sinDibujoDe(ruta),
    banderaIds: banderaIdsDe(ruta.code),
    fichaProfe: ruta.fichaProfe
      ? { ...ruta.fichaProfe, escalones: escalonesDe(ruta) }
      : null,
  };
}

/**
 * Vista completa para el staff (R1). `ejerciciosPorRuta`: nombres del catálogo
 * por código de ruta, ya ordenados (los arma el endpoint con el tenant de la
 * request).
 */
export function vistaProfe(
  ejerciciosPorRuta: ReadonlyMap<string, readonly string[]>,
): VistaProfe {
  const roles = rolesPorMusculo();
  return {
    estado: "borrador",
    regiones: regionesVista(),
    musculos: MUSCULOS_DEF.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      zona: zonaDe(m),
      precision: m.precision,
      nota: m.nota ?? null,
      roles: roles.get(m.id) ?? rolesVacios(),
    })),
    rutas: RUTAS.map((r) => rutaProfe(r, ejerciciosPorRuta)),
    banderas: catalogoBanderas(),
    glosario: {
      roles: [...GLOSARIO_ROLES],
      contracciones: [...GLOSARIO_CONTRACCIONES],
      precision: [...GLOSARIO_PRECISION],
    },
    citas: [...CITAS],
    leyenda: { ...LEYENDA_MARCAS },
  };
}

// =============================================================================
// Vista de alumno
// =============================================================================

/** Slugs de ruta por grupo de alumno para un músculo (el antagonista se descarta). */
function gruposDeMusculo(id: string): MusculoAlumno["grupos"] {
  const out: MusculoAlumno["grupos"] = {
    fuerte: [],
    sostiene: [],
    estira: [],
  };
  for (const ruta of RUTAS) {
    for (const rol of ROLES) {
      const grupo = GRUPO_DE_ROL[rol];
      if (!grupo) continue;
      if (ruta.relaciones[rol].some((rel) => rel.m === id)) {
        out[grupo].push(ruta.slug);
      }
    }
  }
  return out;
}

/** Zonas de la ruta para el alumno: fuerte > sostiene, una por (slug, vista). */
function zonasAlumnoDe(ruta: RutaContenido): RutaAlumno["zonas"] {
  const porClave = new Map<
    string,
    { slug: ZonaSlug; vista: Vista; grupo: "fuerte" | "sostiene" }
  >();
  for (const { m, rol } of musculosDeRuta(ruta)) {
    const grupo = GRUPO_DE_ROL[rol];
    if (grupo !== "fuerte" && grupo !== "sostiene") continue;
    const def = MUSCULO_POR_ID.get(m);
    const zona = def ? zonaDe(def) : null;
    if (!zona) continue;
    const clave = `${zona.slug}|${zona.vista}`;
    const actual = porClave.get(clave);
    if (actual?.grupo === "fuerte") continue;
    porClave.set(clave, { slug: zona.slug, vista: zona.vista, grupo });
  }
  const orden = REGIONES_DEF.map((r) => r.slug);
  return [...porClave.values()].sort(
    (a, b) =>
      orden.indexOf(a.slug) - orden.indexOf(b.slug) ||
      a.vista.localeCompare(b.vista),
  );
}

function nombresDeGrupo(ruta: RutaContenido, roles: readonly Rol[]): string[] {
  return roles.flatMap((rol) =>
    ruta.relaciones[rol].map((rel) => nombreDe(rel.m)),
  );
}

function fichaCortaDe(ruta: RutaContenido): FichaCortaAlumno | null {
  const f = ruta.fichaAlumno;
  if (!f) return null;
  const errores = seccionAlumno(f.errores);
  const tips = seccionAlumno(f.tips);
  return {
    que: seccionAlumno(f.que),
    siente: seccionAlumno(f.siente),
    tips: tips ? [...tips] : null,
    errores: errores ? errores.map((e) => ({ ...e })) : null,
  };
}

function rutaAlumno(ruta: RutaContenido): RutaAlumno {
  return {
    slug: ruta.slug,
    nombre: getRouteLabel(ruta.code),
    patron: ruta.patron,
    zonas: zonasAlumnoDe(ruta),
    fuerte: nombresDeGrupo(ruta, ["motor", "sinergista"]),
    sostiene: nombresDeGrupo(ruta, ["estabilizador"]),
    fichaCorta: fichaCortaDe(ruta),
  };
}

let alumnoMemo: VistaAlumno | null = null;

/** Vista recortada para cualquier autenticado (D14, D15). Pura y memoizada. */
export function vistaAlumno(): VistaAlumno {
  if (alumnoMemo) return alumnoMemo;
  alumnoMemo = {
    regiones: regionesVista(),
    musculos: MUSCULOS_DEF.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      zona: zonaDe(m),
      queHace: m.queHaceAlumno,
      grupos: gruposDeMusculo(m.id),
    })),
    rutas: RUTAS.map(rutaAlumno),
    grupos: GRUPOS_ALUMNO.map((g) => ({
      id: g.id,
      frase: g.frase,
      definicion: g.definicion,
    })),
  };
  return alumnoMemo;
}

/** Agrupa filas del catálogo por ruta normalizada (lo usa el endpoint de profe). */
export function ejerciciosPorRutaDe(
  filas: readonly {
    route: string;
    exercise: string;
    dificultadLineal: number;
    progressionStep: number | null;
  }[],
): Map<string, string[]> {
  const ordenadas = [...filas].sort(
    (a, b) =>
      a.dificultadLineal - b.dificultadLineal ||
      (a.progressionStep ?? Number.MAX_SAFE_INTEGER) -
        (b.progressionStep ?? Number.MAX_SAFE_INTEGER) ||
      a.exercise.localeCompare(b.exercise, "es"),
  );
  const out = new Map<string, string[]>();
  for (const fila of ordenadas) {
    const code = normalizarCodigo(fila.route);
    const nombre = fila.exercise.trim();
    if (!code || !nombre) continue;
    const lista = out.get(code) ?? [];
    if (!lista.includes(nombre)) lista.push(nombre);
    out.set(code, lista);
  }
  return out;
}
