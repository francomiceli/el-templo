<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="text-h5 q-mb-md">Alumnos</div>

    <!-- Filter bar — Row 1: search + main filters + actions -->
    <div class="row q-col-gutter-sm q-mb-sm items-end">
      <div class="col-12 col-sm-4 col-md-3">
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
      <div class="col-6 col-sm-2 col-md-2">
        <q-select
          v-model="filters.planId"
          :options="planFilterOptions"
          label="Plan"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        >
          <template #option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section>
                <q-item-label :class="{ 'text-grey-6 text-italic': scope.opt.archived }">
                  {{ scope.opt.label }}
                </q-item-label>
              </q-item-section>
            </q-item>
          </template>
        </q-select>
      </div>
      <div class="col-6 col-sm-2 col-md-1">
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
      <div class="col-4 col-sm-1 col-md-1">
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
      <div class="col-4 col-sm-1 col-md-1">
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
      <div class="col-4 col-sm-2 col-md-2">
        <q-select
          v-model="filters.segment"
          :options="segmentFilterOptions"
          label="Segmento"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-6 col-sm-2 col-md-1">
        <q-select
          v-model="filters.avatarType"
          :options="avatarFilterOptions"
          label="Avatar"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-6 col-sm-auto col-md-1">
        <div class="row no-wrap q-gutter-x-sm justify-end items-center">
          <q-btn icon="download" color="grey-7" flat round :loading="exporting" @click="onExport">
            <q-tooltip>Exportar a Excel</q-tooltip>
          </q-btn>
          <q-btn
            label="Nuevo"
            icon="person_add"
            color="primary"
            dense
            no-caps
            class="q-px-md"
            @click="showCreateDialog = true"
          />
        </div>
      </div>
    </div>

    <!-- QTable -->
    <q-table
      :rows="members"
      :columns="columns"
      row-key="id"
      :loading="loading"
      v-model:pagination="tablePagination"
      :rows-per-page-options="[20, 50, 100]"
      :pagination-label="
        (firstRowIndex, endRowIndex, totalRowsNumber) =>
          `${firstRowIndex}-${endRowIndex} de ${totalRowsNumber}`
      "
      rows-per-page-label="Registros por página"
      no-data-label="No se encontraron alumnos"
      loading-label="Cargando..."
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
        </q-td>
      </template>

      <!-- Plan column with legacy badge -->
      <template #body-cell-plan="props">
        <q-td :props="props">
          {{ props.row.planName ?? 'Sin plan' }}
          <q-badge
            v-if="isLegacyPlan(props.row.planName)"
            color="warning"
            outline
            label="Plan legacy"
            class="q-ml-sm"
          />
        </q-td>
      </template>

      <!-- Segment column -->
      <template #body-cell-segmento="props">
        <q-td :props="props">
          <q-badge
            v-if="props.row.segment"
            :color="segmentColor(props.row.segment)"
            :label="segmentLabel(props.row.segment)"
            outline
          />
          <span v-else class="text-grey-5 text-italic">&mdash;</span>
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

      <!-- Avatar column -->
      <template #body-cell-avatar="props">
        <q-td :props="props">
          <q-badge
            v-if="props.row.avatarType"
            outline
            color="grey-7"
            :label="props.row.avatarType"
          />
          <span v-else class="text-grey-5">—</span>
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
          <q-btn flat dense round icon="edit" color="primary" @click="viewMember(props.row)">
            <q-tooltip>Editar alumno</q-tooltip>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <!-- Create Member Dialog -->
    <MemberFormDialog v-model="showCreateDialog" :branches="branches" @saved="onMemberSaved" />
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useMembersApi } from 'src/composables/useMembersApi';
import type { MemberListItem, MemberSegment, BranchOption } from 'src/types/member';
import { SEGMENT_LABELS, SEGMENT_COLORS } from 'src/types/member';
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
const exporting = ref(false);
const showCreateDialog = ref(false);

// Selection state

// Plans data (including archived for legacy detection)
const allPlans = ref<Array<{ id: number; name: string; isArchived: boolean; planTier: string }>>(
  []
);

