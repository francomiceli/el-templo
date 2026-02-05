<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Sesiones</div>

    <!-- Filters -->
    <session-filters
      v-model="filter"
      @refresh="loadSessions"
    />

    <!-- Week selector -->
    <div class="row items-center q-mb-md q-gutter-sm">
      <q-btn icon="chevron_left" flat round @click="prevWeek" />
      <div class="text-subtitle1">Semana {{ currentWeek }}</div>
      <q-btn icon="chevron_right" flat round @click="nextWeek" />
    </div>

    <!-- Day tabs -->
    <day-tabs v-model="currentDay" class="q-mb-md" />

    <!-- Sessions table -->
    <q-table
      :rows="filteredSessions"
      :columns="columns"
      row-key="id"
      :loading="sessionsApi.loading.value"
      flat
      bordered
      :pagination="tablePagination"
      @request="onTableRequest"
    >
      <!-- Level column -->
      <template #body-cell-memberLevel="props">
        <q-td :props="props">
          <q-chip dense :color="memberLevelColor(props.row.memberLevel)" text-color="white">
            {{ memberLevelLabel(props.row.memberLevel) }}
          </q-chip>
        </q-td>
      </template>

      <!-- Routes column -->
      <template #body-cell-routes="props">
        <q-td :props="props">
          <span class="text-caption">{{ props.row.routesSummary }}</span>
        </q-td>
      </template>

      <!-- Status column -->
      <template #body-cell-status="props">
        <q-td :props="props">
          <status-badge
            :status="props.row.status"
            :by-system="props.row.approvedBySystem"
          />
        </q-td>
      </template>

      <!-- Approver column -->
      <template #body-cell-approver="props">
        <q-td :props="props">
          <template v-if="props.row.approvedByName">
            {{ props.row.approvedByName }}
            <div class="text-caption text-grey">
              {{ formatDate(props.row.approvedAt) }}
            </div>
          </template>
          <template v-else>-</template>
        </q-td>
      </template>

      <!-- Actions column -->
      <template #body-cell-actions="props">
        <q-td :props="props" class="q-gutter-xs">
          <q-btn
            flat
            dense
            icon="visibility"
            @click="viewSession(props.row.id)"
          >
            <q-tooltip>Ver detalles</q-tooltip>
          </q-btn>
          <q-btn
            v-if="props.row.status === 'pending_review'"
            flat
            dense
            color="positive"
            icon="check"
            @click="handleApprove(props.row.id)"
          >
            <q-tooltip>Aprobar</q-tooltip>
          </q-btn>
          <q-btn
            v-if="props.row.status === 'approved'"
            flat
            dense
            color="warning"
            icon="undo"
            @click="handleRevert(props.row.id)"
          >
            <q-tooltip>Revertir a pendiente</q-tooltip>
          </q-btn>
          <q-btn
            v-if="props.row.status !== 'discarded'"
            flat
            dense
            color="negative"
            icon="delete_outline"
            @click="handleDiscard(props.row.id)"
          >
            <q-tooltip>Descartar</q-tooltip>
          </q-btn>
        </q-td>
      </template>

      <!-- No data slot -->
      <template #no-data>
        <div class="full-width row flex-center text-grey q-pa-lg">
          <q-icon name="info" size="sm" class="q-mr-sm" />
          No hay sesiones para esta semana y dia
        </div>
      </template>
    </q-table>

    <!-- Bulk approve button -->
    <div class="q-mt-md" v-if="pendingSessions.length > 0">
      <q-btn
        color="positive"
        icon="check_circle"
        :label="`Aprobar todas (${pendingSessions.length})`"
        @click="handleBulkApprove"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useSessionsApi } from 'src/composables/useSessionsApi';
import { useAdminStore } from 'src/stores/useAdminStore';
import SessionFilters from 'src/components/sessions/SessionFilters.vue';
import DayTabs from 'src/components/sessions/DayTabs.vue';
import StatusBadge from 'src/components/sessions/StatusBadge.vue';
import type { SessionSummary, SessionFilter } from 'src/types/session';

const $q = useQuasar();
const router = useRouter();
const sessionsApi = useSessionsApi();
const adminStore = useAdminStore();

const sessions = ref<SessionSummary[]>([]);
const currentWeek = ref(1);
const currentDay = ref('lunes');
const filter = ref<SessionFilter>({});
const tablePagination = ref({
  sortBy: 'status',
  descending: false,
  page: 1,
  rowsPerPage: 50,
  rowsNumber: 0,
});

// Table columns
const columns = [
  { name: 'memberLevel', label: 'Nivel', field: 'memberLevel', align: 'left' as const },
  { name: 'routes', label: 'Rutas', field: 'routesSummary', align: 'left' as const },
  { name: 'blockCount', label: 'Bloques', field: 'blockCount', align: 'center' as const },
  { name: 'status', label: 'Estado', field: 'status', align: 'center' as const },
  { name: 'approver', label: 'Aprobado por', field: 'approvedByName', align: 'left' as const },
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'center' as const },
];

