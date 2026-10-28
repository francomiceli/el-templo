/**
 * Reglas de la canasta de bloques libres como funciones PURAS (fase 197).
 *
 * Sin DB y sin imports de valor: el servicio (197-06) junta los datos y llama
 * a estas funciones, que se testean en CI sin MySQL.
 *
 *   - D-08: que roles entran en la canasta.
 *   - D-09: cuando dos apariciones son "el mismo bloque" (queda la mas reciente).
 *   - D-04: orden, filtro por grupo y "Ya lo trabajaste hoy" al final.
 */
import type { GrupoZona } from "../anatomy/projection";

/**
 * Rango de desempate por rol (menor = primero). Los `ROM_*` comparten el 5 y
 * se resuelven en `rangoDeRol`.
 */
export const RANGO_ROL: Readonly<Record<string, number>> = {
  NUCLEUS: 0,
  DEUTEROS_1: 1,
  DEUTEROS_2: 2,
  ATHLOS: 3,
  EPIKOS: 4,
};

/** Rango de todos los roles `ROM_*`. */
const RANGO_ROM = 5;

/** Rango para un rol fuera de la canasta (no deberia llegar hasta aca). */
const RANGO_DESCONOCIDO = 99;

/**
 * Fase 197 D-08: la canasta toma NUCLEUS, DEUTEROS_1, DEUTEROS_2, ATHLOS,
 * EPIKOS y ROM_*. Nunca INITIUM, TECNICA_*, STRETCHING, COMBOS_* ni las
 * variantes `*_ALT`.
 */
export function esRolDeCanasta(role: string): boolean {
  if (role.endsWith("_ALT")) return false;
  if (role.startsWith("ROM_")) return true;
  return Object.prototype.hasOwnProperty.call(RANGO_ROL, role);
}

/** Rango de desempate de un rol (NUCLEUS 0 ... EPIKOS 4, ROM_* 5). */
export function rangoDeRol(role: string): number {
  if (Object.prototype.hasOwnProperty.call(RANGO_ROL, role)) {
    return RANGO_ROL[role];
  }
  if (role.startsWith("ROM_")) return RANGO_ROM;
  return RANGO_DESCONOCIDO;
}

/** Recorta y colapsa los espacios internos (el CSV trae dobles espacios). */
export function limpiarNombre(nombre: string): string {
  return nombre.trim().replace(/\s+/g, " ");
}

/**
 * Fase 197 D-09: dos apariciones son el mismo bloque si coinciden ruta +
 * patron + format_name + lista ORDENADA de exercise_id main. El orden de los
 * ids importa a proposito.
 */
export function claveDeDuplicado(b: {
  route: string;
  pattern: string;
  formatName: string;
  exerciseIds: readonly number[];
}): string {
  return `${b.route.trim()}|${limpiarNombre(b.pattern)}|${b.formatName.trim()}|${b.exerciseIds.join(",")}`;
}

/** Una aparicion de un bloque en una sesion aprobada, lista para rankear. */
export interface CandidatoCanasta {
  blockId: string;
  dedupeKey: string;
  /** "YYYY-MM-DD" de la sesion donde aparece. */
  date: string;
  role: string;
  zones: readonly string[];
  groups: readonly GrupoZona[];
  groupHits: Readonly<Record<GrupoZona, number>>;
}

/**
 * Comparador base: fecha mas reciente primero, despues rol (NUCLEUS > ... >
 * ROM_*), despues `blockId`. Las fechas son ISO, asi que el orden de string
 * es el cronologico.
 */
function compararBase(a: CandidatoCanasta, b: CandidatoCanasta): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  const porRol = rangoDeRol(a.role) - rangoDeRol(b.role);
  if (porRol !== 0) return porRol;
  if (a.blockId === b.blockId) return 0;
  return a.blockId < b.blockId ? -1 : 1;
}

/**
 * Fase 197 D-09: por cada `dedupeKey` queda UNA aparicion, la de `date`
 * mayor (empate de fecha: menor `rangoDeRol`; empate: `blockId` menor).
 * Los ganadores conservan el orden de la lista de entrada.
 */
export function deduplicarMasReciente<T extends CandidatoCanasta>(
  items: readonly T[],
): T[] {
  const ganadores = new Map<string, T>();
  for (const item of items) {
    const actual = ganadores.get(item.dedupeKey);
    if (actual === undefined || compararBase(item, actual) < 0) {
      ganadores.set(item.dedupeKey, item);
    }
  }
  return items.filter((item) => ganadores.get(item.dedupeKey) === item);
}

/**
 * Fase 197 D-04: el bloque "ya se trabajo hoy" si cruza 2 o mas zonas con la
 * sesion de hoy. Sin sesion de hoy (`null`) nunca se marca.
 */
export function trabajadoHoy(
  zones: readonly string[],
  todayZones: readonly string[] | null,
): boolean {
  if (todayZones === null) return false;
  const hoy = new Set(todayZones);
  const comunes = new Set(zones.filter((z) => hoy.has(z)));
  return comunes.size >= 2;
}

/**
 * Fase 197 D-04: filtra por `grupo` (si viene), ordena y manda al final los
 * `workedToday` (particion estable en dos pasadas, no un comparador).
 *   - Sin grupo: fecha desc, rol, blockId.
 *   - Con grupo: solo los bloques cuyo `groups` lo incluye, por cantidad de
 *     ejercicios en el grupo (desc) y despues el mismo comparador.
 */
export function ordenarCanasta<T extends CandidatoCanasta>(
  items: readonly T[],
  opts: { grupo: GrupoZona | null; todayZones: readonly string[] | null },
): Array<T & { workedToday: boolean }> {
  const { grupo, todayZones } = opts;
  const base =
    grupo === null ? [...items] : items.filter((i) => i.groups.includes(grupo));

  base.sort((a, b) => {
    if (grupo !== null) {
      const porHits = b.groupHits[grupo] - a.groupHits[grupo];
      if (porHits !== 0) return porHits;
    }
    return compararBase(a, b);
  });

  const marcados = base.map((i) => ({
    ...i,
    workedToday: trabajadoHoy(i.zones, todayZones),
  }));
  return [
    ...marcados.filter((i) => !i.workedToday),
    ...marcados.filter((i) => i.workedToday),
  ];
}

/** Paginacion en memoria (page base 1). Pagina fuera de rango: `items: []`. */
export function paginar<T>(
  items: readonly T[],
  page: number,
  limit: number,
): { items: T[]; total: number; page: number; limit: number } {
  const desde = (page - 1) * limit;
  return {
    items: items.slice(desde, desde + limit),
    total: items.length,
    page,
    limit,
  };
}

/** Subtitulo de la card: los primeros `max` nombres limpios, con ", ". */
export function subtituloDeBloque(nombres: readonly string[], max = 3): string {
  return nombres.slice(0, max).map(limpiarNombre).join(", ");
}
