import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProgressionStore } from '../progressionStore'
import type { ProgressionResponse, TodayCheckInState } from '../../types'

const PROGRESSION: ProgressionResponse = {
  level: { current: 'alfa', displayName: 'Alfa', greekLetter: 'α' },
  stats: {
    totalSessions: 12,
    totalDaysTrained: 10,
    sessionsThisWeek: 2,
    currentStreak: 3,
    longestStreak: 5,
  },
  rpeTrend: { labels: [], data: [], averageRpe: 0 },
  evaluation: {
    eligible: false,
    averageRpeLast2Weeks: null,
    pendingRequest: false,
    requestedAt: null,
  },
  todaySession: null,
}

const CHECK_IN: TodayCheckInState = {
  answers: { energy: { value: 'high', bodyArea: null }, soreness: null, sleep: null },
}

describe('progressionStore — statsLoaded / statsFailed (fase 203, D-02/D-07/D-16)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('al inicio: statsLoaded false, statsOk null y statsFailed false', () => {
    const store = useProgressionStore()

    expect(store.statsLoaded).toBe(false)
    expect(store.statsOk).toBeNull()
    expect(store.statsFailed).toBe(false)
  })

  it('setLoading(true) no toca statsLoaded: loading arranca en false y se prende en cada visita', () => {
    const store = useProgressionStore()

    store.setLoading(true)

    expect(store.loading).toBe(true)
    expect(store.statsLoaded).toBe(false)
  })

  it('markStatsSettled(true): statsLoaded true, statsOk true, statsFailed false', () => {
    const store = useProgressionStore()
    store.setProgressionData(PROGRESSION)

    store.markStatsSettled(true)

    expect(store.statsLoaded).toBe(true)
    expect(store.statsOk).toBe(true)
    expect(store.statsFailed).toBe(false)
  })

  it('un segundo fetch (setLoading(true)) no vuelve statsLoaded a false', () => {
    const store = useProgressionStore()
    store.setProgressionData(PROGRESSION)
    store.markStatsSettled(true)

    store.setLoading(true)

    expect(store.statsLoaded).toBe(true)
  })

  it('primera carga fallida: statsLoaded true y statsFailed true ("no sé")', () => {
    const store = useProgressionStore()
    store.setError('Error cargando progresión')

    store.markStatsSettled(false)

    expect(store.statsLoaded).toBe(true)
    expect(store.statsOk).toBe(false)
    expect(store.stats).toBeNull()
    expect(store.statsFailed).toBe(true)
  })

  it('refresco fallido con stats previas: statsFailed false y las stats siguen intactas', () => {
    const store = useProgressionStore()
    store.setProgressionData(PROGRESSION)
    store.markStatsSettled(true)

    store.setError('Network Error')
    store.markStatsSettled(false)

    expect(store.statsOk).toBe(false)
    expect(store.statsFailed).toBe(false)
    expect(store.stats).toEqual(PROGRESSION.stats)
  })

  it('éxito posterior a una carga fallida: statsFailed vuelve a false', () => {
    const store = useProgressionStore()
    store.markStatsSettled(false)
    expect(store.statsFailed).toBe(true)

    store.setProgressionData(PROGRESSION)
    store.markStatsSettled(true)

    expect(store.statsFailed).toBe(false)
    expect(store.statsOk).toBe(true)
  })

  it('reset() baja statsLoaded y statsOk, y por lo tanto statsFailed', () => {
    const store = useProgressionStore()
    store.markStatsSettled(false)
    expect(store.statsFailed).toBe(true)

    store.reset()

    expect(store.statsLoaded).toBe(false)
    expect(store.statsOk).toBeNull()
    expect(store.statsFailed).toBe(false)
  })
})

describe('progressionStore — checkInSettled / checkInOk (fase 203, D-02/D-07)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('al inicio: checkInSettled false y checkInOk null', () => {
    const store = useProgressionStore()

    expect(store.checkInSettled).toBe(false)
    expect(store.checkInOk).toBeNull()
  })

  it('setCheckInLoading(true) no marca settled', () => {
    const store = useProgressionStore()

    store.setCheckInLoading(true)

    expect(store.checkInSettled).toBe(false)
  })

  it('setCheckInState: settled true y ok true', () => {
    const store = useProgressionStore()

    store.setCheckInState(CHECK_IN)

    expect(store.checkInSettled).toBe(true)
    expect(store.checkInOk).toBe(true)
  })

  it('setCheckInError con mensaje: settled true (fail-open) y ok false', () => {
    const store = useProgressionStore()

    store.setCheckInError('Error cargando check-ins')

    expect(store.checkInSettled).toBe(true)
    expect(store.checkInOk).toBe(false)
  })

  it('setCheckInError(null) solo limpia el mensaje: no cuenta como respuesta', () => {
    const store = useProgressionStore()

    store.setCheckInError(null)

    expect(store.checkInSettled).toBe(false)
    expect(store.checkInOk).toBeNull()
  })

  it('un error posterior a un éxito deja ok false pero conserva settled y el estado previo', () => {
    const store = useProgressionStore()
    store.setCheckInState(CHECK_IN)

    store.setCheckInError('Network Error')

    expect(store.checkInSettled).toBe(true)
    expect(store.checkInOk).toBe(false)
    expect(store.checkInState).toEqual(CHECK_IN)
  })

  it('reset() baja checkInSettled y checkInOk', () => {
    const store = useProgressionStore()
    store.setCheckInState(CHECK_IN)

    store.reset()

    expect(store.checkInSettled).toBe(false)
    expect(store.checkInOk).toBeNull()
  })
})

describe('progressionStore — generación (cierre 203)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('reset() sube la generación; las demás acciones no', () => {
    const store = useProgressionStore()
    const g0 = store.currentGeneration()

    store.setProgressionData(PROGRESSION)
    store.markStatsSettled(true)
    expect(store.currentGeneration()).toBe(g0)

    store.reset()
    expect(store.currentGeneration()).toBe(g0 + 1)
    store.reset()
    expect(store.currentGeneration()).toBe(g0 + 2)
  })
})

describe('progressionStore — todayPresencial (resumen de la clase presencial)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('setProgressionData guarda la clase presencial de hoy', () => {
    const store = useProgressionStore()

    store.setProgressionData({
      ...PROGRESSION,
      todayPresencial: { branchName: 'Moreno', blocksCompleted: ['NUCLEUS'] },
    })

    expect(store.todayPresencial).toEqual({ branchName: 'Moreno', blocksCompleted: ['NUCLEUS'] })
  })

  it('un API sin el campo deja todayPresencial en null', () => {
    const store = useProgressionStore()
    store.setProgressionData({
      ...PROGRESSION,
      todayPresencial: { branchName: 'Moreno', blocksCompleted: [] },
    })

    store.setProgressionData(PROGRESSION)

    expect(store.todayPresencial).toBeNull()
  })

  it('reset() la borra', () => {
    const store = useProgressionStore()
    store.setProgressionData({
      ...PROGRESSION,
      todayPresencial: { branchName: 'Moreno', blocksCompleted: [] },
    })

    store.reset()

    expect(store.todayPresencial).toBeNull()
  })
})