const filters = reactive({
  search: '',
  planId: null as number | null,
  branchId: null as number | string | null,
  level: null as string | null,
  isActive: true as boolean | null,
  segment: null as MemberSegment | null,
  avatarType: null as string | null,
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

interface PlanFilterOption {
  label: string;
  value: number | null;
  archived?: boolean;
}

const planFilterOptions = ref<PlanFilterOption[]>([
  { label: 'Todos', value: null },
  { label: 'Sin plan', value: 0 },
]);

const branchFilterOptions = ref<Array<{ label: string; value: number | string | null }>>([
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

const segmentFilterOptions: Array<{ label: string; value: MemberSegment | null }> = [
  { label: 'Todos', value: null },
  { label: 'Nuevo', value: 'nuevo' },
  { label: 'Espartano', value: 'espartano' },
  { label: 'Intermitente', value: 'intermitente' },
  { label: 'En Riesgo', value: 'en_riesgo' },
  { label: 'Digital Warrior', value: 'digital_warrior' },
  { label: 'Ghost', value: 'ghost' },
];

const avatarFilterOptions: Array<{ label: string; value: string | null }> = [
  { label: 'Todos', value: null },
  { label: 'A - Nunca entreno', value: 'A' },
  { label: 'B - Solo gym', value: 'B' },
  { label: 'C - Dejo el gym', value: 'C' },
  { label: 'D - Yogui/pilatera', value: 'D' },
  { label: 'E - Cardio', value: 'E' },
  { label: 'F - Pesas veterano', value: 'F' },
  { label: 'G - Busca comunidad', value: 'G' },
  { label: 'H - Longevidad', value: 'H' },
  { label: 'I - Cuerpo-mente', value: 'I' },
  { label: 'J - Cuerpo firme', value: 'J' },
  { label: 'K - Mujer joven', value: 'K' },
  { label: 'Sin avatar', value: 'none' },
];

// =========================================================================
// Computed
// =========================================================================

/** Set of archived plan names for quick lookup */
const archivedPlanNames = computed(() => {
  const names = new Set<string>();
  for (const p of allPlans.value) {
    if (p.isArchived) names.add(p.name);
  }
  return names;
});

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
  },
  {
    name: 'segmento',
    label: 'Segmento',
    field: 'segment',
    align: 'center',
    sortable: false,
    style: 'width: 130px',
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
    name: 'avatar',
    label: 'Avatar',
    field: 'avatarType',
    align: 'center',
    sortable: false,
    style: 'width: 70px',
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
    label: 'Ingreso',
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

/**
 * Check if a member's plan name matches an archived plan.
 */
function isLegacyPlan(planName: string | null): boolean {
  if (!planName) return false;
  return archivedPlanNames.value.has(planName);
}

function segmentLabel(segment: string): string {
  return SEGMENT_LABELS[segment as MemberSegment] ?? segment;
}

function segmentColor(segment: string): string {
  return SEGMENT_COLORS[segment as MemberSegment] ?? 'grey';
}

// =========================================================================
// Data loading
// =========================================================================

async function loadBranches() {
  try {
    branches.value = await membersApi.getBranches();
    branchFilterOptions.value = [
      { label: 'Todas', value: null },
      { label: 'Multisucursal', value: 'multi' },
      ...branches.value.map((b) => ({ label: b.name, value: b.id })),
    ];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading branches', { error: message });
  }
}

async function loadPlans() {
  try {
    const plans = await membersApi.getPlans(true); // includeArchived
    allPlans.value = plans.map((p) => ({
      id: p.id,
      name: p.name,
      isArchived: p.isArchived,
      planTier: p.planTier,
    }));

    // Build filter options: current plans first, then archived
    const currentPlans = plans.filter((p) => !p.isArchived);
    const archivedPlans = plans.filter((p) => p.isArchived);

    const options: PlanFilterOption[] = [
      { label: 'Todos', value: null },
      { label: 'Sin plan', value: 0 },
      ...currentPlans.map((p) => ({ label: p.name, value: p.id })),
    ];

    if (archivedPlans.length > 0) {
      options.push({ label: '--- Archivados ---', value: -1, archived: true });
      for (const p of archivedPlans) {
        options.push({ label: `${p.name} (archivado)`, value: p.id, archived: true });
      }
    }

    planFilterOptions.value = options;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading plans', { error: message });
  }
}

async function loadMembers() {
  loading.value = true;
  try {
    const isMultiBranch = filters.branchId === 'multi';
    const result = await membersApi.getMembers({
      search: filters.search || undefined,
      planId: filters.planId ?? undefined,
      branchId: isMultiBranch ? undefined : ((filters.branchId as number) ?? undefined),
      multiBranch: isMultiBranch || undefined,
      level: filters.level ?? undefined,
      isActive: filters.isActive ?? undefined,
      segment: filters.segment ?? undefined,
      avatarType: filters.avatarType ?? undefined,
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

async function onExport() {
  exporting.value = true;
  try {
    const blob = await membersApi.exportMembers({
      search: filters.search || undefined,
      branchId:
        filters.branchId === 'multiBranch'
          ? undefined
          : ((filters.branchId as number | undefined) ?? undefined),
      multiBranch: filters.branchId === 'multiBranch' ? true : undefined,
      level: filters.level || undefined,
      isActive: filters.isActive ?? undefined,
      planId: filters.planId ?? undefined,
      avatarType: filters.avatarType ?? undefined,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().split('T')[0];
    a.download = `alumnos-${today}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    $q.notify({ type: 'positive', message: 'Exportacion completada' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error exporting members', { error: message });
    $q.notify({ type: 'negative', message: 'Error al exportar' });
  } finally {
    exporting.value = false;
  }
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
