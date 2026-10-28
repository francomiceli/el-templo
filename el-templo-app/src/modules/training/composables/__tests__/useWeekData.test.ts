import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('src/boot/axios', () => ({
  api: { get: vi.fn() },
}))

// Store falso con TODO lo que antes decidia `view` en el cliente: el composable
// ya no debe leerlo (fase 203, D-09).
const userStoreMock = vi.hoisted(() => ({
  selectedLevel: null as string | null,
  currentProgram: { enrollmentId: null as number | null },
  hasPresencialPlan: false,
  allActiveEnrollments: [] as unknown[],
}))

vi.mock('src/stores/useUserStore', () => ({
  useUserStore: () => userStoreMock,
}))

import { api } from 'src/boot/axios'
import { useWeekData } from '../useWeekData'

const WEEK = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']

/** Params con los que se llamo a api.get en la ultima invocacion. */
function lastParams(): Record<string, string> {
  const calls = vi.mocked(api.get).mock.calls
  const config = calls[calls.length - 1]?.[1] as { params: Record<string, string> } | undefined
  if (!config) throw new Error('api.get no fue llamado con config')
  return config.params
}

describe('useWeekData (fase 203, D-09)', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset()
    vi.mocked(api.get).mockResolvedValue({
      data: { sessions: { '2026-10-12': null }, completedDates: ['2026-10-13'] },
    })
    userStoreMock.selectedLevel = null
    userStoreMock.currentProgram = { enrollmentId: null }
    userStoreMock.hasPresencialPlan = false
    userStoreMock.allActiveEnrollments = []
  })

  it('pide /sessions/weekly solo con weekStart, sin view', async () => {
    const { fetchWeekSessions } = useWeekData()
    await fetchWeekSessions(WEEK)

    expect(api.get).toHaveBeenCalledWith('/sessions/weekly', {
      params: { weekStart: '2026-10-12' },
    })
    expect(lastParams()).not.toHaveProperty('view')
  })

  it('no manda view aunque el store tenga programa actual, plan presencial e inscripciones', async () => {
    userStoreMock.currentProgram = { enrollmentId: 42 }
    userStoreMock.hasPresencialPlan = true
    userStoreMock.allActiveEnrollments = [{ id: 42 }, { id: 43 }]

    const { fetchWeekSessions } = useWeekData()
    await fetchWeekSessions(WEEK)

    expect(lastParams()).not.toHaveProperty('view')
  })

  it('manda level cuando hay nivel elegido y lo omite cuando no', async () => {
    const { fetchWeekSessions } = useWeekData()

    userStoreMock.selectedLevel = 'alfa'
    await fetchWeekSessions(WEEK)
    expect(lastParams()).toEqual({ weekStart: '2026-10-12', level: 'alfa' })

    userStoreMock.selectedLevel = null
    await fetchWeekSessions(WEEK)
    expect(lastParams()).not.toHaveProperty('level')
  })

  it('loaded arranca en false y pasa a true tras una respuesta OK', async () => {
    const { fetchWeekSessions, loaded, sessions, completedDates, error } = useWeekData()
    expect(loaded.value).toBe(false)

    await fetchWeekSessions(WEEK)

    expect(loaded.value).toBe(true)
    expect(error.value).toBeNull()
    expect(sessions.value.has('2026-10-12')).toBe(true)
    expect(completedDates.value).toEqual(['2026-10-13'])
  })

  it('loaded pasa a true tambien tras un error (fail-open) y error tiene el mensaje', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network Error'))
    const { fetchWeekSessions, loaded, error } = useWeekData()

    await fetchWeekSessions(WEEK)

    expect(loaded.value).toBe(true)
    expect(error.value).toBe('Network Error')
  })

  it('loaded no vuelve a false en un segundo fetch (un refresco no vuelve al esqueleto)', async () => {
    const { fetchWeekSessions, loaded } = useWeekData()
    await fetchWeekSessions(WEEK)
    expect(loaded.value).toBe(true)

    let resolveSecond!: (value: unknown) => void
    vi.mocked(api.get).mockReturnValue(
      new Promise((resolve) => {
        resolveSecond = resolve
      }),
    )
    const second = fetchWeekSessions(WEEK)
    expect(loaded.value).toBe(true)

    resolveSecond({ data: { sessions: {} } })
    await second
    expect(loaded.value).toBe(true)
  })
})
