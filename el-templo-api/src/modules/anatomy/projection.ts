/**
 * Fase 200 D20: proyección del modelo de anatomía a las zonas del dibujo.
 * Reemplaza al mapeo anterior por categoría de la TV, con las mismas firmas.
 * Regla: motor ∪ sinergista; si queda vacío (movilidad/flow), estabilizador ∪
 * estira. Las diferencias con la TV pre-200 están en
 * content/diferencias-aprobadas.ts.
 *
 * Módulo PURO (sin DB, sin Fastify): el servicio le pasa los datos del
 * ejercicio (ruta + categoría) y obtiene las zonas a pintar. Toda salida se
 * ordena con `ZONAS_ORDEN`: el payload del poll no cambia de forma entre dos
 * polls consecutivos por un orden de inserción.
 *
 * Normalización: el CSV de ejercicios trae espacios finales y mayúsculas
 * mezcladas, así que todo se compara con `trim().toUpperCase()` y los espacios
 * internos repetidos se colapsan. `null`/vacío/desconocido no aporta zonas (y
 * nunca tira).
 */
import { MUSCULOS } from "./content/musculos";
import { REGIONES } from "./content/regiones";
import type { TvZonaSlug, ZonaSlug } from "./content/regiones";
import { RUTAS, RUTAS_POR_CODIGO } from "./content/rutas";
import type { GrupoZona, RutaContenido, Rol } from "./types";

export type { GrupoZona } from "./types";

/**
 * Orden estable de las zonas (= orden de `REGIONES`: las 15 de la TV y
 * `tibialis` al final).
 */
export const ZONAS_ORDEN: readonly ZonaSlug[] = REGIONES.map((r) => r.slug);

/** Las 15 zonas que viajan a la TV (`enTv`), en el orden del contrato del poll. */
export const ZONAS_TV: readonly TvZonaSlug[] = REGIONES.flatMap((r) =>
  r.enTv ? [r.slug] : [],
);

const ZONAS_TV_SET: ReadonlySet<ZonaSlug> = new Set<ZonaSlug>(ZONAS_TV);

/** Deja solo las zonas que viajan a la TV (`tibialis` queda fuera en v1). */
export function soloTv(zonas: readonly ZonaSlug[]): TvZonaSlug[] {
  return zonas.filter((z): z is TvZonaSlug => ZONAS_TV_SET.has(z));
}

/**
 * Datos del ejercicio que la proyección necesita (todo nullable: hay
 * prescripciones sin fila en `exercises`). Sin categoría secundaria: el
 * "contiene" del mapeo anterior desaparece (§4.3.3).
 */
export interface EjercicioZonaInput {
  route: string | null | undefined;
  category: string | null | undefined;
}

/**
 * Convierte una prescripción/ejercicio al input de la proyección. Unifica los
 * dos conversores idénticos que había (sesiones y bloques libres, DRY).
 */
export function zonaInputDe(ex: {
  exerciseRoute?: string | null;
  category?: string | null;
}): EjercicioZonaInput {
  return { route: ex.exerciseRoute, category: ex.category };
}

/**
 * Slug de la ruta del ejercicio en el modelo (la figura del player la busca en
 * la vista de anatomía del alumno). `null` si el ejercicio no tiene ruta o la
 * ruta no está modelada: ahí el player no dibuja el cuerpo.
 */
export function rutaSlugDe(ex: {
  exerciseRoute?: string | null;
}): string | null {
  return RUTAS_POR_CODIGO.get(normalizarCodigo(ex.exerciseRoute))?.slug ?? null;
}

/** `trim().toUpperCase()` + colapso de espacios internos. `""` si es null/undefined. */
export function normalizarCodigo(valor: string | null | undefined): string {
  if (!valor) return "";
  return valor.trim().replace(/\s+/g, " ").toUpperCase();
}

/** Ordena y deduplica según `ZONAS_ORDEN`. */
function ordenar(zonas: Iterable<ZonaSlug>): ZonaSlug[] {
  const set = new Set(zonas);
  return ZONAS_ORDEN.filter((z) => set.has(z));
}

// =============================================================================
// Ruta -> zonas (índice precalculado al cargar el módulo)
// =============================================================================

/** Zona del dibujo de cada músculo con zona (los profundos no aparecen). */
const ZONA_DE_MUSCULO: ReadonlyMap<string, ZonaSlug> = new Map(
  MUSCULOS.flatMap((m): [string, ZonaSlug][] =>
    m.zona ? [[m.id, m.zona.slug]] : [],
  ),
);

/** Zonas de los músculos que la ruta lista en alguno de los roles dados. */
function zonasDeRoles(
  ruta: RutaContenido,
  roles: readonly Rol[],
): Set<ZonaSlug> {
  const out = new Set<ZonaSlug>();
  for (const rol of roles) {
    for (const rel of ruta.relaciones[rol]) {
      const zona = ZONA_DE_MUSCULO.get(rel.m);
      if (zona) out.add(zona);
    }
  }
  return out;
}

/**
 * Regla D20 / Pitfall 4: motor ∪ sinergista; si no queda ninguna zona (SPAGAT
 * no tiene motores, PIKE solo flexores de cadera profundos), estabilizador ∪
 * estira.
 */
function calcularZonasDeRuta(ruta: RutaContenido): ZonaSlug[] {
  const primarias = zonasDeRoles(ruta, ["motor", "sinergista"]);
  if (primarias.size > 0) return ordenar(primarias);
  return ordenar(zonasDeRoles(ruta, ["estabilizador", "estira"]));
}

const ZONAS_POR_RUTA: ReadonlyMap<string, readonly ZonaSlug[]> = new Map(
  RUTAS.map((ruta): [string, readonly ZonaSlug[]] => [
    ruta.code,
    calcularZonasDeRuta(ruta),
  ]),
);

