<template>
  <q-page class="mi-camino">
    <!-- Loading State -->
    <div v-if="progressionStore.loading" class="mi-camino__loading">
      <q-spinner-dots color="primary" size="50px" />
      <p class="mi-camino__loading-text">Cargando tu progreso...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="progressionStore.error" class="mi-camino__error">
      <q-icon name="error_outline" class="mi-camino__error-icon" />
      <p class="mi-camino__error-text">{{ progressionStore.error }}</p>
      <q-btn color="primary" unelevated no-caps @click="fetchStats"> Reintentar </q-btn>
    </div>

    <!-- Content State -->
    <div v-else class="mi-camino__content">
      <!-- Segment-Driven Greeting -->
      <SegmentGreeting
        :member-name="userName"
        :segment="userStore.segment"
        :level="greetingLevel"
      />

      <!-- Streak Row (only visible when streak > 0) -->
      <StreakRow v-if="currentStreak > 0" :streak="currentStreak" />

      <!-- Check-in Cards — horizontal swipeable row (Phase 82) -->
      <div v-if="orderedCheckIns.length > 0" class="mi-camino__check-ins">
        <div class="mi-camino__check-ins-row">
          <CheckInCard
            v-for="config in orderedCheckIns"
            :key="config.type"
            :config="config"
            :answer="progressionStore.checkInState?.answers[config.type] ?? null"
            class="mi-camino__check-in-item"
            @submit="
              (value: string, bodyArea?: string) =>
                handleCheckInSubmit(config.type, value, bodyArea)
            "
          />
        </div>
      </div>

      <!-- Tu Dia Cards — ordered by segment -->
      <template v-for="card in cardOrder" :key="card">
        <template v-if="card === 'session'">
          <RestDayCard v-if="isRestDay" />
          <SessionCtaCard
            v-else
            :today-completed="todayCompleted"
            :today-session="progressionStore.todaySession"
            :route-name="todayRouteName"
            :is-personalizada="isPersonalizada"
            :check-in-message="checkInMessage"
          />
        </template>
        <BookingStatusCard
          v-if="card === 'booking' && showReservaCta"
          :has-booking="false"
          :next-class-time="null"
        />
      </template>

      <!-- Weekly Summary (progress bar + stats) -->
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
    </div>
  </q-page>
</template>

<script setup lang="ts">
/**
 * MiCamino page — personalized daily briefing ("Tu Dia").
 *
 * Shows segment-driven greeting, session CTA with today's route,
 * booking status, weekly progress, weekly summary, and existing
 * stats/RPE trend/evaluation sections.
 */
import { computed, onMounted } from 'vue'
import { useProgressionStore } from '../stores/progressionStore'
import { useProgressionApi } from '../composables/useProgressionApi'
import { useCheckInApi } from '../composables/useCheckInApi'
import CheckInCard from '../components/CheckInCard.vue'
import {
  CHECK_IN_QUESTIONS,
  type CheckInQuestionConfig,
  type CheckInQuestionType,
} from '../types'
import { useUserStore, type MemberSegment } from 'src/stores/useUserStore'
import { useWeekData } from 'src/modules/training/composables/useWeekData'
import { getRouteName } from 'src/modules/training/utils/routeNames'
import SegmentGreeting from '../components/SegmentGreeting.vue'
import StreakRow from '../components/StreakRow.vue'
import SessionCtaCard from '../components/SessionCtaCard.vue'
import BookingStatusCard from '../components/BookingStatusCard.vue'
import RestDayCard from '../components/RestDayCard.vue'
import WeeklySummaryCard from '../components/WeeklySummaryCard.vue'
import GeneralContent from '../components/GeneralContent.vue'

const progressionStore = useProgressionStore()
const userStore = useUserStore()
const { fetchStats, requestEvaluation, fetchWeeklySummary } = useProgressionApi()
const { fetchTodayCheckIns, submitCheckIn } = useCheckInApi()
const { sessions: weekSessions, fetchWeekSessions } = useWeekData()

const userName = computed(() => {
  return userStore.profile?.firstName || 'Atleta'
})

const currentStreak = computed(() => progressionStore.stats?.currentStreak ?? 0)

const greetingLevel = computed(() => {
  if (!progressionStore.level) return null
  return {
    greekLetter: progressionStore.level.greekLetter,
    levelName: progressionStore.level.displayName,
  }
})

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

const todayCompleted = computed(() => {
  return progressionStore.todaySession?.completed ?? false
})

const isPersonalizada = computed(() => {
  return userStore.hasActivePersonalizada
})

const showReservaCta = computed(() => {
  return !userStore.profile?.branchIsVirtual
})

type CardId = 'session' | 'booking'

const cardOrder = computed((): CardId[] => {
  const segment = userStore.segment
  // Segments where booking comes first (lower barrier, re-engagement)
  const bookingFirstSegments: (MemberSegment | null)[] = ['en_riesgo', 'nuevo_guerrero', 'ghost']
  if (bookingFirstSegments.includes(segment)) {
    return ['booking', 'session']
  }
  // Default and action-oriented segments: session first
  return ['session', 'booking']
})

const orderedCheckIns = computed((): CheckInQuestionConfig[] => {
  if (!progressionStore.checkInState) return []
  const unlocked = progressionStore.checkInState.unlocked
  if (unlocked.length === 0) return []
  const available = CHECK_IN_QUESTIONS.filter((q) => unlocked.includes(q.type))
  // Soreness always first, rest rotate daily
  const soreness = available.filter((q) => q.type === 'soreness')
  const rest = available.filter((q) => q.type !== 'soreness')
  if (rest.length > 1) {
    const dayOfEpoch = Math.floor(Date.now() / 86400000)
    const rotateBy = dayOfEpoch % rest.length
    const rotated = [...rest.slice(rotateBy), ...rest.slice(0, rotateBy)]
    return [...soreness, ...rotated]
  }
  return [...soreness, ...rest]
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

onMounted(() => {
  fetchStats()
  fetchWeeklySummary()
  fetchTodayCheckIns()

  // Fetch week sessions for today's route
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
  fetchWeekSessions(dates)
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.mi-camino {
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
</style>
