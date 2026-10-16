<template>
  <q-page class="mi-templo">
    <!-- Loading State -->
    <div v-if="progressionStore.loading" class="mi-templo__loading">
      <TemploLoader size="lg" />
      <p class="mi-templo__loading-text">Cargando tu progreso...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="progressionStore.error" class="mi-templo__error">
      <q-icon name="error_outline" class="mi-templo__error-icon" />
      <p class="mi-templo__error-text">{{ progressionStore.error }}</p>
      <q-btn color="primary" unelevated no-caps @click="fetchStats"> Reintentar </q-btn>
    </div>

    <!-- Content State -->
    <div v-else class="mi-templo__content">
      <!-- Notification Permission Banner (per D-24) -->
      <PermissionBanner />

      <!-- Card de hoy (D-03, variante A'): reemplaza a las 4 cards viejas del día (sesión,
           turno, descanso y programa). Solo pinta el modelo de resolveTodayCard. -->
      <TodayCard :model="todayCard" @open-program="programSheetOpen = true" />

      <!-- Novedades (D-9): después del banner y antes del carrusel premium.
           Sin novedades no renderiza nada (D-8) y es fail-open (D-12). -->
      <NovedadesCard />

      <!-- Carrusel premium — siempre visible: Mejoras y Referidos van para
           todos; UpsellBadge solo a virtuales y Planes Personalizados cuando
           no corresponde ProgramProgressCard. Los dots son dinámicos. -->
      <div class="premium-carousel">
        <div class="premium-carousel__dots">
          <span
            v-for="i in premiumSlideCount"
            :key="i"
            class="premium-carousel__dot"
            :class="{ 'premium-carousel__dot--active': premiumSlide === i - 1 }"
          />
        </div>
        <div ref="premiumScroller" class="premium-carousel__scroller" @scroll="onPremiumScroll">
          <div class="premium-carousel__slide">
            <ImprovementCtaCard />
          </div>
          <div class="premium-carousel__slide">
            <ReferralCtaCard />
          </div>
          <div v-if="showUpsellBadge" class="premium-carousel__slide">
            <UpsellBadge />
          </div>
          <div v-if="showProgramCta" class="premium-carousel__slide">
            <ProgramCtaCard :segment="userStore.segment" />
          </div>
          <!-- D-15b: tarjetas libres del admin, DESPUÉS de las fijas visibles. -->
          <div v-for="t in avisosStore.tarjetasLibres" :key="t.id" class="premium-carousel__slide">
            <AvisoCard
              :aviso-id="t.id"
              :title="t.title"
              :body="t.body"
              :button-text="t.buttonText"
              :destination="t.destination"
            />
          </div>
        </div>
      </div>

      <!-- Registro del día (D-07): una pregunta por vez, colapsa a una línea. Se oculta
           para quien nunca tuvo plan (sin-plan-nunca), como el sketch. -->
      <CheckInPanel
        v-if="orderedCheckIns.length > 0 && todayCard.kind !== 'sin-plan-nunca'"
        :questions="orderedCheckIns"
        :answers="progressionStore.checkInState?.answers ?? emptyAnswers"
        :save="handleCheckInSubmit"
      />

      <!-- Tu semana (D-09): fila compacta, sin RPE. -->
      <WeekStrip
        v-if="todayCard.kind !== 'sin-plan-nunca'"
        :week-start="weekStartsFor(todayStr)[0]"
        :today-str="todayStr"
        :completed-dates="completedDates"
        :total-sessions="progressionStore.stats?.totalSessions ?? 0"
        :total-label="todayCard.kind === 'sin-plan-vencio' ? 'templo' : 'total'"
      />

      <!-- Mi Árbol — entry point into the skill-tree advancement view (Phase 127).
           Gated off for members until the v5.1 training-data rollout runs (featureFlags). -->
      <button v-if="MEMBER_TREE_ENABLED" class="mi-arbol-card" @click="goToMiArbol">
        <q-icon name="park" class="mi-arbol-card__icon" />
        <span class="mi-arbol-card__text">
          <span class="mi-arbol-card__title">Mi Árbol</span>
          <span class="mi-arbol-card__subtitle">Tu avance por cada familia de ejercicios</span>
        </span>
        <q-icon name="chevron_right" class="mi-arbol-card__chevron" />
      </button>

      <!-- Evaluación de nivel: solo si es accionable o está pendiente -->
      <GeneralContent
        :evaluation="progressionStore.evaluation"
        @request-evaluation="handleRequestEvaluation"
      />

      <!-- Daily quote — scroll closure -->
      <DailyQuote />
    </div>

    <!-- Hoja "Mi programa": selector de programa, bloques de contenido y aviso de renovación
         (antes ProgramProgressCard suelto en la pila). Programa: non-linked, o linked con
         al menos un enrollment extra (Phase 112). -->
    <ProgramSheet
      v-model="programSheetOpen"
      :progress="programProgress"
      @program-changed="onProgramChanged"
    />
  </q-page>
