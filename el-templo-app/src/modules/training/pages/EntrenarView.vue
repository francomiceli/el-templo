<template>
  <div class="entrenar-view">
    <EntrenarTabs v-if="ENTRENAR_TABS_ENABLED" v-model="activeTab" />

    <!-- Panes con v-if (nunca v-show): la figura tiene que estar visible para medirse.
         Sin tabs, Semana no es un tabpanel (no hay tab que lo nombre). -->
    <section
      v-if="activeTab === 'semana'"
      :id="paneId('semana')"
      :role="ENTRENAR_TABS_ENABLED ? 'tabpanel' : undefined"
      :aria-labelledby="ENTRENAR_TABS_ENABLED ? tabId('semana') : undefined"
      class="entrenar-view__pane"
    >
      <div v-if="loading" class="entrenar-view__loading">
        <TemploLoader size="lg" />
      </div>

      <div v-else-if="error" class="entrenar-view__error">
        <q-banner class="bg-negative text-white" rounded>
          <template #avatar>
            <q-icon name="error" />
          </template>
          {{ error }}
          <template #action>
            <q-btn flat label="Reintentar" @click="reloadWeek" />
          </template>
        </q-banner>
      </div>

      <SemanaTab
        v-else
        :days="days"
        :selected-date="selectedDate"
        :today="today"
        :monday="monday"
        :can-prev="canPrev"
        :can-next="canNext"
        :has-progress="hasProgress"
        :gender="gender"
        @select-date="select"
        @prev-week="prevWeek"
        @next-week="nextWeek"
        @start="openSession"
        @summary="openSummary"
        @go-libre="activeTab = 'libre'"
      />
    </section>

    <section
      v-else-if="activeTab === 'libre'"
      :id="paneId('libre')"
      role="tabpanel"
      :aria-labelledby="tabId('libre')"
      class="entrenar-view__pane"
    >
      <LibreTab />
    </section>

    <section
      v-else-if="activeTab === 'desafios'"
      :id="paneId('desafios')"
      role="tabpanel"
      :aria-labelledby="tabId('desafios')"
      class="entrenar-view__pane"
    >
      <ComingSoonPane kind="desafios" />
    </section>

    <section
      v-else
      :id="paneId('conquer')"
      role="tabpanel"
      :aria-labelledby="tabId('conquer')"
      class="entrenar-view__pane"
    >
      <ConquerTab />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TemploLoader from 'src/components/TemploLoader.vue'
import { ENTRENAR_TABS_ENABLED } from 'src/config/featureFlags'
import { useUserStore } from 'src/stores/useUserStore'
import { useTrainingWeek } from '../composables/useTrainingWeek'
import { useFreeBlocksStore } from '../stores/freeBlocksStore'
import EntrenarTabs, { paneId, tabId } from '../components/EntrenarTabs.vue'
import type { TabKey } from '../components/EntrenarTabs.vue'
import { ENTRENAR_TAB_FLAGS, queryTabKeys, tabFromQuery } from '../utils/entrenarTabs'
import ComingSoonPane from '../components/ComingSoonPane.vue'
import SemanaTab from '../components/semana/SemanaTab.vue'
import LibreTab from '../components/libre/LibreTab.vue'

// Fase 201 D-09, D-17: Conquer en un chunk aparte (su fuente y su CSS no pesan en el resto de Entrenar)
const ConquerTab = defineAsyncComponent(
  () => import('src/modules/conquer/components/ConquerTab.vue'),
)

// Fase 197 D-02, D-05: Entrenar con tabs. Fase 201 D-10: hoy Semana y Conquer. Siempre abre en
// Semana; `?tab=conquer` (destino del pop-up de lanzamiento, D-11) abre Conquer. `?tab=libre` abre
// Libre solo con FREE_BLOCKS_ENABLED. Reemplaza a WeeklyView.
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const freeBlocks = useFreeBlocksStore()

// ── Tab activa ──
// Lista blanca según los flags (T-201-53): sin tabs no hay ninguna y todo `?tab=` abre Semana.
const QUERY_TABS: readonly TabKey[] = queryTabKeys(ENTRENAR_TAB_FLAGS)

function tabFromRoute(raw: unknown): TabKey {
  return tabFromQuery(raw, QUERY_TABS)
}

const activeTab = ref<TabKey>(tabFromRoute(route.query.tab))

// La página ya montada recibe otro `?tab=` (por ejemplo, tocar de nuevo "Entrenar")
watch(
  () => route.query.tab,
  (raw) => {
    activeTab.value = tabFromRoute(raw)
  },
)

// ── Tab Semana ──
const week = useTrainingWeek()
const {
  monday,
  today,
  days,
  selectedDate,
  hasProgress,
  loading,
  error,
  canPrev,
  canNext,
  select,
  prevWeek,
  nextWeek,
} = week

const gender = computed(() => userStore.profile?.gender ?? null)

// Se arranca la carga al crear la página: `loading` ya está en true en el primer render, así no
// parpadea "Sin plani" mientras llega la semana.
void week.load()

function reloadWeek(): void {
  void week.load()
}

/** Empezar o rehacer: mismo destino que el viejo WeeklyView.handleStartSession */
function openSession(date: string): void {
  if (userStore.hasActiveGoalPlan) {
    void router.push({ name: 'goalPlan-session' })
  } else {
    void router.push({ name: 'day-player', params: { date } })
  }
}

function openSummary(): void {
  void router.push({ name: 'session-summary' })
}

// ── Tab Libre ──
// Al activarla (y al volver del player libre, que remonta la página) se refresca la canasta si ya
// había cargado antes: `auraAvailableToday`, `todayZones` y `workedToday` tienen que estar al día.
// Si todavía no cargó, LibreTab hace la primera carga al montarse.
watch(
  activeTab,
  (tab) => {
    if (tab === 'libre' && freeBlocks.loaded) void freeBlocks.loadFirstPage()
  },
  { immediate: true },
)

onUnmounted(() => {
  week.cleanup()
})
</script>

<style scoped lang="scss">
.entrenar-view {
  // Deja ver la foto de fondo (D-16 de la fase 199); el ancho (630 en escritorio) lo da MainLayout.
  background: transparent;

  &__loading {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 50vh;
  }

  &__error {
    padding: 16px;
  }
}
</style>
