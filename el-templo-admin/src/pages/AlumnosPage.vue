<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="text-h5 q-mb-md">Alumnos</div>

    <!-- Filter bar -->
    <div class="row q-col-gutter-sm q-mb-md items-end">
      <div class="col-12 col-sm-2">
        <q-input
          v-model="filters.search"
          label="Buscar por nombre, email o DNI"
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
          v-model="filters.planId"
          :options="planFilterOptions"
          label="Plan"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-6 col-sm-2">
        <q-select
          v-model="filters.branchId"
          :options="branchFilterOptions"
          label="Sucursal"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-6 col-sm-2">
        <q-select
          v-model="filters.level"
          :options="levelFilterOptions"
          label="Nivel"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-6 col-sm-1">
        <q-select
          v-model="filters.isActive"
          :options="statusFilterOptions"
          label="Estado"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-6 col-sm-1">
        <q-toggle
          v-model="filters.overdue"
          label="Morosos"
          color="negative"
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-6 col-sm-2 text-right">
        <q-btn
          icon="person_add"
          label="Crear Alumno"
          color="primary"
          @click="showCreateDialog = true"
        />
      </div>
    </div>

    <!-- QTable -->
    <q-table
      :rows="members"
      :columns="columns"
      row-key="id"
      :loading="loading"
      :pagination="tablePagination"
      :rows-per-page-options="[20, 50, 100]"
      @request="onTableRequest"
    >
      <!-- Nombre column (clickable) -->
      <template #body-cell-nombre="props">
        <q-td :props="props">
          <span
            class="text-weight-medium text-primary cursor-pointer"
            @click="viewMember(props.row)"
          >
            {{ displayName(props.row) }}
          </span>
          <q-badge v-if="props.row.isOverdue" color="negative" label="Deuda" class="q-ml-sm" />
        </q-td>
      </template>

      <!-- Nivel column with Greek letter -->
      <template #body-cell-nivel="props">
        <q-td :props="props">
          <span :class="`text-${levelColor(props.row.level)}`" class="text-weight-bold">
            {{ greekLevel(props.row.level) }}
          </span>
        </q-td>
      </template>

      <!-- Estado column -->
      <template #body-cell-estado="props">
        <q-td :props="props">
          <q-badge
            :color="props.row.isActive ? 'positive' : 'grey'"
            :label="props.row.isActive ? 'Activo' : 'Inactivo'"
          />
        </q-td>
      </template>

      <!-- Fecha column -->
      <template #body-cell-fecha="props">
        <q-td :props="props">
          {{ formatDate(props.row.createdAt) }}
        </q-td>
      </template>

      <!-- Actions column -->
      <template #body-cell-acciones="props">
        <q-td :props="props">
          <q-btn flat dense round icon="visibility" color="primary" @click="viewMember(props.row)">
            <q-tooltip>Ver detalle</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <!-- Create Member Dialog -->
    <MemberFormDialog v-model="showCreateDialog" :branches="branches" @saved="onMemberSaved" />
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useMembersApi } from 'src/composables/useMembersApi';
import type { MemberListItem, BranchOption } from 'src/types/member';
import MemberFormDialog from 'src/components/MemberFormDialog.vue';

const log = createLogger('AlumnosPage');
const $q = useQuasar();
const router = useRouter();
const membersApi = useMembersApi();

// =========================================================================
// State
// =========================================================================

const members = ref<MemberListItem[]>([]);
const branches = ref<BranchOption[]>([]);
const loading = ref(false);
const showCreateDialog = ref(false);

