import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { reactive } from 'vue'

vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('src/boot/axios', () => ({
  api: { get: vi.fn() },
}))

const userStoreMock = vi.hoisted(() => ({
  profile: null as { branchTimezone?: string } | null,
  selectedLevel: null as string | null,
  activeLevel: null as string | null,
}))
const reactiveUserStore = reactive(userStoreMock)

vi.mock('src/stores/useUserStore', () => ({
  useUserStore: () => reactiveUserStore,
}))

vi.mock('../../stores/weekStore', () => ({
  useWeekStore: () => ({ setWeekDays: vi.fn(), selectDate: vi.fn() }),
}))

vi.mock('../../stores/sessionPlayerStore', () => ({
  useSessionPlayerStore: () => ({
    loadProgress: vi.fn(() => Promise.resolve({ elapsedSeconds: 0, completedBlocks: [] })),
  }),
}))

import { api } from 'src/boot/axios'
import { NETWORK_WAIT_MS } from 'src/utils/with-timeout'
import { useTrainingWeek } from '../useTrainingWeek'

describe('useTrainingWeek · semana colgada (reporte 2026-11-03: Entrenar cargando en iPhone)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-03T15:00:00Z'))
    vi.mocked(api.get).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('un /sessions/weekly que no responde nunca termina en error con loading apagado', async () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}) as never)
    const week = useTrainingWeek()

    void week.load()
    expect(week.loading.value).toBe(true)

    await vi.advanceTimersByTimeAsync(NETWORK_WAIT_MS - 1)
    expect(week.loading.value).toBe(true)

    await vi.advanceTimersByTimeAsync(1)
    expect(week.loading.value).toBe(false)
    expect(week.error.value).toBe('Error cargando semana')
    expect(week.hasProgress.value).toBe(false)
    week.cleanup()
  })

  it('"Reintentar" después del tope no queda trabado detrás del pedido colgado', async () => {
    vi.mocked(api.get).mockReturnValueOnce(new Promise(() => {}) as never)
    const week = useTrainingWeek()
    void week.load()
    await vi.advanceTimersByTimeAsync(NETWORK_WAIT_MS)
    expect(week.error.value).toBe('Error cargando semana')

    vi.mocked(api.get).mockResolvedValueOnce({
      data: { sessions: { '2026-11-03': null }, completedDates: ['2026-11-02'] },
    } as never)
    await week.load()

    expect(week.loading.value).toBe(false)
    expect(week.error.value).toBeNull()
    expect(week.selectedDate.value).toBe('2026-11-03')
    expect(week.days.value.find((d) => d.date === '2026-11-02')?.state).toBe('completed')
    week.cleanup()
  })

  it('una semana que responde a tiempo no se ve afectada por el tope', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { sessions: { '2026-11-03': null }, completedDates: [] },
    } as never)
    const week = useTrainingWeek()
    await week.load()

    expect(week.loading.value).toBe(false)
    expect(week.error.value).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    week.cleanup()
  })
})
