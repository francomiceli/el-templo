import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { AxiosError } from 'axios'
import { api } from 'src/boot/axios'
import { createLogger } from 'src/utils/logger'
import { shareInFlight } from 'src/utils/share-in-flight'
import { useLevelSelectionStorage } from 'src/composables/useLevelSelectionStorage'
import { isTrainingLevel, type Level } from 'src/modules/training/level-display'
import { fullLineLabel, sameSpecialLine } from 'src/utils/special-line'
import type { MemberPlanStatus } from 'src/types/plan-status'
import type { MemberEnrollmentProgress } from 'src/modules/programs/types'
import type { TrialEligibility } from 'src/composables/useSchedulingApi'

// Fase 199 (D-05): el tipo vive en types/ para que utilidades puras lo usen sin Pinia.
export type { MemberPlanStatus }

// Re-export Level for backward compatibility with existing imports.
export type { Level }

// Phase 136 (D-01): Attendance label (4 bands by % membership usage over 28d)
// replaces the legacy 6-value behavioral segment. `segment` may be NULL for
// members <1 month old or without an active plan (D-07/D-08) — consumers fall
// back gracefully (see SegmentGreeting `?? 'Hola,'`).
export type MemberSegment = 'optima' | 'regular' | 'alerta' | 'ausente'

export type SubscriptionStatus =
  | 'active'
  | 'paused'
  | 'cancelled'
  | 'expired'
  | 'completed'
  | 'changed'
  | 'scheduled'

export interface UserProfile {
  id: number
  email: string
  firstName: string | null
  lastName: string | null
  role: 'member' | 'coach' | 'admin' | 'superadmin'
  level: Level
  branchId: number
  branchName: string
  branchIsVirtual: boolean
  branchCountry: 'AR' | 'ES'
  // Fase 199 (D-04): zona de la sede para 'hoy'. Opcional: API vieja no lo manda → `DEFAULT_BRANCH_TZ`
  branchTimezone?: string
  segment: MemberSegment | null
  onboardingCompleted: boolean
  // SPEC "Empezá acá" B (persistencia y métrica): null hasta la primera
  // apertura de las historias de bienvenida. MainLayout.vue las abre solas
  // una vez cuando `onboardingCompleted && !introStoriesSeenAt`.
  introStoriesSeenAt: string | null
  introStoriesCompletedAt: string | null
  introStoriesLastSlide: number | null
  gender: 'male' | 'female' | 'other' | 'unspecified' | null
  dateOfBirth: string | null
  // Phase 115 (Desafío de la Barra): set por GET /me cuando el usuario ya hizo
  // su intento. `null` significa "todavía no intentó" (también el caso para
  // todos los usuarios pre-evento). Plan 04 popula estos fields en el endpoint.
  barChallengeCompleted: boolean | null
  barChallengeSeconds: number | null
  barChallengeAttemptedAt: string | null
  // Fecha de alta (users.created_at, ISO) — gatea el sello de veterano (1+ año).
  // Opcional: un API viejo sin el campo simplemente oculta el sello.
  memberSince?: string
}

export interface MemberSubscription {
  id: number
  planName: string
  planTier: string
  status: SubscriptionStatus
  startDate: string
  endDate: string | null
  daysRemaining: number
  pricePaid: number
  planCategory: string
  multiBranch: boolean
}

// Phase 162 (APP-02): pase especial "Actividades con Aura" del member.
// Contrato del endpoint GET /me/especial-pass (162-02): sin pase → { hasPass:false };
// con pase → hasPass:true + saldo x/budget + discriminador socio/externo.
// AISLADO del `subscription` singular a propósito (D-06: capabilities aditivas):
// un socio con presencial+pase NO debe perder acceso a la grilla presencial.
// 2026-09-29 (línea del pase): puede haber un pase por línea (Aura, Yoga...).
// `passes` trae uno por línea; los campos sueltos describen el primero (compat).
export interface EspecialPassLine {
  // NULL = "Actividades con Aura"; otro texto = línea propia (ej. "Yoga").
  specialLine: string | null
  lineLabel: string
  planName: string
  classesRemaining: number | null
  classesBudget: number | null
  endDate: string | null
  isSocio: boolean
}

export interface EspecialPass {
  hasPass: boolean
  passes: EspecialPassLine[]
  // null = acceso ilimitado (plan con monthly_class_budget NULL). Los tiers con
  // cupo (2/4 accesos) traen el entero.
  classesRemaining: number | null
  classesBudget: number | null
  endDate: string | null
  isSocio: boolean
}

// Phase 104: Current-program pointer + active-enrollments listing.
// Source endpoints: GET/PUT /members/me/current-program (Plan 04),
// GET /members/me/enrollments (Plan 04). Plan 05 only consumes them.
export interface CurrentProgramData {
  enrollmentId: number | null
  program: {
    id: number
    name: string
    goalPlanType: string | null
    durationWeeks: number | null
    currentWeek: number
  } | null
}

export interface EnrollmentSummary {
  id: number
  programId: number
  programName: string
  goalPlanType: string | null
  currentWeek: number
  durationWeeks: number | null
}

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'Activo',
  paused: 'Pausado',
  cancelled: 'Cancelado',
  expired: 'Expirado',
  completed: 'Completado',
  changed: 'Cambiado',
  scheduled: 'Programado',
}

