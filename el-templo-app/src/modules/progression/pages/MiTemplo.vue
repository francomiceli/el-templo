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

      <!-- Program/Premium card — only for paid (non-plan-linked) programs -->
      <ProgramProgressCard
        v-if="programProgress && !programProgress.isLinkedToSubscription"
        :progress="programProgress"
        @program-changed="onProgramChanged"
      />

      <!-- Upsell: virtual users get carousel, presencial with linked program get CTA -->
      <template v-else-if="showUpsellBadge">
        <div class="premium-carousel">
          <div class="premium-carousel__dots">
            <span
              class="premium-carousel__dot"
              :class="{ 'premium-carousel__dot--active': premiumSlide === 0 }"
            />
            <span
              class="premium-carousel__dot"
              :class="{ 'premium-carousel__dot--active': premiumSlide === 1 }"
            />
          </div>
          <div ref="premiumScroller" class="premium-carousel__scroller" @scroll="onPremiumScroll">
            <div class="premium-carousel__slide">
              <UpsellBadge />
            </div>
            <div class="premium-carousel__slide">
              <ProgramCtaCard :segment="userStore.segment" />
            </div>
          </div>
        </div>
      </template>

      <ProgramCtaCard v-else :segment="userStore.segment" />

      <!-- Check-in Cards — horizontal swipeable row (Phase 82) -->
      <template v-if="orderedCheckIns.length > 0">
        <p class="mi-templo__section-title">Registro del día</p>
        <div class="mi-templo__check-ins">
          <button class="scroll-arrow scroll-arrow--left" @click="scrollCheckIns('left')">
            <q-icon name="chevron_left" size="20px" />
          </button>
          <div ref="checkInsRowRef" class="mi-templo__check-ins-row">
            <CheckInCard
              v-for="config in orderedCheckIns"
              :key="config.type"
              :config="config"
              :answer="progressionStore.checkInState?.answers[config.type] ?? null"
              class="mi-templo__check-in-item"
              @submit="
                (value: string, bodyArea?: string) =>
                  handleCheckInSubmit(config.type, value, bodyArea)
              "
            />
          </div>
          <button class="scroll-arrow scroll-arrow--right" @click="scrollCheckIns('right')">
            <q-icon name="chevron_right" size="20px" />
          </button>
        </div>
      </template>

      <!-- Tu Dia Cards — ordered by segment -->
      <template v-for="card in cardOrder" :key="card">
        <template v-if="card === 'session'">
          <RestDayCard v-if="showRestDay" />
          <SessionCtaCard
            v-else
            :today-completed="todayCompleted"
            :today-session="progressionStore.todaySession"
            :route-name="todayRouteName"
            :is-goal-plan="isGoalPlan"
            :check-in-message="checkInMessage"
          />
        </template>
        <BookingStatusCard
          v-if="card === 'booking' && showReservaCta"
          :has-booking="false"
          :next-class-time="null"
        />
      </template>

      <!-- Weekly Summary -->
      <WeeklySummaryCard
        :loading="progressionStore.weeklySummaryLoading"
        :error="progressionStore.weeklySummaryError"
        :summary="progressionStore.weeklySummary"
        :total-sessions="progressionStore.stats?.totalSessions ?? 0"
      />

      <!-- Existing stats, RPE trend, and evaluation sections -->
      <GeneralContent
        :rpe-trend="progressionStore.rpeTrend"
        :evaluation="progressionStore.evaluation"
        @request-evaluation="handleRequestEvaluation"
      />

      <!-- Daily quote — scroll closure -->
      <DailyQuote />
    </div>
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
import { computed, ref, onMounted, type Ref } from 'vue'
import TemploLoader from 'src/components/TemploLoader.vue'
import DailyQuote from '../components/DailyQuote.vue'
import { useProgressionStore } from '../stores/progressionStore'
import { useProgressionApi } from '../composables/useProgressionApi'
import { useCheckInApi } from '../composables/useCheckInApi'
import CheckInCard from '../components/CheckInCard.vue'
import { CHECK_IN_QUESTIONS, type CheckInQuestionConfig, type CheckInQuestionType } from '../types'
import { useUserStore } from 'src/stores/useUserStore'
import { useWeekData } from 'src/modules/training/composables/useWeekData'
import { getRouteName } from 'src/modules/training/utils/routeNames'
import SessionCtaCard from '../components/SessionCtaCard.vue'
import BookingStatusCard from '../components/BookingStatusCard.vue'
import RestDayCard from '../components/RestDayCard.vue'
import WeeklySummaryCard from '../components/WeeklySummaryCard.vue'
import GeneralContent from '../components/GeneralContent.vue'
import ProgramCtaCard from 'src/modules/programs/components/ProgramCtaCard.vue'
import ProgramProgressCard from 'src/modules/programs/components/ProgramProgressCard.vue'
import { useProgramsApi } from 'src/modules/programs/composables/useProgramsApi'
import type { MemberEnrollmentProgress } from 'src/modules/programs/types'
import PermissionBanner from '../components/PermissionBanner.vue'
import UpsellBadge from '../components/UpsellBadge.vue'
import { useNotificationStore } from 'src/stores/useNotificationStore'
import { useRouter } from 'vue-router'
import { createLogger } from 'src/utils/logger'

