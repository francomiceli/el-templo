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

    <!-- Content State. Orden fijo de la pila (D-02):
         card de hoy → Novedades → Registro del día → Patrocinadores → Tus sesiones
         (con la evaluación si aplica) → Para vos → Frase del día. El saludo vive en el layout. -->
    <div
      v-else
      class="mi-templo__content"
      :class="{ 'mi-templo__content--fab': todayBookingStore.fabVisible }"
    >
      <!-- Notification Permission Banner (per D-24): arriba de todo -->
      <PermissionBanner />

      <!-- Card de hoy (D-01/D-03, variante A'): la acción del día arriba de todo. Reemplaza a las
           4 cards viejas (sesión, clase reservada, estado sin sesión y programa). Solo pinta el modelo de resolveTodayCard. -->
      <TodayCard :model="todayCard" @open-program="programSheetOpen = true" />

      <!-- Novedades (D-08): mismo diseño del sketch 004, debajo de la card de hoy.
           Sin novedades no renderiza nada (L50) y es fail-open (D-12). -->
      <NovedadesCard />

      <!-- Registro del día (D-07): una pregunta por vez, colapsa a una línea. Se oculta
           para quien nunca tuvo plan (sin-plan-nunca), como el sketch. -->
      <CheckInPanel
        v-if="orderedCheckIns.length > 0 && todayCard.kind !== 'sin-plan-nunca'"
        :questions="orderedCheckIns"
        :answers="progressionStore.checkInState?.answers ?? emptyAnswers"
        :save="handleCheckInSubmit"
      />

      <!-- Patrocinadores (D-20/D-23): carrusel de marcas por país, a sangre y sin título.
           Sin marcas no renderiza nada (L50). El tap abre la hoja de detalle (abajo). -->
      <SponsorsCarousel @open="openSponsor" />

      <!-- Tus sesiones (D-09, sketch 007 A): sesiones de la semana + días L–D + total al pie, sin RPE. La evaluación de nivel (solo si es
           accionable o está pendiente) pertenece a este bloque. -->
      <WeekStrip
        v-if="todayCard.kind !== 'sin-plan-nunca'"
        :week-start="weekStartsFor(todayStr)[0]"
        :today-str="todayStr"
        :completed-dates="completedDates"
        :total-sessions="progressionStore.stats?.totalSessions ?? 0"
      />
      <GeneralContent
        :evaluation="progressionStore.evaluation"
        @request-evaluation="handleRequestEvaluation"
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

      <!-- Para vos (D-10): carrusel de cards claras sin dots; la siguiente asoma ~24 px.
           Orden: Invitaciones, Presencial (solo online), Planes personalizados (si no hay
           card de programa) y avisos libres del admin (D-15b). "Sugerencias" vive en Perfil (D-11). -->
      <section class="for-you" aria-label="Para vos">
        <div class="for-you__rail">
          <ReferralCtaCard />
          <UpsellBadge v-if="showUpsellBadge" />
          <ProgramCtaCard v-if="showProgramCta" :segment="userStore.segment" />
          <AvisoCard
            v-for="t in avisosStore.tarjetasLibres"
            :key="t.id"
            :aviso-id="t.id"
            :title="t.title"
            :body="t.body"
            :button-text="t.buttonText"
            :destination="t.destination"
          />
        </div>
      </section>

      <!-- Frase del día (D-12): cierre del scroll -->
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

    <!-- Hoja de detalle de la marca tocada en el carrusel + carnet de socio (D-22). -->
    <SponsorSheet
      v-model="sheetOpen"
      :sponsor="selectedSponsor"
      @show-card="memberCardOpen = true"
    />
    <MemberCard v-model="memberCardOpen" />
  </q-page>
</template>

<script setup lang="ts">
// deploy: forzar build de la app tras el CI rojo de la fase 202 (test de corrections-reply, paths-filter, 2026-10-27)
/**
 * MiTemplo page — personalized daily briefing ("Tu Dia").
 *
 * Una sola pantalla con gates (fase 199): card de hoy, Novedades, Registro del día,
 * Patrocinadores, Tus sesiones (con evaluación si aplica), Para vos y la frase del día.
 */
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import TemploLoader from 'src/components/TemploLoader.vue'
import DailyQuote from '../components/DailyQuote.vue'
import { useProgressionStore } from '../stores/progressionStore'
import { useProgressionApi } from '../composables/useProgressionApi'
import { useCheckInApi } from '../composables/useCheckInApi'
import CheckInPanel from '../components/CheckInPanel.vue'
import WeekStrip from '../components/WeekStrip.vue'
import { CHECK_IN_QUESTIONS, type CheckInQuestionConfig, type CheckInQuestionType } from '../types'
import { useUserStore } from 'src/stores/useUserStore'
import { FREE_BLOCKS_ENABLED, MEMBER_TREE_ENABLED } from 'src/config/featureFlags'
import { useWeekData } from 'src/modules/training/composables/useWeekData'
import { getRouteName } from 'src/modules/training/utils/routeNames'
import { mainBlock } from 'src/modules/training/utils/blockMeta'
import type { Session } from 'src/modules/training/types/session'
import TodayCard from '../components/TodayCard.vue'
import ProgramSheet from '../components/ProgramSheet.vue'
import { pickNextRoute, resolveTodayCard } from '../utils/today-card'
import type { CheckInAnswers } from '../utils/check-in-summary'
import GeneralContent from '../components/GeneralContent.vue'
import ProgramCtaCard from 'src/modules/programs/components/ProgramCtaCard.vue'
import { useProgramsApi } from 'src/modules/programs/composables/useProgramsApi'
import type { MemberEnrollmentProgress } from 'src/modules/programs/types'
import PermissionBanner from '../components/PermissionBanner.vue'
import NovedadesCard from '../components/NovedadesCard.vue'
import SponsorsCarousel from '../components/SponsorsCarousel.vue'
import SponsorSheet from '../components/SponsorSheet.vue'
import MemberCard from '../components/MemberCard.vue'
import ReferralCtaCard from '../components/ReferralCtaCard.vue'
import UpsellBadge from '../components/UpsellBadge.vue'
import AvisoCard from '../components/AvisoCard.vue'
import { useAvisosStore } from 'src/stores/useAvisosStore'
import { useNovedadesStore } from 'src/stores/useNovedadesStore'
import { useSponsorsStore, type Sponsor } from 'src/stores/useSponsorsStore'
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
const sponsorsStore = useSponsorsStore()
const { fetchStats, requestEvaluation } = useProgressionApi()
const { fetchTodayCheckIns, submitCheckIn } = useCheckInApi()
const todayBookingStore = useTodayBookingStore()
const schedulingApi = useSchedulingApi()
const { sessions: weekSessions, completedDates, fetchWeekSessions } = useWeekData()
const { getMyProgress } = useProgramsApi()
const programProgress = ref<MemberEnrollmentProgress | null>(null)
const programSheetOpen = ref(false)
const trialEligible = ref(false)
// Marca tocada en el carrusel de patrocinadores: abre la hoja de detalle (plan 19).
const selectedSponsor = ref<Sponsor | null>(null)
const sheetOpen = computed({
  get: () => selectedSponsor.value !== null,
  set: (open: boolean) => {
    if (!open) selectedSponsor.value = null
  },
})
const memberCardOpen = ref(false)

function openSponsor(sponsor: Sponsor): void {
  selectedSponsor.value = sponsor
}

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

// D-04: "hoy", día de la semana y semana actual en la zona de la SEDE, nunca la del teléfono.
const tz = computed(() => todayBookingStore.tz)
const todayStr = computed(() => todayInTz(tz.value, todayBookingStore.now))
const dow = computed(() => dowInTz(tz.value, todayBookingStore.now))

function routeNameOf(session: Session | null | undefined): string | null {
  if (!session || !session.blocks) return null
  const main = mainBlock(session.blocks)
  return main ? getRouteName(main.route) : null
}

const todayRouteName = computed(() => routeNameOf(weekSessions.value.get(todayStr.value)))

// "Próxima: <plani>" (card sin clase reservada): hoy o el próximo día cargado con sesión.
const nextRouteName = computed(() => {
  const routeByDate = new Map<string, string | null>()
  for (const [date, session] of weekSessions.value) routeByDate.set(date, routeNameOf(session))
  return pickNextRoute(todayStr.value, routeByDate)
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

// Lunes..domingo de la semana actual, a partir de la fecha de la sede.
function currentWeekDates(): string[] {
  const monday = weekStartsFor(todayStr.value)[0]
  return Array.from({ length: 7 }, (_, i) => addDaysStr(monday, i))
}

/** Semana actual: de ahí sale el nombre de la sesión de hoy y los días completados. */
async function loadWeeks(): Promise<void> {
  await fetchWeekSessions(currentWeekDates())
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
// Sin `immediate` (REVIEW-app WR-03): `onMounted` recarga la suscripción siempre que no haya
// plan activo, así que la transición loading -> loaded de esa recarga dispara esto UNA vez por
// visita. Con `immediate` corría también en el setup con la suscripción vieja en memoria y la
// recarga lo repetía (doble plan-status y doble trial-eligibility).
watch(
  () => userStore.subscriptionLoaded && !userStore.subscriptionLoading,
  (ready) => {
    if (!ready || userStore.hasActiveSubscription) return
    void userStore.loadPlanStatus()
    if (!isVirtual.value) void loadTrialEligibility()
  },
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
    // Hasta que respondan las reservas de hoy la card no afirma que falte reservar (A1).
    bookingsLoading: !todayBookingStore.loaded,
    todayRoute: todayRouteName.value,
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
    nextRoute: nextRouteName.value,
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
    trialEligible: trialEligible.value,
    libreEnabled: FREE_BLOCKS_ENABLED,
    // Fase 203 (plan 10): entradas "todavía no sé" de la función pura. En false = comportamiento de
    // antes; el plan 11 las cablea a las fuentes reales (perfil, semana, programa, stats, tope).
    profileLoading: false,
    weekLoading: false,
    programLoading: false,
    trialLoading: false,
    statsLoading: false,
    planFailed: false,
    bookingsFailed: false,
    programFailed: false,
    statsFailed: false,
    deadlinePassed: false,
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
  // Patrocinadores (D-20): fail-open; el feed ya viene filtrado por país y vigencia.
  void sponsorsStore.load()

  // Fase 199: Mi Templo carga la suscripción al montar porque el login no lo hace
  // (boot/auth.ts solo la dispara al arrancar con sesión): sin esto, tras un login
  // sin reinicio un socio con plan vería "Arrancá tu plan". Sin await y DESPUÉS de los
  // fetch de arriba para no demorar el loader; la card muestra su skeleton mientras carga.
  // Se recarga también si lo que hay en memoria NO es un plan activo (p.ej. una suscripción
  // `expired` vieja): si el socio renovó en esta misma sesión, sin esto vería "Renová tu plan".
  if (!userStore.hasActiveSubscription && !userStore.subscriptionLoading) {
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
    color: #6b6459; // D-15: texto sólido
  }

  &__error-icon {
    font-size: 64px;
    color: $negative;
    margin-bottom: 16px;
  }

  &__error-text {
    font-size: 14px;
    color: #2c2318; // D-15: texto sólido
    margin-bottom: 16px;
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 16px;

    // D-06/L28: `.mi-templo__content--fab` reserva el espacio del botón QR flotante SOLO mientras se ve.
    // Sin transición no hay salto brusco al aparecer; con reduced-motion cambia de golpe.
    @media (prefers-reduced-motion: no-preference) {
      transition: padding-bottom 0.2s ease;
    }

    &--fab {
      padding-bottom: 88px;
    }
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

// Para vos (D-10): carrusel compacto de cards claras. Cada hijo directo del rail es una card
// (ReferralCtaCard, UpsellBadge, ProgramCtaCard, AvisoCard → ForYouCard).
.for-you {
  margin: 0 -16px; // sangra a los bordes de la página

  &__rail {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-padding-inline: 16px;
    padding: 0 16px 2px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }

    // Ancho = pantalla - márgenes (2 × 16) - 24 px de la siguiente asomando.
    > :deep(.for-you-card) {
      flex: 0 0 calc(100% - 2 * 16px - 24px);
      scroll-snap-align: start;
    }
  }
}
</style>
