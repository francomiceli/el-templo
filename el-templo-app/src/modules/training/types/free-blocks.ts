/**
 * Tipos de la canasta de bloques libres (fase 197 D-04, D-12, D-14).
 *
 * Espejo de las respuestas de `GET /sessions/free-blocks`, `GET /sessions/free-blocks/:blockId`
 * y `POST /sessions/free-blocks/complete`
 * (`el-templo-api/src/modules/sessions/free-blocks-service.ts`).
 */

import type { ZoneGroup, ZoneSlug } from 'src/components/anatomy/zones'
import type { Level } from 'src/modules/training/level-display'
import type { Block } from './session'

/**
 * Segundos mínimos para que un bloque libre acredite AURA (D-12).
 * Espejo de la constante del API: el servidor es quien decide, esto es solo para la UI.
 */
export const FREE_BLOCK_AURA_MIN_SECONDS = 600

/** Un bloque de la canasta: la forma de `Block` más lo de la card. */
export interface FreeBlockItem extends Block {
  /** Zonas musculares del bloque (en la canasta siempre vienen) */
  zones: ZoneSlug[]
  /** Grupos de zona del bloque (en la canasta siempre vienen) */
  groups: ZoneGroup[]
  /** "Ruta · Formato" (ROM: "Tren Inferior · Formato") */
  title: string
  /** Los primeros nombres de ejercicio, "A, B, C" */
  subtitle: string
  /** YYYY-MM-DD de la sesión donde aparece (la más reciente si hay copias) */
  lastDate: string
  /** dayId de la plani de origen */
  sourceDayId: string
  /** Nivel de la plani de origen (último segmento del dayId) */
  level: string
  /** D-04: cruza 2 o más zonas con la sesión de hoy (va al final) */
  workedToday: boolean
}

/** Respuesta de `GET /sessions/free-blocks` */
export interface FreeBlocksPage {
  items: FreeBlockItem[]
  total: number
  page: number
  limit: number
  /** false si ya cobró el AURA del bloque libre hoy */
  auraAvailableToday: boolean
  /** Zonas de la sesión de hoy (null si hoy no hay sesión) */
  todayZones: ZoneSlug[] | null
  /** Zonas que el socio ya trabajó esta semana */
  weekWorkedZones: ZoneSlug[]
}

/** Respuesta de `GET /sessions/free-blocks/:blockId` */
export interface FreeBlockDetail {
  item: FreeBlockItem
  auraAvailableToday: boolean
}

/** Body de `POST /sessions/free-blocks/complete` */
export interface FreeBlockCompleteRequest {
  blockId: string
  /** ISO 8601. El servidor calcula la duración a partir de esto */
  startedAt: string
  /** exerciseId de los ejercicios hechos */
  exercisesCompleted: number[]
  /** Fila a continuar ("Seguir entrenando") */
  completionId?: number
  /** Nivel elegido en el header (si no se manda, el composable usa el seleccionado) */
  level?: Level
}

/** Respuesta de `POST /sessions/free-blocks/complete` */
export interface FreeBlockCompleteResponse {
  completionId: number
  durationSeconds: number
  auraAwarded: boolean
  auraAvailableToday: boolean
}
