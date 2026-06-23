<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row q-mb-md items-center q-gutter-x-md">
      <div class="text-h5">Alumnos</div>
      <!-- Owner-only country selector (D-06) -->
      <div v-if="isOwner" style="min-width: 160px">
        <q-select
          v-model="selectedCountry"
          :options="countryOptions"
          label="Pais"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onCountryChange"
        />
      </div>
      <q-space />
      <div class="row no-wrap q-gutter-x-sm justify-end items-center">
        <q-btn icon="download" color="grey-7" flat round :loading="exporting" @click="onExport">
          <q-tooltip>Exportar a Excel</q-tooltip>
        </q-btn>
        <q-btn
          label="Nuevo en Prueba"
          icon="fact_check"
          color="warning"
          dense
          no-caps
          class="q-px-md"
          @click="showCreateTrialDialog = true"
        >
          <q-tooltip>Soft register para sesión de prueba (4 campos)</q-tooltip>
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

    <!-- Filter bar — Row 1: search + Solo deudores + Solo Leads -->
    <div class="row q-col-gutter-sm q-mb-sm items-end">
      <div class="col-12 col-sm-6 col-md-6">
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
      <div class="col-6 col-sm-3 col-md-3 items-center">
        <q-toggle
          v-model="filters.debtorOnly"
          label="Solo deudores"
          color="negative"
          @update:model-value="onFilterChange"
        />
      </div>
    </div>

    <!-- Filter bar — Row 2: filters -->
    <div class="row q-col-gutter-sm q-mb-md items-end">
      <div class="col-6 col-sm-3 col-md-2">
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
      <div class="col-6 col-sm-3 col-md-2">
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
      <div class="col-6 col-sm-3 col-md-2">
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
      <div class="col-6 col-sm-3 col-md-2">
        <q-select
          v-model="filters.status"
          :options="statusFilterOptions"
          label="Estado"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-6 col-sm-3 col-md-2">
        <q-select
          v-model="filters.segment"
          :options="segmentFilterOptions"
          label="Asistencia"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-6 col-sm-3 col-md-2">
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
    </div>

    <!-- Total debt banner — owner/admin only (financial data), and only when
         Solo deudores is on and there are debts. The backend also withholds
         the aggregate from other roles (defense in depth). -->
    <q-banner
      v-if="canSeeTotalDebt && filters.debtorOnly && totalDebtByCurrency.length > 0"
      class="bg-red-1 text-red-10 q-mb-sm"
      dense
      rounded
    >
      <strong>Deuda total:</strong>
      {{ formattedTotalDebt }}
    </q-banner>

    <!-- QTable -->
    <q-table
      :rows="members"
      :columns="visibleColumns"
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

      <!-- Vencimiento (cuenta regresiva): pill solo en hitos 10/7/5/1/hoy/vencida -->
      <template #body-cell-vencimiento="props">
        <q-td :props="props">
          <q-badge
            v-if="vencBadge(props.row.endDate)"
            :color="vencBadge(props.row.endDate)!.color"
            :label="vencBadge(props.row.endDate)!.label"
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

      <!-- Estado column (Phase 103 R10: 4-state badge from users.status) -->
      <template #body-cell-estado="props">
        <q-td :props="props">
          <q-badge
            :color="getStatusColor(props.row.status)"
            :label="getStatusLabel(props.row.status, props.row.hasUsedTrial)"
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

    <!-- Soft-register dialog for SP (sesión de prueba) — 4-field flow -->
    <TrialMemberFormDialog
      v-model="showCreateTrialDialog"
      :branches="branches"
      @created="onTrialMemberCreated"
    />

    <!-- Assign Plan Dialog: opens after creating a member when admin
         confirms they want to load the membership right away. -->
    <AssignPlanDialog
      v-if="postCreateAssignTarget"
      v-model="showAssignFromCreate"
      :userId="postCreateAssignTarget.id"
      :memberBranchId="postCreateAssignTarget.branchId"
      :memberBranchName="postCreateAssignTarget.branchName"
      :boardingPassUsed="false"
      :memberBranchIsVirtual="postCreateBranchIsVirtual"
      :member="postCreateAssignTarget"
      :branches="branches"
      @assigned="onPostCreateAssigned"
      @update:modelValue="onPostCreateAssignDialog"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useMembersApi } from 'src/composables/useMembersApi';
