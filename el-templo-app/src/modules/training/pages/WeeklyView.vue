<template>
  <q-page class="weekly-view">
    <!-- Header with week info -->
    <div class="weekly-view__header q-pa-md">
      <div class="weekly-view__title text-h5 text-weight-bold text-center">
        Semana {{ weekNumber }}
      </div>
      <div class="weekly-view__subtitle text-subtitle2 text-center">
        {{ weekRangeLabel }}
      </div>
    </div>

    <!-- Loading state while fetching sessions -->
    <div v-if="loading" class="weekly-view__loading">
      <q-spinner-dots color="primary" size="50px" />
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="weekly-view__error q-pa-md">
      <q-banner class="bg-negative text-white" rounded>
        <template #avatar>
          <q-icon name="error" />
        </template>
        {{ error }}
        <template #action>
          <q-btn
            flat
            label="Reintentar"
            @click="loadWeekData"
          />
        </template>
      </q-banner>
    </div>

    <!-- Week carousel with full-height day cards (blocks included) -->
    <WeekCarousel
      v-else
      class="weekly-view__carousel"
      @start="handleStartSession"
    />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useWeekStore } from '../stores/weekStore';
import { useWeekData } from '../composables/useWeekData';
import { getWeekDates, formatDayName, getDateState } from '../composables/useDateNavigation';
import type { WeekDay } from '../types/session';
import WeekCarousel from '../components/WeekCarousel.vue';

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

const router = useRouter();
const weekStore = useWeekStore();
const { sessions, loading, error, fetchWeekSessions } = useWeekData();

/**
 * Load week data from API and populate store
 */
async function loadWeekData() {
  try {
    // Get dates for current week (Monday-Sunday)
    const dates = getWeekDates();

    // Fetch sessions for all days in parallel
    await fetchWeekSessions(dates);

    // Build WeekDay objects combining calendar info + session data
    const weekDays: WeekDay[] = dates.map((date) => {
      const dateObj = new Date(date + 'T00:00:00');
      const dayOfWeek = dateObj.getDay();
      const session = sessions.value.get(date) || null;

      // TODO: Get completed dates from user activity store
      // For now, assume no days are completed
      const completedDates: string[] = [];

      return {
        date,
        dayName: formatDayName(date),
        dayOfWeek,
        state: getDateState(date, completedDates),
        session,
      };
    });

    // Update store with week data
    weekStore.setWeekDays(weekDays);

    // Auto-select today (or first non-Sunday if today is not in current week)
    const today = new Date().toISOString().split('T')[0];
    const todayInWeek = dates.includes(today);

    if (todayInWeek) {
      weekStore.selectDate(today);
    } else {
      // Select first non-Sunday day
      const firstNonSunday = weekDays.find(day => day.state !== 'rest');
      if (firstNonSunday) {
        weekStore.selectDate(firstNonSunday.date);
      }
    }
  } catch (err) {
    console.error('Failed to load week data:', err);
  }
}

/**
 * Week number from first available session
 * Falls back to current calendar week if no sessions
 */
const weekNumber = computed(() => {
  const firstSession = weekStore.weekDays.find(day => day.session)?.session;
  if (firstSession) {
    return firstSession.week;
  }

  // Fallback: calculate ISO week number
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 1000 * 60 * 60 * 24 * 7;
  return Math.ceil(diff / oneWeek);
});

/**
 * Week range label for header (e.g., "20 Ene - 26 Ene")
 */
const weekRangeLabel = computed(() => {
  const dates = weekStore.weekDays;
  if (dates.length === 0) return '';

  const firstDate = new Date(dates[0].date + 'T00:00:00');
  const lastDate = new Date(dates[dates.length - 1].date + 'T00:00:00');

  const monthNames = [
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
    'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
  ];

  const firstDay = firstDate.getDate();
  const firstMonth = monthNames[firstDate.getMonth()];
  const lastDay = lastDate.getDate();
  const lastMonth = monthNames[lastDate.getMonth()];

  if (firstMonth === lastMonth) {
    return `${firstDay} - ${lastDay} ${firstMonth}`;
  }
  return `${firstDay} ${firstMonth} - ${lastDay} ${lastMonth}`;
});

/**
 * Navigate to Day Player when Start button clicked
 */
function handleStartSession(date: string) {
  router.push({
    name: 'day-player',
    params: { date },
  });
}

// Load data on mount
onMounted(() => {
  loadWeekData();
});
</script>

<style scoped lang="scss">
// Import brand variables
@import 'src/css/quasar.variables.scss';

.weekly-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;

  &__header {
    flex-shrink: 0;
    background-color: $cream;
    border-bottom: 2px solid $secondary;
    position: relative;

    // Marble texture overlay
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
      opacity: 0.3;
      pointer-events: none;
      mix-blend-mode: multiply;
    }
  }

  &__title {
    color: $primary;
    position: relative;
    z-index: 1;
  }

  &__subtitle {
    color: $secondary;
    position: relative;
    z-index: 1;
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
