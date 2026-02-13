<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Sesiones</div>

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
      <q-card
        v-for="dayGroup in dayGroups"
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

    <!-- Member preview dialog -->
    <member-preview-dialog
      v-model="previewOpen"
      :session-id="previewSessionId"
      :current-member-level="previewMemberLevel"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useSessionsApi } from 'src/composables/useSessionsApi';
import { useAdminStore } from 'src/stores/useAdminStore';
import MemberPreviewDialog from 'src/components/sessions/MemberPreviewDialog.vue';
import type { SessionSummary } from 'src/types/session';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const sessionsApi = useSessionsApi();
const adminStore = useAdminStore();

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
  return DAYS.map(day => {
    const daySessions = sessions.value.filter(s => s.day === day);
    const levels = DISPLAY_LEVELS.map(level => {
      const session = daySessions.find(s => s.memberLevel === level);
      return {
        memberLevel: level,
        status: session?.status ?? null,
        sessionId: session?.id ?? null,
        routesSummary: session?.routesSummary ?? null,
        blockCount: session?.blockCount ?? 0,
      };
    });
    const pendingCount = daySessions.filter(s => s.status === 'pending_review').length;
    return { day, levels, sessions: daySessions, pendingCount };
  }).filter(dg => dg.sessions.length > 0);
});

async function loadSessions() {
  try {
    const response = await sessionsApi.fetchSessions({
      week: currentWeek.value,
      limit: 100,
    });
    sessions.value = response.sessions;
  } catch {
    $q.notify({ type: 'negative', message: 'Error cargando sesiones' });
  }
}

function syncWeekUrl() {
  router.replace({ query: { week: String(currentWeek.value) } });
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

async function handleBulkApproveDay(dayGroup: DayGroup) {
  const pendingIds = dayGroup.sessions
    .filter(s => s.status === 'pending_review')
    .map(s => s.id);

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
    .filter(s => PDF_LEVELS.includes(s.memberLevel))
    .map(s => s.id);

  if (daySessionIds.length === 0) {
    $q.notify({ type: 'warning', message: 'No hay sesiones de nivel para generar PDF' });
    return;
  }

  pdfDayLoading.value = dayGroup.day;
  try {
    const details = await Promise.all(
      daySessionIds.map(id => sessionsApi.fetchSessionDetail(id))
    );
    const { sessionsToPdfDay } = await import('src/utils/pdf/session-data-transformer');
    const { buildDayPdf } = await import('src/utils/pdf/session-pdf-builder');
    const pdfDay = sessionsToPdfDay(details);
    buildDayPdf(pdfDay);
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Error generando PDF' });
    console.error('PDF generation error:', err);
  } finally {
    pdfDayLoading.value = null;
  }
}

async function onDownloadWeekPdf() {
  const weekSessionIds = sessions.value
    .filter(s => PDF_LEVELS.includes(s.memberLevel))
    .map(s => s.id);

  if (weekSessionIds.length === 0) {
    $q.notify({ type: 'warning', message: 'No hay sesiones de nivel para generar PDF de la semana' });
    return;
  }

  pdfWeekLoading.value = true;
  try {
    const details = await Promise.all(
      weekSessionIds.map(id => sessionsApi.fetchSessionDetail(id))
    );
    const { sessionsToWeekPdf } = await import('src/utils/pdf/session-data-transformer');
    const { buildWeekPdf } = await import('src/utils/pdf/session-pdf-builder');
    const pdfDays = sessionsToWeekPdf(details);
    buildWeekPdf(pdfDays);
  } catch (err) {
    $q.notify({ type: 'negative', message: 'Error generando PDF de la semana' });
    console.error('Week PDF error:', err);
  } finally {
    pdfWeekLoading.value = false;
  }
}

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
    case 'alfa': return 'light-blue';
    case 'delta': return 'indigo';
    case 'sigma': return 'purple';
    case 'omega': return 'orange';
    case 'spartan': return 'red';
    default: return 'grey';
  }
}

function memberLevelLabel(level: string): string {
  switch (level) {
    case 'alfa': return 'Alfa';
    case 'delta': return 'Delta';
    case 'sigma': return 'Sigma';
    case 'omega': return 'Omega';
    case 'spartan': return 'Spartan';
    default: return level;
  }
}

onMounted(() => {
  syncWeekUrl();
  loadSessions();
});
</script>

<style scoped>
.level-row + .level-row {
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}
</style>
