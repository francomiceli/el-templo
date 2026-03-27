<template>
  <q-page class="mi-templo">
    <!-- Loading State -->
    <div v-if="progressionStore.loading" class="mi-templo__loading">
      <q-spinner-dots color="primary" size="50px" />
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

      <!-- Check-in Cards — horizontal swipeable row (Phase 82) -->
      <template v-if="orderedCheckIns.length > 0">
        <p class="mi-templo__section-title">Registro del día</p>
        <div class="mi-templo__check-ins">
          <div class="mi-templo__check-ins-row">
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
        </div>
      </template>

      <!-- Program CTA or Progress Card (per D-14: below check-ins) -->
      <ProgramProgressCard v-if="programProgress" :progress="programProgress" />
      <ProgramCtaCard v-else-if="showProgramCta" :segment="userStore.segment" />

      <!-- Tu Dia Cards — ordered by segment -->
      <template v-for="card in cardOrder" :key="card">
        <template v-if="card === 'session'">
          <RestDayCard v-if="showRestDay" />
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

      <!-- Upsell Badge for online/promo users (per D-18) -->
      <UpsellBadge v-if="showUpsellBadge" />

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
import { computed, ref, onMounted } from 'vue'
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
const { getMyProgress, getCatalog } = useProgramsApi()
const programProgress = ref<MemberEnrollmentProgress | null>(null)
const hasProgramsAvailable = ref(false)

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

const isPersonalizada = computed(() => {
  return userStore.hasActivePersonalizada
})

const showReservaCta = computed(() => {
  return !userStore.profile?.branchIsVirtual
})

type CardId = 'session' | 'booking'

const cardOrder = computed((): CardId[] => {
  return ['booking', 'session']
})

const showProgramCta = computed(() => !programProgress.value && hasProgramsAvailable.value)

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

onMounted(async () => {
  fetchStats()
  fetchWeeklySummary()
  fetchTodayCheckIns()

  // Fetch program enrollment status
  try {
    programProgress.value = await getMyProgress()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.warn('Failed to load program progress', { error: message })
  }
  // Check if any programs exist (for CTA visibility per D-45)
  if (!programProgress.value) {
    try {
      const catalog = await getCatalog()
      hasProgramsAvailable.value = catalog.length > 0
    } catch {
      hasProgramsAvailable.value = false
    }
  }

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
    font-size: 14px;
    font-weight: 600;
    color: rgba($primary, 0.6);
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
</style>
