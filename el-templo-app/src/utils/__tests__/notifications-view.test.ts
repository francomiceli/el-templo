import { describe, expect, it, vi } from 'vitest'

// resolveTapRoute vive en el boot de push: se mockean los plugins nativos para poder importarlo
// (mismo criterio que push-destination.test.ts).
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
}))
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: { addListener: vi.fn(), checkPermissions: vi.fn(), register: vi.fn() },
}))
vi.mock('@capacitor-firebase/messaging', () => ({
  FirebaseMessaging: { addListener: vi.fn(), checkPermissions: vi.fn() },
}))
vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))
vi.mock('src/stores/useAuthStore', () => ({
  useAuthStore: () => ({ isAuthenticated: false }),
}))

import { resolveTapRoute } from 'src/boot/push-notifications'
import type { InboxGift, InboxItem } from 'src/types/notifications-inbox'
import {
  badgeText,
  bellAriaLabel,
  giftPill,
  groupByDay,
  iconForKind,
  rowAriaLabel,
  tapData,
  timeLabel,
  unreadIds,
  voidedText,
} from '../notifications-view'

const BA = 'America/Argentina/Buenos_Aires'
// Reloj fijo: miércoles 2026-11-18 12:00 en Buenos Aires (15:00 UTC).
const NOW = new Date('2026-11-18T15:00:00Z')

function gift(over: Partial<InboxGift> = {}): InboxGift {
  return {
    amount: 1,
    giverKind: 'alumno',
    giverFirstName: 'Sofía',
    giverLastInitial: 'M',
    giverPhotoUrl: null,
    status: 'vigente',
    voidCause: null,
    anonymous: false,
    ...over,
  }
}

function item(over: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 1,
    kind: 'anuncios',
    title: 'Novedades',
    body: 'Mirá lo nuevo.',
    route: null,
    destination: 'app_section',
    destinationSection: null,
    whatsappText: null,
    createdAt: '2026-11-18T21:42:00.000Z',
    readAt: null,
    gift: null,
    ...over,
  }
}

describe('groupByDay', () => {
  it('agrupa por día local en orden de llegada, con etiqueta Hoy / Ayer / fecha', () => {
    const a = item({ id: 1, createdAt: '2026-11-18T14:00:00.000Z' })
    const b = item({ id: 2, createdAt: '2026-11-18T12:00:00.000Z' })
    const c = item({ id: 3, createdAt: '2026-11-17T20:00:00.000Z' })
    const d = item({ id: 4, createdAt: '2026-11-10T20:00:00.000Z' })
    const sections = groupByDay([a, b, c, d], BA, NOW)
    expect(sections.map((s) => s.label)).toEqual(['Hoy', 'Ayer', 'Mar 10 nov'])
    expect(sections.map((s) => s.key)).toEqual(['2026-11-18', '2026-11-17', '2026-11-10'])
    expect(sections[0]?.items.map((i) => i.id)).toEqual([1, 2])
    expect(sections[1]?.items.map((i) => i.id)).toEqual([3])
  })

  it('no reordena los avisos dentro del día', () => {
    const a = item({ id: 9, createdAt: '2026-11-18T12:00:00.000Z' })
    const b = item({ id: 3, createdAt: '2026-11-18T14:00:00.000Z' })
    const sections = groupByDay([a, b], BA, NOW)
    expect(sections[0]?.items.map((i) => i.id)).toEqual([9, 3])
  })

  it('el día se mide en la zona de la sede (23:30 en Buenos Aires ya es otro día en UTC)', () => {
    // 2026-11-18T02:30Z = 2026-11-17 23:30 en Buenos Aires.
    const sections = groupByDay([item({ createdAt: '2026-11-18T02:30:00.000Z' })], BA, NOW)
    expect(sections[0]?.key).toBe('2026-11-17')
    expect(sections[0]?.label).toBe('Ayer')
  })

  it('solo agrupa días contiguos: no junta el mismo día separado por otro', () => {
    const a = item({ id: 1, createdAt: '2026-11-18T14:00:00.000Z' })
    const b = item({ id: 2, createdAt: '2026-11-17T14:00:00.000Z' })
    const c = item({ id: 3, createdAt: '2026-11-18T13:00:00.000Z' })
    const sections = groupByDay([a, b, c], BA, NOW)
    expect(sections.map((s) => s.key)).toEqual(['2026-11-18', '2026-11-17', '2026-11-18'])
  })

  it('lista vacía → sin secciones', () => {
    expect(groupByDay([], BA, NOW)).toEqual([])
  })

  it('fecha inválida no rompe: queda en una sección sin etiqueta', () => {
    const sections = groupByDay([item({ createdAt: 'basura' })], BA, NOW)
    expect(sections).toHaveLength(1)
    expect(sections[0]?.label).toBe('')
  })
})