</template>

<script setup lang="ts">
/**
 * MiTemplo page — personalized daily briefing ("Tu Dia").
 *
 * Shows segment-driven greeting, session CTA with today's route,
 * booking status, weekly progress, weekly summary, and existing
 * stats/RPE trend/evaluation sections.
 */
import { computed, ref, onMounted, onUnmounted, watch, type Ref } from 'vue'
import TemploLoader from 'src/components/TemploLoader.vue'
import DailyQuote from '../components/DailyQuote.vue'
import { useProgressionStore } from '../stores/progressionStore'
import { useProgressionApi } from '../composables/useProgressionApi'
import { useCheckInApi } from '../composables/useCheckInApi'
import CheckInPanel from '../components/CheckInPanel.vue'
import WeekStrip from '../components/WeekStrip.vue'
import { CHECK_IN_QUESTIONS, type CheckInQuestionConfig, type CheckInQuestionType } from '../types'
import { useUserStore } from 'src/stores/useUserStore'
import { MEMBER_TREE_ENABLED } from 'src/config/featureFlags'
import { useWeekData } from 'src/modules/training/composables/useWeekData'
import { getRouteName } from 'src/modules/training/utils/routeNames'
import type { Session } from 'src/modules/training/types/session'
import TodayCard from '../components/TodayCard.vue'
import ProgramSheet from '../components/ProgramSheet.vue'
import { resolveTodayCard } from '../utils/today-card'
import type { CheckInAnswers } from '../utils/check-in-summary'
import GeneralContent from '../components/GeneralContent.vue'
import ProgramCtaCard from 'src/modules/programs/components/ProgramCtaCard.vue'
import { useProgramsApi } from 'src/modules/programs/composables/useProgramsApi'
import type { MemberEnrollmentProgress } from 'src/modules/programs/types'
import PermissionBanner from '../components/PermissionBanner.vue'
import NovedadesCard from '../components/NovedadesCard.vue'
import ImprovementCtaCard from '../components/ImprovementCtaCard.vue'
import ReferralCtaCard from '../components/ReferralCtaCard.vue'
import UpsellBadge from '../components/UpsellBadge.vue'
import AvisoCard from '../components/AvisoCard.vue'
import { useAvisosStore } from 'src/stores/useAvisosStore'
import { useNovedadesStore } from 'src/stores/useNovedadesStore'
import { useNotificationStore } from 'src/stores/useNotificationStore'
import { useTodayBookingStore } from 'src/stores/useTodayBookingStore'
import { useSchedulingApi } from 'src/composables/useSchedulingApi'
import { addDaysStr, formatHHMM, weekStartsFor } from 'src/utils/check-in-window'
import { dowInTz, todayInTz } from 'src/utils/tz'
import { useRouter } from 'vue-router'
import { createLogger } from 'src/utils/logger'

const log = createLogger('MiTemplo')
const notificationStore = useNotificationStore()
const router = useRouter()
const progressionStore = useProgressionStore()
const userStore = useUserStore()
const avisosStore = useAvisosStore()
const novedadesStore = useNovedadesStore()
const { fetchStats, requestEvaluation } = useProgressionApi()
const { fetchTodayCheckIns, submitCheckIn } = useCheckInApi()
const todayBookingStore = useTodayBookingStore()
const schedulingApi = useSchedulingApi()
const {
  sessions: weekSessions,
  completedDates,
  error: weekError,
  fetchWeekSessions,
} = useWeekData()
// Domingo: "mañana" cae en la semana siguiente (otra instancia, cada una guarda UNA semana).
const { sessions: nextWeekSessions, fetchWeekSessions: fetchNextWeekSessions } = useWeekData()
const { getMyProgress } = useProgramsApi()
const programProgress = ref<MemberEnrollmentProgress | null>(null)
const programSheetOpen = ref(false)
// El fetch de la semana terminó OK: sin esto la card no afirma "Hoy descansás" (plan 14).
const weekLoaded = ref(false)
const trialEligible = ref(false)
const premiumScroller = ref<HTMLElement | null>(null) as Ref<HTMLElement | null>
const premiumSlide = ref(0)

