<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="text-h5 q-mb-md">Alumnos</div>

    <!-- Filter bar -->
    <div class="row q-col-gutter-sm q-mb-md items-end">
      <div class="col-12 col-sm-4">
        <q-input
          v-model="filters.search"
          label="Buscar por nombre"
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
      <div class="col-6 col-sm-3">
        <q-select
          v-model="filters.journeyType"
          :options="journeyTypeOptions"
          label="Tipo de Journey"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
    </div>

    <!-- QTable -->
    <q-table
      :rows="members"
      :columns="columns"
      row-key="userId"
      :loading="loading"
      :pagination="tablePagination"
      :rows-per-page-options="[20, 50, 100]"
      @request="onTableRequest"
    >
      <!-- Nombre column -->
      <template #body-cell-nombre="props">
        <q-td :props="props">
          <span class="text-weight-medium">
            {{ displayName(props.row) }}
          </span>
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

      <!-- Journey column with colored badge -->
      <template #body-cell-journey="props">
        <q-td :props="props">
          <q-badge
            v-if="props.row.journeyType"
            :color="journeyBadgeColor(props.row.journeyType)"
            :label="props.row.journeyName"
          />
          <span v-else class="text-grey-5 text-italic">Sin journey</span>
        </q-td>
      </template>

      <!-- Semana column -->
      <template #body-cell-semana="props">
        <q-td :props="props">
          <span v-if="props.row.journeyType" class="text-caption">
            {{ highestSemana(props.row) }}
          </span>
          <span v-else class="text-grey-5">—</span>
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
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useJourneyAdminApi } from 'src/composables/useJourneyAdminApi';
import {
  ALL_JOURNEY_TYPES,
  JOURNEY_TYPE_LABELS,
  JOURNEY_TIER_MAP,
  JOURNEY_TIER_COLORS,
  type JourneyType,
  type JourneyTier,
  type MemberJourneyInfo,
} from 'src/types/journey';

const log = createLogger('AlumnosPage');
const $q = useQuasar();
const router = useRouter();

// =========================================================================
// State
// =========================================================================

const members = ref<MemberJourneyInfo[]>([]);
const loading = ref(false);

const filters = reactive({
  search: '',
  journeyType: '',
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

const journeyTypeOptions = [
  { label: 'Todos', value: '' },
  { label: '— Principiante —', value: '', disable: true },
  ...ALL_JOURNEY_TYPES.filter((jt) => JOURNEY_TIER_MAP[jt] === 'principiante').map((jt) => ({
    label: JOURNEY_TYPE_LABELS[jt],
    value: jt,
  })),
  { label: '— Intermedio —', value: '', disable: true },
  ...ALL_JOURNEY_TYPES.filter((jt) => JOURNEY_TIER_MAP[jt] === 'intermedio').map((jt) => ({
    label: JOURNEY_TYPE_LABELS[jt],
    value: jt,
  })),
  { label: '— Avanzado —', value: '', disable: true },
  ...ALL_JOURNEY_TYPES.filter((jt) => JOURNEY_TIER_MAP[jt] === 'avanzado').map((jt) => ({
    label: JOURNEY_TYPE_LABELS[jt],
    value: jt,
  })),
];

// =========================================================================
// Table columns
// =========================================================================

const columns: QTableProps['columns'] = [
  {
    name: 'nombre',
    label: 'Nombre',
    field: (row: MemberJourneyInfo) => displayName(row),
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
    name: 'sucursal',
    label: 'Sucursal',
    field: 'branchName',
    align: 'left',
    sortable: false,
  },
  {
    name: 'journey',
    label: 'Journey',
    field: 'journeyType',
    align: 'left',
    sortable: false,
  },
  {
    name: 'semana',
    label: 'Semana',
    field: 'semana20',
    align: 'center',
    sortable: false,
    style: 'width: 100px',
  },
  {
    name: 'acciones',
    label: 'Acciones',
    field: 'userId',
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

function displayName(member: MemberJourneyInfo): string {
  const parts = [member.firstName, member.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : member.email;
}

function journeyBadgeColor(journeyType: string): string {
  const tier: JourneyTier | undefined = JOURNEY_TIER_MAP[journeyType as JourneyType];
  return tier ? JOURNEY_TIER_COLORS[tier] : 'grey';
}

function highestSemana(member: MemberJourneyInfo): string {
  const semanas = [member.semana20, member.semana40, member.semana60].filter(
    (s): s is number => s !== null
  );
  if (semanas.length === 0) return '—';
  return `S${Math.max(...semanas)}`;
}

// =========================================================================
// Data loading
// =========================================================================

async function loadMembers() {
  loading.value = true;
  try {
    const journeyApi = useJourneyAdminApi();
    const result = await journeyApi.getMembers({
      search: filters.search || undefined,
      journeyType: filters.journeyType || undefined,
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

function viewMember(member: MemberJourneyInfo) {
  router.push(`/alumnos/${member.userId}`);
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadMembers();
});
</script>
