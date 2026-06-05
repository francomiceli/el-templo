<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-md">
      <div class="text-h5">Revisión de dimensiones</div>
      <q-space />
      <q-chip v-if="total > 0" color="primary" text-color="white" icon="pending_actions">
        {{ total }} pendientes
      </q-chip>
    </div>

    <div class="text-caption text-grey-7 q-mb-md">
      Propuestas automáticas de sub-familia, palanca y ruta. Editá inline lo que haga falta, aceptá
      el grupo completo de una ruta, o aceptá / rechazá fila por fila. Aceptar fija la dimensión
      como verdad sobre el ejercicio.
    </div>

    <!-- Filter bar -->
    <div class="row q-col-gutter-sm q-mb-md items-end">
      <div class="col-6 col-sm-3">
        <q-select
          v-model="filters.route"
          :options="routeOptions"
          label="Ruta"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-6 col-sm-3">
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
    </div>

    <!-- Empty state -->
    <q-banner
      v-if="!loading && proposals.length === 0"
      class="bg-grey-2 text-grey-8 q-mb-md"
      rounded
    >
      <template #avatar>
        <q-icon name="check_circle" color="positive" />
      </template>
      No hay propuestas {{ statusLabel }} para revisar
      {{ filters.route ? `en la ruta ${filters.route}` : '' }}.
    </q-banner>

    <!-- Grouped tables (one per route) -->
    <div v-for="group in groupedProposals" :key="group.route" class="q-mb-lg">
      <div class="row items-center q-mb-sm">
        <div class="text-subtitle1 text-weight-medium">
          Ruta {{ group.route || '(sin ruta)' }}
          <q-badge color="grey-6" class="q-ml-sm">{{ group.rows.length }}</q-badge>
        </div>
        <q-space />
        <q-btn
          v-if="filters.status === 'pending'"
          label="Aceptar grupo"
          icon="done_all"
          color="positive"
          dense
          unelevated
          :loading="bulkBusyRoute === group.route"
          @click="onAcceptGroup(group)"
        />
      </div>

      <q-table
        :rows="group.rows"
        :columns="columns"
        row-key="id"
        :loading="loading"
        hide-pagination
        :pagination="{ rowsPerPage: 0 }"
        flat
        bordered
      >
        <!-- Exercise name (read-only) -->
        <template #body-cell-exerciseName="props">
          <q-td :props="props">
            <div class="text-weight-medium">{{ props.row.exerciseName }}</div>
            <div v-if="props.row.routePending" class="text-caption text-orange">ruta pendiente</div>
          </q-td>
        </template>

        <!-- Sub-family: click to edit (free text) -->
        <template #body-cell-proposedSubfamily="props">
          <q-td :props="props">
            <q-input
              :model-value="props.row.proposedSubfamily"
              dense
              outlined
              placeholder="Sin asignar"
              style="min-width: 160px"
              @update:model-value="(val) => onEditField(props.row, 'proposedSubfamily', val)"
            />
          </q-td>
        </template>

        <!-- Leverage: inline select (nullable, clearable) -->
        <template #body-cell-proposedLeverage="props">
          <q-td :props="props">
            <q-select
              :model-value="props.row.proposedLeverage"
              :options="leverageOptions"
              dense
              outlined
              emit-value
              map-options
              clearable
              new-value-mode="add-unique"
              use-input
              placeholder="—"
              style="min-width: 130px"
              @update:model-value="(val) => onEditField(props.row, 'proposedLeverage', val)"
            />
          </q-td>
        </template>

        <!-- Route: inline select (only meaningful for route_pending) -->
        <template #body-cell-proposedRoute="props">
          <q-td :props="props">
            <q-select
              v-if="props.row.routePending"
              :model-value="props.row.proposedRoute"
              :options="routeEditOptions"
              dense
              outlined
              emit-value
              map-options
              clearable
              style="min-width: 110px"
              color="warning"
              @update:model-value="(val) => onEditField(props.row, 'proposedRoute', val)"
            />
            <span v-else class="text-grey-6">{{ props.row.currentRoute }}</span>
          </q-td>
        </template>

        <!-- Actions -->
        <template #body-cell-actions="props">
          <q-td :props="props">
            <div class="row no-wrap q-gutter-xs justify-center">
              <q-btn
                flat
                dense
                icon="check"
                color="positive"
                :loading="rowBusyId === props.row.id"
                @click="onAccept(props.row)"
              >
                <q-tooltip>Aceptar (con ediciones)</q-tooltip>
              </q-btn>
              <q-btn
                flat
                dense
                icon="close"
                color="negative"
                :loading="rowBusyId === props.row.id"
                @click="onReject(props.row)"
              >
                <q-tooltip>Rechazar</q-tooltip>
              </q-btn>
            </div>
          </q-td>
        </template>
      </q-table>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { useProposalsApi } from 'src/composables/useProposalsApi';
import type { Proposal, ProposalStatus, AcceptOverrides } from 'src/types/proposal';

const $q = useQuasar();
const proposalsApi = useProposalsApi();
const { loading } = proposalsApi;

// =========================================================================
// State
// =========================================================================

const proposals = ref<Proposal[]>([]);
const total = ref(0);
const rowBusyId = ref<number | null>(null);
const bulkBusyRoute = ref<string | null>(null);

const filters = reactive<{ route: string; status: ProposalStatus }>({
  route: '',
  status: 'pending',
});

// =========================================================================
// Options
// =========================================================================

