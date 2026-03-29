<template>
  <q-page class="session-summary-page">
    <!-- Loading -->
    <div v-if="loading" class="session-summary-page__loading flex flex-center">
      <TemploLoader size="lg" />
    </div>

    <!-- No data -->
    <div
      v-else-if="!todaySession"
      class="session-summary-page__empty flex flex-center column q-pa-xl"
    >
      <q-icon name="event_busy" size="64px" color="grey-4" />
      <div class="text-h6 text-grey-6 q-mt-md">No hay sesión completada hoy</div>
      <q-btn flat color="primary" label="Volver" class="q-mt-lg" @click="router.back()" />
    </div>

    <!-- Reuse SessionSummary in read-only mode -->
    <SessionSummary
      v-else
      :date="todayStr"
      :blocks="completedBlocks"
      :days-completed-this-week="sessionsThisWeek"
      :total-days-trained="totalDaysTrained"
      read-only
      :duration-minutes="todaySession.durationMinutes"
      :saved-rpe="todaySession.rpe"
      :saved-notes="todaySession.notes"
      @restart="handleRestart"
      @back="router.back()"
    />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import TemploLoader from 'src/components/TemploLoader.vue'
import { useQuasar } from 'quasar'
import { useProgressionStore } from 'src/modules/progression/stores/progressionStore'
import { useSessionPlayerStore } from '../stores/sessionPlayerStore'
import { useWeekStore } from '../stores/weekStore'
import { useWeekData } from '../composables/useWeekData'
import { getWeekDates, formatDayName, getDateState } from '../composables/useDateNavigation'
import type { Block } from '../types/session'
import SessionSummary from '../components/player/SessionSummary.vue'

const router = useRouter()
const $q = useQuasar()
const progressionStore = useProgressionStore()
const sessionPlayerStore = useSessionPlayerStore()
const weekStore = useWeekStore()
const { sessions: weekSessions, completedDates, fetchWeekSessions } = useWeekData()

const loading = computed(() => progressionStore.loading)
const todaySession = computed(() => progressionStore.todaySession)
const sessionsThisWeek = computed(() => progressionStore.stats?.sessionsThisWeek ?? 0)
const totalDaysTrained = computed(() => progressionStore.stats?.totalDaysTrained ?? 0)

const todayStr = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

/** Get today's session Block objects from weekStore, filtered to completed block roles */
const completedBlocks = computed<Block[]>(() => {
  const completedRoles = todaySession.value?.blocksCompleted ?? []
  if (completedRoles.length === 0) return []

  // Try weekStore first (populated if user visited WeeklyView)
  const todayDay = weekStore.weekDays.find((d) => d.date === todayStr.value)
  const allBlocks = todayDay?.session?.blocks

  // Fallback to local weekSessions (fetched on mount)
  const sessionBlocks = allBlocks ?? weekSessions.value.get(todayStr.value)?.blocks ?? []

  return sessionBlocks.filter((b) => completedRoles.includes(b.role))
})

/** Load week data if weekStore doesn't have today's session blocks */
async function loadWeekDataIfNeeded() {
  const todayDay = weekStore.weekDays.find((d) => d.date === todayStr.value)
  if (todayDay?.session?.blocks) return

  const dates = getWeekDates()
  await fetchWeekSessions(dates)

  // Also populate weekStore if empty
  if (weekStore.weekDays.length === 0) {
    weekStore.setWeekDays(
      dates.map((date) => ({
        date,
        dayName: formatDayName(date),
        dayOfWeek: new Date(date + 'T00:00:00').getDay(),
        state: getDateState(date, completedDates.value),
        session: weekSessions.value.get(date) || null,
      })),
    )
  }
}

function handleRestart() {
  $q.dialog({
    title: 'Repetir sesión',
    message: 'Vas a reiniciar la sesión de hoy. El progreso registrado anteriormente se perderá.',
    cancel: { label: 'Cancelar', flat: true },
    ok: { label: 'Repetir', color: 'primary' },
    persistent: true,
  }).onOk(async () => {
    const today = weekStore.weekDays.find((d) => d.date === todayStr.value)
    const dayId = today?.session?.dayId
    if (dayId) {
      await sessionPlayerStore.clearProgress(dayId)
    }
    router.push({ name: 'day-player', params: { date: todayStr.value } })
  })
}

onMounted(() => {
  loadWeekDataIfNeeded()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.session-summary-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: $cream;
}

.session-summary-page__loading,
.session-summary-page__empty {
  flex: 1;
}
</style>
