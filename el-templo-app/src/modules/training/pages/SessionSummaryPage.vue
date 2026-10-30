<template>
  <q-page class="session-summary-page">
    <!-- Loading -->
    <div v-if="loading" class="session-summary-page__loading flex flex-center">
      <TemploLoader size="lg" />
    </div>

    <!-- No data -->
    <div v-else-if="!summary" class="session-summary-page__empty flex flex-center column q-pa-xl">
      <q-icon name="event_busy" size="64px" class="session-summary-page__empty-icon" />
      <div class="text-h6 session-summary-page__empty-text q-mt-md">
        No hay sesión completada hoy
      </div>
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
      :duration-minutes="summary.durationMinutes"
      :saved-rpe="summary.rpe"
      :saved-notes="summary.notes"
      :presencial="summary.presencial"
      :branch-name="summary.branchName"
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
import { confirmDialog } from 'src/utils/confirm-dialog'
import { useProgressionStore } from 'src/modules/progression/stores/progressionStore'
import { useProgressionApi } from 'src/modules/progression/composables/useProgressionApi'
import { useSessionPlayerStore } from '../stores/sessionPlayerStore'
import { useWeekStore } from '../stores/weekStore'
import { useWeekData } from '../composables/useWeekData'
import { getWeekDates, formatDayName, getDateState } from '../composables/useDateNavigation'
import { resolveSummarySource } from '../utils/summarySource'
import type { Block } from '../types/session'
import SessionSummary from '../components/player/SessionSummary.vue'

const router = useRouter()
const $q = useQuasar()
const progressionStore = useProgressionStore()
const sessionPlayerStore = useSessionPlayerStore()
const weekStore = useWeekStore()
const { sessions: weekSessions, completedDates, fetchWeekSessions } = useWeekData()
const { fetchStats } = useProgressionApi()

// Gap 197-24 (hallazgo 2): `todaySession` solo lo hidrata Mi Templo. Con carga directa en /training
// (recarga o deep link, entrando por "Ver resumen" de Semana) el store llega vacío: se pide acá con la
// misma acción que usa Mi Templo. Va en el setup (no en onMounted) para que `loading` ya esté en true
// en el primer render y no parpadee el estado vacío.
if (!progressionStore.todaySession && !progressionStore.todayPresencial) void fetchStats()

const loading = computed(() => progressionStore.loading)
const summary = computed(() =>
  resolveSummarySource(progressionStore.todaySession, progressionStore.todayPresencial),
)
const sessionsThisWeek = computed(() => progressionStore.stats?.sessionsThisWeek ?? 0)
const totalDaysTrained = computed(() => progressionStore.stats?.totalDaysTrained ?? 0)

const todayStr = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

/** Get today's session Block objects from weekStore, filtered to completed block roles */
const completedBlocks = computed<Block[]>(() => {
  const completedRoles = summary.value?.blocksCompleted ?? []
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
  // Tras la clase presencial no se pierde nada: la asistencia queda y la sesión de la app se guarda aparte.
  const presencial = summary.value?.presencial ?? false
  confirmDialog($q, {
    title: '¿Repetir la sesión?',
    message: presencial
      ? 'Tu clase presencial queda registrada. Vas a hacer la sesión de hoy desde la app.'
      : 'Vas a reiniciar la sesión de hoy y se pierde lo que habías registrado.',
    okLabel: 'Repetir',
    destructive: !presencial,
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
@import 'src/css/premium-card';

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

// Gap 197-24: grises de Quasar fuera de D-16 (texto 2,30:1, ícono 1,13:1) -> tinta sólida del sistema
// (texto 6,2:1 y ícono >= 3:1 sobre la crema de la página).
.session-summary-page__empty-icon,
.session-summary-page__empty-text {
  color: $pd-ink-2;
}
</style>
