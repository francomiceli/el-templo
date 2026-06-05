<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-md">
      <div class="text-h5">Revisión de progresiones</div>
      <q-space />
      <q-chip v-if="total > 0" color="primary" text-color="white" icon="pending_actions">
        {{ total }} pendientes
      </q-chip>
    </div>

    <div class="text-caption text-grey-7 q-mb-md">
      Propuestas automáticas de escalón de progresión, Habilidad (variante paralela) y ruta. Editá
      inline lo que haga falta, aceptá el grupo completo de una ruta, o aceptá / rechazá fila por
      fila. Aceptar fija la progresión como verdad sobre el ejercicio.
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
          <q-badge
            v-if="group.unmatched > 0"
            color="orange"
            class="q-ml-xs"
            :label="`${group.unmatched} sin escalón`"
          />
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
            <div v-else-if="isUnmatched(props.row)" class="text-caption text-orange">
              sin escalón resuelto
            </div>
          </q-td>
        </template>

        <!-- Step (progression rank): select of the route's step tokens when available -->
        <template #body-cell-proposedStep="props">
          <q-td :props="props">
            <q-select
              v-if="stepOptionsFor(props.row).length > 0"
              :model-value="props.row.proposedStep"
              :options="stepOptionsFor(props.row)"
              dense
              outlined
              emit-value
              map-options
              clearable
              placeholder="Sin escalón"
              style="min-width: 180px"
              @update:model-value="(val) => onEditStep(props.row, val)"
            />
            <span v-else class="text-grey-6">— lineal</span>
          </q-td>
        </template>

        <!-- Habilidad: select of the route's variant vocab + free text, nullable -->
        <template #body-cell-proposedHabilidad="props">
          <q-td :props="props">
            <q-select
              :model-value="props.row.proposedHabilidad"
              :options="habilidadOptionsFor(props.row)"
              dense
              outlined
              emit-value
              map-options
              clearable
              new-value-mode="add-unique"
              use-input
              placeholder="—"
              style="min-width: 150px"
              @update:model-value="(val) => onEditHabilidad(props.row, val)"
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
              @update:model-value="(val) => onEditRoute(props.row, val)"
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
import type {
  Proposal,
  ProposalStatus,
  AcceptOverrides,
  RouteProgressionMap,
} from 'src/types/proposal';

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
/** Per-route progression model (steps + Habilidad vocab) — single source of truth. */
const routeMap = ref<RouteProgressionMap>({});

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

const statusLabel = computed(() => {
  const found = statusOptions.find((o) => o.value === filters.status);
  return found ? found.label.toLowerCase() : '';
});

// =========================================================================
// Route-map helpers (per-row step + Habilidad vocab from the backend map)
// =========================================================================

/** The route to look up the map under: the proposed one for a pending row, else current. */
function routeKey(row: Proposal): string {
  const raw = row.routePending ? (row.proposedRoute ?? '') : row.currentRoute;
  return raw.trim().toUpperCase();
}

/** Ordered step-token options for the row's route (empty for linear/excluded/unmapped). */
function stepOptionsFor(row: Proposal): { label: string; value: number }[] {
  const info = routeMap.value[routeKey(row)];
  if (!info || info.strategy !== 'token') return [];
  return info.steps.map((token, i) => ({ label: `${i} · ${token}`, value: i }));
}

/** Habilidad vocab options for the row's route (free typing still allowed). */
function habilidadOptionsFor(row: Proposal): { label: string; value: string }[] {
  const info = routeMap.value[routeKey(row)];
  if (!info) return [];
  return info.habilidades.map((v) => ({ label: v, value: v }));
}

/** A token-strategy row with no resolved step is "unmatched" (needs a profe). */
function isUnmatched(row: Proposal): boolean {
  const info = routeMap.value[routeKey(row)];
  return !!info && info.strategy === 'token' && row.proposedStep === null;
}

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
    name: 'proposedStep',
    label: 'Escalón',
    field: 'proposedStep',
    align: 'left',
    sortable: false,
  },
  {
    name: 'proposedHabilidad',
    label: 'Habilidad',
    field: 'proposedHabilidad',
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
    .map(([route, rows]) => ({
      route,
      rows,
      unmatched: rows.filter((r) => isUnmatched(r)).length,
    }))
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

async function loadRouteMap() {
  try {
    routeMap.value = await proposalsApi.fetchRouteMap();
  } catch {
    // Error already handled by the composable; the screen degrades to free entry.
  }
}

// =========================================================================
// Inline edit — edits mutate the local row; sent as overrides on accept.
// =========================================================================

function onEditStep(row: Proposal, value: number | null) {
  row.proposedStep = value === null || value === undefined ? null : Number(value);
}

function onEditHabilidad(row: Proposal, value: string | null) {
  row.proposedHabilidad = value === '' || value === null ? null : String(value);
}

function onEditRoute(row: Proposal, value: string | null) {
  row.proposedRoute = value === '' || value === null ? null : String(value);
}

/** Build the accept-override body from the (possibly edited) row. */
function overridesFor(row: Proposal): AcceptOverrides {
  const overrides: AcceptOverrides = {
    // Both are nullable — send explicitly so the profe can set OR clear them.
    proposedStep: row.proposedStep,
    proposedHabilidad: row.proposedHabilidad,
  };
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
  loadRouteMap();
  loadProposals();
});
</script>
