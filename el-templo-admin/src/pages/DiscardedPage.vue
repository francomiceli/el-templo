<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Sesiones Descartadas</div>

    <q-table
      :rows="sessions"
      :columns="columns"
      row-key="id"
      :loading="loading"
      flat
      bordered
      :pagination="pagination"
      @request="onRequest"
    >
      <!-- Reason column -->
      <template #body-cell-reason="props">
        <q-td :props="props">
          <span v-if="props.row.discardedReason" class="text-italic text-grey-7">
            {{ truncate(props.row.discardedReason, 50) }}
            <q-tooltip v-if="props.row.discardedReason.length > 50">
              {{ props.row.discardedReason }}
            </q-tooltip>
          </span>
          <span v-else class="text-grey">-</span>
        </q-td>
      </template>

      <!-- Level column -->
      <template #body-cell-levelGroup="props">
        <q-td :props="props">
          <q-chip dense :color="levelColor(props.row.levelGroup)">
            {{ levelLabel(props.row.levelGroup) }}
          </q-chip>
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
            flat
            dense
            color="positive"
            icon="restore"
            @click="handleRestore(props.row.id)"
          >
            <q-tooltip>Restaurar a pendiente</q-tooltip>
          </q-btn>
        </q-td>
      </template>

      <!-- No data slot -->
      <template #no-data>
        <div class="full-width row flex-center text-grey q-pa-lg">
          <q-icon name="check_circle" size="sm" class="q-mr-sm" />
          No hay sesiones descartadas
        </div>
      </template>
    </q-table>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useSessionsApi } from 'src/composables/useSessionsApi';
import type { SessionSummary, LevelGroup } from 'src/types/session';

const router = useRouter();
const $q = useQuasar();
const sessionsApi = useSessionsApi();

const sessions = ref<SessionSummary[]>([]);
const loading = ref(false);
const pagination = ref({
  page: 1,
  rowsPerPage: 20,
  rowsNumber: 0,
});

const columns = [
  { name: 'week', label: 'Semana', field: 'week', align: 'center' as const, sortable: true },
  { name: 'day', label: 'Dia', field: 'day', align: 'left' as const },
  { name: 'levelGroup', label: 'Nivel', field: 'levelGroup', align: 'center' as const },
  { name: 'discardedAt', label: 'Descartada', field: (row: SessionSummary) => formatDate(row.discardedAt), align: 'left' as const },
  { name: 'reason', label: 'Razon', field: 'discardedReason', align: 'left' as const },
  { name: 'actions', label: 'Acciones', field: 'actions', align: 'center' as const },
];

async function loadSessions() {
  loading.value = true;
  try {
    const response = await sessionsApi.fetchSessions({
      status: 'discarded',
      page: pagination.value.page,
      limit: pagination.value.rowsPerPage,
    });
    sessions.value = response.sessions;
    pagination.value.rowsNumber = response.total;
  } catch {
    $q.notify({ type: 'negative', message: 'Error cargando sesiones' });
  } finally {
    loading.value = false;
  }
}

interface RequestProps {
  pagination: {
    page: number;
    rowsPerPage: number;
    rowsNumber?: number;
    sortBy?: string;
    descending?: boolean;
  };
}

function onRequest(props: RequestProps) {
  pagination.value.page = props.pagination.page;
  pagination.value.rowsPerPage = props.pagination.rowsPerPage;
  if (props.pagination.rowsNumber !== undefined) {
    pagination.value.rowsNumber = props.pagination.rowsNumber;
  }
  loadSessions();
}

function viewSession(id: number) {
  router.push(`/sessions/${id}`);
}

async function handleRestore(id: number) {
  $q.dialog({
    title: 'Restaurar Sesion',
    message: 'Restaurar esta sesion a estado pendiente?',
    cancel: true,
  }).onOk(async () => {
    try {
      await sessionsApi.restoreSession(id);
      $q.notify({ type: 'positive', message: 'Sesion restaurada' });
      loadSessions();
    } catch {
      $q.notify({ type: 'negative', message: 'Error restaurando sesion' });
    }
  });
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.substring(0, len) + '...';
}

function levelColor(group: LevelGroup): string {
  switch (group) {
    case 'alfa_delta': return 'blue';
    case 'sigma': return 'purple';
    case 'omega': return 'orange';
    default: return 'grey';
  }
}

function levelLabel(group: LevelGroup): string {
  switch (group) {
    case 'alfa_delta': return 'a/D';
    case 'sigma': return 'S';
    case 'omega': return 'O';
    default: return group;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

onMounted(loadSessions);
</script>