const filters = reactive({
  search: '',
  planId: null as number | null,
  branchId: null as number | null,
  level: null as string | null,
  isActive: true as boolean | null,
  overdue: false,
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

const planFilterOptions = ref<Array<{ label: string; value: number | null }>>([
  { label: 'Todos', value: null },
  { label: 'Sin plan', value: 0 },
]);

const branchFilterOptions = ref<Array<{ label: string; value: number | null }>>([
  { label: 'Todas', value: null },
]);

const levelFilterOptions = [
  { label: 'Todos', value: null },
  { label: 'Alfa', value: 'alfa' },
  { label: 'Delta', value: 'delta' },
  { label: 'Sigma', value: 'sigma' },
  { label: 'Omega', value: 'omega' },
  { label: 'Spartan', value: 'spartan' },
];

const statusFilterOptions = [
  { label: 'Todos', value: null },
  { label: 'Activos', value: true },
  { label: 'Inactivos', value: false },
];

// =========================================================================
// Table columns
// =========================================================================

const columns: QTableProps['columns'] = [
  {
    name: 'nombre',
    label: 'Nombre',
    field: (row: MemberListItem) => displayName(row),
    align: 'left',
    sortable: false,
  },
  {
    name: 'email',
    label: 'Email',
    field: 'email',
    align: 'left',
    sortable: false,
  },
  {
    name: 'plan',
    label: 'Plan',
    field: 'planName',
    align: 'left',
    sortable: false,
    format: (val: string | null) => val ?? 'Sin plan',
  },
  {
    name: 'sucursal',
    label: 'Sucursal',
    field: 'branchName',
    align: 'left',
    sortable: false,
  },
  {
    name: 'nivel',
    label: 'Nivel',
    field: 'level',
    align: 'left',
    sortable: false,
    style: 'width: 80px',
  },
  {
    name: 'estado',
    label: 'Estado',
    field: 'isActive',
    align: 'center',
    sortable: false,
    style: 'width: 100px',
  },
  {
    name: 'fecha',
    label: 'Fecha',
    field: 'createdAt',
    align: 'left',
    sortable: false,
    style: 'width: 110px',
  },
  {
    name: 'acciones',
    label: 'Acciones',
    field: 'id',
    align: 'center',
    sortable: false,
    style: 'width: 80px',
  },
];

// =========================================================================
// Greek level display
// =========================================================================

const LEVEL_GREEK_MAP: Record<string, string> = {
  alfa: '\u03B1', // alpha
  delta: '\u0394', // Delta
  sigma: '\u03A3', // Sigma
  omega: '\u03A9', // Omega
  spartan: '\u03A9', // Omega (same tier)
};

function greekLevel(level: string): string {
  return LEVEL_GREEK_MAP[level.toLowerCase()] ?? level;
}

function levelColor(level: string): string {
  switch (level.toLowerCase()) {
    case 'alfa':
      return 'amber-8';
    case 'delta':
      return 'deep-orange-7';
    case 'sigma':
      return 'brown-8';
    case 'omega':
      return 'red-9';
    case 'spartan':
      return 'grey-9';
    default:
      return 'grey';
  }
}

// =========================================================================
// Display helpers
// =========================================================================

function displayName(member: MemberListItem): string {
  const parts = [member.firstName, member.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : member.email;
}

function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

// =========================================================================
// Data loading
// =========================================================================

async function loadBranches() {
  try {
    branches.value = await membersApi.getBranches();
    branchFilterOptions.value = [
      { label: 'Todas', value: null },
      ...branches.value.map((b) => ({ label: b.name, value: b.id })),
    ];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading branches', { error: message });
  }
}

async function loadPlans() {
  try {
    const plans = await membersApi.getPlans();
    planFilterOptions.value = [
      { label: 'Todos', value: null },
      { label: 'Sin plan', value: 0 },
      ...plans.map((p) => ({ label: p.name, value: p.id })),
    ];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading plans', { error: message });
  }
}

async function loadMembers() {
  loading.value = true;
  try {
    const result = await membersApi.getMembers({
      search: filters.search || undefined,
      planId: filters.planId ?? undefined,
      branchId: filters.branchId ?? undefined,
      level: filters.level ?? undefined,
      isActive: filters.isActive ?? undefined,
      overdue: filters.overdue || undefined,
      page: tablePagination.value.page,
      limit: tablePagination.value.rowsPerPage,
    });
    members.value = result.members;
    tablePagination.value.rowsNumber = result.total;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading members', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando alumnos' });
  } finally {
    loading.value = false;
  }
}

// =========================================================================
// Event handlers
// =========================================================================

function onFilterChange() {
  tablePagination.value.page = 1;
  loadMembers();
}

function onTableRequest(props: { pagination: { page: number; rowsPerPage: number } }) {
  tablePagination.value.page = props.pagination.page;
  tablePagination.value.rowsPerPage = props.pagination.rowsPerPage;
  loadMembers();
}

function viewMember(member: MemberListItem) {
  router.push(`/alumnos/${member.id}`);
}

function onMemberSaved() {
  $q.notify({ type: 'positive', message: 'Alumno guardado correctamente' });
  loadMembers();
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadBranches();
  loadPlans();
  loadMembers();
});
</script>
