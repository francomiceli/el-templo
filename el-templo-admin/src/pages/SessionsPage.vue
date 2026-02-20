<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Sesiones</div>

    <!-- Tabs for General / Personalizadas -->
    <q-tabs
      v-model="activeTab"
      dense
      class="text-grey"
      active-color="primary"
      indicator-color="primary"
      align="left"
    >
      <q-tab name="general" label="General" />
      <q-tab name="personalizadas" label="Personalizadas" />
    </q-tabs>

    <q-separator class="q-mb-md" />

    <q-tab-panels v-model="activeTab" animated>
      <!-- ============================================================ -->
      <!-- GENERAL TAB (existing functionality) -->
      <!-- ============================================================ -->
      <q-tab-panel name="general" class="q-pa-none">
        <!-- Week selector -->
        <div class="row items-center q-mb-lg q-gutter-sm">
          <q-btn icon="chevron_left" flat round @click="prevWeek" />
          <div class="text-subtitle1">Semana {{ currentWeek }}</div>
          <q-btn icon="chevron_right" flat round @click="nextWeek" />
          <q-space />
          <q-btn
            icon="collections_bookmark"
            label="PDF Semana"
            color="deep-purple"
            outline
            :loading="pdfWeekLoading"
            @click="onDownloadWeekPdf"
          />
        </div>

        <!-- Loading -->
        <div v-if="sessionsApi.loading.value" class="flex flex-center q-pa-xl">
          <q-spinner-dots size="50px" color="primary" />
        </div>

        <!-- Day cards -->
        <template v-else>
          <q-card v-for="dayGroup in dayGroups" :key="dayGroup.day" flat bordered class="q-mb-sm">
            <q-card-section class="q-py-sm">
              <!-- Day name row with action icons -->
              <div class="row items-center no-wrap q-mb-xs">
                <div class="text-subtitle1 text-weight-bold">
                  {{ dayLabel(dayGroup.day) }}
                </div>
                <q-space />
                <div class="row items-center no-wrap q-gutter-sm">
                  <q-btn
                    flat
                    dense
                    round
                    icon="picture_as_pdf"
                    color="deep-purple"
                    size="md"
                    :loading="pdfDayLoading === dayGroup.day"
                    @click="onDownloadDayPdf(dayGroup)"
                  >
                    <q-tooltip>PDF del dia</q-tooltip>
                  </q-btn>
                  <q-btn
                    flat
                    dense
                    round
                    icon="edit"
                    color="primary"
                    size="md"
                    @click="editDay(dayGroup.day)"
                  >
                    <q-tooltip>Editar dia</q-tooltip>
                  </q-btn>
                  <q-btn
                    v-if="dayGroup.pendingCount > 0"
                    flat
                    dense
                    round
                    icon="check_circle"
                    color="positive"
                    size="md"
                    @click="handleBulkApproveDay(dayGroup)"
                  >
                    <q-tooltip>Aprobar {{ dayGroup.pendingCount }} pendientes</q-tooltip>
                    <q-badge floating color="red" :label="dayGroup.pendingCount" />
                  </q-btn>
                </div>
              </div>

              <!-- Level rows -->
              <div>
                <div
                  v-for="level in dayGroup.levels"
                  :key="level.memberLevel"
                  v-show="level.status"
                  class="row items-center no-wrap level-row q-py-xs"
                >
                  <q-icon
                    :name="level.status === 'approved' ? 'check_circle' : 'schedule'"
                    :color="level.status === 'approved' ? 'green' : 'amber-8'"
                    size="16px"
                    class="q-mr-xs"
                  />
                  <span
                    class="text-body2 text-weight-bold q-mr-sm"
                    :class="`text-${levelColor(level.memberLevel)}`"
                    style="min-width: 52px"
                  >
                    {{ memberLevelLabel(level.memberLevel) }}
                  </span>
                  <span v-if="level.routesSummary" class="text-caption text-grey-7">
                    {{ level.routesSummary }}
                  </span>
                </div>
              </div>
            </q-card-section>
          </q-card>

          <!-- No sessions -->
          <div v-if="sessions.length === 0" class="text-center q-pa-xl text-grey">
            <q-icon name="info" size="xl" class="q-mb-md" />
            <div class="text-h6">No hay sesiones para la semana {{ currentWeek }}</div>
          </div>
        </template>
      </q-tab-panel>

      <!-- ============================================================ -->
      <!-- PERSONALIZADAS TAB (journey sessions) -->
      <!-- ============================================================ -->
      <q-tab-panel name="personalizadas" class="q-pa-none">
        <!-- Week selector + journey type filter -->
        <div class="row items-center q-mb-md q-gutter-sm">
          <q-btn icon="chevron_left" flat round @click="prevJourneyWeek" />
          <div class="text-subtitle1">Semana {{ journeyWeek }}</div>
          <q-btn icon="chevron_right" flat round @click="nextJourneyWeek" />
          <q-space />
          <q-select
            v-model="journeyTypeFilter"
            :options="journeyFilterOptions"
            emit-value
            map-options
            dense
            outlined
            style="min-width: 160px"
            label="Tipo de Journey"
            @update:model-value="loadJourneySessions"
          />
        </div>

        <!-- Day tabs -->
        <q-tabs
          v-model="journeyDayTab"
          dense
          class="text-grey q-mb-md"
          active-color="primary"
          indicator-color="primary"
          align="left"
        >
          <q-tab v-for="d in DAYS" :key="d" :name="d" :label="dayLabel(d)" />
        </q-tabs>

        <!-- Loading -->
        <div v-if="journeyLoading" class="flex flex-center q-pa-xl">
          <q-spinner-dots size="50px" color="primary" />
        </div>

        <!-- Journey session cards for selected day -->
        <template v-else>
          <q-card
            v-for="session in filteredJourneySessions"
            :key="session.id"
            flat
            bordered
            class="q-mb-sm cursor-pointer"
            @click="editSession(session.id)"
          >
            <q-card-section class="q-py-sm">
              <div class="row items-center no-wrap">
                <!-- Status icon -->
                <q-icon
                  :name="session.status === 'approved' ? 'check_circle' : 'schedule'"
                  :color="session.status === 'approved' ? 'green' : 'amber-8'"
                  size="16px"
                  class="q-mr-sm"
                />

                <!-- Level -->
                <span
                  class="text-body2 text-weight-bold q-mr-sm"
                  :class="`text-${levelColor(session.memberLevel)}`"
                  style="min-width: 52px"
                >
                  {{ memberLevelLabel(session.memberLevel) }}
                </span>

                <!-- Journey type badge -->
                <q-badge
                  v-if="session.journeyType"
                  :color="getJourneyBadgeColor(session.journeyType)"
                  :label="getJourneyLabel(session.journeyType)"
                  class="q-mr-sm"
                />

                <!-- Routes summary -->
                <span v-if="session.routesSummary" class="text-caption text-grey-7 ellipsis">
                  {{ session.routesSummary }}
                </span>

                <q-space />

                <!-- Block count -->
                <span class="text-caption text-grey-6"> {{ session.blockCount }} bloques </span>

                <q-icon name="chevron_right" color="grey-5" class="q-ml-sm" />
              </div>
            </q-card-section>
          </q-card>

          <!-- No sessions for this day -->
          <div v-if="filteredJourneySessions.length === 0" class="text-center q-pa-xl text-grey">
            <q-icon name="info" size="xl" class="q-mb-md" />
            <div class="text-h6">
              No hay sesiones personalizadas para {{ dayLabel(journeyDayTab) }}
            </div>
            <div class="text-caption q-mt-sm">
              Genera sesiones en la pestana "Generar Sesiones" > Personalizadas
            </div>
          </div>
        </template>
      </q-tab-panel>
    </q-tab-panels>

    <!-- Member preview dialog -->
    <member-preview-dialog
      v-model="previewOpen"
      :session-id="previewSessionId"
      :current-member-level="previewMemberLevel"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSessionsApi } from 'src/composables/useSessionsApi';
