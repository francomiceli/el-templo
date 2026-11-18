/**
 * Interruptores de notificaciones de Perfil (decisión D-18 de la 214 y, en la 215, #30).
 *
 * "Regalos de Aura" (`regalos_aura`) apaga la push de un regalo recibido, pero el aviso queda igual
 * en Notificaciones y la Aura se acredita. Solo se ofrece si el módulo de Aura está prendido: sin
 * Aura no hay regalos que avisar.
 */

export interface NotificationCategoryOption {
  key: string
  label: string
  description: string
}

export const NOTIFICATION_CATEGORIES: readonly NotificationCategoryOption[] = [
  {
    key: 'entrenamiento',
    label: 'Entrenamiento',
    description: 'Recordatorios de check-in, resumen semanal',
  },
  {
    key: 'programas',
    label: 'Programas',
    description: 'Confirmación de inscripción, avance semanal',
  },
  {
    key: 'planes',
    label: 'Planes',
    description: 'Cuando cargamos tu plan y avisos de vencimiento',
  },
  {
    key: 'regalos_aura',
    label: 'Regalos de Aura',
    description: 'Cuando te dan Aura. Apagado, igual lo ves en Notificaciones',
  },
  {
    key: 'anuncios',
    label: 'Novedades',
    description: 'Nuevas funciones y actualizaciones',
  },
]

/** La categoría de los regalos de Aura: solo se muestra con el módulo de Aura prendido. */
export const GIFT_NOTIFICATION_KEY = 'regalos_aura'

/** Valor inicial de cada interruptor: todos encendidos hasta que el servidor diga lo contrario. */
export function defaultPreferences(): Record<string, boolean> {
  return Object.fromEntries(NOTIFICATION_CATEGORIES.map((cat) => [cat.key, true]))
}

/** Los interruptores que se muestran: "Regalos de Aura" solo con el módulo de Aura prendido. */
export function visibleNotificationCategories(
  auraVisible: boolean,
): readonly NotificationCategoryOption[] {
  return NOTIFICATION_CATEGORIES.filter((cat) => cat.key !== GIFT_NOTIFICATION_KEY || auraVisible)
}
