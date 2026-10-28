import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { AxiosError, AxiosHeaders } from 'axios'

vi.mock('src/utils/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('src/boot/axios', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}))

import { api } from 'src/boot/axios'
import {
  useUserStore,
  MEMBER_LOAD_MAX_IN_FLIGHT_MS,
  MEMBER_STATE_MAX_AGE_MS,
  type UserProfile,
} from '../useUserStore'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Respuesta controlable a mano para observar el estado "en vuelo". */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** Deja correr las microtareas pendientes (sirve también con fake timers). */
async function flush(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve()
}

type RouteKey =
  | 'subscription'
  | 'planStatus'
  | 'trial'
  | 'myProgress'
  | 'currentProgram'
  | 'enrollments'

type Handler = () => unknown

const SUFFIXES: Record<RouteKey, string> = {
  subscription: '/me/subscription',
  planStatus: '/me/plan-status',
  trial: '/trial-eligibility',
  myProgress: '/my-progress',
  currentProgram: '/me/current-program',
  enrollments: '/me/enrollments',
}

const EXPIRED_SUB = { status: 'expired', planName: 'Mensual', startDate: '2026-09-01' }
const ACTIVE_SUB = { ...EXPIRED_SUB, status: 'active', planCategory: 'presencial' }
const PROGRESS = { enrollmentId: 11, programId: 3, programName: 'Fundación', goalPlanType: null }
const PROGRESS_2 = {
  enrollmentId: 12,
  programId: 4,
  programName: 'Gluteos',
  goalPlanType: 'gluteos',
}
const CURRENT = { enrollmentId: 11, program: { id: 3, name: 'Fundación' } }
const ENROLLMENTS = { enrollments: [{ id: 11, programId: 3, programName: 'Fundación' }] }

const defaults: Record<RouteKey, Handler> = {
  subscription: () => ({ status: 200, data: EXPIRED_SUB }),
  planStatus: () => ({ status: 200, data: { hasActivePlan: false } }),
  trial: () => ({
    status: 200,
    data: { eligible: true, alreadyBooked: false, phoneRequired: false },
  }),
  myProgress: () => ({ status: 200, data: PROGRESS }),
  currentProgram: () => ({ status: 200, data: CURRENT }),
  enrollments: () => ({ status: 200, data: ENROLLMENTS }),
}

/** Cada ruta responde con su handler (los que no se pasen usan el default). */
function mockApi(overrides: Partial<Record<RouteKey, Handler>> = {}) {
  const handlers: Record<RouteKey, Handler> = { ...defaults, ...overrides }
  vi.mocked(api.get).mockImplementation((async (url: string) => {
    const key = (Object.keys(SUFFIXES) as RouteKey[]).find((k) => url.endsWith(SUFFIXES[k]))
    if (!key) throw new Error(`ruta inesperada en el test: ${url}`)
    return await handlers[key]()
  }) as never)
}

function count(key: RouteKey): number {
  return vi.mocked(api.get).mock.calls.filter(([u]) => String(u).endsWith(SUFFIXES[key])).length
}

function totalCalls(): number {
  return vi.mocked(api.get).mock.calls.length
}

function networkError(): AxiosError {
  return new AxiosError('Network Error', 'ERR_NETWORK')
}

function notFound(): AxiosError {
  return new AxiosError('Not Found', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 404,
    statusText: 'Not Found',
    data: null,
    headers: {},
    config: { headers: new AxiosHeaders() },
  })
}

