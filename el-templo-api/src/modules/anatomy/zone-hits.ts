/**
 * Fase 200 D17/D18: hits de "Hoy en tu clase", calculados en el server porque
 * CI no corre tests del app. Por zona del dibujo, qué músculos trabaja fuerte
 * (motor + sinergista), sostiene (estabilizador) o estira (estira) un conjunto
 * de rutas. El antagonista nunca se muestra al alumno (D14) y los músculos sin
 * zona (profundos, D10) no aparecen.
 */
import { MUSCULOS } from "./content/musculos";
import type { MusculoId } from "./content/musculos";
import type { ZonaSlug } from "./content/regiones";
import { RUTAS_POR_CODIGO } from "./content/rutas";
import {
  ROM_ROLE_ZONAS,
  ZONAS_ORDEN,
  normalizarCodigo,
  zonasDeEjercicio,
  zonasDelBloque,
} from "./projection";
import type { EjercicioZonaInput } from "./projection";
import { GRUPO_DE_ROL, ROLES } from "./types";
import type { GrupoAlumno } from "./types";

/**
 * Hits de UNA zona. `movilidad`: zona de un bloque ROM sin ruta (el app dice
 * "Trabaja la movilidad de esta zona"). `sinDetalle`: zona de un ejercicio sin
 * ruta en el modelo (PLYO/POTENCIA/KL, D2): el app dice "Este bloque trabaja
 * esta zona", sin músculos ni roles.
 */
export interface HitsZona {
  fuerte: MusculoId[];
  sostiene: MusculoId[];
  estira: MusculoId[];
  movilidad?: true;
  sinDetalle?: true;
}

/** Músculos con zona: id, zona y posición en `MUSCULOS` (orden de salida). */
const MUSCULO_CON_ZONA: ReadonlyMap<
  string,
  { id: MusculoId; zona: ZonaSlug; orden: number }
> = new Map(
  MUSCULOS.flatMap(
    (m, orden): [string, { id: MusculoId; zona: ZonaSlug; orden: number }][] =>
      m.zona ? [[m.id, { id: m.id, zona: m.zona.slug, orden }]] : [],
  ),
);

/** Orden de un id en `MUSCULOS`. */
function ordenDe(id: MusculoId): number {
  return MUSCULO_CON_ZONA.get(id)?.orden ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Códigos de ruta (normalizados) del modelo que aparecen en los ejercicios, sin
 * repetir y en orden de aparición. Descarta vacíos y desconocidos.
 */
export function rutasDistintas(
  ejercicios: readonly EjercicioZonaInput[],
): string[] {
  const out: string[] = [];
  for (const e of ejercicios) {
    const code = normalizarCodigo(e.route);
    if (code && RUTAS_POR_CODIGO.has(code) && !out.includes(code)) {
      out.push(code);
    }
  }
  return out;
}

/**
 * Hits por zona de un conjunto de rutas. Cada rol con grupo de alumno
 * (`GRUPO_DE_ROL`) suma el id del músculo al grupo de su zona, sin repetir; los
 * ids salen en el orden de `MUSCULOS` y las zonas en el de `ZONAS_ORDEN`. Un
 * código que no está en el modelo se ignora. Sin claves vacías.
 */
export function zoneHitsDeRutas(
  codes: readonly string[],
): Partial<Record<ZonaSlug, HitsZona>> {
  const acumulado = new Map<ZonaSlug, Record<GrupoAlumno, Set<MusculoId>>>();
  for (const code of codes) {
    const ruta = RUTAS_POR_CODIGO.get(normalizarCodigo(code));
    if (!ruta) continue;
    for (const rol of ROLES) {
      const grupo = GRUPO_DE_ROL[rol];
      if (grupo === null) continue;
      for (const rel of ruta.relaciones[rol]) {
        const musculo = MUSCULO_CON_ZONA.get(rel.m);
        if (!musculo) continue;
        let porGrupo = acumulado.get(musculo.zona);
        if (!porGrupo) {
          porGrupo = {
            fuerte: new Set(),
            sostiene: new Set(),
            estira: new Set(),
          };
          acumulado.set(musculo.zona, porGrupo);
        }
        porGrupo[grupo].add(musculo.id);
      }
    }
  }
  const out: Partial<Record<ZonaSlug, HitsZona>> = {};
  for (const zona of ZONAS_ORDEN) {
    const porGrupo = acumulado.get(zona);
    if (!porGrupo) continue;
    out[zona] = {
      fuerte: [...porGrupo.fuerte].sort((a, b) => ordenDe(a) - ordenDe(b)),
      sostiene: [...porGrupo.sostiene].sort((a, b) => ordenDe(a) - ordenDe(b)),
      estira: [...porGrupo.estira].sort((a, b) => ordenDe(a) - ordenDe(b)),
    };
  }
  return out;
}

/**
 * Hits de un BLOQUE (D18): los de sus rutas distintas, más una entrada marcada
 * por cada zona que el cuerpo pinta (`zonasDelBloque`) y que las rutas no
 * cubren, así el chip marcado y la hoja coinciden con lo que pinta el cuerpo:
 *  - bloque ROM sin ejercicios con zona: fallback por rol (`ROM_ROLE_ZONAS`),
 *    `movilidad: true` (no inventa músculos ni roles);
 *  - ejercicios sin ruta con zonas (`ZONAS_SIN_RUTA`: PLYO/POTENCIA/KL, D2):
 *    `sinDetalle: true`.
 */
export function zoneHitsDelBloque(
  ejercicios: readonly EjercicioZonaInput[],
  role: string,
): Partial<Record<ZonaSlug, HitsZona>> {
  const hits = zoneHitsDeRutas(rutasDistintas(ejercicios));
  const deEjercicios = new Set<ZonaSlug>();
  for (const e of ejercicios) {
    for (const z of zonasDeEjercicio(e)) deEjercicios.add(z);
  }
  const pintadas = zonasDelBloque(ejercicios, role);
  const esFallbackRom =
    deEjercicios.size === 0 && ROM_ROLE_ZONAS[role] !== undefined;
  const out: Partial<Record<ZonaSlug, HitsZona>> = {};
  for (const zona of ZONAS_ORDEN) {
    const propios = hits[zona];
    if (propios) {
      out[zona] = propios;
    } else if (pintadas.includes(zona)) {
      out[zona] = esFallbackRom
        ? { fuerte: [], sostiene: [], estira: [], movilidad: true }
        : { fuerte: [], sostiene: [], estira: [], sinDetalle: true };
    }
  }
  return out;
}
