/**
 * Fase 214: tipos de la comunidad (anotados de un horario), la foto de perfil y el
 * detalle privado de Aura. Contratos del servidor (planes 11 a 18).
 */

export type PhotoStatus = 'none' | 'pendiente' | 'aprobada' | 'rechazada'

export type PhotoRejectionReason = 'sin_cara' | 'no_es_propia' | 'contenido' | 'otro'

/** Estado de la foto propia, tal como lo devuelve `GET /auth/me` (campo `photo`). */
export interface MemberPhotoState {
  url: string | null
  status: PhotoStatus
  pendingUrl: string | null
  rejectionReason: PhotoRejectionReason | null
}

export type AttendeesReason = 'ok' | 'sin_plan' | 'oculto'

export interface Attendee {
  firstName: string
  lastInitial: string
  photoUrl: string | null
  photoId: number | null
  aura: number | null
  isMe: boolean
}

export interface SlotAttendees {
  total: number
  canSeeList: boolean
  reason: AttendeesReason
  attendees: Attendee[]
  hiddenCount: number
  viewer: { visible: boolean; noticeSeen: boolean }
}

export interface AuraMovement {
  id: number
  amount: number
  label: string
  createdAt: string
}

export interface AuraMovementsPage {
  earned: number
  movements: AuraMovement[]
  nextBefore: number | null
}
