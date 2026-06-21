<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Sesiones</div>

    <!-- Tabs for General / Goal Plans -->
    <q-tabs
      v-model="activeTab"
      dense
      class="text-grey"
      active-color="primary"
      indicator-color="primary"
      align="left"
    >
      <q-tab name="general" label="General" />
      <q-tab name="goalPlans" label="Por Objetivos" />
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
          <div class="text-subtitle1">{{ formatWeekLabel(currentWeek) }}</div>
          <q-btn icon="chevron_right" flat round @click="nextWeek" />
          <q-btn icon="event" flat round dense>
            <q-popup-proxy
              v-model="showGeneralDatePicker"
              cover
              transition-show="scale"
              transition-hide="scale"
            >
              <q-date
                :model-value="weekToQDate(currentWeek)"
                @update:model-value="onGeneralDatePicked"
                minimal
                first-day-of-week="1"
                navigation-min-year-month="2026/02"
                navigation-max-year-month="2027/02"
              />
            </q-popup-proxy>
          </q-btn>
          <q-space />
          <q-btn
            icon="download"
            label="Descargar Imagenes"
            color="accent"
            outline
            :loading="pdfWeekLoading"
            class="gt-xs"
            @click="onDownloadWeekPngZip"
          />
          <q-btn
            icon="download"
            color="accent"
            outline
            round
            :loading="pdfWeekLoading"
            class="xs"
            @click="onDownloadWeekPngZip"
          >
            <q-tooltip>Descargar Imagenes</q-tooltip>
          </q-btn>
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
                <q-badge v-if="isDayGroupRom(dayGroup)" color="info" label="ROM" class="q-ml-sm" />
                <q-space />
                <div class="row items-center no-wrap q-gutter-sm">
                  <q-btn
                    flat
                    dense
                    round
                    icon="download"
                    color="accent"
                    size="md"
                    :loading="pdfDayLoading === dayGroup.day"
                    @click="onDownloadDayPngZip(dayGroup)"
                  >
                    <q-tooltip>Descargar imagenes del dia</q-tooltip>
                  </q-btn>
                  <q-btn
                    v-if="!isPastWeek"
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
                    v-if="dayGroup.pendingCount > 0 && !isPastWeek"
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
            <div class="text-h6">No hay sesiones para {{ formatWeekLabel(currentWeek) }}</div>
          </div>
        </template>
      </q-tab-panel>

      <!-- ============================================================ -->
      <!-- GOAL PLANS TAB (goal plan sessions) -->
      <!-- ============================================================ -->
      <q-tab-panel name="goalPlans" class="q-pa-none">
        <!-- Week selector -->
        <div class="row items-center q-mb-md q-gutter-sm">
          <q-btn icon="chevron_left" flat round @click="prevGoalPlanWeek" />
          <div class="text-subtitle1">{{ formatWeekLabel(goalPlanWeek) }}</div>
          <q-btn icon="chevron_right" flat round @click="nextGoalPlanWeek" />
          <q-btn icon="event" flat round dense>
            <q-popup-proxy
              v-model="showGoalPlanDatePicker"
              cover
              transition-show="scale"
              transition-hide="scale"
            >
              <q-date
                :model-value="weekToQDate(goalPlanWeek)"
                @update:model-value="onGoalPlanDatePicked"
                minimal
                first-day-of-week="1"
                navigation-min-year-month="2026/02"
                navigation-max-year-month="2027/02"
              />
            </q-popup-proxy>
          </q-btn>
        </div>

        <!-- Goal plan type sub-tabs -->
        <q-tabs
          v-model="selectedGoalPlanTab"
          dense
          class="text-grey q-mb-md"
          active-color="primary"
          indicator-color="primary"
          align="left"
          narrow-indicator
          @update:model-value="loadGoalPlanSessions"
        >
          <q-tab v-for="jt in ALL_GOAL_PLAN_TYPES" :key="jt" :name="jt">
            <q-badge
              :color="getGoalPlanBadgeColor(jt)"
              :label="getGoalPlanLabel(jt)"
              class="q-px-sm"
            />
          </q-tab>
        </q-tabs>

        <!-- Loading -->
        <div v-if="goalPlanLoading" class="flex flex-center q-pa-xl">
          <q-spinner-dots size="50px" color="primary" />
        </div>

        <!-- Day cards (mirrors General tab structure) -->
        <template v-else>
          <q-card
            v-for="dayGroup in goalPlanDayGroups"
            :key="dayGroup.day"
            flat
            bordered
            class="q-mb-sm"
          >
            <q-card-section class="q-py-sm">
              <!-- Day name row with action icons -->
              <div class="row items-center no-wrap q-mb-xs">
                <div class="text-subtitle1 text-weight-bold">
                  {{ dayLabel(dayGroup.day) }}
                </div>
                <q-space />
                <div class="row items-center no-wrap q-gutter-sm">
                  <q-btn
                    v-if="!isPastWeek"
                    flat
                    dense
                    round
                    icon="edit"
                    color="primary"
                    size="md"
                    @click="editGoalPlanDay(dayGroup.day)"
                  >
                    <q-tooltip>Editar dia</q-tooltip>
                  </q-btn>
                  <q-btn
                    v-if="dayGroup.pendingCount > 0 && !isPastWeek"
                    flat
                    dense
                    round
                    icon="check_circle"
                    color="positive"
                    size="md"
                    @click="handleBulkApproveGoalPlanDay(dayGroup)"
                  >
                    <q-tooltip>Aprobar {{ dayGroup.pendingCount }} pendientes</q-tooltip>
                    <q-badge floating color="red" :label="dayGroup.pendingCount" />
                  </q-btn>
                </div>
              </div>

              <!-- Level rows (same as General) -->
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
          <div v-if="goalPlanDayGroups.length === 0" class="text-center q-pa-xl text-grey">
            <q-icon name="info" size="xl" class="q-mb-md" />
            <div class="text-h6">
              No hay sesiones de {{ getGoalPlanLabel(selectedGoalPlanTab) }} para
              {{ formatWeekLabel(goalPlanWeek) }}
            </div>
            <div class="text-caption q-mt-sm">
              Genera sesiones en la pestana "Generar Sesiones" > Por Objetivos
            </div>
          </div>
        </template>
      </q-tab-panel>
    </q-tab-panels>

    <!-- PNG generation progress dialog -->
    <q-dialog v-model="pngProgress.active" persistent no-backdrop-dismiss>
      <q-card style="width: 80vw; max-width: 900px">
        <q-card-section>
          <div class="text-subtitle2 q-mb-sm">{{ pngProgress.message }}</div>
          <q-linear-progress :value="pngProgress.percent / 100" color="accent" size="20px" rounded>
            <div class="absolute-full flex flex-center">
              <span class="text-caption text-white text-weight-bold">
                {{ pngProgress.percent }}%
              </span>
            </div>
          </q-linear-progress>
          <img
            v-if="pngProgress.previewUrl"
            :src="pngProgress.previewUrl"
            class="q-mt-sm full-width rounded-borders"
            style="border: 1px solid #ddd"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" color="negative" @click="cancelPngGeneration" />
        </q-card-actions>
      </q-card>
    </q-dialog>

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
import {
  formatWeekLabel,
  weekToUrlParam,
  urlParamToWeek,
  getCurrentWeekNumber,
  weekToQDate,
  qDateToWeek,
} from 'src/utils/weekDates';
import { useSessionsApi } from 'src/composables/useSessionsApi';
import { useAdminStore } from 'src/stores/useAdminStore';
import MemberPreviewDialog from 'src/components/sessions/MemberPreviewDialog.vue';
import {
  ALL_GOAL_PLAN_TYPES,
  GOAL_PLAN_TYPE_LABELS,
  GOAL_PLAN_TIER_MAP,
  GOAL_PLAN_TIER_COLORS,
  type GoalPlanType,
} from 'src/types/goal-plan';
import type { SessionSummary } from 'src/types/session';
import { levelColor } from 'src/constants/levels';

