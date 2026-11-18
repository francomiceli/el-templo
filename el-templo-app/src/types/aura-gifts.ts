import type { GiftReasonCode } from 'src/constants/gift-reasons'

/**
 * Fase 215: contratos del regalo de Aura entre alumnos (API, plan 06). Espejo de las
 * respuestas de `el-templo-api/src/modules/aura/gift-schemas.ts`. La app no decide ninguna
 * regla: pinta lo que manda el servidor.
 */

/** Una clase por la que el alumno todavía puede regalar. GET /members/aura/gifts/pending */
export interface PendingGift {
  attendanceId: number
  /** YYYY-MM-DD, en la zona de la sede. */
  sessionDate: string
  startTime: string
  activityName: string
  /** Último día (YYYY-MM-DD) en que se puede dar. */
  expiresOn: string
}

/**
 * Regalo ya dado hoy. GET /members/aura/gifts/pending (campo `givenToday`).
 *
 * Con `receiver.anonymous` (quien recibió hoy está oculto de las listas o no tiene nombre) el
 * nombre viene "" y no hay inicial ni foto: el texto dice solo cuánto y por qué ("Diste 1 de Aura
 * por Constancia"), sin nombrar a nadie ni decir "Alguien".
 */
export interface GivenGift {
  attendanceId: number
  receiver: {
    firstName: string
    lastInitial: string | null
    photoUrl: string | null
    anonymous: boolean
  }
  reason: GiftReasonCode
  /** Puntos que se dieron. */
  amount: number
}

/**
 * Por qué no puede dar Aura aunque tenga algo para regalar. Hoy solo `oculto`: tiene plan pero
 * está oculto de las listas. Null en cualquier otro caso (sin plan o Wellhub, staff, sin nada
 * para regalar): no se le muestra ningún texto.
 */
export type GiftUnavailableReason = 'oculto'

/** GET /members/aura/gifts/pending */
export interface PendingGiftsResponse {
  pending: PendingGift[]
  givenToday: GivenGift[]
  /** Opcional: una API anterior a esta revisión no lo manda y se trata como null. */
  unavailableReason?: GiftUnavailableReason | null
}

/** Un compañero al que se puede regalar. GET /members/aura/gifts/candidates?attendanceId= */
export interface GiftCandidate {
  receiverAttendanceId: number
  firstName: string
  lastInitial: string | null
  photoUrl: string | null
  /** `tope_semanal`: ya recibió 2 regalos suyos esta semana (D-05). */
  blockedReason: 'tope_semanal' | null
}

/** GET /members/aura/gifts/candidates?attendanceId= */
export interface GiftCandidatesResponse {
  class: { sessionDate: string; startTime: string; activityName: string }
  candidates: GiftCandidate[]
}

/** POST /members/aura/gifts (cuerpo) */
export interface GiveGiftBody {
  attendanceId: number
  receiverAttendanceId: number
  reason: GiftReasonCode
}

/** POST /members/aura/gifts (201) */
export interface GiveGiftResponse {
  receiverFirstName: string
  reason: GiftReasonCode
}

/** Códigos de error del cuerpo `{ error, message, code }` de las rutas del regalo. */
export type GiftErrorCode =
  | 'REGALO_TOPE_SEMANAL' // POST /members/aura/gifts (409)
  | 'REGALO_YA_DADO' // POST (409) y GET candidates (409)
  | 'REGALO_VENCIDO' // POST (409) y GET candidates (409)
  | 'REGALO_NO_DISPONIBLE' // POST (409)
  | 'REGALO_NO_ENCONTRADO' // POST y GET candidates (404)
