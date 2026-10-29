<template>
  <q-page class="mi-templo">
    <!-- Fase 203 (C-6, D-16): la página nunca se reemplaza entera por un loader ni por una pantalla
         de error. Cada card reserva su lugar (esqueleto) o degrada sola; un fallo de stats solo se
         avisa con el toast de `fetchStats`.
         Orden fijo de la pila (fase 199, D-02):
         card de hoy → Novedades → Registro del día → Patrocinadores → Tus sesiones
         (con la evaluación si aplica) → Para vos → Frase del día. El saludo vive en el layout. -->
    <div
      class="mi-templo__content"
      :class="{ 'mi-templo__content--fab': todayBookingStore.fabVisible }"
    >
      <!-- Notification Permission Banner (per D-24): arriba de todo -->
      <PermissionBanner />

      <!-- Card de hoy (D-01/D-03, variante A'): la acción del día arriba de todo. Reemplaza a las
           4 cards viejas (sesión, clase reservada, estado sin sesión y programa). Solo pinta el modelo de resolveTodayCard. -->
      <TodayCard :model="todayCard" @open-program="programSheetOpen = true" />

      <!-- Novedades (D-08): mismo diseño del sketch 004, debajo de la card de hoy.
           Sin novedades no renderiza nada (L50) y es fail-open (D-12). Fase 203 (D-02): reserva el
           lugar con esqueleto solo si la última vez tuvo novedades. -->
      <CardSkeleton
        v-if="slots.novedades === 'skeleton'"
        :height="NOVEDADES_SKELETON_PX"
        :radius="16"
        label="Cargando novedades"
      />
      <NovedadesCard v-else-if="slots.novedades === 'content'" />

      <!-- Registro del día (D-07): una pregunta por vez, colapsa a una línea. Se oculta
           para quien nunca tuvo plan (sin-plan-nunca), como el sketch. -->
      <CardSkeleton
        v-if="slots.checkIn === 'skeleton'"
        :height="CHECKIN_SKELETON_PX"
        :radius="16"
        label="Cargando el registro del día"
      />
      <CheckInPanel
        v-else-if="slots.checkIn === 'content'"
        :questions="orderedCheckIns"
        :answers="progressionStore.checkInState?.answers ?? emptyAnswers"
        :save="handleCheckInSubmit"
      />

      <!-- Patrocinadores (D-20/D-23): carrusel de marcas por país, a sangre y sin título.
           Sin marcas no renderiza nada (L50). El tap abre la hoja de detalle (abajo). -->
      <CardSkeleton
        v-if="slots.sponsors === 'skeleton'"
        :height="SPONSORS_SKELETON_PX"
        :radius="16"
        label="Cargando beneficios"
      />
      <SponsorsCarousel v-else-if="slots.sponsors === 'content'" @open="openSponsor" />

      <!-- Tus sesiones (D-09, sketch 007 A): sesiones de la semana + días L–D + total al pie, sin RPE. La evaluación de nivel (solo si es
           accionable o está pendiente) pertenece a este bloque. -->
      <CardSkeleton
        v-if="slots.weekStrip === 'skeleton'"
        :height="WEEKSTRIP_SKELETON_PX"
        :radius="16"
        label="Cargando tus sesiones"
      />
      <!-- Total: solo el que informó el server. Sin stats (pendientes o fallidas) va null y la
           fila queda reservada pero oculta: nunca se afirma "0 sesiones" (D-07/D-16). Un refresco
           fallido conserva las stats previas, que siguen siendo el último dato bueno. -->
      <WeekStrip
        v-else-if="slots.weekStrip === 'content'"
        :week-start="weekStartsFor(todayStr)[0]"
        :today-str="todayStr"
        :completed-dates="completedDates"
        :total-sessions="progressionStore.stats?.totalSessions ?? null"
      />
      <CardSkeleton
        v-if="slots.evaluation === 'skeleton'"
        :height="EVALUATION_SKELETON_PX"
        :radius="16"
        label="Cargando la evaluación"
      />
      <GeneralContent
        v-else-if="slots.evaluation === 'content'"
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
        <!-- Fase 203 (D-01/C-11): hasta que llegan las tarjetas del admin, el estado del socio y el
             perfil el riel muestra esqueletos (sin texto de respaldo que después cambie por el del
             admin ni cards que aparezcan de golpe). Con el tope vencido sale lo que haya. -->
        <div v-if="slots.paraVos === 'skeleton'" class="for-you__rail" aria-busy="true">
          <CardSkeleton
            v-for="n in 2"
            :key="n"
            class="for-you__skeleton"
            inline
            :height="FOR_YOU_SKELETON_PX"
            :radius="16"
            label="Cargando"
          />
        </div>
        <div v-else class="for-you__rail">
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
// deploy: forzar build de la app tras el CI rojo de NODE-6K + ladder (sentinel de tenancy en el test, paths-filter, 2026-10-29)
/**
 * MiTemplo page — personalized daily briefing ("Tu Dia").
 *
 * Una sola pantalla con gates (fase 199): card de hoy, Novedades, Registro del día,
 * Patrocinadores, Tus sesiones (con evaluación si aplica), Para vos y la frase del día.
 */
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import CardSkeleton from 'src/components/CardSkeleton.vue'
import DailyQuote from '../components/DailyQuote.vue'
import { useProgressionStore } from '../stores/progressionStore'
import { useProgressionApi } from '../composables/useProgressionApi'
import { useCheckInApi } from '../composables/useCheckInApi'
import CheckInPanel from '../components/CheckInPanel.vue'
import WeekStrip from '../components/WeekStrip.vue'
import { CHECK_IN_QUESTIONS, type CheckInQuestionConfig, type CheckInQuestionType } from '../types'
import { useUserStore, MEMBER_STATE_MAX_AGE_MS } from 'src/stores/useUserStore'
import { FREE_BLOCKS_ENABLED, MEMBER_TREE_ENABLED } from 'src/config/featureFlags'
import { useWeekData } from 'src/modules/training/composables/useWeekData'
import { getRouteName } from 'src/modules/training/utils/routeNames'
import { mainBlock } from 'src/modules/training/utils/blockMeta'
import type { Session } from 'src/modules/training/types/session'
import TodayCard from '../components/TodayCard.vue'
import ProgramSheet from '../components/ProgramSheet.vue'
import { pickNextRoute, resolveTodayCard } from '../utils/today-card'
import { MI_TEMPLO_CARD_KEYS, resolveMiTemploSlots } from '../utils/mi-templo-slots'
import type { CheckInAnswers } from '../utils/check-in-summary'
import GeneralContent from '../components/GeneralContent.vue'
import ProgramCtaCard from 'src/modules/programs/components/ProgramCtaCard.vue'
import PermissionBanner from '../components/PermissionBanner.vue'
import NovedadesCard from '../components/NovedadesCard.vue'
import SponsorsCarousel from '../components/SponsorsCarousel.vue'
import SponsorSheet from '../components/SponsorSheet.vue'
import MemberCard from '../components/MemberCard.vue'
import ReferralCtaCard from '../components/ReferralCtaCard.vue'
import UpsellBadge from '../components/UpsellBadge.vue'
import AvisoCard from '../components/AvisoCard.vue'
import { useAvisosStore } from 'src/stores/useAvisosStore'
import { useCardHadContentStore } from 'src/stores/useCardHadContentStore'
import { useNovedadesStore } from 'src/stores/useNovedadesStore'
import { useSponsorsStore, type Sponsor } from 'src/stores/useSponsorsStore'
import { useNotificationStore } from 'src/stores/useNotificationStore'
import { useTodayBookingStore } from 'src/stores/useTodayBookingStore'
import { useLoadDeadline } from 'src/composables/useLoadDeadline'
import { addDaysStr, formatHHMM, weekStartsFor } from 'src/utils/check-in-window'
import { dowInTz, todayInTz } from 'src/utils/tz'
import { useRouter } from 'vue-router'

// Fase 203 (D-01/D-02): altos de los esqueletos = alto de la card final, medido de sus estilos, para
// que al llegar el dato no salte el layout. Si cambia el diseño de una card, se actualiza acá.
/** NovedadesCard: borde 2 + encabezado (padding 12+2, línea de 16) + stage fijo 62 + barra de progreso 3. */
const NOVEDADES_SKELETON_PX = 97
/** CheckInPanel en su primer estado del día (pregunta + control): borde 2 + padding 12+14 + título 24 + pregunta 8+26 + control 10+44. */
const CHECKIN_SKELETON_PX = 140
/** SponsorsCarousel: el `min-height` de `.sp-card`. */
const SPONSORS_SKELETON_PX = 156
/** WeekStrip: borde 2 + padding 14 + encabezado ~21 + días 12+30+14 + franja del total ~51. */
const WEEKSTRIP_SKELETON_PX = 144
/** EvaluationRequest "Listo para evaluación": padding 32 + título ~18 + botón 12+48. */
const EVALUATION_SKELETON_PX = 110
/** Card del riel "Para vos" (ForYouCard con cuerpo de 2 líneas): borde 2 + padding 28 + kicker ~12 + título 6+20 + cuerpo ~36 + botón 2+44. */
const FOR_YOU_SKELETON_PX = 150

const notificationStore = useNotificationStore()
const router = useRouter()
const progressionStore = useProgressionStore()
const userStore = useUserStore()
const avisosStore = useAvisosStore()
const novedadesStore = useNovedadesStore()
const sponsorsStore = useSponsorsStore()
const cardFlags = useCardHadContentStore()
const { fetchStats, requestEvaluation } = useProgressionApi()
const { fetchTodayCheckIns, submitCheckIn } = useCheckInApi()
const todayBookingStore = useTodayBookingStore()
// Fase 203 (D-07): tope de carga de la página. Se arma UNA vez al montar (en `onMounted`), nunca
// dentro de un `watch`: cada `start()` vuelve `passed` a false.
const deadline = useLoadDeadline()
const {
  sessions: weekSessions,
  completedDates,
  loaded: weekLoaded,
  hasData: weekHasData,
  error: weekError,
  fetchWeekSessions,
} = useWeekData()
// Fase 203 (D-06): my-progress, current-program, enrollments, plan-status y trial-eligibility viven
// en el store (`ensureMemberState`); la página no los pide por su cuenta.
const programProgress = computed(() => userStore.myProgress)
const programSheetOpen = ref(false)
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

/**
 * Clave del pedido de `/sessions/weekly`: los mismos datos que arman sus parámetros
 * (zona de la sede, nivel elegido y lunes de la semana).
 */
function weeksKey(): string {
  return `${userStore.profile?.branchTimezone ?? ''}|${userStore.selectedLevel ?? ''}|${currentWeekDates()[0]}`
}

// Estado de cierre de `requestWeeks` (no es reactivo a propósito: nada lo lee desde el template).
let weeksInFlight: { key: string; promise: Promise<void> } | null = null
let weeksLoadedKey: string | null = null

/**
 * Pide la semana para `key`. Con un pedido en vuelo de la MISMA clave devuelve esa promesa. Con uno
 * en vuelo de OTRA clave espera a que termine antes de salir: `fetchWeekSessions` escribe lo último
 * que llega, y si el pedido viejo terminara después del nuevo pisaría la semana con parámetros
 * viejos. `weeksLoadedKey` solo se fija si la carga no falló (un error se puede reintentar).
 */
function startOrShareWeeks(key: string): Promise<void> {
  if (weeksInFlight?.key === key) return weeksInFlight.promise
  const previous = weeksInFlight?.promise
  const run = previous ? previous.catch(() => undefined).then(() => loadWeeks()) : loadWeeks()
  const promise: Promise<void> = run
    .then(() => {
      if (weekError.value === null) weeksLoadedKey = key
    })
    .finally(() => {
      if (weeksInFlight?.promise === promise) weeksInFlight = null
    })
  weeksInFlight = { key, promise }
  return promise
}

/**
 * Único punto que pide `/sessions/weekly` (fase 203, SC-4): un mismo juego de parámetros
 * (zona, nivel, semana) nunca se pide dos veces, salvo con `force`, que garantiza un pedido que
 * sale DESPUÉS de la llamada. Con un pedido en vuelo `force` no lo comparte (pudo salir antes del
 * cambio en el server): espera a que termine y encadena UNA recarga; dos `force` simultáneos
 * comparten la encadenada. Misma semántica que `ensureMemberState({ force: true })`.
 */
function requestWeeks(opts: { force?: boolean } = {}): Promise<void> {
  const key = weeksKey()
  if (opts.force) {
    if (weeksInFlight) {
      return weeksInFlight.promise.catch(() => undefined).then(() => startOrShareWeeks(weeksKey()))
    }
    return startOrShareWeeks(key)
  }
  if (weeksLoadedKey === key && !weeksInFlight) return Promise.resolve()
  return startOrShareWeeks(key)
}

async function onProgramChanged(): Promise<void> {
  // Bundle members switching programs from the home card. Re-fetch the member state
  // (my-progress follows the server-side current-program pointer) and the week sessions
  // so today's route + day cards reflect the new program. `force` espera la carga en vuelo
  // y encadena una carga completa, en ambos casos.
  await Promise.all([userStore.ensureMemberState({ force: true }), requestWeeks({ force: true })])
}

// Perfil tardío (boot optimista, D-08): sin perfil no se pide la semana (no hay zona ni nivel). Se
// dispara por PRESENCIA de perfil, no por la zona: `branchTimezone` es opcional en `UserProfile` y un
// perfil sin zona igual debe pedir la semana. Cuando el perfil recién llega (`!hadProfile`) se espera
// la hidratación del nivel antes de pedir, para que la clave ya lleve el nivel final:
// `retryProfileLoad` hace `setProfile` (cambia la zona) y luego `hydrateSelection` (cambia el nivel),
// y sin esta espera saldrían dos pedidos. El disparo siguiente por el cambio de nivel cae en la misma
// clave y comparte la promesa o se saltea. Cambios posteriores reales de zona o nivel -> clave nueva
// -> un pedido. No es inmediato: el montaje pide por su cuenta.
let disposed = false
watch(
  () =>
    [
      userStore.profile !== null,
      userStore.profile?.branchTimezone ?? null,
      userStore.selectedLevel,
    ] as const,
  async ([hasProfile], [hadProfile]) => {
    if (!hasProfile) return
    if (!hadProfile) await userStore.hydrateSelection()
    if (disposed) return
    void requestWeeks()
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
    // Hasta que respondan las reservas de hoy la card no afirma que falte reservar (A1). Si el perfil
    // llegó con otra zona, los turnos cargados con la zona por defecto no valen hasta que el layout
    // los recargue (D-08).
    bookingsLoading:
      !todayBookingStore.loaded || todayBookingStore.loadedTz !== todayBookingStore.tz,
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
    trialEligible: userStore.trialEligible,
    libreEnabled: FREE_BLOCKS_ENABLED,
    // Fase 203: "todavía no sé" (*Loading = no llegó por primera vez) y "falló" (*Failed = falló y no hay
    // dato previo). Una falla es "no sé", nunca "no": las banderas *Failed van a la card, que sale enseguida
    // a neutral / a lo que se sabe (una falla no espera el tope; el tope es solo para lo que tarda).
    // Sin perfil la card queda en esqueleto aun con el tope vencido: lo decide `resolveTodayCard` (D-08),
    // acá no hay ningún atajo que la saque de ahí.
    profileLoading: userStore.profile === null,
    weekLoading: !weekLoaded.value,
    programLoading: !userStore.memberStateLoaded,
    trialLoading: !userStore.trialEligibilityLoaded,
    statsLoading: !progressionStore.statsLoaded,
    // Sin suscripción 204/vencida y plan-status caído no se sabe si venció ni si hay un plan programado.
    planFailed:
      userStore.planStatus === null && (userStore.subscriptionFailed || userStore.planStatusFailed),
    bookingsFailed: todayBookingStore.loadFailed,
    programFailed: userStore.programFailed,
    // Stats falló y no hay previas: "no sé", nunca "no completada" (D-07).
    statsFailed: progressionStore.statsFailed,
    deadlinePassed: deadline.passed.value,
  })
})