describe('timeLabel', () => {
  it('24 h con cero a la izquierda', () => {
    expect(timeLabel('2026-11-18T21:42:00.000Z', BA)).toBe('18:42')
    expect(timeLabel('2026-11-18T12:05:00.000Z', BA)).toBe('09:05')
  })

  it('medianoche sale 00:xx, no 24:xx', () => {
    expect(timeLabel('2026-11-18T03:10:00.000Z', BA)).toBe('00:10')
  })

  it('zona inválida cae en Buenos Aires', () => {
    expect(timeLabel('2026-11-18T21:42:00.000Z', 'No/Existe')).toBe('18:42')
  })

  it('fecha inválida → cadena vacía', () => {
    expect(timeLabel('basura', BA)).toBe('')
  })
})

describe('iconForKind', () => {
  it('los seis tipos de la tabla', () => {
    expect(iconForKind('entrenamiento')).toBe('event_available')
    expect(iconForKind('programas')).toBe('school')
    expect(iconForKind('motivacion')).toBe('self_improvement')
    expect(iconForKind('anuncios')).toBe('campaign')
    expect(iconForKind('planes')).toBe('card_membership')
    expect(iconForKind('referidos')).toBe('group_add')
  })

  it('otro tipo → notifications', () => {
    expect(iconForKind('otro')).toBe('notifications')
    expect(iconForKind('')).toBe('notifications')
    expect(iconForKind('constructor')).toBe('notifications')
  })

  it('aura_gift → null (usa avatar o chispa)', () => {
    expect(iconForKind('aura_gift')).toBeNull()
  })
})

describe('badgeText y bellAriaLabel', () => {
  it('badgeText', () => {
    expect(badgeText(0)).toBeNull()
    expect(badgeText(3)).toBe('3')
    expect(badgeText(9)).toBe('9')
    expect(badgeText(10)).toBe('9+')
    expect(badgeText(250)).toBe('9+')
  })

  it('badgeText con valores raros no muestra nada', () => {
    expect(badgeText(-2)).toBeNull()
    expect(badgeText(Number.NaN)).toBeNull()
  })

  it('bellAriaLabel', () => {
    expect(bellAriaLabel(0)).toBe('Notificaciones')
    expect(bellAriaLabel(3)).toBe('Notificaciones, 3 sin leer')
    expect(bellAriaLabel(250)).toBe('Notificaciones, 250 sin leer')
  })
})

describe('unreadIds', () => {
  it('junta solo los avisos sin leer', () => {
    const items = [
      item({ id: 1, readAt: null }),
      item({ id: 2, readAt: '2026-11-18T10:00:00.000Z' }),
      item({ id: 3, readAt: null }),
    ]
    expect([...unreadIds(items)].sort()).toEqual([1, 3])
  })

  it('sin avisos o todos leídos → vacío', () => {
    expect(unreadIds([]).size).toBe(0)
    expect(unreadIds([item({ readAt: '2026-11-18T10:00:00.000Z' })]).size).toBe(0)
  })
})

describe('voidedText', () => {
  it('una causa por texto, y el genérico sin causa o con una API vieja', () => {
    expect(voidedText('asistencia')).toBe('Anulado: la asistencia se corrigió')
    expect(voidedText('staff')).toBe('Anulado por el staff')
    expect(voidedText(null)).toBe('Anulado')
    expect(voidedText(undefined)).toBe('Anulado')
  })
})

describe('giftPill', () => {
  it('regalo vigente → monto', () => {
    expect(giftPill(item({ kind: 'aura_gift', gift: gift() }))).toEqual({
      kind: 'amount',
      text: '+1',
    })
  })

  it('regalo anulado sin causa → Anulado', () => {
    expect(giftPill(item({ kind: 'aura_gift', gift: gift({ status: 'anulado' }) }))).toEqual({
      kind: 'voided',
      text: 'Anulado',
    })
  })

  it('regalo anulado porque se corrigió la asistencia → con el motivo (#28, #37)', () => {
    expect(
      giftPill(
        item({ kind: 'aura_gift', gift: gift({ status: 'anulado', voidCause: 'asistencia' }) }),
      ),
    ).toEqual({ kind: 'voided', text: 'Anulado: la asistencia se corrigió' })
  })

  it('regalo anulado por el staff → con el motivo (#28, #37)', () => {
    expect(
      giftPill(item({ kind: 'aura_gift', gift: gift({ status: 'anulado', voidCause: 'staff' }) })),
    ).toEqual({ kind: 'voided', text: 'Anulado por el staff' })
  })

  it('sin regalo → null', () => {
    expect(giftPill(item())).toBeNull()
  })
})

