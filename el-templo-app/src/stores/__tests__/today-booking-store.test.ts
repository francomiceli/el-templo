import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { MyBookingRecord } from 'src/types/scheduling'

// Reactivo como el store real: `tz` es un computed sobre el perfil y no se
// entera de un cambio en un objeto plano.
const { warn, userStoreMock } = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  return {
    warn: vi.fn(),
    userStoreMock: reactive({
      profile: { branchTimezone: 'America/Argentina/Buenos_Aires' } as {
        branchTimezone: string
      } | null,
    }),
  }
})

vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }),
}))

vi.mock('src/boot/axios', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

vi.mock('src/stores/useUserStore', () => ({
  useUserStore: () => userStoreMock,
}))

import { api } from 'src/boot/axios'
import { DEFAULT_BRANCH_TZ, addDaysStr } from 'src/utils/check-in-window'
import { useTodayBookingStore } from '../useTodayBookingStore'

const BA = 'America/Argentina/Buenos_Aires'
// Jueves 2026-10-15. 19:00 en Buenos Aires = 22:00Z.
const CLASS_19_UTC = new Date('2026-10-15T22:00:00.000Z').getTime()
const MIN = 60_000

let nextId = 1

function booking(overrides: Partial<MyBookingRecord> = {}): MyBookingRecord {
  return {
    id: nextId++,
    memberId: 1,
    memberName: 'Socio Test',
    scheduleId: 10,
    activityName: 'Funcional',
    dayOfWeek: 'jueves',
    startTime: '19:00:00',
    bookingDate: '2026-10-15',
    status: 'reservado',
    waitlistPosition: null,
    bookedAt: '2026-10-10T12:00:00.000Z',
    cancelledAt: null,
    isSpecial: false,
    specialLine: null,
    branchId: 1,
    branchName: 'Sede Test',
    branchTimezone: BA,
    checkedInAt: null,
    ...overrides,
  } as MyBookingRecord
}

/**
 * Responde my-bookings por `weekStart`: lo que no está en el mapa vuelve vacío.
 * Con `weeks: 2` (fase 203, D-15) devuelve la semana pedida concatenada con la siguiente.
 */
function mockWeeks(byWeek: Record<string, MyBookingRecord[]>): void {
  vi.mocked(api.get).mockImplementation(async (_url: string, config?: unknown) => {
    const { weekStart, weeks } = (config as { params: { weekStart: string; weeks?: number } })
      .params
    const first = byWeek[weekStart] ?? []
    const second = weeks === 2 ? (byWeek[addDaysStr(weekStart, 7)] ?? []) : []
    return { data: { bookings: [...first, ...second] } }
  })
}

function setNow(ms: number): void {
  vi.setSystemTime(new Date(ms))
}

async function loadedStore(byWeek: Record<string, MyBookingRecord[]>, nowMs: number) {
  setNow(nowMs)
  mockWeeks(byWeek)
  const store = useTodayBookingStore()
  await store.load()
  return store
}

describe('useTodayBookingStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    vi.mocked(api.get).mockReset()
    warn.mockClear()
    nextId = 1
    userStoreMock.profile = { branchTimezone: BA }
  })

  afterEach(() => {
    useTodayBookingStore().reset()
    vi.useRealTimers()
  })

  it('pide UNA vez con weekStart del lunes actual y weeks=2', async () => {
    await loadedStore({}, CLASS_19_UTC - 60 * MIN)
    const calls = vi.mocked(api.get).mock.calls
    expect(calls.length).toBe(1)
    expect(calls[0]![0]).toBe('/members/scheduling/my-bookings')
    expect((calls[0]![1] as { params: unknown }).params).toEqual({
      weekStart: '2026-10-12',
      weeks: 2,
    })
  })

  it('las reservas de las dos semanas quedan en bookings', async () => {
    const thisWeek = booking()
    const nextWeek = booking({ bookingDate: '2026-10-19', startTime: '07:00:00' })
    const store = await loadedStore(
      { '2026-10-12': [thisWeek], '2026-10-19': [nextWeek] },
      CLASS_19_UTC - 60 * MIN,
    )
    expect(store.bookings.map((b) => b.id)).toEqual([thisWeek.id, nextWeek.id])
    expect(store.nextBooking?.id).toBe(nextWeek.id)
    expect(store.loadFailed).toBe(false)
  })

  it('todayBooking elige la próxima del día', async () => {
    const morning = booking({ startTime: '08:00:00', status: 'qr_escaneado' })
    const evening = booking({ startTime: '19:00:00' })
    const store = await loadedStore({ '2026-10-12': [evening, morning] }, CLASS_19_UTC - 60 * MIN)
    expect(store.todayBooking?.id).toBe(evening.id)
  })

  it('si todas las del día ya pasaron, todayBooking es la última', async () => {
    const morning = booking({ startTime: '08:00:00', status: 'qr_escaneado' })
    const noon = booking({ startTime: '12:00:00', status: 'qr_escaneado' })
    const store = await loadedStore({ '2026-10-12': [noon, morning] }, CLASS_19_UTC)
    expect(store.todayBooking?.id).toBe(noon.id)
  })

  it('"hoy" se calcula en la zona de la sede, no en la del teléfono', async () => {
    // 02:00Z del 16 = 23:00 del 15 en Buenos Aires.
    const store = await loadedStore({}, new Date('2026-10-16T02:00:00.000Z').getTime())
    expect(store.todayStr).toBe('2026-10-15')
  })

  it('todayWaitlist devuelve la lista de espera de hoy', async () => {
    const wl = booking({ status: 'lista_espera', waitlistPosition: 2 })
    const store = await loadedStore({ '2026-10-12': [wl] }, CLASS_19_UTC - 60 * MIN)
    expect(store.todayWaitlist?.id).toBe(wl.id)
    expect(store.todayBooking).toBeNull()
  })

  describe('fabVisible', () => {
    it('true a -10 min de una reserva reservado', async () => {
      const store = await loadedStore({ '2026-10-12': [booking()] }, CLASS_19_UTC - 10 * MIN)
      expect(store.fabVisible).toBe(true)
      expect(store.windowState).toBe('open')
    })

    it('true en los bordes -20 y +20 min (inclusivos, como el server)', async () => {
      const store = await loadedStore({ '2026-10-12': [booking()] }, CLASS_19_UTC - 20 * MIN)
      expect(store.fabVisible).toBe(true)
      setNow(CLASS_19_UTC + 20 * MIN)
      store.now = new Date()
      expect(store.fabVisible).toBe(true)
    })

    it('false a -30 min', async () => {
      const store = await loadedStore({ '2026-10-12': [booking()] }, CLASS_19_UTC - 30 * MIN)
      expect(store.fabVisible).toBe(false)
      expect(store.windowState).toBe('before')
    })

    it('false si la reserva ya es qr_escaneado', async () => {
      const store = await loadedStore(
        { '2026-10-12': [booking({ status: 'qr_escaneado' })] },
        CLASS_19_UTC - 10 * MIN,
      )
      expect(store.fabVisible).toBe(false)
    })

    it('usa la zona de la sede de la CLASE, no la del perfil', async () => {
      // Clase en Madrid a las 19:00 (verano, UTC+2) = 17:00Z; el perfil es de Buenos Aires.
      const madrid = booking({ branchTimezone: 'Europe/Madrid' })
      const classUtc = new Date('2026-10-15T17:00:00.000Z').getTime()
      const store = await loadedStore({ '2026-10-12': [madrid] }, classUtc - 10 * MIN)
      expect(store.fabVisible).toBe(true)
    })

    it('misma categoría: A regular marcada + B regular en ventana -> false', async () => {
      const a = booking({ startTime: '08:00:00', status: 'qr_escaneado' })
      const b = booking({ startTime: '19:00:00' })
      const store = await loadedStore({ '2026-10-12': [a, b] }, CLASS_19_UTC - 10 * MIN)
      expect(store.fabVisible).toBe(false)
    })

    it('otra categoría: A Aura marcada + B regular en ventana -> true', async () => {
      const a = booking({
        startTime: '08:00:00',
        status: 'qr_escaneado',
        isSpecial: true,
        specialLine: null,
      })
      const b = booking({ startTime: '19:00:00' })
      const store = await loadedStore({ '2026-10-12': [a, b] }, CLASS_19_UTC - 10 * MIN)
      expect(store.fabVisible).toBe(true)
      expect(store.windowBooking?.id).toBe(b.id)
    })

    it('otra línea: A yoga marcada + B Aura (specialLine null) en ventana -> true', async () => {
      const a = booking({
        startTime: '08:00:00',
        status: 'qr_escaneado',
        isSpecial: true,
        specialLine: 'yoga',
      })
      const b = booking({ startTime: '19:00:00', isSpecial: true, specialLine: null })
      const store = await loadedStore({ '2026-10-12': [a, b] }, CLASS_19_UTC - 10 * MIN)
      expect(store.fabVisible).toBe(true)
    })

    it('checkedInAt cuenta como asistencia marcada aunque el status no cambie', async () => {
      const a = booking({ startTime: '08:00:00', checkedInAt: '2026-10-15T11:05:00.000Z' })
      const b = booking({ startTime: '19:00:00' })
      const store = await loadedStore({ '2026-10-12': [a, b] }, CLASS_19_UTC - 10 * MIN)
      expect(store.fabVisible).toBe(false)
    })
  })

  describe('markAttendanceDone (flag local por categoría)', () => {
    it('regular en ventana: esconde el FAB y marca "regular"', async () => {
      const store = await loadedStore({ '2026-10-12': [booking()] }, CLASS_19_UTC - 10 * MIN)
      expect(store.fabVisible).toBe(true)
      store.markAttendanceDone()
      expect(store.fabVisible).toBe(false)
      expect(store.attendanceMarkedFor('regular')).toBe(true)
      expect(store.attendanceMarkedFor('special:')).toBe(false)
    })

    it('el flag de Aura no esconde la ventana de una regular posterior', async () => {
      const aura = booking({ startTime: '19:00:00', isSpecial: true, specialLine: null })
      const regular = booking({ startTime: '21:00:00' })
      const store = await loadedStore({ '2026-10-12': [aura, regular] }, CLASS_19_UTC - 10 * MIN)
      expect(store.windowBooking?.id).toBe(aura.id)
      store.markAttendanceDone()
      expect(store.attendanceMarkedFor('special:')).toBe(true)
      expect(store.fabVisible).toBe(false)

      // Avanza a la ventana de la regular de las 21:00 (00:00Z del 16).
      setNow(new Date('2026-10-16T00:00:00.000Z').getTime() - 10 * MIN)
      store.now = new Date()
      expect(store.windowBooking?.id).toBe(regular.id)
      expect(store.fabVisible).toBe(true)
    })

    it('sin reserva en ventana marca la categoría regular', async () => {
      const store = await loadedStore({}, CLASS_19_UTC - 10 * MIN)
      store.markAttendanceDone()
      expect(store.attendanceMarkedFor('regular')).toBe(true)
    })

    it('el flag deja de aplicar al cambiar el día de la sede', async () => {
      const store = await loadedStore({ '2026-10-12': [booking()] }, CLASS_19_UTC - 10 * MIN)
      store.startClock()
      store.markAttendanceDone()
      expect(store.attendanceMarkedFor('regular')).toBe(true)

      // 03:00Z del 16 = 00:00 del 16 en Buenos Aires.
      setNow(new Date('2026-10-16T03:30:00.000Z').getTime())
      vi.advanceTimersByTime(30_000)
      expect(store.todayStr).toBe('2026-10-16')
      expect(store.attendanceMarkedFor('regular')).toBe(false)
    })

    it('reset() limpia el flag', async () => {
      const store = await loadedStore({ '2026-10-12': [booking()] }, CLASS_19_UTC - 10 * MIN)
      store.markAttendanceDone()
      store.reset()
      expect(store.attendanceMarkedFor('regular')).toBe(false)
    })
  })

  it('attendanceMarkedAt formatea checkedInAt en la zona de la sede', async () => {
    const b = booking({ status: 'qr_escaneado', checkedInAt: '2026-10-15T21:55:00.000Z' })
    const store = await loadedStore({ '2026-10-12': [b] }, CLASS_19_UTC)
    expect(store.attendanceMarkedAt).toBe('18:55')
  })

  it('attendanceMarkedAt es null si la reserva no tiene asistencia', async () => {
    const store = await loadedStore({ '2026-10-12': [booking()] }, CLASS_19_UTC - 10 * MIN)
    expect(store.attendanceMarkedAt).toBeNull()
  })

  it('nextBooking encuentra la del lunes siguiente siendo domingo', async () => {
    // Domingo 2026-10-18, 12:00 en Buenos Aires = 15:00Z.
    const monday = booking({ bookingDate: '2026-10-19', startTime: '07:00:00' })
    const store = await loadedStore(
      { '2026-10-19': [monday] },
      new Date('2026-10-18T15:00:00.000Z').getTime(),
    )
    expect(store.todayStr).toBe('2026-10-18')
    expect(store.todayBooking).toBeNull()
    expect(store.nextBooking?.id).toBe(monday.id)
  })

  it('error de red en la primera carga: bookings = [] sin lanzar (fail-open) y loadFailed', async () => {
    setNow(CLASS_19_UTC - 60 * MIN)
    vi.mocked(api.get).mockRejectedValue(new Error('network'))
    const store = useTodayBookingStore()
    await expect(store.load()).resolves.toBeUndefined()
    expect(store.bookings).toEqual([])
    expect(store.loaded).toBe(true)
    expect(store.loadFailed).toBe(true)
    expect(warn).toHaveBeenCalled()
    expect(vi.mocked(api.get).mock.calls.length).toBe(1)
  })

  it('error después de una carga buena conserva las reservas y marca loadFailed', async () => {
    const evening = booking()
    const store = await loadedStore({ '2026-10-12': [evening] }, CLASS_19_UTC - 10 * MIN)
    expect(store.fabVisible).toBe(true)
    expect(store.loadFailed).toBe(false)
    warn.mockClear()

    vi.mocked(api.get).mockRejectedValue(new Error('network'))
    await expect(store.load()).resolves.toBeUndefined()

    expect(store.bookings.map((b) => b.id)).toEqual([evening.id])
    expect(store.loaded).toBe(true)
    expect(store.loadFailed).toBe(true)
    expect(store.fabVisible).toBe(true)
    expect(warn).toHaveBeenCalled()
  })

  it('una carga exitosa después de una fallida limpia loadFailed', async () => {
    setNow(CLASS_19_UTC - 10 * MIN)
    vi.mocked(api.get).mockRejectedValue(new Error('network'))
    const store = useTodayBookingStore()
    await store.load()
    expect(store.loadFailed).toBe(true)

    const evening = booking()
    mockWeeks({ '2026-10-12': [evening] })
    await store.load()

    expect(store.loadFailed).toBe(false)
    expect(store.bookings.map((b) => b.id)).toEqual([evening.id])
  })

  it('reset() baja loadFailed', async () => {
    setNow(CLASS_19_UTC - 10 * MIN)
    vi.mocked(api.get).mockRejectedValue(new Error('network'))
    const store = useTodayBookingStore()
    await store.load()
    expect(store.loadFailed).toBe(true)
    store.reset()
    expect(store.loadFailed).toBe(false)
  })

  it('un refresco exitoso reemplaza las reservas anteriores', async () => {
    const first = booking()
    const store = await loadedStore({ '2026-10-12': [first] }, CLASS_19_UTC - 10 * MIN)
    const second = booking({ startTime: '20:00:00' })
    mockWeeks({ '2026-10-12': [second] })
    await store.load()
    expect(store.bookings.map((b) => b.id)).toEqual([second.id])
  })

  describe('loadedTz', () => {
    it('es null antes de cargar', () => {
      expect(useTodayBookingStore().loadedTz).toBeNull()
    })

    it('guarda la zona del perfil con la que se cargó', async () => {
      userStoreMock.profile = { branchTimezone: 'Europe/Madrid' }
      const store = await loadedStore({}, CLASS_19_UTC - 60 * MIN)
      expect(store.loadedTz).toBe('Europe/Madrid')
    })

    it('sin perfil usa la zona por defecto', async () => {
      userStoreMock.profile = null
      const store = await loadedStore({}, CLASS_19_UTC - 60 * MIN)
      expect(store.loadedTz).toBe(DEFAULT_BRANCH_TZ)
    })

    it('se actualiza al recargar con el perfil real', async () => {
      userStoreMock.profile = null
      const store = await loadedStore({}, CLASS_19_UTC - 60 * MIN)
      expect(store.loadedTz).toBe(DEFAULT_BRANCH_TZ)
      userStoreMock.profile = { branchTimezone: 'Europe/Madrid' }
      await store.load()
      expect(store.loadedTz).toBe('Europe/Madrid')
    })

    it('reset() lo vuelve a null', async () => {
      const store = await loadedStore({}, CLASS_19_UTC - 60 * MIN)
      expect(store.loadedTz).toBe(BA)
      store.reset()
      expect(store.loadedTz).toBeNull()
    })
  })

  it('reset() descarta una respuesta en vuelo', async () => {
    setNow(CLASS_19_UTC - 60 * MIN)
    // load() pide las dos semanas en un solo pedido: se guarda el resolver.
    const resolvers: Array<(v: unknown) => void> = []
    vi.mocked(api.get).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve)
        }),
    )
    const store = useTodayBookingStore()
    const pending = store.load()
    store.reset()
    for (const resolve of resolvers) resolve({ data: { bookings: [booking()] } })
    await pending
    expect(resolvers).toHaveLength(1)
    expect(store.bookings).toEqual([])
    expect(store.loaded).toBe(false)
  })

  it('startClock es idempotente y reset() lo para (sin intervalos vivos)', async () => {
    const store = await loadedStore({}, CLASS_19_UTC - 60 * MIN)
    store.startClock()
    store.startClock()
    expect(vi.getTimerCount()).toBe(1)
    store.reset()
    expect(vi.getTimerCount()).toBe(0)
  })
})
