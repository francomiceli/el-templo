import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { notifyCreate } = vi.hoisted(() => ({ notifyCreate: vi.fn() }))
vi.mock('quasar', () => ({ Notify: { create: notifyCreate } }))

vi.mock('src/boot/axios', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

import { api } from 'src/boot/axios'
import { useProgressionApi } from '../useProgressionApi'
import { useCheckInApi } from '../useCheckInApi'
import { useProgressionStore } from '../../stores/progressionStore'
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
  answers: { energy: null, soreness: null, sleep: null },
}

describe('useProgressionApi.fetchStats — banderas y toast (fase 203, D-16)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(api.get).mockReset()
    notifyCreate.mockClear()
  })

  it('2xx: statsLoaded true, statsOk true, sin toast', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: PROGRESSION })
    const store = useProgressionStore()

    await useProgressionApi().fetchStats()

    expect(api.get).toHaveBeenCalledWith('/progression/stats')
    expect(store.statsLoaded).toBe(true)
    expect(store.statsOk).toBe(true)
    expect(store.statsFailed).toBe(false)
    expect(store.stats).toEqual(PROGRESSION.stats)
    expect(store.loading).toBe(false)
    expect(notifyCreate).not.toHaveBeenCalled()
  })

  it('error en la primera carga: fail-open (statsLoaded true), statsFailed true y el toast negativo se mantiene', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network Error'))
    const store = useProgressionStore()

    await expect(useProgressionApi().fetchStats()).resolves.toBeUndefined()

    expect(store.statsLoaded).toBe(true)
    expect(store.statsOk).toBe(false)
    expect(store.statsFailed).toBe(true)
    expect(store.error).toBe('Network Error')
    expect(store.loading).toBe(false)
    expect(notifyCreate).toHaveBeenCalledTimes(1)
    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'negative', message: 'Network Error' }),
    )
  })

  it('refresco fallido: conserva las stats previas (statsFailed false) y también avisa con el toast', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: PROGRESSION })
    const store = useProgressionStore()
    const { fetchStats } = useProgressionApi()
    await fetchStats()

    vi.mocked(api.get).mockRejectedValueOnce(new Error('Network Error'))
    await fetchStats()

    expect(store.stats).toEqual(PROGRESSION.stats)
    expect(store.statsOk).toBe(false)
    expect(store.statsFailed).toBe(false)
    expect(notifyCreate).toHaveBeenCalledTimes(1)
  })

  it('durante el pedido: loading true pero statsLoaded sigue en false', async () => {
    let resolve!: (value: unknown) => void
    vi.mocked(api.get).mockReturnValue(new Promise((res) => (resolve = res)) as never)
    const store = useProgressionStore()

    const pending = useProgressionApi().fetchStats()

    expect(store.loading).toBe(true)
    expect(store.statsLoaded).toBe(false)
    resolve({ data: PROGRESSION })
    await pending
    expect(store.statsLoaded).toBe(true)
  })

  it('éxito tras un error: statsFailed vuelve a false', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Network Error'))
    const store = useProgressionStore()
    const { fetchStats } = useProgressionApi()
    await fetchStats()
    expect(store.statsFailed).toBe(true)

    vi.mocked(api.get).mockResolvedValueOnce({ data: PROGRESSION })
    await fetchStats()

    expect(store.statsFailed).toBe(false)
    expect(store.error).toBeNull()
  })
})

describe('useProgressionApi.fetchStats — respuesta tardía del socio anterior (cierre 203)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(api.get).mockReset()
    notifyCreate.mockClear()
  })

  it('una respuesta 2xx de antes del reset() no escribe stats ni marca statsLoaded del socio nuevo', async () => {
    let resolve!: (value: unknown) => void
    vi.mocked(api.get).mockReturnValue(new Promise((res) => (resolve = res)) as never)
    const store = useProgressionStore()
    const pending = useProgressionApi().fetchStats()

    store.reset()
    resolve({ data: PROGRESSION })
    await pending

    expect(store.stats).toBeNull()
    expect(store.level).toBeNull()
    expect(store.statsLoaded).toBe(false)
    expect(store.statsOk).toBeNull()
  })

  it('un error de antes del reset() no marca statsLoaded/statsOk, ni setea error, ni avisa con el toast', async () => {
    let reject!: (reason: unknown) => void
    vi.mocked(api.get).mockReturnValue(new Promise((_, rej) => (reject = rej)) as never)
    const store = useProgressionStore()
    const pending = useProgressionApi().fetchStats()

    store.reset()
    reject(new Error('Network Error'))
    await pending

    expect(store.statsLoaded).toBe(false)
    expect(store.statsOk).toBeNull()
    expect(store.error).toBeNull()
    expect(notifyCreate).not.toHaveBeenCalled()
  })

  it('la respuesta vieja no baja el loading del pedido del socio nuevo', async () => {
    let resolveOld!: (value: unknown) => void
    vi.mocked(api.get).mockReturnValueOnce(new Promise((res) => (resolveOld = res)) as never)
    vi.mocked(api.get).mockReturnValueOnce(new Promise(() => {}) as never)
    const store = useProgressionStore()
    const pendingOld = useProgressionApi().fetchStats()

    store.reset()
    void useProgressionApi().fetchStats()
    expect(store.loading).toBe(true)
    resolveOld({ data: PROGRESSION })
    await pendingOld

    expect(store.loading).toBe(true)
    expect(store.statsLoaded).toBe(false)
  })
})

describe('useCheckInApi.fetchTodayCheckIns — banderas (fase 203)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(api.get).mockReset()
  })

  it('2xx: checkInSettled true y checkInOk true', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: CHECK_IN })
    const store = useProgressionStore()

    await useCheckInApi().fetchTodayCheckIns()

    expect(api.get).toHaveBeenCalledWith('/check-ins/today')
    expect(store.checkInSettled).toBe(true)
    expect(store.checkInOk).toBe(true)
    expect(store.checkInLoading).toBe(false)
  })

  it('error: checkInSettled true (fail-open) pero checkInOk false', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network Error'))
    const store = useProgressionStore()

    await expect(useCheckInApi().fetchTodayCheckIns()).resolves.toBeUndefined()

    expect(store.checkInSettled).toBe(true)
    expect(store.checkInOk).toBe(false)
    expect(store.checkInLoading).toBe(false)
  })

  it('una respuesta de antes del reset() no marca checkInSettled ni escribe el estado del socio nuevo', async () => {
    let resolve!: (value: unknown) => void
    vi.mocked(api.get).mockReturnValue(new Promise((res) => (resolve = res)) as never)
    const store = useProgressionStore()
    const pending = useCheckInApi().fetchTodayCheckIns()

    store.reset()
    resolve({ data: CHECK_IN })
    await pending

    expect(store.checkInState).toBeNull()
    expect(store.checkInSettled).toBe(false)
    expect(store.checkInOk).toBeNull()
  })

  it('un error de antes del reset() no marca checkInSettled ni checkInOk', async () => {
    let reject!: (reason: unknown) => void
    vi.mocked(api.get).mockReturnValue(new Promise((_, rej) => (reject = rej)) as never)
    const store = useProgressionStore()
    const pending = useCheckInApi().fetchTodayCheckIns()

    store.reset()
    reject(new Error('Network Error'))
    await pending

    expect(store.checkInSettled).toBe(false)
    expect(store.checkInOk).toBeNull()
    expect(store.checkInError).toBeNull()
  })
})
