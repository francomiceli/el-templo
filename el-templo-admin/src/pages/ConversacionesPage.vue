<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="text-h5 q-mb-md">WhatsApp Conversaciones</div>

    <!-- Filter bar -->
    <div class="row q-col-gutter-sm q-mb-md items-end">
      <div class="col-12 col-sm-4">
        <q-input
          v-model="filters.search"
          label="Buscar por nombre o telefono"
          dense
          outlined
          clearable
          debounce="300"
          @update:model-value="onFilterChange"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
      </div>
      <div class="col-6 col-sm-2">
        <q-select
          v-model="filters.status"
          :options="statusOptions"
          label="Estado"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-6 col-sm-2">
        <q-select
          v-model="filters.clientState"
          :options="clientStateOptions"
          label="Tipo cliente"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
    </div>

    <!-- Table -->
    <div class="relative-position">
      <q-table
        :rows="conversations"
        :columns="columns"
        row-key="id"
        :loading="loading"
        v-model:pagination="tablePagination"
        :rows-per-page-options="[20, 50]"
        :pagination-label="
          (firstRowIndex, endRowIndex, totalRowsNumber) =>
            `${firstRowIndex}-${endRowIndex} de ${totalRowsNumber}`
        "
        rows-per-page-label="Por pagina"
        no-data-label="No hay conversaciones"
        loading-label="Cargando..."
        @request="onTableRequest"
        @row-click="onRowClick"
        class="cursor-pointer"
      >
        <!-- Contact name column -->
        <template #body-cell-contacto="props">
          <q-td :props="props">
            <span class="text-weight-medium">
              {{ props.row.contactName || props.row.phone }}
            </span>
          </q-td>
        </template>

        <!-- Status column -->
        <template #body-cell-status="props">
          <q-td :props="props">
            <q-badge
              :color="statusColor(props.row.status)"
              :label="statusLabel(props.row.status)"
            />
          </q-td>
        </template>

        <!-- Client state column -->
        <template #body-cell-clientState="props">
          <q-td :props="props">
            <q-badge
              :color="clientStateColor(props.row.clientState)"
              :label="clientStateLabel(props.row.clientState)"
            />
          </q-td>
        </template>

        <!-- Last message preview column -->
        <template #body-cell-lastMessage="props">
          <q-td :props="props">
            <span class="text-grey-7">
              {{ truncate(props.row.lastMessagePreview, 50) }}
            </span>
          </q-td>
        </template>

        <!-- Last message time column -->
        <template #body-cell-lastMessageAt="props">
          <q-td :props="props">
            {{ formatRelativeTime(props.row.lastMessageAt) }}
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { createLogger } from 'src/utils/logger';
import { useWhatsappApi } from 'src/composables/useWhatsappApi';
import type { ConversationRecord, ConversationStatus, ClientState } from 'src/types/whatsapp';
import type { QTableProps } from 'quasar';

const log = createLogger('ConversacionesPage');
const router = useRouter();
const whatsappApi = useWhatsappApi();

// =========================================================================
// State
// =========================================================================

const conversations = ref<ConversationRecord[]>([]);
const loading = ref(false);

const filters = reactive({
  search: '' as string,
  status: null as ConversationStatus | null,
  clientState: null as ClientState | null,
});

const tablePagination = ref({
  page: 1,
  rowsPerPage: 20,
  rowsNumber: 0,
  sortBy: null as string | null,
  descending: false,
});

// =========================================================================
// Filter options
// =========================================================================

const statusOptions = [
  { label: 'Todos', value: null },
  { label: 'Activo', value: 'active' },
  { label: 'Humano', value: 'human_takeover' },
  { label: 'Cerrado', value: 'closed' },
];

const clientStateOptions = [
  { label: 'Todos', value: null },
  { label: 'Lead', value: 'lead' },
  { label: 'Trial', value: 'trial' },
  { label: 'Activo', value: 'active_member' },
  { label: 'Inactivo', value: 'inactive_member' },
  { label: 'Expirado', value: 'expired_member' },
];