import { useStatusBadge } from 'src/composables/useStatusBadge';
import { useAuthStore } from 'src/stores/useAuthStore';
import type {
  MemberListItem,
  MemberProfile,
  MemberSegment,
  BranchOption,
  TotalDebtRow,
  UserStatus,
} from 'src/types/member';
import { SEGMENT_LABELS, SEGMENT_COLORS, expiryBadge } from 'src/types/member';
import { todayInTz } from 'src/utils/tz';
import { levelColor } from 'src/constants/levels';
import MemberFormDialog from 'src/components/MemberFormDialog.vue';
import TrialMemberFormDialog from 'src/components/TrialMemberFormDialog.vue';
import AssignPlanDialog from 'src/components/AssignPlanDialog.vue';

const log = createLogger('AlumnosPage');
const $q = useQuasar();
const router = useRouter();
const membersApi = useMembersApi();
const authStore = useAuthStore();
const { getColor: getStatusColor, getLabel: getStatusLabel } = useStatusBadge();

// =========================================================================
// Country selector (owner-only per D-06)
// =========================================================================

const isOwner = computed(() => authStore.user?.role === 'owner');
// "Deuda total" es dato financiero: solo owner/admin. El backend además no
// devuelve el agregado a otros roles (defensa en profundidad).
const canSeeTotalDebt = computed(
  () => authStore.user?.role === 'owner' || authStore.user?.role === 'admin'
);

const countryOptions = [
  { label: 'Argentina', value: 'AR' as const },
  { label: 'España', value: 'ES' as const },
];

const selectedCountry = ref<'AR' | 'ES'>('AR');

async function onCountryChange() {
  filters.branchId = null;
  filters.planId = null;
  tablePagination.value.page = 1;
  await Promise.all([loadBranches(), loadPlans(), loadMembers()]);
}

// =========================================================================
// State
// =========================================================================

const members = ref<MemberListItem[]>([]);
const branches = ref<BranchOption[]>([]);
const loading = ref(false);
const exporting = ref(false);
const showCreateDialog = ref(false);
const showCreateTrialDialog = ref(false);

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
  // Phase 103 R10: replaces previous boolean isActive + leadsOnly toggles.
  // null = "Todos" (no filter); enum values map 1:1 to users.status.
  status: null as UserStatus | null,
  segment: null as MemberSegment | null,
  avatarType: null as string | null,
  debtorOnly: false as boolean,
});

// Phase 101: aggregated total debt grouped by currency, scoped to the same
// filters applied to the member list. Populated on every fetchMembers call.
const totalDebtByCurrency = ref<TotalDebtRow[]>([]);

const formattedTotalDebt = computed(() =>
  totalDebtByCurrency.value.map((t) => `${t.currency} $${t.amount.toLocaleString()}`).join(' · ')
);

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
  { label: 'Kairos', value: 'kairos' },
  { label: 'Alfa', value: 'alfa' },
  { label: 'Delta', value: 'delta' },
  { label: 'Sigma', value: 'sigma' },
  { label: 'Omega', value: 'omega' },
  { label: 'Spartan', value: 'spartan' },
];

// Phase 103 R10 (D-15.2): 5 options matching the 4 user lifecycle states.
const statusFilterOptions: Array<{ label: string; value: UserStatus | null }> = [
  { label: 'Todos', value: null },
  { label: 'Freemium', value: 'freemium' },
  { label: 'En Prueba', value: 'prueba' },
  { label: 'Activos', value: 'activo' },
  { label: 'Inactivos', value: 'inactivo' },
];