const STATUS_COLORS: Record<SubscriptionStatus, string> = {
  active: 'positive',
  paused: 'warning',
  cancelled: 'negative',
  expired: 'grey',
  completed: 'info',
  changed: 'purple',
  scheduled: 'blue-grey',
}

/**
 * Frescura de los datos del socio para `ensureMemberState()` sin `maxAgeMs`: el boot
 * carga todo y la primera pantalla que lo pide un instante después no repite los
 * pedidos (Pitfall 5 de la fase 203).
 */
export const MEMBER_STATE_MAX_AGE_MS = 15_000

/**
 * Vigencia máxima de una carga compartida. En nativo CapacitorHttp ignora el timeout
 * de axios: un pedido colgado no puede bloquear las cargas siguientes ni a los `force`
 * que lo esperan (W4). Pasado este tiempo la próxima llamada arranca una carga nueva.
 */
export const MEMBER_LOAD_MAX_IN_FLIGHT_MS = 15_000

export const useUserStore = defineStore('user', () => {
  const log = createLogger('useUserStore')

  // State
  const profile = ref<UserProfile | null>(null)
  const loading = ref(false)
  // App 1.7.9 (boot optimista): true cuando el boot arrancó la sesión con el
  // `AuthUser` mínimo decodificado del token (sin red para verificar/traer el
  // perfil rico). El router reintenta `retryProfileLoad()` en la primera
  // navegación mientras esto sea true.
  const profileStale = ref(false)
  const subscription = ref<MemberSubscription | null>(null)
  const subscriptionLoading = ref(false)
  // Fase 199: `subscription === null` significa a la vez "no tiene" y "todavía no
  // se cargó". Este flag distingue los dos casos (se prende en el finally de
  // loadSubscription, haya habido plan, 204 o error).
  const subscriptionLoaded = ref(false)
  // Fase 199 (D-05): estado de plan para distinguir "nunca tuvo" de "venció".
  // null = sin cargar o error de red (fail-open → la card cae a "Arrancá tu plan").
  const planStatus = ref<MemberPlanStatus | null>(null)
  const planStatusLoading = ref(false)
  const planStatusLoaded = ref(false)
  // Fase 203 (D-07): una falla es "no sé", nunca "no tiene". Cada fuente del socio
  // tiene su bandera de falla; un refresco fallido conserva el último dato bueno y
  // un éxito posterior la limpia.
  const subscriptionFailed = ref(false)
  const planStatusFailed = ref(false)
  const myProgressFailed = ref(false)
  const currentProgramFailed = ref(false)
  // Fase 203 (SC-4): el store guarda el objeto completo de my-progress para que
  // ninguna pantalla vuelva a pedirlo. null = sin inscripción (204) o sin cargar.
  const myProgress = ref<MemberEnrollmentProgress | null>(null)
  const myProgressLoaded = ref(false)
  // Fase 203 (D-15): trial-eligibility sale en paralelo con la suscripción para todos.
  // null = no elegible/sede virtual/error (fail-open).
  const trialEligibility = ref<TrialEligibility | null>(null)
  const trialEligibilityLoaded = ref(false)
  // true cuando las 6 fuentes del socio resolvieron (bien o mal) por primera vez.
  // Distingue "todavía no llegó" de "no tiene"; un refresco no lo vuelve a false.
  const memberStateLoaded = ref(false)
  // Closure-scoped (no reactivo): instante de la última carga completa vigente.
  let memberStateLoadedAt: number | null = null
  // Se incrementa en clearProfile: descarta respuestas en vuelo del socio anterior (T-203-11).
  let memberGeneration = 0
  // Secuencia de cargas: una carga vieja vencida no pisa a una más nueva (W4).
  let memberLoadSeq = 0
  // Secuencia del "visto" de la pelotita de Planes (ver loadPlanStatus).
  let planUpdateClearSeq = 0
  // Phase 162 (APP-02): pase especial. AISLADO del singular `subscription`
  // (D-06): sus capabilities son aditivas y NO alteran hasPresencialPlan /
  // hasPresencialReservationAccess. null = sin pase (o error/204).
  const especialPass = ref<EspecialPass | null>(null)
  // Líneas especiales (ej. ['Yoga']) donde el socio puede tomar UNA clase de prueba
  // gratis. Viene en ambas ramas de /me/especial-pass (con y sin pase). Builds viejos
  // del server no lo mandan → [].
  const trialLines = ref<string[]>([])
  const hasActiveProgramEnrollment = ref(false)
  const enrolledGoalPlanType = ref<string | null>(null)

  // Phase 104: current-program pointer + active enrollments listing.
  // Both populated by fetchCurrentProgram() (called from loadMemberState).
  // isUpdatingCurrentProgram is the concurrent-PUT guard surfaced via the
  // selector's :loading/:disable bindings in the home program card dropdown.
  const currentProgram = ref<CurrentProgramData>({ enrollmentId: null, program: null })
  const allActiveEnrollments = ref<EnrollmentSummary[]>([])
  const isUpdatingCurrentProgram = ref<boolean>(false)

  // Phase 99: member-selectable training level.
  // selectedLevel is the in-memory override; null = use profile.level.
  const selectedLevel = ref<Level | null>(null)
  const levelStorage = useLevelSelectionStorage()
  // Closure-scoped mid-session guard. null = no guard.
  // Registered by DayPlayer (Plan 99-03) when at least one exercise has started.
  let midSessionGuard: (() => Promise<boolean>) | null = null

  // Getters
  const fullName = computed(() => {
    if (!profile.value) return ''
    const { firstName, lastName } = profile.value
    if (firstName && lastName) return `${firstName} ${lastName}`
    if (firstName) return firstName
    if (lastName) return lastName
    return profile.value.email
  })

  const displayLevel = computed(() => {
    if (!profile.value) return ''
    // Capitalize first letter
    return profile.value.level.charAt(0).toUpperCase() + profile.value.level.slice(1)
  })

  const subscriptionStatusLabel = computed(() => {
    if (!subscription.value) return ''
    return STATUS_LABELS[subscription.value.status] ?? subscription.value.status
  })

  const subscriptionStatusColor = computed(() => {
    if (!subscription.value) return 'grey'
    return STATUS_COLORS[subscription.value.status] ?? 'grey'
  })

  const segment = computed(() => profile.value?.segment ?? null)

  const onboardingCompleted = computed(() => profile.value?.onboardingCompleted ?? false)

  const hasActiveGoalPlan = computed(() => {
    // Only true when the enrolled program has a goalPlanType (e.g. front_lever, gluteos).
    // Foundation has goalPlanType=null — it uses regular sessions, not goal plan sessions.
    return hasActiveProgramEnrollment.value && enrolledGoalPlanType.value !== null
  })

  const branchDisplayName = computed(() => {
    const name = profile.value?.branchName ?? ''
    return name.replace(/^El Templo\s+/i, 'Sede ')
  })

  const hasActiveSubscription = computed(() => {
    return subscription.value?.status === 'active' || subscription.value?.status === 'paused'
  })

  // Fase 199: respaldo con plan-status cuando la suscripción no vino (error de red
  // en /me/subscription pero plan-status sí respondió). NO reemplaza a
  // `hasActiveSubscription`, que usan el FAB y otras pantallas.
  const memberHasActivePlan = computed(
    () => hasActiveSubscription.value || planStatus.value?.hasActivePlan === true,
  )

  // Fase 199: la card de hoy y la hoja de patrocinadores no deciden "sin plan"
  // mientras esto sea true. Fase 203 (D-15): plan-status sale en loadMemberState junto
  // con la suscripción, para todos (ya no lo dispara Mi Templo cuando no hay plan).
  // Es true hasta que cada fuente respondió POR PRIMERA VEZ: un refresco de algo
  // ya resuelto (`*Loading` con `*Loaded` true) no devuelve la card al skeleton,
  // porque ya hay un dato con qué decidir (REVIEW-app WR-03).
  const planStateLoading = computed(
    () => !hasActiveSubscription.value && (!subscriptionLoaded.value || !planStatusLoaded.value),
  )

  // Phase 104 (R11 + R10): single source of truth for "this user has presencial
  // access". Plan 06 (ReservasPage gating) imports this same computed —
  // do NOT inline the same logic in two places.
  const hasPresencialPlan = computed(() => {
    const sub = subscription.value
    if (!sub) return false
    if (sub.status !== 'active' && sub.status !== 'paused') return false
    return sub.planCategory === 'presencial'
  })

  // Acceso a reservas — igual que hasPresencialPlan pero además cuenta las
  // membresías con inicio futuro (status 'scheduled'), para que un alumno cuya
  // membresía arranca mañana pueda reservar hoy dentro de la ventana de +48h.
  // El backend valida que la fecha de la clase caiga dentro del período de la
  // membresía. NO usar para acceso a contenido de entrenamiento (eso sigue
  // gateado por hasPresencialPlan / suscripción vigente).
  const hasPresencialReservationAccess = computed(() => {
    const sub = subscription.value
    if (!sub) return false
    if (sub.status !== 'active' && sub.status !== 'paused' && sub.status !== 'scheduled') {
      return false
    }
    return sub.planCategory === 'presencial'
  })

  // ─── Phase 162 (APP-02): capabilities del pase especial ─────────────────
  // Derivan SOLO de `especialPass` — nunca del `subscription` singular
  // (D-06 capabilities aditivas). No mutan hasPresencialReservationAccess.
  const hasEspecialPass = computed(() => especialPass.value?.hasPass === true)

  // Acceso ilimitado: pase presente con saldo NULL (plan monthly_class_budget NULL).
  // Se chequea ANTES que los contadores — un pase ilimitado nunca está "agotado".
  const especialUnlimited = computed(
    () => hasEspecialPass.value && especialPass.value?.classesRemaining == null,
  )

  const especialClassesRemaining = computed(() => especialPass.value?.classesRemaining ?? 0)

  const especialClassesBudget = computed(() => especialPass.value?.classesBudget ?? 0)

  // 2026-09-29 (línea del pase): un pase por línea. La lógica por clase usa
  // estos, no los agregados de arriba (que describen "cualquier/primer pase").
  const especialPasses = computed<EspecialPassLine[]>(() => especialPass.value?.passes ?? [])

  /** Pase del socio para una línea (`null` = Aura), o null si no tiene. */
  function especialPassForLine(line: string | null): EspecialPassLine | null {
    return especialPasses.value.find((p) => sameSpecialLine(p.specialLine, line)) ?? null
  }

  // Externo-solo-pase: tiene pase pero NO acceso presencial. Distingue al
  // socio-con-pase (que conserva la grilla presencial) del externo cuyo único
  // acceso es a las clases especiales.
  const hasOnlyEspecialPass = computed(
    () => hasEspecialPass.value && !hasPresencialReservationAccess.value,
  )

  // Phase 104 (R9): selector visibility — only show UI when there is more than
  // one possible view. N enrollments + 1 if presencial.
  const viewOptionsCount = computed(() => {
    return allActiveEnrollments.value.length + (hasPresencialPlan.value ? 1 : 0)
  })

  const showProgramSelector = computed(() => viewOptionsCount.value > 1)

  // Fase 203: elegible para la prueba gratis = elegible y sin reserva de prueba hecha.
  const trialEligible = computed(
    () =>
      trialEligibility.value?.eligible === true && trialEligibility.value.alreadyBooked !== true,
  )

  /**
   * La última carga de my-progress o de current-program/enrollments falló. Los datos
   * que se ven son los del último éxito, o vacíos si nunca hubo uno: las pantallas lo
   * tratan como "no sé", nunca como "no tiene" (D-07).
   */
  const programFailed = computed(() => myProgressFailed.value || currentProgramFailed.value)

  /**
   * activeLevel — what the client should treat as the user's currently-active
   * training level (for content fetches, display, etc). Falls back to
   * profile.level when no override is set, and uses isTrainingLevel narrowing
   * rather than an unchecked cast so a drifted profile value cannot leak
   * through as a typed Level.
   */
  const activeLevel = computed<Level | null>(() => {
    if (selectedLevel.value) return selectedLevel.value
    const p = profile.value?.level
    return isTrainingLevel(p) ? p : null
  })

  // Actions
  function setProfile(newProfile: UserProfile) {
    profile.value = newProfile
  }

  function markOnboardingComplete() {
    if (profile.value) {
      profile.value = { ...profile.value, onboardingCompleted: true }
    }
  }

  /**
   * SPEC "Empezá acá" B: actualiza el perfil en memoria con lo que el
   * servidor confirmó al registrar apertura/finalización de las historias
   * (evita esperar un GET /auth/me completo solo para reflejar 3 campos).
   */
  function setIntroStoriesProgress(progress: {
    introStoriesSeenAt: string | null
    introStoriesCompletedAt: string | null
    introStoriesLastSlide: number | null
  }) {
    if (profile.value) {
      profile.value = { ...profile.value, ...progress }
    }
  }

  function clearProfile() {
    profile.value = null
    subscription.value = null
    // Fase 199 (T-199-39): el estado de plan no sobrevive al logout.
    planStatus.value = null
    planStatusLoaded.value = false
    planStatusLoading.value = false
    subscriptionLoaded.value = false
    // Fase 203 (T-203-11): las respuestas en vuelo del socio anterior no escriben nada
    // y la próxima ensureMemberState pide de nuevo (no reutiliza la promesa vieja).
    memberGeneration++
    memberLoad.reset()
    subscriptionLoading.value = false
    subscriptionFailed.value = false
    planStatusFailed.value = false
    myProgressFailed.value = false
    currentProgramFailed.value = false
    myProgress.value = null
    myProgressLoaded.value = false
    trialEligibility.value = null
    trialEligibilityLoaded.value = false
    memberStateLoaded.value = false
    memberStateLoadedAt = null
    hasActiveProgramEnrollment.value = false
    enrolledGoalPlanType.value = null
    planUpdateClearSeq = 0
    // Phase 162: limpiar el pase especial junto al singular en logout / reset.
    especialPass.value = null
    trialLines.value = []
    // Phase 104: also clear current-program state on logout / profile reset
    // so a fresh login does not see stale enrollments from a prior session.
    currentProgram.value = { enrollmentId: null, program: null }
    allActiveEnrollments.value = []
    isUpdatingCurrentProgram.value = false
    profileStale.value = false
  }

  /** App 1.7.9: boot dejó la sesión sin perfil rico (ver boot/auth.ts, D-network). */
  function markProfileStale() {
    profileStale.value = true
  }

  let profileRetryInFlight = false

  /**
   * Reintenta cargar `/auth/me` cuando el boot arrancó de forma optimista
   * (sin red). Disparado desde el router en la primera navegación
   * (router/index.ts) — no-op si no hace falta o si ya hay un intento en
   * vuelo. Best-effort y silencioso: si vuelve a fallar, `profileStale`
   * queda en true para el próximo intento. El interceptor de axios (D-c/D-d
   * de createAuthErrorHandler) ya decide si el fallo amerita desloguear
   * (401/403) o no (red) — acá no se duplica esa decisión, solo se loguea.
   */
  async function retryProfileLoad(): Promise<void> {
    if (!profileStale.value || profileRetryInFlight) return
    profileRetryInFlight = true
    try {
      const response = await api.get<UserProfile>('/auth/me')
      setProfile(response.data)
      profileStale.value = false
      await hydrateSelection()
      void ensureMemberState()
    } catch (err: unknown) {
      log.warn('Reintento de perfil sin éxito, se reintentará en la próxima navegación', {
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      profileRetryInFlight = false
    }
  }

  function setLoading(state: boolean) {
    loading.value = state
  }

  /** Guard por defecto de las lecturas sueltas: vigente mientras no haya logout. */
  function currentGeneration(): () => boolean {
    const gen = memberGeneration
    return () => gen === memberGeneration
  }

  /**
   * Fase 199 (D-05): lee el estado de plan del socio (API 199-05). NUNCA lanza.
   *
   * Uso interno de loadMemberState: las pantallas llaman a ensureMemberState (el
   * llamado suelto de MainLayout y de Mi Templo se elimina en el plan 11).
   *
   * Fase 203 (W3): ante un error `planStatus` conserva el valor previo (null en la
   * primera carga) y marca `planStatusFailed`: la card no dice "Arrancá tu plan" si no
   * se sabe si venció o hay uno programado.
   *
   * Carrera de la pelotita (`showPlanBadge` de MainLayout): Planes se abre → `clear` +
   * POST `seen` → llega tarde la respuesta de un plan-status viejo → reabría la
   * pelotita. Si entre el arranque del pedido y su respuesta hubo un
   * `clearPlanUpdateUnseen()`, la respuesta salió antes del "visto" (el server todavía
   * no tenía el POST) y se escribe con `hasUnseenPlanUpdate: false`; el resto de los
   * campos sí se actualizan. Un pedido arrancado después del `clear` refleja al server
   * tal cual, así una membresía nueva vuelve a prender la pelotita.
   */
  async function loadPlanStatus(isCurrent: () => boolean = currentGeneration()): Promise<void> {
    planStatusLoading.value = true
    const clearSeqAtStart = planUpdateClearSeq
    try {
      const response = await api.get<MemberPlanStatus>('/members/subscription/me/plan-status')
      if (!isCurrent()) return
      const data = response.data ?? null
      planStatus.value =
        data && clearSeqAtStart !== planUpdateClearSeq
          ? { ...data, hasUnseenPlanUpdate: false }
          : data
      planStatusFailed.value = false
    } catch (err: unknown) {
      if (!isCurrent()) return
      planStatusFailed.value = true
      log.warn('plan-status no disponible (se conserva el valor previo)', {
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      if (isCurrent()) {
        planStatusLoading.value = false
        planStatusLoaded.value = true
      }
    }
  }

  /**
   * Apaga la pelotita de la tab Planes al abrir la pantalla (el POST `seen` lo manda la página).
   * Solo toca el flag: el resto de `planStatus` queda igual. Además avanza la secuencia
   * del "visto" para que una respuesta de plan-status en vuelo no lo reabra (ver loadPlanStatus).
   */
  function clearPlanUpdateUnseen(): void {
    planUpdateClearSeq++
    if (planStatus.value) planStatus.value = { ...planStatus.value, hasUnseenPlanUpdate: false }
  }

  /**
   * Suscripción del socio. 204/404 = no tiene (subscriptionFailed false). Cualquier
   * otro error = "no sé": NO toca `subscription` (la última buena se conserva) y marca
   * `subscriptionFailed`.
   */
  async function fetchSubscription(isCurrent: () => boolean): Promise<void> {
    subscriptionLoading.value = true
    try {
      const response = await api.get<MemberSubscription>('/members/subscription/me/subscription')
      if (!isCurrent()) return
      // 204 No Content means no subscription
      subscription.value = response.status === 204 || !response.data ? null : response.data
      subscriptionFailed.value = false
    } catch (err: unknown) {
      if (!isCurrent()) return
      if (err instanceof AxiosError && err.response?.status === 404) {
        subscription.value = null
        subscriptionFailed.value = false
      } else {
        subscriptionFailed.value = true
        log.warn('Suscripción no disponible (se conserva el valor previo)', {
          message: err instanceof Error ? err.message : String(err),
        })
      }
    } finally {
      if (isCurrent()) {
        subscriptionLoading.value = false
        subscriptionLoaded.value = true
      }
    }
  }

  /**
   * Elegibilidad de la prueba gratis (D-15: en paralelo con la suscripción, para todos).
   * Sede virtual: no se pide (la card no usa la prueba para virtuales, igual que Mi Templo).
   * Usa `api` directo y no `useSchedulingApi` para no compartir su AbortController.
   */
  async function loadTrialEligibility(isCurrent: () => boolean): Promise<void> {
    if (profile.value?.branchIsVirtual === true) {
      trialEligibility.value = null
      trialEligibilityLoaded.value = true
      return
    }
    try {
      const response = await api.get<TrialEligibility>('/members/scheduling/trial-eligibility')
      if (!isCurrent()) return
      trialEligibility.value = response.status === 204 || !response.data ? null : response.data
    } catch (err: unknown) {
      if (!isCurrent()) return
      trialEligibility.value = null
      log.warn('trial-eligibility no disponible (fail-open)', {
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      if (isCurrent()) trialEligibilityLoaded.value = true
    }
  }

  /**
   * Carga COMPLETA y fresca de los datos del socio (suscripción, plan-status,
   * trial-eligibility, my-progress, current-program y enrollments) en paralelo.
   * Mismo comportamiento que `ensureMemberState({ force: true })`. La usan Reservas tras
   * confirmar la semana de regalo (`ReservasPage.vue:2171`) y ActivarInvitación tras
   * activar (`ActivarInvitacionPage.vue:290`), justo después de mutar el estado en el
   * server: con una carga en vuelo espera a que termine y encadena una nueva.
   */
  function loadSubscription(): Promise<void> {
    return ensureMemberState({ force: true })
  }

  /**
   * Phase 162 (APP-02): carga el pase especial del member desde el endpoint
   * aislado GET /me/especial-pass (162-02). Mismo patrón try/catch que
   * loadSubscription: ante 204 / error / red → especialPass = null. NO toca
   * el `subscription` singular ni hasPresencialReservationAccess (D-06).
   */
  async function loadEspecialPass(): Promise<void> {
    try {
      const response = await api.get<
        Partial<EspecialPass> & { hasPass: boolean; trialLines?: string[] }
      >('/members/subscription/me/especial-pass')
      const data = response.data
      trialLines.value = Array.isArray(data?.trialLines)
        ? data.trialLines.filter((l): l is string => typeof l === 'string')
        : []
      // 204 No Content, sin data, o { hasPass:false } → sin pase.
      if (response.status === 204 || !data || data.hasPass !== true) {
        especialPass.value = null
      } else {
        // Defensivo: sin `passes` (payload viejo) se arma un único pase de la
        // línea Aura con los campos sueltos.
        const legacy: EspecialPassLine = {
          specialLine: null,
          lineLabel: fullLineLabel(null),
          planName: '',
          classesRemaining: data.classesRemaining ?? null,
          classesBudget: data.classesBudget ?? null,
          endDate: data.endDate ?? null,
          isSocio: data.isSocio ?? false,
        }
        const passes: EspecialPassLine[] =
          Array.isArray(data.passes) && data.passes.length > 0
            ? data.passes.map((p) => ({
                specialLine: p.specialLine ?? null,
                lineLabel: p.lineLabel || fullLineLabel(p.specialLine ?? null),
                planName: p.planName ?? '',
                // Preservar null (= ilimitado) también por línea.
                classesRemaining: p.classesRemaining ?? null,
                classesBudget: p.classesBudget ?? null,
                endDate: p.endDate ?? null,
                isSocio: p.isSocio ?? false,
              }))
            : [legacy]
        especialPass.value = {
          hasPass: true,
          passes,
          // Preservar null (= ilimitado). NO colapsar a 0/2 o se perdería la
          // semántica de acceso ilimitado y la app lo trataría como agotado.
          classesRemaining: data.classesRemaining ?? null,
          classesBudget: data.classesBudget ?? null,
          endDate: data.endDate ?? null,
          isSocio: data.isSocio ?? false,
        }
      }
    } catch {
      // 204/404 o error de red — sin pase.
      especialPass.value = null
      trialLines.value = []
    }
  }

  /**
   * my-progress: guarda el objeto completo (204 → null) y deriva
   * `hasActiveProgramEnrollment` / `enrolledGoalPlanType` (per D-08: gates
   * Personalizadas access). Un error es "no sé": marca `myProgressFailed` y conserva
   * el último dato bueno.
   */
  async function fetchProgramEnrollmentStatus(
    isCurrent: () => boolean = currentGeneration(),
  ): Promise<void> {
    try {
      const response = await api.get<MemberEnrollmentProgress | null>(
        '/members/programs/my-progress',
      )
      if (!isCurrent()) return
      const data = response.status === 204 || !response.data ? null : response.data
      myProgress.value = data
      hasActiveProgramEnrollment.value = response.status === 200 && data !== null
      enrolledGoalPlanType.value = data?.goalPlanType ?? null
      myProgressFailed.value = false
    } catch (err: unknown) {
      if (!isCurrent()) return
      myProgressFailed.value = true
      log.warn('my-progress no disponible (se conserva el valor previo)', {
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      if (isCurrent()) myProgressLoaded.value = true
    }
  }

  /**
   * Phase 104 (R6 + R9 + R10): fetch the user's current-program pointer and
   * the list of all active enrollments in parallel. Both endpoints live on
   * Plan 04. Fase 203 (D-07): on error the refs are NOT reset — se conserva el último
   * dato bueno y se marca `currentProgramFailed` (un refresco fallido no vacía las
   * inscripciones: eso hacía que TrainingIndex mostrara la vidriera a un socio solo-online).
   */
  async function fetchCurrentProgram(
    isCurrent: () => boolean = currentGeneration(),
  ): Promise<void> {
    try {
      const [cur, list] = await Promise.all([
        api.get<CurrentProgramData>('/members/me/current-program'),
        api.get<{ enrollments: EnrollmentSummary[] }>('/members/me/enrollments'),
      ])
      if (!isCurrent()) return
      currentProgram.value = cur.data
      allActiveEnrollments.value = list.data.enrollments
      currentProgramFailed.value = false
    } catch (err: unknown) {
      if (!isCurrent()) return
      currentProgramFailed.value = true
      log.error('Failed to fetch current program', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ─── Fase 203: carga del socio (dueño único, en paralelo, promesa compartida) ───

  /**
   * Un solo ciclo de carga. 'initial' pide las 6 fuentes; 'refresh' (vueltas a
   * Mi Templo/Planes/Entrenar/Perfil por frescura) pide siempre my-progress +
   * current-program (+ enrollments) y suscripción + plan-status + trial solo si el socio
   * NO tiene plan activo: con plan activo el refresco no recarga plan-status, la
   * pelotita de un socio con plan se renueva en la carga 'initial' / force y no en cada
   * vuelta a una pantalla. Todo sale en paralelo (D-06/D-15). Las escrituras pasan por
   * `isCurrent()`: tras un logout, o si ya hay una carga más nueva (la vieja se colgó y
   * venció), la respuesta tardía no escribe nada.
   */
  async function doLoadMemberState(mode: 'initial' | 'refresh'): Promise<void> {
    const gen = memberGeneration
    const seq = ++memberLoadSeq
    const isCurrent = () => gen === memberGeneration && seq === memberLoadSeq
    const tasks: Promise<void>[] = []
    if (mode === 'initial' || !hasActiveSubscription.value) {
      tasks.push(
        fetchSubscription(isCurrent),
        loadPlanStatus(isCurrent),
        loadTrialEligibility(isCurrent),
      )
    } else {
      // Esta carga ya es la vigente y NO pide estas fuentes: considera bueno el dato que hay. Si una
      // carga 'initial' colgada las dejó en "cargando", ya no es current y su `finally` no las apaga.
    }
    tasks.push(fetchProgramEnrollmentStatus(isCurrent), fetchCurrentProgram(isCurrent))
    // Tope (W4): en nativo CapacitorHttp ignora el timeout de axios, y quien hace
    // `await loadSubscription()` no puede quedar colgado para siempre. Vencido el tope la promesa
    // resuelve, pero este ciclo NO marca `memberStateLoaded` (la próxima ensureMemberState vuelve a
    // pedir); las respuestas tardías siguen escribiendo solo si `isCurrent()`.
    let capTimer: ReturnType<typeof setTimeout> | undefined
    const capped = new Promise<'capped'>((resolve) => {
      capTimer = setTimeout(() => resolve('capped'), MEMBER_LOAD_MAX_IN_FLIGHT_MS)
    })
    const outcome = await Promise.race([
      Promise.allSettled(tasks).then(() => 'settled' as const),
      capped,
    ])
    clearTimeout(capTimer)
    if (outcome === 'capped') {
      log.warn('La carga del socio superó el tope: se sigue sin esperar las fuentes pendientes')
      return
    }
    if (isCurrent()) {
      memberStateLoaded.value = true
      memberStateLoadedAt = Date.now()
    }
  }

  const memberLoad = shareInFlight(doLoadMemberState, {
    maxInFlightMs: MEMBER_LOAD_MAX_IN_FLIGHT_MS,
  })

  /** Carga el estado del socio. Llamadas simultáneas comparten una sola carga. */
  function loadMemberState(mode: 'initial' | 'refresh' = 'initial'): Promise<void> {
    return memberLoad.run(mode)
  }

  /**
   * `force`: NUNCA devuelve la carga en vuelo ni hace un refresh parcial. Con una
   * carga en vuelo (que pudo salir antes del cambio en el server) espera a que termine
   * (o a que venza su vigencia, W4) y encadena UNA carga COMPLETA ('initial', las 6);
   * si dos llamadores fuerzan a la vez comparten esa carga encadenada. Sin carga en
   * vuelo arranca en el MISMO tick (W2: `subscriptionLoading` es true de forma síncrona).
   * Si hubo clearProfile() en el medio no se pide nada.
   */
  function forceFullLoad(): Promise<void> {
    if (!memberLoad.isInFlight()) return memberLoad.run('initial')
    const gen = memberGeneration
    return memberLoad
      .waitInFlight()
      .then(() => (gen === memberGeneration ? memberLoad.run('initial') : undefined))
  }

  /**
   * Garantiza que los datos del socio estén cargados; las pantallas llaman a esto.
   * - `force: true`: carga completa fresca (ver forceFullLoad).
   * - Con una carga en vuelo (sin force): devuelve la en vuelo.
   * - Sin carga previa: carga 'initial'.
   * - Dentro de la frescura (`maxAgeMs`, por defecto MEMBER_STATE_MAX_AGE_MS): no pide nada.
   * - Fuera de la frescura: 'refresh'.
   */
  function ensureMemberState(opts: { maxAgeMs?: number; force?: boolean } = {}): Promise<void> {
    if (opts.force) return forceFullLoad()
    if (memberLoad.isInFlight()) return memberLoad.run('refresh')
    if (!memberStateLoaded.value) return memberLoad.run('initial')
    const maxAge = opts.maxAgeMs ?? MEMBER_STATE_MAX_AGE_MS
    if (memberStateLoadedAt !== null && Date.now() - memberStateLoadedAt < maxAge) {
      return Promise.resolve()
    }
    return memberLoad.run('refresh')
  }

  /**
   * Phase 104 (R9): persist the user's chosen view (program enrollment id or
   * null for Templo). Concurrent-tap guard via isUpdatingCurrentProgram —
   * the second of two rapid taps is dropped at the source so we never have
   * two PUTs in flight.
   */
  async function setCurrentProgramId(enrollmentId: number | null): Promise<void> {
    if (isUpdatingCurrentProgram.value) {
      log.warn('setCurrentProgramId called while already updating — ignoring', {
        enrollmentId,
      })
      return
    }
    isUpdatingCurrentProgram.value = true
    try {
      const response = await api.put<CurrentProgramData>('/members/me/current-program', {
        enrollmentId,
      })
      currentProgram.value = response.data
    } finally {
      isUpdatingCurrentProgram.value = false
    }
  }

  // ─── Phase 99: selection API ────────────────────────────────────────────

  /**
   * Boot path — loads a previously-stored selection into the store.
   * Bypasses the mid-session guard (prevents Pitfall 6 in research: a
   * background hydration must never prompt the user). Invalid values are
   * rejected against isTrainingLevel and cleared from storage.
   */
  async function hydrateSelection(): Promise<void> {
    const userId = profile.value?.id
    if (!userId) return
    const raw = await levelStorage.get(userId)
    if (raw === null) return
    if (isTrainingLevel(raw)) {
      selectedLevel.value = raw
    } else {
      await levelStorage.remove(userId)
      selectedLevel.value = null
    }
  }

  /**
   * User-facing selection action. If the user picks their own `profile.level`,
   * route through `clearLevel` (D-08: single path to no-override). Otherwise
   * consult the mid-session guard before committing.
   */
  async function setLevel(lvl: Level): Promise<void> {
    if (profile.value?.level === lvl) {
      await clearLevel()
      return
    }
    if (midSessionGuard) {
      const proceed = await midSessionGuard()
      if (!proceed) return
    }
    selectedLevel.value = lvl
    const userId = profile.value?.id
    if (userId) await levelStorage.set(userId, lvl)
  }

  /**
   * Clears the override. Gated by the mid-session guard (reached via self-pick
   * through setLevel, or directly from any caller wanting to reset to the
   * assigned level).
   */
  async function clearLevel(): Promise<void> {
    if (midSessionGuard) {
      const proceed = await midSessionGuard()
      if (!proceed) return
    }
    selectedLevel.value = null
    const userId = profile.value?.id
    if (userId) await levelStorage.remove(userId)
  }

  /**
   * Logout path — wipes the stored selection BYPASSING the guard (session is
   * ending, no point prompting). Resolves userId defensively from profile or
   * authStore.user so it works regardless of which ref was nulled first.
   *
   * IMPORTANT: useAuthStore is imported lazily here to avoid a top-level
   * circular import (useAuthStore imports useUserStore for clearProfile).
   */
  async function clearSelection(): Promise<void> {
    const { useAuthStore } = await import('src/stores/useAuthStore')
    const authStore = useAuthStore()
    const userId = profile.value?.id ?? authStore.user?.id
    selectedLevel.value = null
    if (userId) await levelStorage.remove(userId)
  }

  /**
   * Register (or clear with `null`) the mid-session guard. Plan 99-03 wires
   * DayPlayer to register this when `anyExerciseStarted === true`.
   */
  function registerMidSessionGuard(fn: (() => Promise<boolean>) | null): void {
    midSessionGuard = fn
  }

  return {
    // State
    profile,
    loading,
    subscription,
    subscriptionLoading,
    subscriptionLoaded,
    planStatus,
    planStatusLoaded,
    hasActiveProgramEnrollment,
    enrolledGoalPlanType,
    // Fase 203: estado del socio (dueño único) y banderas "cargó / falló"
    subscriptionFailed,
    planStatusFailed,
    myProgressFailed,
    currentProgramFailed,
    programFailed,
    myProgress,
    myProgressLoaded,
    trialEligibility,
    trialEligibilityLoaded,
    trialEligible,
    memberStateLoaded,
    especialPass,
    trialLines,
    selectedLevel,
    // Phase 104: current-program state
    currentProgram,
    allActiveEnrollments,
    isUpdatingCurrentProgram,
    // Getters
    fullName,
    displayLevel,
    subscriptionStatusLabel,
    subscriptionStatusColor,
    segment,
    onboardingCompleted,
    hasActiveGoalPlan,
    hasActiveSubscription,
    memberHasActivePlan,
    planStateLoading,
    branchDisplayName,
    activeLevel,
    // Phase 104: presencial / selector capability flags
    hasPresencialPlan,
    hasPresencialReservationAccess,
    // Phase 162: capabilities del pase especial (aditivas)
    hasEspecialPass,
    especialUnlimited,
    especialClassesRemaining,
    especialClassesBudget,
    especialPasses,
    especialPassForLine,
    hasOnlyEspecialPass,
    viewOptionsCount,
    showProgramSelector,
    // App 1.7.9: boot optimista
    profileStale,
    // Actions
    setProfile,
    markOnboardingComplete,
    setIntroStoriesProgress,
    clearProfile,
    markProfileStale,
    retryProfileLoad,
    setLoading,
    loadSubscription,
    loadMemberState,
    ensureMemberState,
    loadPlanStatus,
    clearPlanUpdateUnseen,
    loadEspecialPass,
    fetchProgramEnrollmentStatus,
    // Phase 104: current-program actions
    fetchCurrentProgram,
    setCurrentProgramId,
    // Phase 99: selection API
    setLevel,
    clearLevel,
    clearSelection,
    hydrateSelection,
    registerMidSessionGuard,
  }
})