const log = createLogger('MiTemplo')
const notificationStore = useNotificationStore()
const router = useRouter()
const progressionStore = useProgressionStore()
const userStore = useUserStore()
const { fetchStats, requestEvaluation, fetchWeeklySummary } = useProgressionApi()
const { fetchTodayCheckIns, submitCheckIn } = useCheckInApi()
const { sessions: weekSessions, fetchWeekSessions } = useWeekData()
const { getMyProgress } = useProgramsApi()
const programProgress = ref<MemberEnrollmentProgress | null>(null)
const checkInsRowRef = ref<HTMLElement | null>(null)
const premiumScroller = ref<HTMLElement | null>(null) as Ref<HTMLElement | null>
const premiumSlide = ref(0)

function scrollCheckIns(direction: 'left' | 'right') {
  const el = checkInsRowRef.value
  if (!el) return
  el.scrollBy({ left: direction === 'left' ? -280 : 280, behavior: 'smooth' })
}

function onPremiumScroll() {
  const el = premiumScroller.value
  if (!el) return
  const scrollRatio = el.scrollLeft / (el.scrollWidth - el.clientWidth)
  premiumSlide.value = scrollRatio > 0.5 ? 1 : 0
}

const todayStr = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

const todayRouteName = computed(() => {
  const session = weekSessions.value.get(todayStr.value)
  if (!session || !session.blocks || session.blocks.length === 0) return null
  const mainBlock = session.blocks.find((b) => b.role === 'NUCLEUS') || session.blocks[0]
  return getRouteName(mainBlock.route)
})

const isRestDay = computed(() => {
  const d = new Date()
  const dayOfWeek = d.getDay()
  // Sunday = 0 is rest day
  if (dayOfWeek === 0) return true
  // If weekly data loaded and today has no session
  if (weekSessions.value.size > 0 && !weekSessions.value.get(todayStr.value)) return true
  return false
})

const showRestDay = computed(() => {
  if (userStore.profile?.branchIsVirtual && !userStore.hasActiveSubscription) {
    return false
  }
  return isRestDay.value
})

const showUpsellBadge = computed(() => {
  return userStore.profile?.branchIsVirtual ?? false
})

const todayCompleted = computed(() => {
  return progressionStore.todaySession?.completed ?? false
})

const isGoalPlan = computed(() => {
  return userStore.hasActiveGoalPlan
})

const showReservaCta = computed(() => {
  return !userStore.profile?.branchIsVirtual
})

type CardId = 'session' | 'booking'

const cardOrder = computed((): CardId[] => {
  return ['booking', 'session']
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

async function handleCheckInSubmit(
  questionType: CheckInQuestionType,
  value: string,
  bodyArea?: string,
) {
  await submitCheckIn(questionType, value, bodyArea)
}

async function handleRequestEvaluation() {
  await requestEvaluation()
}

function currentWeekDates(): string[] {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + diffToMonday)
  const dates: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    dates.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    )
  }
  return dates
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
  await Promise.all([loadProgramProgress(), fetchWeekSessions(currentWeekDates())])
}

onMounted(async () => {
  fetchStats()
  fetchWeeklySummary()
  fetchTodayCheckIns()

  // Hydrate active enrollments so the bundle dropdown on ProgramProgressCard
  // appears on first load. loadSubscription is only called from /training,
  // /reservas, /profile, /planes — without this, the dropdown would only
  // light up after visiting one of those pages.
  await Promise.all([loadProgramProgress(), userStore.fetchCurrentProgram()])

  fetchWeekSessions(currentWeekDates())

  // Handle pending deep link from notification tap (per D-30)
  const pendingRoute = notificationStore.consumePendingRoute()
  if (pendingRoute && pendingRoute !== '/mi-templo') {
    router.push(pendingRoute)
  }
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.mi-templo {
  padding: 16px;
  background-color: $cream;

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

  &__section-title {
    font-family: 'Montserrat', sans-serif;
    font-size: 16px;
    font-weight: 800;
    color: $primary;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: -4px 0 -8px;
  }

  &__check-ins {
    position: relative;

    &::before,
    &::after {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      width: 24px;
      z-index: 1;
      pointer-events: none;
    }

    &::before {
      left: 0;
      background: linear-gradient(to right, $cream, transparent);
    }

    &::after {
      right: 0;
      background: linear-gradient(to left, $cream, transparent);
    }
  }

  &__check-ins-row {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    padding: 0 4px;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__check-in-item {
    min-width: 260px;
    max-width: 280px;
    flex-shrink: 0;
    scroll-snap-align: start;
  }
}

// Scroll arrows (desktop only)
.scroll-arrow {
  display: none;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(white, 0.9);
  color: $primary;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: background 200ms ease;

  &:hover {
    background: white;
  }

  &--left {
    left: 4px;
  }

  &--right {
    right: 4px;
  }

  @media (min-width: 768px) {
    display: flex;
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