import { useAdminStore } from 'src/stores/useAdminStore';
import MemberPreviewDialog from 'src/components/sessions/MemberPreviewDialog.vue';
import {
  ALL_JOURNEY_TYPES,
  JOURNEY_TYPE_LABELS,
  JOURNEY_TIER_MAP,
  JOURNEY_TIER_COLORS,
  type JourneyType,
} from 'src/types/journey';
import type { SessionSummary } from 'src/types/session';

const log = createLogger('SessionsPage');

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const sessionsApi = useSessionsApi();
const adminStore = useAdminStore();

// Shared
const activeTab = ref(route.query.tab === 'personalizadas' ? 'personalizadas' : 'general');

// ============================================================
// General tab state
// ============================================================
const sessions = ref<SessionSummary[]>([]);
const initialWeek = Number(route.query.week) || 1;
const currentWeek = ref(initialWeek);

// Preview dialog state
const previewOpen = ref(false);
const previewSessionId = ref(0);
const previewMemberLevel = ref('alfa');

// PDF state
const pdfWeekLoading = ref(false);
const pdfDayLoading = ref<string | null>(null);

const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DISPLAY_LEVELS = ['alfa', 'delta', 'sigma', 'omega', 'spartan'];
const PDF_LEVELS = ['alfa', 'delta', 'sigma', 'omega'];

