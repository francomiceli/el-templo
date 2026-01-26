<template>
  <q-page class="weekly-view">
    <!-- Header with week info -->
    <div class="weekly-view__header q-pa-md">
      <div class="text-h5 text-weight-bold text-center">
        Semana {{ weekNumber }}
      </div>
      <div class="text-subtitle2 text-grey-7 text-center">
        {{ weekRangeLabel }}
      </div>
    </div>

    <!-- Week carousel (horizontal scrolling days) -->
    <WeekCarousel />

    <!-- Loading state while fetching sessions -->
    <div v-if="loading" class="flex flex-center q-pa-xl">
      <q-spinner-dots color="primary" size="50px" />
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="q-pa-md">
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

    <!-- Block list for selected day -->
    <BlockList
      v-else-if="selectedDayBlocks"
      :blocks="selectedDayBlocks"
      :loading="loading"
    />

    <!-- Empty state when no session for selected day -->
    <div v-else class="flex flex-center column q-pa-xl text-center">
      <q-icon name="event_busy" size="64px" color="grey-5" class="q-mb-md" />
      <div class="text-h6 text-grey-6">No hay sesión para este día</div>
      <div class="text-caption text-grey-5 q-mt-sm">
        {{ selectedDayEmptyMessage }}
      </div>
    </div>

    <!-- Start session button (shows only for today and not completed) -->
    <StartSessionButton
      :visible="showStartButton"
      :disabled="isTodayCompleted"
      @start="handleStartSession"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useWeekStore } from '../stores/weekStore';
import { useWeekData } from '../composables/useWeekData';
import { getWeekDates, formatDayName, isToday, getDateState } from '../composables/useDateNavigation';
import type { WeekDay } from '../types/session';
import WeekCarousel from '../components/WeekCarousel.vue';
import BlockList from '../components/BlockList.vue';
import StartSessionButton from '../components/StartSessionButton.vue';

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
      const session = sessions.get(date) || null;

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
 * Blocks for currently selected day
 */
const selectedDayBlocks = computed(() => {
  return weekStore.selectedDay?.session?.blocks || null;
});

/**
 * Empty state message based on selected day
 */
const selectedDayEmptyMessage = computed(() => {
  const selectedDay = weekStore.selectedDay;
  if (!selectedDay) return 'Selecciona un día';

  if (selectedDay.state === 'rest') {
    return 'Domingo es día de descanso';
  }

  return 'Intenta con otro día';
});

/**
 * Show start button only when today is selected
 */
const showStartButton = computed(() => {
  if (!weekStore.selectedDate) return false;
  return isToday(weekStore.selectedDate);
});

/**
 * Check if today's session has been completed
 */
const isTodayCompleted = computed(() => {
  const selectedDay = weekStore.selectedDay;
  return selectedDay?.state === 'completed';
});

/**
 * Navigate to Day Player when Start button clicked
 */
function handleStartSession() {
  if (!weekStore.selectedDate) return;

  router.push({
    name: 'day-player',
    params: {
      date: weekStore.selectedDate,
    },
  });
}

// Load data on mount
onMounted(() => {
  loadWeekData();
});
</script>

<style scoped lang="scss">
.weekly-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;

  &__header {
    flex-shrink: 0;
    background: white;
    border-bottom: 1px solid #e0e0e0;
  }
}

// Ensure BlockList fills remaining space
.weekly-view :deep(.block-list) {
  flex: 1;
  overflow-y: auto;
}
</style>