describe('rowAriaLabel', () => {
  const regalo = item({
    kind: 'aura_gift',
    title: 'Sofía M. te dio Aura',
    body: 'Motivo: Buena energía.',
    gift: gift(),
  })

  it('regalo sin leer con monto', () => {
    expect(rowAriaLabel(regalo, '18:42')).toBe(
      'Sin leer. Sofía M. te dio Aura. 18:42, Motivo: Buena energía. Más 1 de Aura.',
    )
  })

  it('leído → sin "Sin leer."', () => {
    expect(rowAriaLabel({ ...regalo, readAt: '2026-11-18T22:00:00.000Z' }, '18:42')).toBe(
      'Sofía M. te dio Aura. 18:42, Motivo: Buena energía. Más 1 de Aura.',
    )
  })

  it('aviso que no es regalo → sin la parte del monto', () => {
    expect(rowAriaLabel(item({ body: 'Mirá lo nuevo.' }), '18:42')).toBe(
      'Sin leer. Novedades. 18:42, Mirá lo nuevo.',
    )
  })

  it('regalo anulado → sin monto y con el motivo', () => {
    expect(rowAriaLabel({ ...regalo, gift: gift({ status: 'anulado' }) }, '18:42')).toBe(
      'Sin leer. Sofía M. te dio Aura. 18:42, Motivo: Buena energía. Anulado.',
    )
    expect(
      rowAriaLabel({ ...regalo, gift: gift({ status: 'anulado', voidCause: 'staff' }) }, '18:42'),
    ).toBe('Sin leer. Sofía M. te dio Aura. 18:42, Motivo: Buena energía. Anulado por el staff.')
  })

  it('el "Sin leer." sale del tercer parámetro si se pasa (resaltado de la visita, #35)', () => {
    const leido = { ...regalo, readAt: '2026-11-18T22:00:00.000Z' }
    expect(rowAriaLabel(leido, '18:42', true)).toBe(
      'Sin leer. Sofía M. te dio Aura. 18:42, Motivo: Buena energía. Más 1 de Aura.',
    )
    expect(rowAriaLabel(regalo, '18:42', false)).toBe(
      'Sofía M. te dio Aura. 18:42, Motivo: Buena energía. Más 1 de Aura.',
    )
  })

  it('sin cuerpo → título y hora', () => {
    expect(rowAriaLabel(item({ body: '' }), '18:42')).toBe('Sin leer. Novedades. 18:42.')
  })

  it('cuerpo sin punto final → se le agrega uno', () => {
    expect(rowAriaLabel(item({ body: 'Mirá lo nuevo' }), '18:42')).toBe(
      'Sin leer. Novedades. 18:42, Mirá lo nuevo.',
    )
  })

  it('el monto usa el separador de miles', () => {
    expect(rowAriaLabel({ ...regalo, gift: gift({ amount: 1240 }) }, '18:42')).toContain(
      'Más 1.240 de Aura.',
    )
  })
})

describe('tapData', () => {
  it('omite los nulos', () => {
    expect(
      tapData(
        item({
          route: '/mi-templo?aura=detalle',
          destination: 'app_section',
          destinationSection: null,
          whatsappText: null,
        }),
      ),
    ).toEqual({ route: '/mi-templo?aura=detalle', destination: 'app_section' })
  })

  it('resolveTapRoute(tapData(...)) da la ruta del aviso', () => {
    const data = tapData(item({ route: '/mi-templo?aura=detalle', destination: 'app_section' }))
    expect(resolveTapRoute(data)).toBe('/mi-templo?aura=detalle')
  })

  it('whatsapp_sales incluye whatsappText', () => {
    const data = tapData(item({ destination: 'whatsapp_sales', whatsappText: 'Hola', route: null }))
    expect(data).toEqual({ destination: 'whatsapp_sales', whatsappText: 'Hola' })
    expect(resolveTapRoute(data)).toBe('/contacto-ventas?text=Hola')
  })

  it('sin nada que resolver cae en /mi-templo', () => {
    expect(resolveTapRoute(tapData(item({ destination: '', route: null })))).toBe('/mi-templo')
  })

  it('una sección desconocida no rompe: usa la ruta o el fallback', () => {
    const data = tapData(
      item({ destination: 'app_section', destinationSection: 'inexistente', route: '/perfil' }),
    )
    expect(resolveTapRoute(data)).toBe('/perfil')
  })
})