// Computed
const filteredSessions = computed(() => {
  return sessions.value.filter(s =>
    s.week === currentWeek.value && s.day === currentDay.value
  ).sort((a, b) => {
    // Pending first, then approved, then discarded
    const statusOrder: Record<string, number> = { pending_review: 0, approved: 1, discarded: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
  });
});

const pendingSessions = computed(() =>
  filteredSessions.value.filter(s => s.status === 'pending_review')
);

const discardedSessions = computed(() =>
  filteredSessions.value.filter(s => s.status === 'discarded')
);

// Methods
async function loadSessions() {
  try {
    const response = await sessionsApi.fetchSessions({
      ...filter.value,
      week: currentWeek.value,
      limit: 100,
    });
    sessions.value = response.sessions;
    tablePagination.value.rowsNumber = response.total;
  } catch {
    $q.notify({ type: 'negative', message: 'Error cargando sesiones' });
  }
}

function onTableRequest(props: { pagination: typeof tablePagination.value }) {
  tablePagination.value = props.pagination;
  loadSessions();
}

function prevWeek() {
  if (currentWeek.value > 1) {
    currentWeek.value--;
    loadSessions();
  }
}

function nextWeek() {
  if (currentWeek.value < 52) {
    currentWeek.value++;
    loadSessions();
  }
}

function viewSession(id: number) {
  router.push(`/sessions/${id}`);
}

async function handleApprove(id: number) {
  const doApprove = async () => {
    try {
      await sessionsApi.approveSession(id);
      $q.notify({ type: 'positive', message: 'Sesion aprobada' });
      loadSessions();
      adminStore.fetchPendingCount();
      adminStore.checkSessionCoverage();
    } catch {
      $q.notify({ type: 'negative', message: 'Error aprobando sesion' });
    }
  };

  // Warn if there are discarded sessions (incomplete coverage)
  if (discardedSessions.value.length > 0) {
    const discardedLevels = discardedSessions.value.map(s => memberLevelLabel(s.memberLevel)).join(', ');
    $q.dialog({
      title: 'Cobertura incompleta',
      message: `Hay sesiones descartadas para este dia (${discardedLevels}). Los miembros de esos niveles no tendran sesion. Aprobar de todas formas?`,
      cancel: true,
      persistent: true,
    }).onOk(doApprove);
  } else {
    await doApprove();
  }
}

async function handleRevert(id: number) {
  try {
    await sessionsApi.revertSession(id);
    $q.notify({ type: 'info', message: 'Sesion revertida a pendiente' });
    loadSessions();
    adminStore.fetchPendingCount();
    adminStore.checkSessionCoverage();
  } catch {
    $q.notify({ type: 'negative', message: 'Error revirtiendo sesion' });
  }
}

async function handleDiscard(id: number) {
  $q.dialog({
    title: 'Descartar Sesion',
    message: 'Razon (opcional):',
    prompt: {
      model: '',
      type: 'textarea',
    },
    cancel: true,
  }).onOk(async (reason: string) => {
    try {
      await sessionsApi.discardSession(id, reason || undefined);
      $q.notify({ type: 'info', message: 'Sesion descartada' });
      loadSessions();
      adminStore.fetchPendingCount();
    } catch {
      $q.notify({ type: 'negative', message: 'Error descartando sesion' });
    }
  });
}

async function handleBulkApprove() {
  const count = pendingSessions.value.length;
  let message = `Aprobar ${count} sesiones pendientes para ${currentDay.value}?`;

  // Warn if there are discarded sessions
  if (discardedSessions.value.length > 0) {
    const discardedLevels = discardedSessions.value.map(s => memberLevelLabel(s.memberLevel)).join(', ');
    message += `\n\nAtencion: Hay sesiones descartadas (${discardedLevels}). Los miembros de esos niveles no tendran sesion.`;
  }

  $q.dialog({
    title: 'Aprobar Sesiones',
    message,
    cancel: true,
    persistent: true,
  }).onOk(async () => {
    try {
      const ids = pendingSessions.value.map(s => s.id);
      const result = await sessionsApi.bulkApprove(ids);
      $q.notify({
        type: 'positive',
        message: `${result.approvedCount} sesiones aprobadas`,
      });
      loadSessions();
      adminStore.fetchPendingCount();
      adminStore.checkSessionCoverage();
    } catch {
      $q.notify({ type: 'negative', message: 'Error aprobando sesiones' });
    }
  });
}

function memberLevelColor(level: string): string {
  switch (level) {
    case 'alfa': return 'light-blue';
    case 'delta': return 'blue';
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

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Watch for filter changes
watch(filter, () => loadSessions(), { deep: true });

onMounted(() => {
  // Get current SPOM week from API or default to 1
  loadSessions();
});
</script>