const log = createLogger('SessionsPage');

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const sessionsApi = useSessionsApi();
const adminStore = useAdminStore();

// Shared
const activeTab = ref(route.query.tab === 'goalPlans' ? 'goalPlans' : 'general');

// ============================================================
// General tab state
// ============================================================
const sessions = ref<SessionSummary[]>([]);
const weekParam = route.query.week as string | undefined;
const initialWeek = weekParam
  ? (urlParamToWeek(weekParam) ?? getCurrentWeekNumber())
  : getCurrentWeekNumber();
const currentWeek = ref(initialWeek);
const isPastWeek = computed(() => currentWeek.value < getCurrentWeekNumber());

// Preview dialog state
const previewOpen = ref(false);
const previewSessionId = ref(0);
const previewMemberLevel = ref('alfa');

// PDF state
const pdfWeekLoading = ref(false);
const pdfDayLoading = ref<string | null>(null);

// Date picker state
const showGeneralDatePicker = ref(false);

const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DISPLAY_LEVELS = ['kairos', 'alfa', 'delta', 'sigma', 'omega', 'spartan'];
// ROM days solo generan alfa/delta (kairos no tiene sesión ROM) → sin kairos aquí.
const ROM_DISPLAY_LEVELS = ['alfa', 'delta'];
const PDF_LEVELS = ['alfa', 'delta', 'sigma', 'kairos'];