function goToMiArbol() {
  void router.push('/mi-arbol')
}

// ProgramProgressCard: non-linked program, OR linked-program member with at
// least one extra enrollment (admin add-on, bundle) — misma condición que el
// v-if histórico de la card (Phase 112).
const showProgramProgress = computed(() => {
  return (
    programProgress.value !== null &&
    (!programProgress.value.isLinkedToSubscription || userStore.allActiveEnrollments.length > 1)
  )
})

// Valor no-nulo para la card (narrowing que el template no puede hacer solo).
const programProgressCard = computed(() =>
  showProgramProgress.value ? programProgress.value : null,
)

// Planes Personalizados vive en el carrusel siempre que no corresponda la
// card de progreso (mismo criterio que el viejo v-else).
const showProgramCta = computed(() => !showProgramProgress.value)

const premiumSlideCount = computed(() => {
  return (
    2 +
    (showUpsellBadge.value ? 1 : 0) +
    (showProgramCta.value ? 1 : 0) +
    avisosStore.tarjetasLibres.length
  )
})

function onPremiumScroll() {
  const el = premiumScroller.value
  if (!el) return
  const index = Math.round(el.scrollLeft / el.clientWidth)
  premiumSlide.value = Math.min(Math.max(index, 0), premiumSlideCount.value - 1)
}

// D-04: "hoy", día de la semana y semana actual en la zona de la SEDE, nunca la del teléfono.
const tz = computed(() => todayBookingStore.tz)
const todayStr = computed(() => todayInTz(tz.value, todayBookingStore.now))
const dow = computed(() => dowInTz(tz.value, todayBookingStore.now))
const tomorrowStr = computed(() => addDaysStr(todayStr.value, 1))

function routeNameOf(session: Session | null | undefined): string | null {
  if (!session || !session.blocks || session.blocks.length === 0) return null
  const mainBlock = session.blocks.find((b) => b.role === 'NUCLEUS') || session.blocks[0]
  return getRouteName(mainBlock.route)
}

const todayRouteName = computed(() => routeNameOf(weekSessions.value.get(todayStr.value)))

const tomorrowRoute = computed(() => {
  const source = dow.value === 7 ? nextWeekSessions.value : weekSessions.value
  return routeNameOf(source.get(tomorrowStr.value))
})

const isVirtual = computed(() => userStore.profile?.branchIsVirtual ?? false)

const showUpsellBadge = computed(() => isVirtual.value)

const todayCompleted = computed(() => {
  return progressionStore.todaySession?.completed ?? false
})

const orderedCheckIns = computed((): CheckInQuestionConfig[] => {
  if (!progressionStore.checkInState) return []
  // Soreness always first, rest rotate daily
  const soreness = CHECK_IN_QUESTIONS.filter((q) => q.type === 'soreness')
  const rest = CHECK_IN_QUESTIONS.filter((q) => q.type !== 'soreness')
  const dayOfEpoch = Math.floor(Date.now() / 86400000)
  const rotateBy = dayOfEpoch % rest.length
  const rotated = [...rest.slice(rotateBy), ...rest.slice(0, rotateBy)]
  return [...soreness, ...rotated]
})

/**
 * Derive session CTA messaging from today's check-in answers (per D-10).
 * Priority: energy > soreness > sleep (most impactful first).
 * Only "negative" answers produce a message; normal/good = null.
 */
const checkInMessage = computed((): string | null => {
  const state = progressionStore.checkInState
  if (!state) return null

  // Low energy takes highest priority (per D-10)
  if (state.answers.energy?.value === 'bajo') {
    return 'Sesión liviana sugerida'
  }

  // Moderate soreness second priority (per D-10)
  if (state.answers.soreness?.value === 'moderada') {
    return 'Considerá movilidad hoy'
  }

  // Bad sleep third priority (per D-10)
  if (state.answers.sleep?.value === 'mal') {
    return 'Escuchá tu cuerpo hoy'
  }

  // Normal/good answers → no change (per D-10)
  return null
})

