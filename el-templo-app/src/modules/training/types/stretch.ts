/**
 * Tipos del estiramiento post-clase (fase 213).
 *
 * Espejo de `el-templo-api/src/modules/sessions/stretch-service.ts` y
 * `stretch-schemas.ts`: mismos nombres de campo, la app no agrega ni renombra nada.
 */

/** Estado de la oferta de hoy: sin oferta, ofrecida o ya hecha. */
export type StretchStatus = 'none' | 'available' | 'done'

/** Familia de movilidad del ejercicio (catálogo del estiramiento). */
export type StretchFamily = 'LS' | 'MN' | 'FL' | 'TTB' | 'TS'

export interface StretchExercise {
  exerciseId: number
  name: string
  family: StretchFamily
  /** 1 = un solo lado, 2 = se hace de cada lado */
  sides: number
  secondsPerSide: number
  /** Segundos de pausa/transición antes de este ejercicio */
  transitionSeconds: number
  videoUrl: string | null
}

/** `GET /sessions/stretch/today` */
export interface StretchTodayResponse {
  status: StretchStatus
  /** Día local de la sede (YYYY-MM-DD); "" cuando el servidor no pudo resolver el día */
  localDate: string
  offerId: number | null
  minutes: number | null
  plannedSeconds: number | null
  exercises: StretchExercise[]
  completedAt: string | null
  auraAwarded: boolean
}

export type StretchEventType = 'card_seen' | 'started' | 'push_opened'
export type StretchEventFrom = 'card' | 'push'

/** Body de `POST /sessions/stretch/events` */
export interface StretchEventRequest {
  type: StretchEventType
  from?: StretchEventFrom
}

/** Body de `POST /sessions/stretch/complete` */
export interface StretchCompleteRequest {
  offerId: number
  exercisesCompleted: number[]
}

/** Respuesta de `POST /sessions/stretch/complete` */
export interface StretchCompleteResponse {
  completedAt: string
  durationSeconds: number | null
  allDone: boolean
  auraAwarded: boolean
  alreadyCompleted: boolean
  /** Minutos para la pantalla "Listo. X minutos de estiramiento" */
  minutes: number
}