function profileOf(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 1,
    email: 'socio@test.com',
    firstName: 'Socio',
    lastName: 'Test',
    role: 'member',
    level: 'alfa',
    branchId: 1,
    branchName: 'El Templo Sede',
    branchIsVirtual: false,
    branchCountry: 'AR',
    segment: null,
    onboardingCompleted: true,
    introStoriesSeenAt: null,
    introStoriesCompletedAt: null,
    introStoriesLastSlide: null,
    gender: null,
    dateOfBirth: null,
    barChallengeCompleted: null,
    barChallengeSeconds: null,
    barChallengeAttemptedAt: null,
    ...overrides,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useUserStore · estado del socio (loadMemberState / ensureMemberState)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(api.get).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('paralelo y un pedido por endpoint', () => {
    it('primera carga: los 6 pedidos salen en paralelo, antes de que resuelva el primero', async () => {
      const gate = deferred<void>()
      const gated = (key: RouteKey): Handler => async () => {
        await gate.promise
        return defaults[key]()
      }
      mockApi({
        subscription: gated('subscription'),
        planStatus: gated('planStatus'),
        trial: gated('trial'),
        myProgress: gated('myProgress'),
        currentProgram: gated('currentProgram'),
        enrollments: gated('enrollments'),
      })
      const store = useUserStore()

      const load = store.ensureMemberState()
      // Sin avanzar ni un tick: ya están los 6 GET en vuelo, ninguno espera a otro.
      expect(count('subscription')).toBe(1)
      expect(count('planStatus')).toBe(1)
      expect(count('trial')).toBe(1)
      expect(count('myProgress')).toBe(1)
      expect(count('currentProgram')).toBe(1)
      expect(count('enrollments')).toBe(1)
      expect(store.memberStateLoaded).toBe(false)

      gate.resolve()
      await load
      expect(store.memberStateLoaded).toBe(true)
    })

    it('dos ensureMemberState simultáneos (boot + Mi Templo) hacen un pedido por endpoint', async () => {
      mockApi()
      const store = useUserStore()

      await Promise.all([store.ensureMemberState(), store.ensureMemberState()])

      expect(totalCalls()).toBe(6)
      for (const key of Object.keys(SUFFIXES) as RouteKey[]) expect(count(key)).toBe(1)
    })

    it('ensureMemberState sin force con una carga en vuelo comparte la en vuelo (un pedido por endpoint)', async () => {
      const sub = deferred<unknown>()
      mockApi({ subscription: () => sub.promise })
      const store = useUserStore()

      const first = store.ensureMemberState()
      const second = store.ensureMemberState({ maxAgeMs: 0 })
      sub.resolve({ status: 200, data: EXPIRED_SUB })
      await Promise.all([first, second])

      expect(count('subscription')).toBe(1)
      expect(count('myProgress')).toBe(1)
    })

    it('socio de sede virtual: no pide trial-eligibility y trialEligibilityLoaded queda true', async () => {
      mockApi()
      const store = useUserStore()
      store.setProfile(profileOf({ branchIsVirtual: true }))

      await store.ensureMemberState()

      expect(count('trial')).toBe(0)
      expect(store.trialEligibilityLoaded).toBe(true)
      expect(store.trialEligibility).toBeNull()
      expect(store.trialEligible).toBe(false)
      expect(count('subscription')).toBe(1)
    })
  })

  describe('force y loadSubscription', () => {
    it('force con carga en vuelo encadena una carga completa (2 pedidos de suscripción) y resuelve después del segundo', async () => {
      const subs = [deferred<unknown>(), deferred<unknown>()]
      let i = 0
      mockApi({ subscription: () => subs[i++].promise })
      const store = useUserStore()

      const initial = store.ensureMemberState()
      let forceDone = false
      const forced = store.ensureMemberState({ force: true }).then(() => {
        forceDone = true
      })
      // El force NO devuelve la en vuelo: espera.
      expect(count('subscription')).toBe(1)

      subs[0].resolve({ status: 200, data: EXPIRED_SUB })
      await initial
      await flush()
      // Encadenó una carga completa: las 6 de nuevo.
      expect(count('subscription')).toBe(2)
      expect(count('planStatus')).toBe(2)
      expect(count('trial')).toBe(2)
      expect(count('myProgress')).toBe(2)
      expect(count('currentProgram')).toBe(2)
      expect(count('enrollments')).toBe(2)
      expect(forceDone).toBe(false)

      subs[1].resolve({ status: 200, data: ACTIVE_SUB })
      await forced
      expect(forceDone).toBe(true)
      expect(store.subscription?.status).toBe('active')
    })

    it('dos force simultáneos comparten la carga encadenada: 2 pedidos de suscripción, no 3', async () => {
      const subs = [deferred<unknown>(), deferred<unknown>()]
      let i = 0
      mockApi({ subscription: () => subs[i++].promise })
      const store = useUserStore()

      const initial = store.ensureMemberState()
      const forceA = store.ensureMemberState({ force: true })
      const forceB = store.loadSubscription()

      subs[0].resolve({ status: 200, data: EXPIRED_SUB })
      await initial
      await flush()
      subs[1].resolve({ status: 200, data: EXPIRED_SUB })
      await Promise.all([forceA, forceB])

      expect(count('subscription')).toBe(2)
      expect(count('myProgress')).toBe(2)
    })

    it('loadSubscription con un refresh en vuelo espera y encadena una carga completa fresca', async () => {
      mockApi()
      const store = useUserStore()
      await store.ensureMemberState()
      expect(count('subscription')).toBe(1)

      // Refresco (p.ej. el de Mi Templo por maxAgeMs) con la suscripción colgada a mano.
      const refreshSub = deferred<unknown>()
      mockApi({ subscription: () => refreshSub.promise })
      const refresh = store.ensureMemberState({ maxAgeMs: 0 })
      expect(count('subscription')).toBe(2)

      mockApi({ subscription: () => ({ status: 200, data: ACTIVE_SUB }) })
      let done = false
      const load = store.loadSubscription().then(() => {
        done = true
      })
      await flush()
      // No resolvió con el refresh ni pidió nada todavía: espera a que termine.
      expect(done).toBe(false)
      expect(count('subscription')).toBe(2)

      refreshSub.resolve({ status: 200, data: EXPIRED_SUB })
      await refresh
      await load
      // Las 6 nuevas salieron DESPUÉS de la llamada: la suscripción es la fresca.
      expect(count('subscription')).toBe(3)
      expect(count('planStatus')).toBe(3)
      expect(count('trial')).toBe(3)
      expect(count('myProgress')).toBe(3)
      expect(count('currentProgram')).toBe(3)
      expect(count('enrollments')).toBe(3)
      expect(store.subscription?.status).toBe('active')
    })

    it('loadSubscription sin carga en vuelo prende subscriptionLoading en el mismo tick', () => {
      const sub = deferred<unknown>()
      mockApi({ subscription: () => sub.promise })
      const store = useUserStore()

      void store.loadSubscription()
      // Sin await: no hay microtask de demora (W2).
      expect(store.subscriptionLoading).toBe(true)
      expect(count('subscription')).toBe(1)
    })

    it('force sin carga en vuelo y con datos frescos igual hace una carga completa inmediata', async () => {
      mockApi()
      const store = useUserStore()
      await store.ensureMemberState()
      const before = totalCalls()

      void store.ensureMemberState({ force: true })
      expect(totalCalls() - before).toBe(6)
    })

    it('un logout entre la carga en vuelo y la encadenada cancela la encadenada', async () => {
      const sub = deferred<unknown>()
      mockApi({ subscription: () => sub.promise })
      const store = useUserStore()

      const initial = store.ensureMemberState()
      const forced = store.ensureMemberState({ force: true })
      store.clearProfile()

      sub.resolve({ status: 200, data: ACTIVE_SUB })
      await initial
      await forced
      await flush()

      expect(count('subscription')).toBe(1)
      expect(store.subscription).toBeNull()
    })
  })

  describe('frescura y refresco', () => {
    it('dentro de la frescura no pide nada; fuera de la frescura hace un refresco', async () => {
      vi.useFakeTimers()
      mockApi()
      const store = useUserStore()
      await store.ensureMemberState()
      const afterInitial = totalCalls()

      vi.advanceTimersByTime(MEMBER_STATE_MAX_AGE_MS - 5_000)
      await store.ensureMemberState()
      expect(totalCalls()).toBe(afterInitial)

      vi.advanceTimersByTime(6_000)
      await store.ensureMemberState()
      expect(totalCalls()).toBeGreaterThan(afterInitial)
      expect(count('myProgress')).toBe(2)
    })

    it('ensureMemberState({ maxAgeMs }) respeta la frescura que pide el llamador', async () => {
      vi.useFakeTimers()
      mockApi()
      const store = useUserStore()
      await store.ensureMemberState()
      const afterInitial = totalCalls()

      vi.advanceTimersByTime(2_000)
      await store.ensureMemberState({ maxAgeMs: 1_000 })
      expect(count('myProgress')).toBe(2)
      expect(totalCalls()).toBeGreaterThan(afterInitial)
    })

    it('refresco con plan activo no pide plan-status (ni suscripción ni trial) pero sí my-progress y el programa', async () => {
      mockApi({ subscription: () => ({ status: 200, data: ACTIVE_SUB }) })
      const store = useUserStore()
      await store.ensureMemberState()
      expect(store.hasActiveSubscription).toBe(true)

      await store.ensureMemberState({ maxAgeMs: 0 })

      expect(count('planStatus')).toBe(1)
      expect(count('subscription')).toBe(1)
      expect(count('trial')).toBe(1)
      expect(count('myProgress')).toBe(2)
      expect(count('currentProgram')).toBe(2)
      expect(count('enrollments')).toBe(2)
    })

    it('refresco sin plan activo sí pide plan-status, suscripción y trial', async () => {
      mockApi()
      const store = useUserStore()
      await store.ensureMemberState()
      expect(store.hasActiveSubscription).toBe(false)

      await store.ensureMemberState({ maxAgeMs: 0 })

      expect(count('planStatus')).toBe(2)
      expect(count('subscription')).toBe(2)
      expect(count('trial')).toBe(2)
    })

    it('memberStateLoaded pasa a true al resolver las 6 y un refresco no lo devuelve a false', async () => {
      mockApi()
      const store = useUserStore()
      expect(store.memberStateLoaded).toBe(false)

      await store.ensureMemberState()
      expect(store.memberStateLoaded).toBe(true)

      const slow = deferred<unknown>()
      mockApi({ myProgress: () => slow.promise })
      const refresh = store.ensureMemberState({ maxAgeMs: 0 })
      expect(store.memberStateLoaded).toBe(true)
      slow.resolve({ status: 200, data: PROGRESS })
      await refresh
      expect(store.memberStateLoaded).toBe(true)
    })
  })

  describe('fallas: "no sé", nunca "no tiene"', () => {
    it('error de red en la suscripción (primera carga) marca subscriptionFailed; 404 y 204 no', async () => {
      mockApi({
        subscription: () => {
          throw networkError()
        },
      })
      const store = useUserStore()
      await store.ensureMemberState()
      expect(store.subscription).toBeNull()
      expect(store.subscriptionLoaded).toBe(true)
      expect(store.subscriptionFailed).toBe(true)

      mockApi({
        subscription: () => {
          throw notFound()
        },
      })
      await store.loadSubscription()
      expect(store.subscriptionFailed).toBe(false)

      mockApi({ subscription: () => ({ status: 204, data: null }) })
      await store.loadSubscription()
      expect(store.subscriptionFailed).toBe(false)
      expect(store.subscription).toBeNull()
    })

    it('error de red en la suscripción en una recarga conserva la suscripción previa; la siguiente exitosa limpia la falla', async () => {
      mockApi({ subscription: () => ({ status: 200, data: EXPIRED_SUB }) })
      const store = useUserStore()
      await store.ensureMemberState()
      expect(store.subscription?.status).toBe('expired')

      mockApi({
        subscription: () => {
          throw networkError()
        },
      })
      await store.loadSubscription()
      expect(store.subscription?.status).toBe('expired')
      expect(store.subscriptionFailed).toBe(true)

      mockApi({ subscription: () => ({ status: 200, data: ACTIVE_SUB }) })
      await store.loadSubscription()
      expect(store.subscription?.status).toBe('active')
      expect(store.subscriptionFailed).toBe(false)
    })

    it('myProgress guarda el objeto completo (204 → null) y myProgressLoaded sube', async () => {
      mockApi()
      const store = useUserStore()
      expect(store.myProgressLoaded).toBe(false)
      await store.ensureMemberState()
      expect(store.myProgress).toEqual(PROGRESS)
      expect(store.myProgressLoaded).toBe(true)
      expect(store.hasActiveProgramEnrollment).toBe(true)

      mockApi({ myProgress: () => ({ status: 204, data: '' }) })
      await store.loadSubscription()
      expect(store.myProgress).toBeNull()
      expect(store.hasActiveProgramEnrollment).toBe(false)
      expect(store.myProgressFailed).toBe(false)
    })

    it('falla de my-progress en recarga conserva el dato previo y marca myProgressFailed/programFailed; el éxito posterior lo limpia', async () => {
      mockApi({ myProgress: () => ({ status: 200, data: PROGRESS_2 }) })
      const store = useUserStore()
      await store.ensureMemberState()
      expect(store.hasActiveProgramEnrollment).toBe(true)
      expect(store.enrolledGoalPlanType).toBe('gluteos')

      mockApi({
        myProgress: () => {
          throw networkError()
        },
      })
      await store.loadSubscription()
      expect(store.myProgressFailed).toBe(true)
      expect(store.programFailed).toBe(true)
      expect(store.myProgress).toEqual(PROGRESS_2)
      expect(store.hasActiveProgramEnrollment).toBe(true)
      expect(store.enrolledGoalPlanType).toBe('gluteos')

      mockApi()
      await store.loadSubscription()
      expect(store.myProgressFailed).toBe(false)
      expect(store.programFailed).toBe(false)
    })

    it('falla de my-progress en la primera carga deja myProgress en null (y la falla marcada)', async () => {
      mockApi({
        myProgress: () => {
          throw networkError()
        },
      })
      const store = useUserStore()
      await store.ensureMemberState()
      expect(store.myProgress).toBeNull()
      expect(store.myProgressFailed).toBe(true)
      expect(store.myProgressLoaded).toBe(true)
      expect(store.memberStateLoaded).toBe(true)
    })

    it('falla de enrollments conserva las inscripciones y el programa previos y marca programFailed', async () => {
      mockApi()
      const store = useUserStore()
      await store.ensureMemberState()
      expect(store.allActiveEnrollments).toHaveLength(1)

      mockApi({
        enrollments: () => {
          throw networkError()
        },
      })
      await store.loadSubscription()
      expect(store.currentProgramFailed).toBe(true)
      expect(store.programFailed).toBe(true)
      expect(store.myProgressFailed).toBe(false)
      expect(store.allActiveEnrollments).toHaveLength(1)
      expect(store.currentProgram.enrollmentId).toBe(11)

      mockApi()
      await store.loadSubscription()
      expect(store.currentProgramFailed).toBe(false)
      expect(store.programFailed).toBe(false)
    })

    it('falla de plan-status marca planStatusFailed y conserva el planStatus previo; el éxito posterior lo limpia', async () => {
      mockApi({
        planStatus: () => ({ status: 200, data: { hasActivePlan: false, hadPlan: true } }),
      })
      const store = useUserStore()
      await store.ensureMemberState()
      expect(store.planStatus?.hadPlan).toBe(true)

      mockApi({
        planStatus: () => {
          throw networkError()
        },
      })
      await store.loadSubscription()
      expect(store.planStatusFailed).toBe(true)
      expect(store.planStatus?.hadPlan).toBe(true)
      expect(store.planStatusLoaded).toBe(true)

      mockApi()
      await store.loadSubscription()
      expect(store.planStatusFailed).toBe(false)
    })

    it('falla de plan-status en la primera carga deja planStatus en null con planStatusFailed', async () => {
      mockApi({
        planStatus: () => {
          throw networkError()
        },
      })
      const store = useUserStore()
      await store.ensureMemberState()
      expect(store.planStatus).toBeNull()
      expect(store.planStatusFailed).toBe(true)
      expect(store.planStatusLoaded).toBe(true)
    })

    it('trialEligible = elegible y sin reserva de prueba; un error es fail-open a null con trialEligibilityLoaded true', async () => {
      mockApi()
      const store = useUserStore()
      await store.ensureMemberState()
      expect(store.trialEligible).toBe(true)

      mockApi({
        trial: () => ({
          status: 200,
          data: { eligible: true, alreadyBooked: true, phoneRequired: false },
        }),
      })
      await store.loadSubscription()
      expect(store.trialEligible).toBe(false)

      mockApi({
        trial: () => {
          throw networkError()
        },
      })
      await store.loadSubscription()
      expect(store.trialEligibility).toBeNull()
      expect(store.trialEligible).toBe(false)
      expect(store.trialEligibilityLoaded).toBe(true)
    })
  })

  describe('logout y cargas colgadas', () => {
    it('clearProfile a mitad de una carga: las respuestas viejas no escriben, memberStateLoaded queda false y la próxima ensureMemberState pide de nuevo', async () => {
      const sub = deferred<unknown>()
      const progress = deferred<unknown>()
      mockApi({ subscription: () => sub.promise, myProgress: () => progress.promise })
      const store = useUserStore()

      const load = store.ensureMemberState()
      store.clearProfile()
      sub.resolve({ status: 200, data: ACTIVE_SUB })
      progress.resolve({ status: 200, data: PROGRESS })
      await load
      await flush()

      expect(store.subscription).toBeNull()
      expect(store.subscriptionLoaded).toBe(false)
      expect(store.myProgress).toBeNull()
      expect(store.myProgressLoaded).toBe(false)
      expect(store.memberStateLoaded).toBe(false)

      mockApi()
      await store.ensureMemberState()
      expect(store.memberStateLoaded).toBe(true)
      // No reutilizó la promesa vieja: pidió de nuevo (1 de la vieja + 1 de la nueva).
      expect(count('subscription')).toBe(2)
    })

    it('clearProfile reinicia todas las banderas y datos del socio', async () => {
      mockApi({
        subscription: () => {
          throw networkError()
        },
      })
      const store = useUserStore()
      await store.ensureMemberState()
      expect(store.subscriptionFailed).toBe(true)

      store.clearProfile()

      expect(store.subscriptionFailed).toBe(false)
      expect(store.planStatusFailed).toBe(false)
      expect(store.myProgressFailed).toBe(false)
      expect(store.currentProgramFailed).toBe(false)
      expect(store.myProgress).toBeNull()
      expect(store.trialEligibility).toBeNull()
      expect(store.trialEligibilityLoaded).toBe(false)
      expect(store.memberStateLoaded).toBe(false)
      expect(store.hasActiveProgramEnrollment).toBe(false)
    })

    it('una carga colgada vence: antes del tope se comparte, pasado el tope ensureMemberState arranca una nueva', async () => {
      vi.useFakeTimers()
      let n = 0
      mockApi({
        subscription: () => (n++ === 0 ? new Promise(() => {}) : { status: 200, data: ACTIVE_SUB }),
      })
      const store = useUserStore()

      void store.ensureMemberState()
      vi.advanceTimersByTime(MEMBER_LOAD_MAX_IN_FLIGHT_MS - 1_000)
      void store.ensureMemberState()
      expect(count('subscription')).toBe(1)

      vi.advanceTimersByTime(2_000)
      await store.ensureMemberState()
      expect(count('subscription')).toBe(2)
      expect(store.subscription?.status).toBe('active')
      expect(store.memberStateLoaded).toBe(true)
    })

    it('un force que esperaba una carga colgada arranca su carga completa al vencer el tope, sin esperar más', async () => {
      vi.useFakeTimers()
      let n = 0
      mockApi({
        subscription: () => (n++ === 0 ? new Promise(() => {}) : { status: 200, data: ACTIVE_SUB }),
      })
      const store = useUserStore()

      void store.ensureMemberState()
      let forceDone = false
      const forced = store.ensureMemberState({ force: true }).then(() => {
        forceDone = true
      })
      await flush()
      expect(forceDone).toBe(false)
      expect(count('subscription')).toBe(1)

      await vi.advanceTimersByTimeAsync(MEMBER_LOAD_MAX_IN_FLIGHT_MS + 1_000)
      await forced
      expect(forceDone).toBe(true)
      expect(count('subscription')).toBe(2)
      expect(count('myProgress')).toBe(2)
      expect(store.subscription?.status).toBe('active')
    })

    it('si la carga colgada resuelve tarde, no pisa lo que escribió la nueva', async () => {
      vi.useFakeTimers()
      const oldSub = deferred<unknown>()
      const oldProgress = deferred<unknown>()
      let n = 0
      mockApi({
        subscription: () => (n++ === 0 ? oldSub.promise : { status: 200, data: ACTIVE_SUB }),
        myProgress: () => (n > 1 ? { status: 200, data: PROGRESS_2 } : oldProgress.promise),
      })
      const store = useUserStore()

      void store.ensureMemberState()
      vi.advanceTimersByTime(MEMBER_LOAD_MAX_IN_FLIGHT_MS + 1_000)
      await store.ensureMemberState()
      expect(store.subscription?.status).toBe('active')
      expect(store.myProgress).toEqual(PROGRESS_2)

      // La vieja llega tarde con datos distintos.
      oldSub.resolve({ status: 200, data: EXPIRED_SUB })
      oldProgress.resolve({ status: 200, data: PROGRESS })
      await flush()

      expect(store.subscription?.status).toBe('active')
      expect(store.myProgress).toEqual(PROGRESS_2)
      expect(store.hasActiveProgramEnrollment).toBe(true)
      expect(store.enrolledGoalPlanType).toBe('gluteos')
    })
  })
})