// Respuestas vacías mientras no llega el estado del día (el panel igual se oculta sin preguntas).
const emptyAnswers: CheckInAnswers = { energy: null, soreness: null, sleep: null }

// Mismo endpoint y payload que siempre (L41): devuelve si se guardó para que el panel no avance si falló.
function handleCheckInSubmit(
  questionType: CheckInQuestionType,
  value: string,
  bodyArea?: string,
): Promise<boolean> {
  return submitCheckIn(questionType, value, bodyArea)
}

async function handleRequestEvaluation() {
  await requestEvaluation()
}

// Lunes..domingo de la semana actual / siguiente, a partir de la fecha de la sede.
function weekDatesFrom(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysStr(monday, i))
}

function currentWeekDates(): string[] {
  return weekDatesFrom(weekStartsFor(todayStr.value)[0])
}

function nextWeekDates(): string[] {
  return weekDatesFrom(weekStartsFor(todayStr.value)[1])
}

/** Semana actual (+ la siguiente los domingos, para "Mañana: ...") y bandera de carga OK. */
async function loadWeeks(): Promise<void> {
  await fetchWeekSessions(currentWeekDates())
  // useWeekData no lanza: deja `error` y la semana vacía. Si falló, weekLoaded queda false
  // y la card no dice "Hoy descansás" por error.
  weekLoaded.value = weekError.value === null
  if (dow.value === 7) await fetchNextWeekSessions(nextWeekDates())
}

async function loadProgramProgress(): Promise<void> {
  try {
    programProgress.value = await getMyProgress()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.warn('Failed to load program progress', { error: message })
  }
}

async function onProgramChanged(): Promise<void> {
  // Bundle members switching programs from the home card. Re-fetch progress
  // (the my-progress endpoint follows the server-side current-program pointer)
  // and the week sessions so today's route + day cards reflect the new program.
  await Promise.all([loadProgramProgress(), loadWeeks()])
}