// Fase 203 (D-01/D-02/D-07): qué se dibuja en el lugar de cada card (esqueleto, contenido u oculto) y
// qué flags "tuvo contenido" hay que guardar. La regla vive en una función pura; acá solo se arma el
// input con booleanos y conteos (D-03: nunca contenido).
const slots = computed(() => {
  const evaluation = progressionStore.evaluation
  return resolveMiTemploSlots({
    deadlinePassed: deadline.passed.value,
    todayKind: todayCard.value.kind,
    novedades: {
      loaded: novedadesStore.loaded,
      ok: novedadesStore.lastLoadOk,
      count: novedadesStore.novedades.length,
    },
    sponsors: {
      loaded: sponsorsStore.loaded,
      ok: sponsorsStore.lastLoadOk,
      count: sponsorsStore.sponsors.length,
    },
    checkIn: {
      settled: progressionStore.checkInSettled,
      ok: progressionStore.checkInOk,
      questions: orderedCheckIns.value.length,
    },
    week: { loaded: weekLoaded.value, ok: weekError.value === null, hasData: weekHasData.value },
    stats: {
      loaded: progressionStore.statsLoaded,
      ok: progressionStore.statsOk,
      evaluationVisible: evaluation !== null && (evaluation.eligible || evaluation.pendingRequest),
    },
    paraVos: {
      tarjetasSettled: avisosStore.tarjetasSettled,
      memberStateLoaded: userStore.memberStateLoaded,
      hasProfile: userStore.profile !== null,
    },
    hadContent: cardFlags.map,
  })
})

