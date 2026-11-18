/**
 * Fase 215: contratos de la bandeja de notificaciones (API, plan 14). Espejo de las respuestas de
 * `el-templo-api/src/modules/notifications/inbox-schemas.ts`. La app no decide nada: pinta lo que
 * manda el servidor.
 */

/** Por qué se anuló un regalo: el staff, o se deshizo/anuló la asistencia. */
export type InboxVoidCause = 'staff' | 'asistencia'

/**
 * Datos del regalo de un aviso `aura_gift`. Con `anonymous` (quien regaló hoy está oculto de las
 * listas o no tiene nombre) `giverFirstName` viene "" y no hay inicial ni foto: el `title` y el
 * `body` ya vienen redactados sin nombre y la app no nombra ni dibuja a nadie.
 */
export interface InboxGift {
  amount: number
  giverKind: 'alumno' | 'profe'
  giverFirstName: string
  giverLastInitial: string | null
  giverPhotoUrl: string | null
  status: 'vigente' | 'anulado'
  /** Solo con `status === 'anulado'`; null si está vigente o es un dato viejo sin causa. */
  voidCause: InboxVoidCause | null
  anonymous: boolean
}

/** Un aviso de la bandeja. GET /members/notifications */
export interface InboxItem {
  id: number
  /** Tipo del aviso: `entrenamiento`, `programas`, `motivacion`, `anuncios`, `planes`, `referidos`, `aura_gift` u otro. */
  kind: string
  title: string
  body: string
  route: string | null
  /** `app_section` o `whatsapp_sales`. */
  destination: string
  destinationSection: string | null
  whatsappText: string | null
  /** Hora desde la que el aviso se ve (ISO). */
  createdAt: string
  /** null = sin leer. */
  readAt: string | null
  /** Solo en `kind === 'aura_gift'`; null si el regalo ya no existe o no es del socio. */
  gift: InboxGift | null
}

/** GET /members/notifications?before&limit */
export interface InboxPage {
  items: InboxItem[]
  /** Cursor para "Ver más"; null = no hay más. */
  nextBefore: string | null
}

/** GET /members/notifications/unread-count */
export interface InboxUnreadCount {
  count: number
}