async function loadTrialEligibility(): Promise<void> {
  try {
    const eligibility = await schedulingApi.getTrialEligibility()
    trialEligible.value = eligibility.eligible && !eligibility.alreadyBooked
  } catch (err: unknown) {
    // Fail-open: sin dato no se ofrece la clase de prueba, la card sigue con su gate por defecto.
    trialEligible.value = false
    log.warn('Failed to load trial eligibility', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// Plan-status y prueba gratis SOLO cuando la suscripción terminó de cargar sin plan activo
// (si todavía carga, esperamos: nunca decidimos "sin plan" por una carrera). L37.
watch(
  () => userStore.subscriptionLoaded && !userStore.subscriptionLoading,
  (ready) => {
    if (!ready || userStore.hasActiveSubscription) return
    void userStore.loadPlanStatus()
    if (!isVirtual.value) void loadTrialEligibility()
  },
  { immediate: true },
)

// D-03: el modelo de la card sale de una función pura; acá solo se arma el input.
const todayCard = computed(() => {
  const sub = userStore.subscription
  const booking = todayBookingStore.todayBooking
  const waitlist = todayBookingStore.todayWaitlist
  const next = todayBookingStore.nextBooking
  const profileBranch = userStore.profile?.branchName ?? ''
  const program = isVirtual.value ? programProgress.value : null
  return resolveTodayCard({
    todayStr: todayStr.value,
    dow: dow.value,
    firstName: userStore.profile?.firstName ?? null,
    branchName: profileBranch,
    isVirtual: isVirtual.value,
    subscription: sub
      ? { status: sub.status, planName: sub.planName, startDate: sub.startDate }
      : null,
    planStatus: userStore.planStatus,
    planLoading: userStore.planStateLoading,
    todayRoute: todayRouteName.value,
    tomorrowRoute: tomorrowRoute.value,
    todayCompleted: todayCompleted.value,
    todaySession: progressionStore.todaySession,
    booking: booking
      ? {
          time: formatHHMM(booking.startTime),
          branchName: booking.branchName ?? profileBranch,
          activityName: booking.activityName,
          status: booking.status,
        }
      : null,
    windowState: todayBookingStore.windowState,
    minutesToStart: todayBookingStore.minutesToStart,
    attendanceMarkedAt: todayBookingStore.attendanceMarkedAt,
    waitlistTime: waitlist ? formatHHMM(waitlist.startTime) : null,
    nextBooking: next
      ? {
          date: next.bookingDate,
          time: formatHHMM(next.startTime),
          branchName: next.branchName ?? profileBranch,
        }
      : null,
    program: program
      ? {
          programName: program.programName,
          currentWeek: program.currentWeek,
          durationWeeks: program.durationWeeks,
          sessionsCompletedThisWeek: program.sessionsCompletedThisWeek,
          sessionsPerWeekToAdvance: program.sessionsPerWeekToAdvance,
        }
      : null,
    hasExtraPrograms: programProgressCard.value !== null && !isVirtual.value,
    checkInMessage: checkInMessage.value,
    trialEligible: trialEligible.value,
    weekLoaded: weekLoaded.value,
  })
})

onMounted(async () => {
  fetchStats()
  fetchTodayCheckIns()
  // D-15b: tarjetas del carrusel (fijas con copy editable + libres del
  // admin), sin bloquear el render — mismo criterio que fetchStats de arriba.
  void avisosStore.loadTarjetas()
  // Novedades (D-12): fail-open, en cada montaje de Mi Templo. No hay
  // pull-to-refresh en esta página, así que no hay un segundo punto de carga.
  void novedadesStore.load()

  // Fase 199: Mi Templo carga la suscripción al montar porque el login no lo hace
  // (boot/auth.ts solo la dispara al arrancar con sesión): sin esto, tras un login
  // sin reinicio un socio con plan vería "Arrancá tu plan". Sin await y DESPUÉS de los
  // fetch de arriba para no demorar el loader; la card muestra su skeleton mientras carga.
  // Misma guarda que PlanesPage/TrainingIndex.
  if (!userStore.subscription && !userStore.subscriptionLoading) {
    void userStore.loadSubscription()
  }

  // Hydrate active enrollments so the program dropdown on ProgramProgressCard
  // (hoja "Mi programa") appears on first load.
  await Promise.all([loadProgramProgress(), userStore.fetchCurrentProgram()])

  void loadWeeks()

  // Handle pending deep link from notification tap (per D-30)
  const pendingRoute = notificationStore.consumePendingRoute()
  if (pendingRoute && pendingRoute !== '/mi-templo') {
    router.push(pendingRoute)
  }
})

onUnmounted(() => {
  schedulingApi.cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.mi-templo {
  padding: 16px;
  background-color: transparent; // D-16: la foto de fondo se ve detrás

  &__loading,
  &__error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    text-align: center;
    padding: 24px;
  }

  &__loading-text {
    margin: 16px 0 0;
    font-size: 14px;
    color: rgba($primary, 0.7);
  }

  &__error-icon {
    font-size: 64px;
    color: $negative;
    margin-bottom: 16px;
  }

  &__error-text {
    font-size: 14px;
    color: rgba($primary, 0.8);
    margin-bottom: 16px;
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
}

// Mi Árbol entry-point card (Phase 127)
.mi-arbol-card {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 16px;
  border: 1px solid rgba($secondary, 0.25);
  border-radius: 12px;
  background-color: white;
  cursor: pointer;
  text-align: left;
  transition: background-color 0.15s ease;

  &:hover {
    background-color: rgba($secondary, 0.06);
  }

  &__icon {
    font-size: 28px;
    color: $secondary;
    flex-shrink: 0;
  }

  &__text {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  &__title {
    font-family: 'Montserrat', sans-serif;
    font-size: 16px;
    font-weight: 700;
    color: $primary;
  }

  &__subtitle {
    font-size: 13px;
    color: rgba($accent, 0.7);
  }

  &__chevron {
    font-size: 22px;
    color: rgba($secondary, 0.6);
    flex-shrink: 0;
  }
}

// Premium cards carousel
.premium-carousel {
  margin: 0 -16px; // bleed to page edges

  &__dots {
    display: flex;
    justify-content: center;
    gap: 6px;
    padding: 0 0 8px;
  }

  &__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(#2c2318, 0.25);
    transition: all 0.2s ease;

    &--active {
      width: 18px;
      border-radius: 3px;
      background: #2c2318;
    }
  }

  &__scroller {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__slide {
    flex: 0 0 100%;
    scroll-snap-align: center;
    padding: 0 16px;
    box-sizing: border-box;
  }
}
</style>