// Route codes mirror ExercisesPage.vue's createRouteOptions.
const ROUTE_CODES = [
  'PL',
  'FL',
  'HT',
  'HS',
  'HSPU',
  'MU',
  'TTB',
  'OAP',
  'OAPU',
  'OAR',
  'PLPU',
  'PIKE',
  'SS',
  'SU',
  'PS',
  'DS',
  'QC',
  'BL',
  'AF',
  'NC',
  'FLR',
  'PHS',
  'L',
  'HR',
  'HD/ID',
  'MN/RP',
  'BRIDGE',
  'SPAGAT',
  'REVERSE HYPER',
  'SIDE PCK',
  'games',
];

const routeOptions = [
  { label: 'Todas', value: '' },
  ...ROUTE_CODES.map((v) => ({ label: v, value: v })),
];

const routeEditOptions = ROUTE_CODES.map((v) => ({ label: v, value: v }));

const statusOptions: { label: string; value: ProposalStatus }[] = [
  { label: 'Pendientes', value: 'pending' },
  { label: 'Aceptadas', value: 'accepted' },
  { label: 'Rechazadas', value: 'rejected' },
];

// Leverage vocab (D-03 — keyword-matched, nullable, per-family). Free typing
// is allowed via new-value-mode for families with other vocabularies.
const leverageOptions = ['tuck', 'adv tuck', 'straddle', 'half', 'full'].map((v) => ({
  label: v,
  value: v,
}));

const statusLabel = computed(() => {
  const found = statusOptions.find((o) => o.value === filters.status);
  return found ? found.label.toLowerCase() : '';
});

// =========================================================================
// Columns
// =========================================================================

const columns: QTableProps['columns'] = [
  {
    name: 'exerciseName',
    label: 'Ejercicio',
    field: 'exerciseName',
    align: 'left',
    sortable: false,
  },
  {
    name: 'proposedSubfamily',
    label: 'Sub-familia',
    field: 'proposedSubfamily',
    align: 'left',
    sortable: false,
  },
  {
    name: 'proposedLeverage',
    label: 'Palanca',
    field: 'proposedLeverage',
    align: 'left',
    sortable: false,
  },
  {
    name: 'proposedRoute',
    label: 'Ruta',
    field: 'proposedRoute',
    align: 'left',
    sortable: false,
  },
  {
    name: 'actions',
    label: 'Acciones',
    field: 'id',
    align: 'center',
    sortable: false,
    style: 'width: 110px',
  },
];

// =========================================================================
// Grouping (by the exercise's real current route — D-07)
// =========================================================================

const groupedProposals = computed(() => {
  const groups = new Map<string, Proposal[]>();
  for (const row of proposals.value) {
    const key = row.currentRoute ?? '';
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(row);
    } else {
      groups.set(key, [row]);
    }
  }
  return Array.from(groups.entries())
    .map(([route, rows]) => ({ route, rows }))
    .sort((a, b) => a.route.localeCompare(b.route));
});

// =========================================================================
// Data loading
// =========================================================================

async function loadProposals() {
  try {
    const result = await proposalsApi.fetchProposals({
      route: filters.route || undefined,
      status: filters.status,
    });
    proposals.value = result.proposals;
    total.value = result.total;
  } catch {
    // Error already handled by the composable.
  }
}

// =========================================================================
// Inline edit — edits mutate the local row; sent as overrides on accept.
// =========================================================================

function onEditField(
  row: Proposal,
  field: 'proposedSubfamily' | 'proposedLeverage' | 'proposedRoute',
  value: string | number | null
) {
  const normalized = value === '' || value === null ? null : String(value);
  row[field] = normalized;
}

/** Build the accept-override body from the (possibly edited) row. */
function overridesFor(row: Proposal): AcceptOverrides {
  const overrides: AcceptOverrides = {};
  if (row.proposedSubfamily) overrides.proposedSubfamily = row.proposedSubfamily;
  // leverage is nullable — send explicit null so the profe can clear it.
  overrides.proposedLeverage = row.proposedLeverage;
  if (row.routePending && row.proposedRoute) overrides.proposedRoute = row.proposedRoute;
  return overrides;
}

// =========================================================================
// Actions
// =========================================================================

async function onAccept(row: Proposal) {
  rowBusyId.value = row.id;
  try {
    await proposalsApi.acceptProposal(row.id, overridesFor(row));
    $q.notify({ type: 'positive', message: `Propuesta aceptada: ${row.exerciseName}` });
    await loadProposals();
  } catch {
    // Error handled by composable.
  } finally {
    rowBusyId.value = null;
  }
}

async function onReject(row: Proposal) {
  rowBusyId.value = row.id;
  try {
    await proposalsApi.rejectProposal(row.id);
    $q.notify({ type: 'info', message: `Propuesta rechazada: ${row.exerciseName}` });
    await loadProposals();
  } catch {
    // Error handled by composable.
  } finally {
    rowBusyId.value = null;
  }
}

async function onAcceptGroup(group: { route: string; rows: Proposal[] }) {
  bulkBusyRoute.value = group.route;
  try {
    const ids = group.rows.map((r) => r.id);
    // Bulk-accept uses the proposed values as-is (no per-row override — overrides
    // are for individual accept, per the plan).
    const result = await proposalsApi.bulkAccept(ids);
    $q.notify({
      type: 'positive',
      message: `${result.acceptedCount} propuestas aceptadas (ruta ${group.route || 'sin ruta'})`,
    });
    await loadProposals();
  } catch {
    // Error handled by composable.
  } finally {
    bulkBusyRoute.value = null;
  }
}

function onFilterChange() {
  loadProposals();
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadProposals();
});
</script>