// Day mode state
function isDayGroupRom(dayGroup: DayGroup): boolean {
  return dayGroup.sessions.some((s) => s.sessionMode === 'rom');
}

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
    const isRom = daySessions.some((s) => s.sessionMode === 'rom');
    const displayLevels = isRom ? ROM_DISPLAY_LEVELS : DISPLAY_LEVELS;
    const levels = displayLevels.map((level) => {
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
      goalPlanType: 'null', // General tab: only non-goal-plan sessions
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
      week: weekToUrlParam(currentWeek.value),
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

function onGeneralDatePicked(val: string | null) {
  showGeneralDatePicker.value = false;
  if (!val) return;
  currentWeek.value = qDateToWeek(val);
  syncWeekUrl();
  loadSessions();
}

function editDay(day: string) {
  router.push({ path: '/sessions/edit', query: { week: weekToUrlParam(currentWeek.value), day } });
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

const pngProgress = ref({ active: false, message: '', percent: 0, previewUrl: '' });
let pngAbort: AbortController | null = null;

function onPngProgress(message: string, percent: number, previewUrl?: string) {
  pngProgress.value.message = message;
  pngProgress.value.percent = percent;
  if (previewUrl) pngProgress.value.previewUrl = previewUrl;
}

function cancelPngGeneration() {
  pngAbort?.abort();
}

async function onDownloadDayPngZip(dayGroup: DayGroup) {
  const daySessionIds = dayGroup.sessions
    .filter((s) => PDF_LEVELS.includes(s.memberLevel))
    .map((s) => s.id);

  if (daySessionIds.length === 0) {
    $q.notify({ type: 'warning', message: 'No hay sesiones de nivel para generar imagenes' });
    return;
  }

  pdfDayLoading.value = dayGroup.day;
  pngAbort = new AbortController();
  pngProgress.value = { active: true, message: 'Cargando sesiones...', percent: 0, previewUrl: '' };
  try {
    const details = await Promise.all(
      daySessionIds.map((id) => sessionsApi.fetchSessionDetail(id))
    );
    const { sessionsToPdfDay } = await import('src/utils/pdf/session-data-transformer');
    const { buildDayPngZip } = await import('src/utils/pdf/session-png-builder');
    const pdfDay = sessionsToPdfDay(details);
    await buildDayPngZip(pdfDay, onPngProgress, pngAbort.signal);
    $q.notify({ type: 'positive', message: 'Imagenes descargadas' });
  } catch (err) {
    if (pngAbort.signal.aborted) {
      $q.notify({ type: 'info', message: 'Descarga cancelada' });
    } else {
      $q.notify({ type: 'negative', message: 'Error generando imagenes' });
      log.error('PNG generation error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } finally {
    pngAbort = null;
    pngProgress.value.active = false;
    pdfDayLoading.value = null;
  }
}

async function onDownloadWeekPngZip() {
  const weekSessionIds = sessions.value
    .filter((s) => PDF_LEVELS.includes(s.memberLevel))
    .map((s) => s.id);

  if (weekSessionIds.length === 0) {
    $q.notify({
      type: 'warning',
      message: 'No hay sesiones de nivel para generar imagenes de la semana',
    });
    return;
  }

  pdfWeekLoading.value = true;
  pngAbort = new AbortController();
  pngProgress.value = { active: true, message: 'Cargando sesiones...', percent: 0, previewUrl: '' };
  try {
    const details = await Promise.all(
      weekSessionIds.map((id) => sessionsApi.fetchSessionDetail(id))
    );
    const { sessionsToWeekPdf } = await import('src/utils/pdf/session-data-transformer');
    const { buildWeekPngZip } = await import('src/utils/pdf/session-png-builder');
    const pdfDays = sessionsToWeekPdf(details);
    await buildWeekPngZip(pdfDays, onPngProgress, pngAbort.signal);
    $q.notify({ type: 'positive', message: 'Imagenes descargadas' });
  } catch (err) {
    if (pngAbort.signal.aborted) {
      $q.notify({ type: 'info', message: 'Descarga cancelada' });
    } else {
      $q.notify({ type: 'negative', message: 'Error generando imagenes de la semana' });
      log.error('Week PNG generation error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } finally {
    pngAbort = null;
    pngProgress.value.active = false;
    pdfWeekLoading.value = false;
  }
}

// ============================================================
// Goal Plans tab state
// ============================================================
const goalPlanWeek = ref(initialWeek);
const selectedGoalPlanTab = ref<GoalPlanType>(ALL_GOAL_PLAN_TYPES[0]);
const goalPlanSessions = ref<SessionSummary[]>([]);
const goalPlanLoading = ref(false);
const showGoalPlanDatePicker = ref(false);

interface GoalPlanDayLevelStatus {
  memberLevel: string;
  status: string | null;
  sessionId: number | null;
  routesSummary: string | null;
  blockCount: number;
}

interface GoalPlanDayGroup {
  day: string;
  levels: GoalPlanDayLevelStatus[];
  sessions: SessionSummary[];
  pendingCount: number;
}

const goalPlanDayGroups = computed<GoalPlanDayGroup[]>(() => {
  return DAYS.map((day) => {
    const daySessions = goalPlanSessions.value.filter((s) => s.day === day);
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

async function loadGoalPlanSessions() {
  goalPlanLoading.value = true;
  try {
    const response = await sessionsApi.fetchSessions({
      week: goalPlanWeek.value,
      goalPlanType: selectedGoalPlanTab.value,
      limit: 100,
    });
    goalPlanSessions.value = response.sessions;
  } catch {
    $q.notify({ type: 'negative', message: 'Error cargando sesiones por objetivos' });
  } finally {
    goalPlanLoading.value = false;
  }
}

function editGoalPlanDay(day: string) {
  router.push({
    path: '/sessions/edit',
    query: {
      week: weekToUrlParam(goalPlanWeek.value),
      day,
      goalPlanType: selectedGoalPlanTab.value,
    },
  });
}

async function handleBulkApproveGoalPlanDay(dayGroup: GoalPlanDayGroup) {
  const pendingIds = dayGroup.sessions
    .filter((s) => s.status === 'pending_review')
    .map((s) => s.id);

  if (pendingIds.length === 0) return;

  $q.dialog({
    title: 'Aprobar Sesiones',
    message: `Aprobar ${pendingIds.length} sesiones pendientes de ${getGoalPlanLabel(selectedGoalPlanTab.value)} para ${dayLabel(dayGroup.day)}?`,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      const result = await sessionsApi.bulkApprove(pendingIds);
      $q.notify({ type: 'positive', message: `${result.approvedCount} sesiones aprobadas` });
      loadGoalPlanSessions();
      adminStore.fetchPendingCount();
      adminStore.checkSessionCoverage();
    } catch {
      $q.notify({ type: 'negative', message: 'Error aprobando sesiones' });
    }
  });
}

function prevGoalPlanWeek() {
  if (goalPlanWeek.value > 1) {
    goalPlanWeek.value--;
    loadGoalPlanSessions();
  }
}

function nextGoalPlanWeek() {
  if (goalPlanWeek.value < 52) {
    goalPlanWeek.value++;
    loadGoalPlanSessions();
  }
}

function onGoalPlanDatePicked(val: string | null) {
  showGoalPlanDatePicker.value = false;
  if (!val) return;
  goalPlanWeek.value = qDateToWeek(val);
  loadGoalPlanSessions();
}

function getGoalPlanBadgeColor(goalPlanType: string): string {
  const tier = GOAL_PLAN_TIER_MAP[goalPlanType as GoalPlanType];
  return tier ? GOAL_PLAN_TIER_COLORS[tier] : 'grey';
}

function getGoalPlanLabel(goalPlanType: string): string {
  return GOAL_PLAN_TYPE_LABELS[goalPlanType as GoalPlanType] ?? goalPlanType;
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

function memberLevelLabel(level: string): string {
  switch (level) {
    case 'kairos':
      return 'Kairos';
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

// Reload goal plan sessions when switching to Goal Plans tab
watch(activeTab, (newTab) => {
  if (newTab === 'goalPlans' && goalPlanSessions.value.length === 0) {
    loadGoalPlanSessions();
  }
});

onMounted(() => {
  syncWeekUrl();
  loadSessions();
  // If starting on goalPlans tab, load goal plan sessions too
  if (activeTab.value === 'goalPlans') {
    loadGoalPlanSessions();
  }
});
</script>

<style scoped>
.level-row + .level-row {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}
.q-btn--round {
  min-width: 2.5em;
  min-height: 2.5em;
}
</style>