// =========================================================================
// Table columns
// =========================================================================

const columns: QTableProps['columns'] = [
  {
    name: 'contacto',
    label: 'Contacto',
    field: (row: ConversationRecord) => row.contactName || row.phone,
    align: 'left',
    sortable: false,
  },
  {
    name: 'phone',
    label: 'Telefono',
    field: 'phone',
    align: 'left',
    sortable: false,
  },
  {
    name: 'status',
    label: 'Estado',
    field: 'status',
    align: 'center',
    sortable: false,
    style: 'width: 100px',
  },
  {
    name: 'clientState',
    label: 'Cliente',
    field: 'clientState',
    align: 'center',
    sortable: false,
    style: 'width: 100px',
  },
  {
    name: 'lastMessage',
    label: 'Ultimo mensaje',
    field: 'lastMessagePreview',
    align: 'left',
    sortable: false,
  },
  {
    name: 'lastMessageAt',
    label: 'Fecha',
    field: 'lastMessageAt',
    align: 'left',
    sortable: false,
    style: 'width: 120px',
  },
  {
    name: 'messageCount',
    label: 'Msgs',
    field: 'messageCount',
    align: 'center',
    sortable: false,
    style: 'width: 70px',
  },
];

// =========================================================================
// Badge colors and labels
// =========================================================================

function statusColor(status: ConversationStatus): string {
  switch (status) {
    case 'active':
      return 'green';
    case 'human_takeover':
      return 'orange';
    case 'closed':
      return 'grey';
    default:
      return 'grey';
  }
}

function statusLabel(status: ConversationStatus): string {
  switch (status) {
    case 'active':
      return 'Activo';
    case 'human_takeover':
      return 'Humano';
    case 'closed':
      return 'Cerrado';
    default:
      return status;
  }
}

function clientStateColor(state: ClientState): string {
  switch (state) {
    case 'lead':
      return 'blue';
    case 'trial':
      return 'purple';
    case 'active_member':
      return 'green';
    case 'inactive_member':
      return 'orange';
    case 'expired_member':
      return 'red';
    default:
      return 'grey';
  }
}

function clientStateLabel(state: ClientState): string {
  switch (state) {
    case 'lead':
      return 'Lead';
    case 'trial':
      return 'Trial';
    case 'active_member':
      return 'Activo';
    case 'inactive_member':
      return 'Inactivo';
    case 'expired_member':
      return 'Expirado';
    default:
      return state;
  }
}

// =========================================================================
// Display helpers
// =========================================================================

function truncate(text: string | null, maxLen: number): string {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return '';
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60_000);

    if (diffMin < 1) return 'ahora';
    if (diffMin < 60) return `hace ${diffMin} min`;

    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `hace ${diffHours}h`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `hace ${diffDays}d`;

    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

// =========================================================================
// Data loading
// =========================================================================

async function loadConversations() {
  loading.value = true;
  try {
    const result = await whatsappApi.getConversations({
      search: filters.search || undefined,
      status: filters.status ?? undefined,
      clientState: filters.clientState ?? undefined,
      page: tablePagination.value.page,
      limit: tablePagination.value.rowsPerPage,
    });
    conversations.value = result.conversations;
    tablePagination.value.rowsNumber = result.total;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading conversations', { error: message });
  } finally {
    loading.value = false;
  }
}

// =========================================================================
// Event handlers
// =========================================================================

function onFilterChange() {
  tablePagination.value.page = 1;
  loadConversations();
}

function onTableRequest(props: { pagination: { page: number; rowsPerPage: number } }) {
  tablePagination.value.page = props.pagination.page;
  tablePagination.value.rowsPerPage = props.pagination.rowsPerPage;
  loadConversations();
}

function onRowClick(_evt: Event, row: ConversationRecord) {
  router.push(`/conversaciones/${row.id}`);
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadConversations();
});
</script>
