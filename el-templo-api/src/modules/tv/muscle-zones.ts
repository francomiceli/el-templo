/**
 * Mapeo CURADO ejercicio -> zonas musculares para la intro "el recorrido de
 * hoy" de la TV de sucursal.
 *
 * Modulo PURO (sin DB, sin Fastify): el servicio le pasa los datos del
 * ejercicio que trae `class-day.ts` y obtiene las zonas a pintar en los
 * cuerpos H/M del kiosco/admin. Las tres tablas de abajo son datos, no logica:
 * se van a ajustar con sesiones reales, asi que el criterio es "tabla explicita
 * y comentada" y no una heuristica.
 *
 * Fuentes (en este orden de aporte, todas se SUMAN):
 *   1. `exercises.category`          -> CATEGORY_ZONAS (patron principal)
 *   2. `exercises.category_secondary`-> SECONDARY_ZONAS (match por "contiene")
 *   3. `exercises.route`             -> ROUTE_ZONAS (match exacto)
 *
 * Normalizacion: el CSV de ejercicios trae espacios finales y mayusculas
 * mezcladas, asi que todo se compara con `trim().toUpperCase()` y los espacios
 * internos repetidos se colapsan. `null`/vacio/desconocido no aporta zonas (y
 * nunca tira).
 */
import type { TvZonaMuscular } from "./types";

/**
 * Orden estable de las zonas (= orden de declaracion de `TvZonaMuscular`).
 * Toda salida de este modulo se ordena con esta lista: el payload del poll no
 * cambia de forma entre dos polls consecutivos por un orden de insercion.
 */
export const ZONAS_ORDEN: readonly TvZonaMuscular[] = [
  "chest",
  "deltoids",
  "triceps",
  "biceps",
  "forearm",
  "trapezius",
  "upper-back",
  "lower-back",
  "abs",
  "obliques",
  "gluteal",
  "quadriceps",
  "hamstring",
  "adductors",
  "calves",
];

/**
 * 1) Patron principal (`exercises.category`). Clave = valor normalizado.
 * Las categorias que no estan (CARDIO, DESPLAZAMIENTO, COORDINATIVO, MOVILIDAD,
 * ESTABILIDAD) quedan SIN zonas a proposito: no tienen un musculo "dueno".
 */
const CATEGORY_ZONAS: Record<string, readonly TvZonaMuscular[]> = {
  "PULL VERTICAL": ["upper-back", "biceps", "forearm"],
  "PULL HORIZONTAL": ["upper-back", "biceps", "trapezius", "deltoids"],
  "PUSH HORIZONTAL": ["chest", "triceps", "deltoids"],
  "PUSH VERTICAL": ["deltoids", "triceps", "trapezius"],
  "HIP DOMINANT": ["gluteal", "hamstring", "lower-back"],
  "KNEE DOMINANT": ["quadriceps", "gluteal", "adductors"],
  LUNGE: ["quadriceps", "gluteal", "adductors"],
  "CORE ANTERIOR": ["abs", "obliques"],
  CORE: ["abs", "obliques"],
  "CORE LATERAL": ["obliques", "abs"],
  OBLICUOS: ["obliques", "abs"],
  "CORE POSTERIOR": ["lower-back", "gluteal"],
  BRIDGE: ["lower-back", "gluteal", "deltoids"],
  SPAGAT: ["hamstring", "adductors"],
  PLYO: ["quadriceps", "gluteal", "calves"],
  POTENCIA: ["quadriceps", "gluteal", "calves"],
  UPPER: ["deltoids", "chest", "upper-back"],
};

/**
 * 2) Categoria secundaria (`exercises.category_secondary`). A diferencia de la
 * principal, es texto libre ("STRAIGHT ARM / ABS", "QUADS", ...): se busca por
 * "CONTIENE" cada clave y se SUMAN las zonas de todas las que matchean.
 * Una clave que no esta aca no aporta nada.
 */
const SECONDARY_ZONAS: Record<string, readonly TvZonaMuscular[]> = {
  "STRAIGHT ARM": ["abs"],
  QUADS: ["quadriceps"],
  ISQUIOS: ["hamstring"],
  GLUTES: ["gluteal"],
  GLUTE: ["gluteal"],
  ABS: ["abs"],
  OBLICUOS: ["obliques"],
  ESPINALES: ["lower-back"],
  "CORE ANTERIOR": ["abs"],
  "CORE POSTERIOR": ["lower-back"],
  "LOWER ANTERIOR": ["quadriceps"],
  "LOWER POSTERIOR": ["hamstring", "gluteal"],
  PIKE: ["hamstring", "abs"],
};

/**
 * 3) Ruta del ejercicio (`exercises.route`), match EXACTO. Solo las rutas cuyo
 * trabajo muscular no sale de la categoria (toe to bar, L-sit).
 */
