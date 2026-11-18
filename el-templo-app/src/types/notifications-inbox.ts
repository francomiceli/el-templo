/**
 * Fase 215: contratos de la bandeja de notificaciones (API, plan 14). Espejo de las respuestas de
 * `el-templo-api/src/modules/notifications/inbox-schemas.ts`. La app no decide nada: pinta lo que
 * manda el servidor.
 */

/** Datos del regalo de un aviso `aura_gift`. `giverFirstName` nunca es null ("Alguien" si falta). */
export interface InboxGift {
  amount: number
  giverKind: 'alumno' | 'profe'
  giverFirstName: string
  giverLastInitial: string | null
  giverPhotoUrl: string | null
  status: 'vigente' | 'anulado'
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
