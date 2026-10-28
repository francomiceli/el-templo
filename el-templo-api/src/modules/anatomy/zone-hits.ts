/**
 * Fase 200 D17/D18: hits de "Hoy en tu clase", calculados en el server porque
 * CI no corre tests del app. Por zona del dibujo, qué músculos trabaja fuerte
 * (motor + sinergista), sostiene (estabilizador) o estira (estira) un conjunto
 * de rutas, y qué rol tiene cada ruta en esa zona. El antagonista nunca se
 * muestra al alumno (D14). Los músculos profundos (sin zona, D10) cuentan para
 * la zona de la que cuelgan (`debajoDe`): el manguito suma a Hombros.
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

/** Una ruta del bloque que toca la zona, con su grupo más fuerte en ella. */
export interface RutaHit {
  /** Código de ruta normalizado (el mismo de `rutasDistintas`). */
  ruta: string;
  /** Fuerte > sostiene > estira entre los músculos de la zona en esa ruta. */
  grupo: GrupoAlumno;
}

/**
 * Hits de UNA zona. `rutas`: una entrada por ruta distinta del bloque que toca
 * la zona (orden de aparición), para decir "Hace el movimiento en: X ·
 * Sostiene el movimiento en: Y"; vacío en `movilidad`/`sinDetalle`. `movilidad`: zona de un bloque ROM sin ruta (el app dice
 * "Trabaja la movilidad de esta zona"). `sinDetalle`: zona de un ejercicio sin
 * ruta en el modelo (PLYO/POTENCIA/KL, D2): el app dice "Este bloque trabaja
 * esta zona", sin músculos ni roles.
 */
export interface HitsZona {
  fuerte: MusculoId[];
  sostiene: MusculoId[];
  estira: MusculoId[];
  rutas: RutaHit[];
  movilidad?: true;
  sinDetalle?: true;
}

/** Prioridad de grupo (menor = más fuerte) para elegir el de la ruta en la zona. */
const PRIORIDAD_GRUPO: Readonly<Record<GrupoAlumno, number>> = {
  fuerte: 0,
  sostiene: 1,
  estira: 2,
};

/**
 * Músculos con zona de hits: id, zona y posición en `MUSCULOS` (orden de
 * salida). Los profundos cuentan en la región de su `debajoDe`.
 */
const MUSCULO_CON_ZONA: ReadonlyMap<
  string,
  { id: MusculoId; zona: ZonaSlug; orden: number }
> = new Map(
  MUSCULOS.flatMap(
    (m, orden): [string, { id: MusculoId; zona: ZonaSlug; orden: number }][] => {
      const zona = m.zona?.slug ?? ("debajoDe" in m ? m.debajoDe : undefined);
      return zona ? [[m.id, { id: m.id, zona, orden }]] : [];
    },
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
 * código que no está en el modelo se ignora. Sin claves vacías. `rutas`: por
 * zona, cada ruta que la toca (orden de `codes`, sin repetir) con su grupo más
 * fuerte.
 */
export function zoneHitsDeRutas(
  codes: readonly string[],
): Partial<Record<ZonaSlug, HitsZona>> {
  const acumulado = new Map<ZonaSlug, Record<GrupoAlumno, Set<MusculoId>>>();
  const rutasPorZona = new Map<ZonaSlug, Map<string, GrupoAlumno>>();
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
        let deRutas = rutasPorZona.get(musculo.zona);
        if (!deRutas) {
          deRutas = new Map();
          rutasPorZona.set(musculo.zona, deRutas);
        }
        const previo = deRutas.get(ruta.code);
        if (
          previo === undefined ||
          PRIORIDAD_GRUPO[grupo] < PRIORIDAD_GRUPO[previo]
        ) {
          deRutas.set(ruta.code, grupo);
        }
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
      rutas: [...(rutasPorZona.get(zona) ?? [])].map(([ruta, grupo]) => ({
        ruta,
        grupo,
      })),
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
        ? { fuerte: [], sostiene: [], estira: [], rutas: [], movilidad: true }
        : { fuerte: [], sostiene: [], estira: [], rutas: [], sinDetalle: true };
    }
  }
  return out;
}