// Pitfall 6: `records` solo trae las cards cuya fuente respondió bien (nunca tras un error); `record()`
// ignora los valores que no cambian, así que este watch no entra en bucle con `cardFlags.map`.
watch(
  () => slots.value.records,
  (records) => {
    for (const card of MI_TEMPLO_CARD_KEYS) {
      const has = records[card]
      if (has !== undefined) cardFlags.record(card, has)
    }
  },
  { immediate: true },
)

onMounted(() => {
  // Fase 203 (SC-4, D-06): todo sale en el mismo tick y en paralelo, sin ningún `await` antes de los
  // pedidos. El tope de la card arranca una sola vez, acá.
  deadline.start()
  void fetchStats()
  void fetchTodayCheckIns()
  // D-15b: tarjetas del carrusel (fijas con copy editable + libres del admin).
  void avisosStore.loadTarjetas()
  // Novedades (D-12): fail-open, en cada montaje de Mi Templo. No hay
  // pull-to-refresh en esta página, así que no hay un segundo punto de carga.
  void novedadesStore.load()
  // Patrocinadores (D-20): fail-open; el feed ya viene filtrado por país y vigencia.
  void sponsorsStore.load()

  // Estado del socio (suscripción, plan-status, trial-eligibility, my-progress, current-program y
  // enrollments): reusa la carga del boot/layout si está en vuelo o fresca, y refresca si está
  // vieja (p. ej. un socio que renovó en esta sesión y todavía tenía un plan vencido en memoria).
  void userStore.ensureMemberState({ maxAgeMs: MEMBER_STATE_MAX_AGE_MS })

  // Semana: apenas hay perfil, en paralelo con todo lo demás. Sin perfil la pide el watch de arriba.
  if (userStore.profile) void requestWeeks()

  // Handle pending deep link from notification tap (per D-30)
  const pendingRoute = notificationStore.consumePendingRoute()
  if (pendingRoute && pendingRoute !== '/mi-templo') {
    router.push(pendingRoute)
  }
})

onUnmounted(() => {
  disposed = true
  deadline.cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.mi-templo {
  padding: 16px;
  background-color: transparent; // D-16: la foto de fondo se ve detrás

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

  // Esqueleto del riel (fase 203): mismo ancho que una card real. Gana por especificidad al
  // `flex: 0 0 auto` de CardSkeleton inline, que no sabe de este ancho.
  &__rail > &__skeleton {
    flex: 0 0 calc(100% - 2 * 16px - 24px);
    scroll-snap-align: start;
  }
}
</style>
