/**
 * Espejo A PROPÓSITO de GET /api/anatomy (fase 200). Cambiar los dos juntos.
 *
 * Fuente: `el-templo-api/src/modules/anatomy/serializers.ts` (VistaAlumno y derivados) y
 * `el-templo-api/src/modules/anatomy/zone-hits.ts` (HitsZona, que viaja en los bloques de
 * /weekly y /daily). Solo tipos: la vista de alumno NO trae códigos de ruta, antagonista,
 * banderas ni ficha de profe.
 */
import type { ZoneGroup, ZoneSlug } from 'src/components/anatomy/zones'

/** Vista de la figura en la que se dibuja una zona. */
export type VistaFigura = 'front' | 'back' | 'both'

/** Los tres grupos de alumno (D14): trabaja fuerte · te sostiene · se estira. */
export type GrupoAlumno = 'fuerte' | 'sostiene' | 'estira'

export type PatronRuta = 'PUSH' | 'PULL' | 'LOWER' | 'CORE' | 'MOVILIDAD' | 'FLOW'

/** Región del dibujo (16): una zona tocable, con los ids de los músculos que la componen. */
export interface RegionAlumno {
  slug: ZoneSlug
  nombre: string
  vista: VistaFigura
  grupo: ZoneGroup
  /**
   * Ids de los músculos con esta zona, en orden (más de uno = la zona es un grupo). Al final van los
   * profundos que cuelgan de ella (`MusculoAlumno.adentro`), los "más adentro".
   */
  musculos: string[]
}

export interface ZonaMusculoAlumno {
  slug: ZoneSlug
  vista: VistaFigura
}

export interface MusculoAlumno {
  id: string
  nombre: string
  /** `null` = músculo profundo, no se ve en el dibujo ("los que no se ven"). */
  zona: ZonaMusculoAlumno | null
  /** Profundo: región de cuya hoja cuelga ("más adentro"); `null` si se ve en el dibujo. */
  debajoDe: ZoneSlug | null
  /** `true` si es profundo (`debajoDe !== null`): la hoja de su zona lo marca "más adentro". */
  adentro: boolean
  /** Una frase en tono alumno. */
  queHace: string
  /** Slugs de ruta (nunca códigos) por grupo de alumno. */
  grupos: { fuerte: string[]; sostiene: string[]; estira: string[] }
}

export interface FichaCortaAlumno {
  que: string | null
  siente: string | null
  tips: string[] | null
  errores: { error: string; texto: string }[] | null
}

export interface RutaAlumno {
  slug: string
  /** Nombre de la ruta (D1), nunca el código. */
  nombre: string
  patron: PatronRuta
  zonas: { slug: ZoneSlug; vista: VistaFigura; grupo: 'fuerte' | 'sostiene' }[]
  /** Nombres de músculos. */
  fuerte: string[]
  sostiene: string[]
  /** `null` = ruta sin ficha corta todavía ("Pronto"). */
  fichaCorta: FichaCortaAlumno | null
}

/** Texto de cada grupo de alumno: la frase del rótulo y su (i). */
export interface GrupoAlumnoInfo {
  id: GrupoAlumno
  frase: string
  definicion: string
}

export interface VistaAlumno {
  regiones: RegionAlumno[]
  musculos: MusculoAlumno[]
  rutas: RutaAlumno[]
  grupos: GrupoAlumnoInfo[]
}

/** Una ruta del bloque que toca la zona, con su grupo más fuerte en ella (fuerte > sostiene > estira). */
export interface RutaHit {
  /** Código de ruta normalizado (el mismo que traen los ejercicios del bloque). */
  ruta: string
  grupo: GrupoAlumno
}

/**
 * Qué pega un bloque en una zona (campo `zoneHits` de los bloques de /weekly y /daily):
 * ids de músculos por grupo (los profundos cuentan en la zona de la que cuelgan) y `rutas`: una
 * entrada por ruta distinta del bloque que toca la zona (vacío en `movilidad`/`sinDetalle`).
 * `movilidad` = bloque de ROM sin ruta; `sinDetalle` = bloque sin ruta
 * (p. ej. pliometría): la zona se marca pero no hay detalle por músculo.
 */
export interface HitsZona {
  fuerte: string[]
  sostiene: string[]
  estira: string[]
  rutas: RutaHit[]
  movilidad?: true
  sinDetalle?: true
}