/**
 * Zonas de una RUTA del modelo, en el orden de `ZONAS_ORDEN`. `[]` si el código
 * no está en el modelo (el código se normaliza igual que en `zonasDeEjercicio`).
 */
export function zonasDeRuta(code: string): ZonaSlug[] {
  return [...(ZONAS_POR_RUTA.get(normalizarCodigo(code)) ?? [])];
}

/**
 * Fallback explícito por categoría para los ejercicios SIN ruta del modelo
 * (D2). Las demás categorías (CARDIO, COORDINATIVO, ESTABILIDAD) no aportan.
 * `LUNGE` y `KNEE DOMINANT` son interinos: cubren los 5 SISSY hasta que corra
 * la migración que los asigna a una ruta.
 */
export const ZONAS_SIN_RUTA: Readonly<Record<string, readonly ZonaSlug[]>> = {
  PLYO: ["gluteal", "quadriceps", "calves"],
  POTENCIA: ["gluteal", "quadriceps", "calves"],
  LUNGE: ["quadriceps", "gluteal", "adductors"],
  "KNEE DOMINANT": ["quadriceps", "gluteal", "adductors"],
};

/**
 * Fallback por rol para los bloques ROM (sábado): el día se estructura por zona
 * del cuerpo y sus ejercicios (movilidad/ROM) suelen no tener ruta, así que
 * sin esto el bloque quedaría sin pintar.
 */
export const ROM_ROLE_ZONAS: Readonly<Record<string, readonly ZonaSlug[]>> = {
  ROM_LOWER: ["quadriceps", "hamstring", "gluteal", "adductors", "calves"],
  ROM_CORE: ["abs", "obliques", "lower-back"],
  ROM_UPPER: ["deltoids", "chest", "upper-back"],
};

/**
 * Zonas de UN ejercicio: las de su ruta si está en el modelo; si no, el
 * fallback por categoría (`ZONAS_SIN_RUTA`). Sin repetidas y en orden estable.
 */
export function zonasDeEjercicio(e: EjercicioZonaInput): ZonaSlug[] {
  const code = normalizarCodigo(e.route);
  if (code && RUTAS_POR_CODIGO.has(code)) return zonasDeRuta(code);
  return ordenar(ZONAS_SIN_RUTA[normalizarCodigo(e.category)] ?? []);
}

// =============================================================================
// Zonas de un grupo de ejercicios (TV) y de un bloque (app)
// =============================================================================

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
 * suma 1 a cada una de sus zonas (las de su ruta en el modelo). Si no queda
 * ninguna y alguno de los `roles` es ROM_*, cae al fallback por rol
 * (`ROM_ROLE_ZONAS`).
 */
export function zonasDelGrupo(
  ejercicios: readonly EjercicioZonaInput[],
  roles: readonly string[] = [],
): ZonaSlug[] {
  const cuenta = new Map<ZonaSlug, number>();
  for (const e of ejercicios) {
    for (const z of zonasDeEjercicio(e)) {
      cuenta.set(z, (cuenta.get(z) ?? 0) + 1);
    }
  }
  const max = Math.max(0, ...cuenta.values());
  const out = new Set<ZonaSlug>();
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

/** Orden estable de los grupos (= orden de los chips del app). */
export const GRUPOS_ORDEN: readonly GrupoZona[] = [
  "hombros",
  "pecho",
  "espalda",
  "core",
  "piernas",
  "brazos",
];

/** Grupo de cada zona, derivado de `REGIONES[].grupo` (tibialis cae en piernas). */
const GRUPO_POR_ZONA: ReadonlyMap<ZonaSlug, GrupoZona> = new Map(
  REGIONES.map((r): [ZonaSlug, GrupoZona] => [r.slug, r.grupo]),
);

function zonasDeGrupo(grupo: GrupoZona): readonly ZonaSlug[] {
  return ZONAS_ORDEN.filter((z) => GRUPO_POR_ZONA.get(z) === grupo);
}

/**
 * Zonas de cada grupo. DERIVADO de `REGIONES[].grupo`: cada una de las 16 zonas
 * está en exactamente un grupo (T-200-12).
 */
export const GRUPOS_ZONA: Readonly<Record<GrupoZona, readonly ZonaSlug[]>> = {
  hombros: zonasDeGrupo("hombros"),
  pecho: zonasDeGrupo("pecho"),
  espalda: zonasDeGrupo("espalda"),
  core: zonasDeGrupo("core"),
  piernas: zonasDeGrupo("piernas"),
  brazos: zonasDeGrupo("brazos"),
};

/** Grupo al que pertenece una zona (gemelos -> piernas, trapecio -> espalda). */
export function grupoDeZona(z: ZonaSlug): GrupoZona {
  const grupo = GRUPO_POR_ZONA.get(z);
  if (!grupo) throw new Error(`Zona sin grupo: ${z}`);
  return grupo;
}

/** Grupos que tocan las zonas dadas, sin repetidos y en el orden `GRUPOS_ORDEN`. */
export function gruposDeZonas(zonas: Iterable<ZonaSlug>): GrupoZona[] {
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
): ZonaSlug[] {
  const out = new Set<ZonaSlug>();
  for (const e of ejercicios) {
    for (const z of zonasDeEjercicio(e)) out.add(z);
  }
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
    for (const g of gruposDeZonas(zonasDeEjercicio(e))) cuenta[g] += 1;
  }
  const hayAlgo = GRUPOS_ORDEN.some((g) => cuenta[g] > 0);
  if (!hayAlgo) {
    for (const g of gruposDeZonas(ROM_ROLE_ZONAS[role] ?? [])) cuenta[g] = 1;
  }
  return cuenta;
}