interface DayLevelStatus {
  memberLevel: string;
  status: string | null;
  sessionId: number | null;
  routesSummary: string | null;
  blockCount: number;
}

interface DayGroup {
  day: string;
  levels: DayLevelStatus[];
  sessions: SessionSummary[];
  pendingCount: number;
}

const dayGroups = computed<DayGroup[]>(() => {
  return DAYS.map((day) => {
    const daySessions = sessions.value.filter((s) => s.day === day);
    const levels = DISPLAY_LEVELS.map((level) => {
      const session = daySessions.find((s) => s.memberLevel === level);
      return {
        memberLevel: level,
        status: session?.status ?? null,
        sessionId: session?.id ?? null,
        routesSummary: session?.routesSummary ?? null,
        blockCount: session?.blockCount ?? 0,
      };
    });
    const pendingCount = daySessions.filter((s) => s.status === 'pending_review').length;
    return { day, levels, sessions: daySessions, pendingCount };
  }).filter((dg) => dg.sessions.length > 0);
});

async function loadSessions() {
  try {
    const response = await sessionsApi.fetchSessions({
      week: currentWeek.value,
      journeyType: 'null', // General tab: only non-journey sessions
      limit: 100,
    });
    sessions.value = response.sessions;
  } catch {
    $q.notify({ type: 'negative', message: 'Error cargando sesiones' });
  }
}

function syncWeekUrl() {
  router.replace({
    query: {
      week: String(currentWeek.value),
      ...(activeTab.value !== 'general' ? { tab: activeTab.value } : {}),
    },
  });
}

function prevWeek() {
  if (currentWeek.value > 1) {
    currentWeek.value--;
    syncWeekUrl();
    loadSessions();
  }
}

function nextWeek() {
  if (currentWeek.value < 52) {
    currentWeek.value++;
    syncWeekUrl();
    loadSessions();
  }
}

function editDay(day: string) {
  router.push({ path: '/sessions/edit', query: { week: String(currentWeek.value), day } });
}

function editSession(sessionId: number) {
  router.push({ path: `/sessions/${sessionId}` });
}

async function handleBulkApproveDay(dayGroup: DayGroup) {
  const pendingIds = dayGroup.sessions
    .filter((s) => s.status === 'pending_review')
    .map((s) => s.id);

  if (pendingIds.length === 0) return;

  $q.dialog({
    title: 'Aprobar Sesiones',
    message: `Aprobar ${pendingIds.length} sesiones pendientes para ${dayLabel(dayGroup.day)}?`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      const result = await sessionsApi.bulkApprove(pendingIds);
      $q.notify({ type: 'positive', message: `${result.approvedCount} sesiones aprobadas` });
      loadSessions();
      adminStore.fetchPendingCount();
      adminStore.checkSessionCoverage();
    } catch {
      $q.notify({ type: 'negative', message: 'Error aprobando sesiones' });
    }
  });
}

async function onDownloadDayPdf(dayGroup: DayGroup) {
  const daySessionIds = dayGroup.sessions
    .filter((s) => PDF_LEVELS.includes(s.memberLevel))
    .map((s) => s.id);

  if (daySessionIds.length === 0) {
    $q.notify({ type: 'warning', message: 'No hay sesiones de nivel para generar PDF' });
    return;
  }

  pdfDayLoading.value = dayGroup.day;
  try {
    const details = await Promise.all(
      daySessionIds.map((id) => sessionsApi.fetchSessionDetail(id))
    );
    const { sessionsToPdfDay } = await import('src/utils/pdf/session-data-transformer');
    const { buildDayPdf } = await import('src/utils/pdf/session-pdf-builder');
    const pdfDay = sessionsToPdfDay(details);
    buildDayPdf(pdfDay);
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Error generando PDF' });
    log.error('PDF generation error', { error: err instanceof Error ? err.message : String(err) });
  } finally {
    pdfDayLoading.value = null;
  }
}

