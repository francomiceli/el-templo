import { describe, expect, it } from 'vitest'
import {
  GIFT_NOTIFICATION_KEY,
  NOTIFICATION_CATEGORIES,
  defaultPreferences,
  visibleNotificationCategories,
} from '../notification-categories'

describe('interruptores de notificaciones (#30)', () => {
  it('"Regalos de Aura" va junto a los demás, entre Planes y Novedades', () => {
    expect(NOTIFICATION_CATEGORIES.map((c) => c.key)).toEqual([
      'entrenamiento',
      'programas',
      'planes',
      'regalos_aura',
      'anuncios',
    ])
    const gift = NOTIFICATION_CATEGORIES.find((c) => c.key === GIFT_NOTIFICATION_KEY)
    expect(gift?.label).toBe('Regalos de Aura')
  })

  it('con el módulo de Aura prendido se ofrecen todos', () => {
    expect(visibleNotificationCategories(true)).toHaveLength(5)
  })

  it('con el módulo de Aura apagado no se ofrece el de regalos y el resto queda igual', () => {
    const keys = visibleNotificationCategories(false).map((c) => c.key)
    expect(keys).not.toContain('regalos_aura')
    expect(keys).toEqual(['entrenamiento', 'programas', 'planes', 'anuncios'])
  })

  it('todos arrancan encendidos', () => {
    const prefs = defaultPreferences()
    expect(Object.keys(prefs).sort()).toEqual(NOTIFICATION_CATEGORIES.map((c) => c.key).sort())
    expect(Object.values(prefs).every((v) => v === true)).toBe(true)
  })
})
