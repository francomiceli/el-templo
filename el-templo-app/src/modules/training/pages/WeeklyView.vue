<template>
  <q-page class="weekly-view">
    <!-- Header with week info -->
    <div class="weekly-view__header q-pa-md">
      <span class="weekly-view__title">{{ weekRangeLabel }}</span>
      <ProgramSelector class="weekly-view__selector" @changed="onViewChanged" />
    </div>

    <!-- Loading state while fetching sessions -->
    <div v-if="loading" class="weekly-view__loading">
      <TemploLoader size="lg" />
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="weekly-view__error q-pa-md">
      <q-banner class="bg-negative text-white" rounded>
        <template #avatar>
          <q-icon name="error" />
        </template>
        {{ error }}
        <template #action>
          <q-btn flat label="Reintentar" @click="loadWeekData" />
        </template>
      </q-banner>
    </div>

    <!-- Week carousel with full-height day cards (blocks included) -->
    <WeekCarousel v-else class="weekly-view__carousel" @start="handleStartSession" />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import TemploLoader from 'src/components/TemploLoader.vue'
import { createLogger } from 'src/utils/logger'
import { useUserStore } from 'src/stores/useUserStore'
import { useWeekStore } from '../stores/weekStore'
import { useWeekData } from '../composables/useWeekData'
import { getWeekDates, formatDayName, getDateState } from '../composables/useDateNavigation'
import type { WeekDay } from '../types/session'
import WeekCarousel from '../components/WeekCarousel.vue'
import ProgramSelector from '../components/ProgramSelector.vue'

const log = createLogger('WeeklyView')
const userStore = useUserStore()

/**
 * Main Weekly View page
 *
 * Assembles all components into the complete weekly training interface:
 * - Header with week number and date range
 * - Horizontal carousel of 7 day cards
 * - Block list showing session details for selected day
 * - Start button for beginning today's session
 *
 * Flow:
 * 1. On mount, fetch week's sessions from API
 * 2. Build WeekDay objects combining calendar + session data
 * 3. Populate store with week data
 * 4. Auto-select today in carousel
 * 5. Show blocks for selected day
 * 6. Enable Start button when today is selected and not completed
 */

const router = useRouter()
const weekStore = useWeekStore()
const { sessions, completedDates, loading, error, fetchWeekSessions } = useWeekData()

/**
 * Load week data from API and populate store
 */
async function loadWeekData() {
  try {
    // Get dates for current week (Monday-Sunday)
    const dates = getWeekDates()

    // Fetch sessions for all days in parallel
    await fetchWeekSessions(dates)

    // Build WeekDay objects combining calendar info + session data
    const weekDays: WeekDay[] = dates.map((date) => {
      const dateObj = new Date(date + 'T00:00:00')
      const dayOfWeek = dateObj.getDay()
      const session = sessions.value.get(date) || null

      return {
        date,
        dayName: formatDayName(date),
        dayOfWeek,
        state: getDateState(date, completedDates.value),
        session,
      }
    })

    // Update store with week data
    weekStore.setWeekDays(weekDays)

    // Auto-select today (or first non-Sunday if today is not in current week)
    // Use local timezone to match week date generation
    const now = new Date()
    const todayYear = now.getFullYear()
    const todayMonth = String(now.getMonth() + 1).padStart(2, '0')
    const todayDay = String(now.getDate()).padStart(2, '0')
    const today = `${todayYear}-${todayMonth}-${todayDay}`
    const todayInWeek = dates.includes(today)

    if (todayInWeek) {
      weekStore.selectDate(today)
    } else {
      // Select first non-Sunday day
      const firstNonSunday = weekDays.find((day) => day.state !== 'rest')
      if (firstNonSunday) {
        weekStore.selectDate(firstNonSunday.date)
      }
    }
  } catch (err) {
    log.error('Failed to load week data', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Week range label for header (e.g., "20 Ene - 26 Ene")
 */
const weekRangeLabel = computed(() => {
  const dates = weekStore.weekDays
  if (dates.length === 0) return ''

  const firstDate = new Date(dates[0].date + 'T00:00:00')
  const lastDate = new Date(dates[dates.length - 1].date + 'T00:00:00')

  const monthNames = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ]

  const firstDay = firstDate.getDate()
  const firstMonth = monthNames[firstDate.getMonth()]
  const lastDay = lastDate.getDate()
  const lastMonth = monthNames[lastDate.getMonth()]

  if (firstMonth === lastMonth) {
    return `${firstDay} al ${lastDay} de ${firstMonth}`
  }
  return `${firstDay} de ${firstMonth} al ${lastDay} de ${lastMonth}`
})

/**
 * Phase 104 (R9): re-fetch the current week when the user picks a different
 * view from the ProgramSelector. The selector has already PUT the new
 * pointer; we just need to re-issue GET /sessions/weekly so useWeekData
 * derives the new view param against the updated store state.
 */
function onViewChanged(): void {
  void loadWeekData()
}

/**
 * Navigate to Day Player when Start button clicked
 */
function handleStartSession(date: string) {
  if (userStore.hasActiveGoalPlan) {
    router.push({ name: 'goalPlan-session' })
  } else {
    router.push({ name: 'day-player', params: { date } })
  }
}

// Load data on mount
onMounted(() => {
  loadWeekData()
})
</script>

<style scoped lang="scss">
// Import brand variables
@import 'src/css/quasar.variables.scss';

.weekly-view {
  display: flex;
  flex-direction: column;
  // Calculate height minus the header (50px on mobile) and mobile tab bar
  height: calc(var(--app-vh) - 50px - var(--mobile-tabs-height));
  overflow: hidden;
  max-width: none !important;

  @media (min-width: 768px) {
    height: var(--app-vh);
  }

  &__header {
    flex-shrink: 0;
    position: relative;
    padding-bottom: 8px;
    display: flex;
    justify-content: center;
    align-items: baseline;
    gap: 8px;
  }

  &__title {
    font-family: 'Montserrat', sans-serif;
    font-size: 15px;
    font-weight: 700;
    color: $primary;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &__selector {
    margin-left: 4px;
  }

  &__carousel {
    flex: 1;
    min-height: 0; // Allow flex child to shrink below content size
  }

  &__loading {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__error {
    flex: 1;
  }
}
</style>