async function onDownloadWeekPdf() {
  const weekSessionIds = sessions.value
    .filter((s) => PDF_LEVELS.includes(s.memberLevel))
    .map((s) => s.id);

  if (weekSessionIds.length === 0) {
    $q.notify({
      type: 'warning',
      message: 'No hay sesiones de nivel para generar PDF de la semana',
    });
    return;
  }

  pdfWeekLoading.value = true;
  try {
    const details = await Promise.all(
      weekSessionIds.map((id) => sessionsApi.fetchSessionDetail(id))
    );
    const { sessionsToWeekPdf } = await import('src/utils/pdf/session-data-transformer');
    const { buildWeekPdf } = await import('src/utils/pdf/session-pdf-builder');
    const pdfDays = sessionsToWeekPdf(details);
    buildWeekPdf(pdfDays);
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Error generando PDF de la semana' });
    log.error('Week PDF generation error', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    pdfWeekLoading.value = false;
  }
}

// ============================================================
// Personalizadas tab state
// ============================================================
const journeyWeek = ref(initialWeek);
const journeyDayTab = ref<string>('lunes');
const journeyTypeFilter = ref<string>('all');
const journeySessions = ref<SessionSummary[]>([]);
const journeyLoading = ref(false);

const journeyFilterOptions = computed(() => [
  { label: 'Todos', value: 'all' },
  ...ALL_JOURNEY_TYPES.map((jt) => ({
    label: JOURNEY_TYPE_LABELS[jt],
    value: jt,
  })),
]);

const filteredJourneySessions = computed(() => {
  let filtered = journeySessions.value.filter((s) => s.day === journeyDayTab.value);
  if (journeyTypeFilter.value !== 'all') {
    filtered = filtered.filter((s) => s.journeyType === journeyTypeFilter.value);
  }
  // Sort: pending first, then by level
  const levelOrder = ['alfa', 'delta', 'sigma', 'omega', 'spartan'];
  return filtered.sort((a, b) => {
    // Pending first
    if (a.status === 'pending_review' && b.status !== 'pending_review') return -1;
    if (a.status !== 'pending_review' && b.status === 'pending_review') return 1;
    // Then by level
    return levelOrder.indexOf(a.memberLevel) - levelOrder.indexOf(b.memberLevel);
  });
});

async function loadJourneySessions() {
  journeyLoading.value = true;
  try {
    const filter: { week: number; journeyType: string; limit: number } = {
      week: journeyWeek.value,
      journeyType: journeyTypeFilter.value === 'all' ? 'notnull' : journeyTypeFilter.value,
      limit: 100,
    };
    const response = await sessionsApi.fetchSessions(filter);
    journeySessions.value = response.sessions;
  } catch {
    $q.notify({ type: 'negative', message: 'Error cargando sesiones personalizadas' });
  } finally {
    journeyLoading.value = false;
  }
}

function prevJourneyWeek() {
  if (journeyWeek.value > 1) {
    journeyWeek.value--;
    loadJourneySessions();
  }
}

function nextJourneyWeek() {
  if (journeyWeek.value < 52) {
    journeyWeek.value++;
    loadJourneySessions();
  }
}

function getJourneyBadgeColor(journeyType: string): string {
  const tier = JOURNEY_TIER_MAP[journeyType as JourneyType];
  return tier ? JOURNEY_TIER_COLORS[tier] : 'grey';
}

function getJourneyLabel(journeyType: string): string {
  return JOURNEY_TYPE_LABELS[journeyType as JourneyType] ?? journeyType;
}

// ============================================================
// Shared helpers
// ============================================================
function dayLabel(day: string): string {
  const labels: Record<string, string> = {
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miercoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
    sabado: 'Sabado',
  };
  return labels[day] || day;
}

function levelColor(level: string): string {
  switch (level) {
    case 'alfa':
      return 'light-blue';
    case 'delta':
      return 'indigo';
    case 'sigma':
      return 'purple';
    case 'omega':
      return 'orange';
    case 'spartan':
      return 'red';
    default:
      return 'grey';
  }
}

function memberLevelLabel(level: string): string {
  switch (level) {
    case 'alfa':
      return 'Alfa';
    case 'delta':
      return 'Delta';
    case 'sigma':
      return 'Sigma';
    case 'omega':
      return 'Omega';
    case 'spartan':
      return 'Spartan';
    default:
      return level;
  }
}

// Reload journey sessions when switching to Personalizadas tab
watch(activeTab, (newTab) => {
  if (newTab === 'personalizadas' && journeySessions.value.length === 0) {
    loadJourneySessions();
  }
});

onMounted(() => {
  syncWeekUrl();
  loadSessions();
  // If starting on personalizadas tab, load journey sessions too
  if (activeTab.value === 'personalizadas') {
    loadJourneySessions();
  }
});
</script>

<style scoped>
.level-row + .level-row {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}
</style>