const ROUTE_ZONAS: Record<string, readonly TvZonaMuscular[]> = {
  TTB: ["abs", "obliques"],
  "MN/RP": ["abs", "triceps"],
};

/**
 * Fallback por rol para los bloques ROM (sabado): el dia se estructura por zona
 * del cuerpo y sus ejercicios (movilidad/ROM) suelen no tener categoria de
 * fuerza, asi que sin esto el bloque quedaria sin pintar.
 */
const ROM_ROLE_ZONAS: Record<string, readonly TvZonaMuscular[]> = {
  ROM_LOWER: ["quadriceps", "hamstring", "gluteal", "adductors", "calves"],
  ROM_CORE: ["abs", "obliques", "lower-back"],
  ROM_UPPER: ["deltoids", "chest", "upper-back"],
};

/** Datos del ejercicio que el mapeo necesita (todo nullable: hay prescripciones sin fila en `exercises`). */
export interface EjercicioZonaInput {
  category: string | null | undefined;
  categorySecondary: string | null | undefined;
  route: string | null | undefined;
}

/** `trim().toUpperCase()` + colapso de espacios internos. `""` si es null/undefined. */
function normalizar(valor: string | null | undefined): string {
  if (!valor) return "";
  return valor.trim().replace(/\s+/g, " ").toUpperCase();
}

/** Ordena y deduplica segun `ZONAS_ORDEN`. */
function ordenar(zonas: Iterable<TvZonaMuscular>): TvZonaMuscular[] {
  const set = new Set(zonas);
  return ZONAS_ORDEN.filter((z) => set.has(z));
}

/** Zonas (SIN ordenar, con posibles repetidas) de un ejercicio. */
function acumularZonas(
  ejercicio: EjercicioZonaInput,
  out: Set<TvZonaMuscular>,
) {
  const category = normalizar(ejercicio.category);
  for (const z of CATEGORY_ZONAS[category] ?? []) out.add(z);

  const secondary = normalizar(ejercicio.categorySecondary);
  if (secondary) {
    for (const [clave, zonas] of Object.entries(SECONDARY_ZONAS)) {
      if (secondary.includes(clave)) for (const z of zonas) out.add(z);
    }
  }

  const route = normalizar(ejercicio.route);
  for (const z of ROUTE_ZONAS[route] ?? []) out.add(z);
}

/**
 * Zonas musculares de UN ejercicio: union de categoria + secundaria + ruta,
 * sin repetidas y en el orden estable de `ZONAS_ORDEN`.
 */
export function zonasDeEjercicio(
  ejercicio: EjercicioZonaInput,
): TvZonaMuscular[] {
  const out = new Set<TvZonaMuscular>();
  acumularZonas(ejercicio, out);
  return ordenar(out);
}

/**
 * Una zona entra al grupo si aparece en al menos esta fracción de los
 * ejercicios de la zona MÁS frecuente del grupo. Con datos reales (W26) la
 * unión pura pintaba casi el cuerpo entero: un ejercicio suelto de tracción en
 * un NUCLEUS de piernas encendía dorsales/bíceps/hombros. 0.4 conserva las
 * zonas que el bloque trabaja de verdad (p. ej. glúteos + cuádriceps +
 * isquios en un bloque de piernas) y descarta las de ejercicios aislados.
 */
export const UMBRAL_DOMINANCIA = 0.4;

/**
 * Zonas de un GRUPO de ejercicios (las prescripciones `main` de los bloques de
 * un grupo visual, en los niveles que muestra la TV): las DOMINANTES
 * (`UMBRAL_DOMINANCIA`), sin repetidas y en orden estable. Cada ejercicio
 * suma 1 a cada una de sus zonas. Si no queda ninguna y alguno de los `roles`
 * es ROM_*, cae al fallback por rol (`ROM_ROLE_ZONAS`).
 */
export function zonasDelGrupo(
  ejercicios: readonly EjercicioZonaInput[],
  roles: readonly string[] = [],
): TvZonaMuscular[] {
  const cuenta = new Map<TvZonaMuscular, number>();
  for (const e of ejercicios) {
    const propias = new Set<TvZonaMuscular>();
    acumularZonas(e, propias);
    for (const z of propias) cuenta.set(z, (cuenta.get(z) ?? 0) + 1);
  }
  const max = Math.max(0, ...cuenta.values());
  const out = new Set<TvZonaMuscular>();
  for (const [z, n] of cuenta) {
    if (n >= max * UMBRAL_DOMINANCIA) out.add(z);
  }
  if (out.size === 0) {
    for (const role of roles) {
      for (const z of ROM_ROLE_ZONAS[role] ?? []) out.add(z);
    }
  }
  return ordenar(out);
}