const segmentFilterOptions: Array<{ label: string; value: MemberSegment | null }> = [
  { label: 'Todos', value: null },
  { label: 'Óptima', value: 'optima' },
  { label: 'Regular', value: 'regular' },
  { label: 'Alerta', value: 'alerta' },
  { label: 'Ausente', value: 'ausente' },
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
    label: 'Asistencia',
    field: 'segment',
    align: 'center',
    sortable: false,
    style: 'width: 130px',
  },
  {
    name: 'vencimiento',
    label: 'Vencimiento',
    field: 'endDate',
    align: 'center',
    sortable: false,
    style: 'width: 110px',
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
    field: 'status',
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

// Phase 105 Plan 07: per-row Deuda column dropped because backend Plan 05
// removed MemberListItem.debt. The aggregate "Deuda total" banner above the
// table still surfaces outstanding balance by currency. Per-member saldo
// detail will return as a dedicated AlumnoDetailPage section once Phase 108
// adds the financial-history endpoint.
const visibleColumns = computed<QTableProps['columns']>(() => columns);

// =========================================================================
// Greek level display
// =========================================================================

const LEVEL_GREEK_MAP: Record<string, string> = {
  kairos: '\u2609', // \u2609 kairos = tiempo/ciclo, glyph propio
  alfa: '\u03B1', // alpha
  delta: '\u0394', // Delta
  sigma: '\u03A3', // Sigma
  omega: '\u03A9', // Omega
  spartan: '\u03A9', // Omega (same tier)
};

function greekLevel(level: string): string {
  return LEVEL_GREEK_MAP[level.toLowerCase()] ?? level;
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

// Vencimiento countdown pill (10/7/5/1/hoy/vencida) from the active sub end
// date. Day count uses AR "today" — the list spans all branches.
function vencBadge(endDate: string | null) {
  return expiryBadge(endDate, todayInTz('America/Argentina/Buenos_Aires'));
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
    const plans = await membersApi.getPlans(
      true,
      isOwner.value ? { country: selectedCountry.value } : undefined
    ); // includeArchived
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
      // Phase 103 R10: single first-class users.status filter.
      status: filters.status ?? undefined,
      segment: filters.segment ?? undefined,
      avatarType: filters.avatarType ?? undefined,
      debtorOnly: filters.debtorOnly || undefined,
      country: isOwner.value ? selectedCountry.value : undefined,
      page: tablePagination.value.page,
      limit: tablePagination.value.rowsPerPage,
    });
    members.value = result.members;
    tablePagination.value.rowsNumber = result.total;
    totalDebtByCurrency.value = result.totalDebtByCurrency ?? [];
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
      // Phase 103 R10: single first-class users.status filter.
      status: filters.status ?? undefined,
      planId: filters.planId ?? undefined,
      avatarType: filters.avatarType ?? undefined,
      country: isOwner.value ? selectedCountry.value : undefined,
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

// Track when AssignPlanDialog was opened from the post-create flow so we can
// flag "user created without membership" when the admin closes it without
// assigning. We only show this warning in the creation chain — the same
// dialog opened from the member subscription tab stays silent on cancel.
const showAssignFromCreate = ref(false);
const postCreateAssignTarget = ref<MemberProfile | null>(null);
const postCreateAssignmentDone = ref(false);

// Phase 111 REQ-2: derive whether the just-created alumno's branch is
// virtual (e.g. Templo Online). Threaded into AssignPlanDialog to filter
// presencial plans + show the convert-CTA banner. Defaults to false when
// the target is null or branches haven't loaded.
const postCreateBranchIsVirtual = computed(() => {
  if (!postCreateAssignTarget.value) return false;
  const branch = branches.value.find((b) => b.id === postCreateAssignTarget.value!.branchId);
  return branch?.isVirtual === true;
});

function onMemberSaved(created: MemberProfile | null) {
  $q.notify({ type: 'positive', message: 'Alumno guardado correctamente' });
  loadMembers();
  if (!created) return;

  $q.dialog({
    title: '¿Cargar membresía?',
    message: `El alumno ${[created.firstName, created.lastName].filter(Boolean).join(' ') || created.email} fue creado. ¿Querés cargar la membresía ahora?`,
    cancel: { flat: true, label: 'Más tarde' },
    ok: { color: 'primary', label: 'Cargar membresía' },
  }).onOk(() => {
    postCreateAssignTarget.value = created;
    postCreateAssignmentDone.value = false;
    showAssignFromCreate.value = true;
  });
}

function onPostCreateAssigned() {
  postCreateAssignmentDone.value = true;
  loadMembers();
}

function onTrialMemberCreated(_member: MemberProfile) {
  loadMembers();
}

function onPostCreateAssignDialog(open: boolean) {
  if (open) return;
  // Dialog just closed. If the admin didn't actually assign a plan, surface
  // a warning so the orphan-user case (created without sub) doesn't go
  // unnoticed.
  if (!postCreateAssignmentDone.value && postCreateAssignTarget.value) {
    $q.notify({
      type: 'warning',
      message:
        'El alumno fue creado pero no tiene membresía cargada. Podés cargarla más tarde desde su perfil.',
      timeout: 6000,
    });
  }
  postCreateAssignTarget.value = null;
  postCreateAssignmentDone.value = false;
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