// =============================================================================
// Grupos de zona (fase 197, D-10): los 6 chips del app
// =============================================================================
//
// La canasta de bloques libres del app (tab Libre) filtra por GRUPO, no por
// zona: tocar gemelos elige Piernas. El mapeo ejercicio -> zonas sigue siendo
// uno solo (el de arriba); esto solo agrupa su salida.

/** Los 6 grupos de la tab Libre (D-10). */
export type GrupoZona =
  | "hombros"
  | "pecho"
  | "espalda"
  | "core"
  | "piernas"
  | "brazos";

/** Orden estable de los grupos (= orden de los chips del app). */
export const GRUPOS_ORDEN: readonly GrupoZona[] = [
  "hombros",
  "pecho",
  "espalda",
  "core",
  "piernas",
  "brazos",
];

/** Zonas de cada grupo. Cada una de las 15 zonas está en exactamente un grupo. */
export const GRUPOS_ZONA: Readonly<
  Record<GrupoZona, readonly TvZonaMuscular[]>
> = {
  hombros: ["deltoids"],
  pecho: ["chest"],
  espalda: ["upper-back", "lower-back", "trapezius"],
  core: ["abs", "obliques"],
  piernas: ["quadriceps", "hamstring", "gluteal", "calves", "adductors"],
  brazos: ["biceps", "triceps", "forearm"],
};

/** Índice inverso zona -> grupo, derivado de `GRUPOS_ZONA` (no se duplica la tabla). */
const GRUPO_POR_ZONA: ReadonlyMap<TvZonaMuscular, GrupoZona> = new Map(
  GRUPOS_ORDEN.flatMap((grupo) =>
    GRUPOS_ZONA[grupo].map(
      (zona): [TvZonaMuscular, GrupoZona] => [zona, grupo],
    ),
  ),
);

/** Grupo al que pertenece una zona (gemelos -> piernas, trapecio -> espalda). */
export function grupoDeZona(z: TvZonaMuscular): GrupoZona {
  const grupo = GRUPO_POR_ZONA.get(z);
  if (!grupo) throw new Error(`Zona sin grupo: ${z}`);
  return grupo;
}

/** Grupos que tocan las zonas dadas, sin repetidos y en el orden `GRUPOS_ORDEN`. */
export function gruposDeZonas(zonas: Iterable<TvZonaMuscular>): GrupoZona[] {
  const set = new Set<GrupoZona>();
  for (const z of zonas) set.add(grupoDeZona(z));
  return GRUPOS_ORDEN.filter((g) => set.has(g));
}

/**
 * Zonas de un BLOQUE para la canasta/Semana del app: la UNIÓN de las zonas de
 * sus ejercicios, sin repetidas y en el orden de `ZONAS_ORDEN`.
 *
 * Distinto de `zonasDelGrupo` (TV), que aplica dominancia
 * (`UMBRAL_DOMINANCIA`): la TV pinta el cuerpo de una clase entera y necesita
 * descartar ruido. La canasta necesita lo contrario: que el bloque aparezca en
 * CADA zona que trabaja alguno de sus ejercicios (corpus §3: la baja
 * selectividad se corrige con el orden por relevancia, `ejerciciosPorGrupo`,
 * no recortando zonas).
 *
 * Si la unión queda vacía y `role` es ROM_*, cae al fallback por rol.
 */
export function zonasDelBloque(
  ejercicios: readonly EjercicioZonaInput[],
  role: string,
): TvZonaMuscular[] {
  const out = new Set<TvZonaMuscular>();
  for (const e of ejercicios) acumularZonas(e, out);
  if (out.size === 0) {
    for (const z of ROM_ROLE_ZONAS[role] ?? []) out.add(z);
  }
  return ordenar(out);
}

/**
 * Por grupo, cuántos ejercicios del bloque tienen al menos una zona del grupo
 * (insumo del orden por relevancia, D-09). Los 6 grupos están siempre como
 * clave. Si todos dan 0 y el rol es ROM con fallback, cada grupo del fallback
 * vale 1.
 */
export function ejerciciosPorGrupo(
  ejercicios: readonly EjercicioZonaInput[],
  role: string,
): Record<GrupoZona, number> {
  const cuenta: Record<GrupoZona, number> = {
    hombros: 0,
    pecho: 0,
    espalda: 0,
    core: 0,
    piernas: 0,
    brazos: 0,
  };
  for (const e of ejercicios) {
    const propias = new Set<TvZonaMuscular>();
    acumularZonas(e, propias);
    for (const g of gruposDeZonas(propias)) cuenta[g] += 1;
  }
  const hayAlgo = GRUPOS_ORDEN.some((g) => cuenta[g] > 0);
  if (!hayAlgo) {
    for (const g of gruposDeZonas(ROM_ROLE_ZONAS[role] ?? [])) cuenta[g] = 1;
  }
  return cuenta;
}
