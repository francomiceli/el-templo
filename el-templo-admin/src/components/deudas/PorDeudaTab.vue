<template>
  <div class="por-deuda-tab">
    <!-- Filters row 1: scope + búsqueda + export -->
    <div class="row q-gutter-sm q-mb-sm items-center">
      <q-select
        v-model="filters.branchId"
        :options="branchOptions"
        emit-value
        map-options
        label="Sucursal"
        outlined
        dense
        clearable
        class="col-12 col-sm-3"
      />
      <q-select
        v-if="isOwner"
        v-model="filters.currency"
        :options="CURRENCY_OPTIONS"
        label="Moneda"
        outlined
        dense
        clearable
        class="col-12 col-sm-2"
      />
      <q-input
        v-model="filters.search"
        label="Buscar miembro"
        outlined
        dense
        clearable
        debounce="400"
        class="col-12 col-sm-3"
      />
      <q-space />
      <q-btn
        label="Exportar Excel"
        color="primary"
        icon="file_download"
        :loading="exporting"
        :disable="loading"
        @click="onExport"
      />
    </div>

    <!-- Filters row 2: gestión (brief §4) — estado, promesa, fechas, fantasmas, orden -->
    <div class="row q-gutter-sm q-mb-md items-center">
      <q-select
        v-model="filters.status"
        :options="STATUS_FILTER_OPTIONS"
        emit-value
        map-options
        label="Estado"
        outlined
        dense
        class="col-12 col-sm-2"
      />
      <q-select
        v-model="filters.promise"
        :options="PROMISE_FILTER_OPTIONS"
        emit-value
        map-options
        label="Promesa de pago"
        outlined
        dense
        clearable
        class="col-12 col-sm-2"
      />
      <q-select
        v-model="filters.dateField"
        :options="DATE_FIELD_OPTIONS"
        emit-value
        map-options
        label="Campo fecha"
        outlined
        dense
        class="col-6 col-sm-2"
        style="min-width: 110px"
      />
      <q-input
        v-model="filters.dateFrom"
        type="date"
        label="Desde"
        outlined
        dense
        clearable
        class="col-6 col-sm-2"
      />
      <q-input
        v-model="filters.dateTo"
        type="date"
        label="Hasta"
        outlined
        dense
        clearable
        class="col-6 col-sm-2"
      />
      <q-input
        v-model.number="filters.minDaysSinceAttendance"
        type="number"
        min="1"
        label="Sin asistir > días"
        outlined
        dense
        clearable
        debounce="400"
        class="col-6 col-sm-2"
        style="max-width: 140px"
      />
      <q-select
        v-model="filters.sortBy"
        :options="SORT_OPTIONS"
        emit-value
        map-options
        label="Ordenar por"
        outlined
        dense
        class="col-6 col-sm-2"
        style="min-width: 150px"
      />
      <q-btn
        flat
        dense
        :icon="filters.sortDir === 'desc' ? 'arrow_downward' : 'arrow_upward'"
        @click="filters.sortDir = filters.sortDir === 'desc' ? 'asc' : 'desc'"
      >
        <q-tooltip>{{ sortDirTooltip }}</q-tooltip>
      </q-btn>
    </div>

    <!-- Los dos números honestos (brief §2.4): cobrable vs dada de baja -->
    <div v-if="statusTotalsCurrencies.length > 0" class="row q-gutter-sm q-mb-md">
      <q-card v-for="cur in statusTotalsCurrencies" :key="cur" flat bordered class="col-auto">
        <q-card-section class="q-py-sm">
          <div class="text-caption text-grey-7">Deuda cobrable ({{ cur }})</div>
          <div class="text-h6 text-positive">
            {{ formatPrice(statusTotals.cobrable[cur] ?? 0, cur) }}
          </div>
          <div class="text-caption text-grey-7">
            Incobrable: {{ formatPrice(statusTotals.incobrable[cur] ?? 0, cur) }}
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- Cards: bucket totals (D-05 / D-06) -->
    <template v-if="isOwner && currencyKeys.length > 0">
      <div v-for="(cur, idx) in currencyKeys" :key="cur" :class="idx > 0 ? 'q-mt-md' : ''">
        <div class="text-subtitle1 q-mb-sm">Totales por antigüedad ({{ cur }})</div>
        <div class="row q-gutter-sm q-mb-md">
          <q-card v-for="bucket in BUCKETS" :key="bucket" flat bordered class="col">
            <q-card-section>
              <div class="text-caption text-grey-7">
                {{ BUCKET_LABELS_ES[bucket] }}
              </div>
              <div class="text-h6">
                {{ formatPrice((bucketTotalsByCurrency[cur] ?? emptyBucketTotals())[bucket], cur) }}
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="text-subtitle1 q-mb-sm">Totales por antigüedad</div>
      <div class="row q-gutter-sm q-mb-md">
        <q-card v-for="bucket in BUCKETS" :key="bucket" flat bordered class="col">
          <q-card-section>
            <div class="text-caption text-grey-7">
              {{ BUCKET_LABELS_ES[bucket] }}
            </div>
            <div class="text-h6">
              {{ formatPrice(bucketTotalsFlat[bucket], flatCurrency) }}
            </div>
          </q-card-section>
        </q-card>
      </div>
    </template>

    <!-- Tabla detallada -->
    <q-table
      class="deudas-table"
      :rows="items"
      :columns="columns"
      :row-key="rowKey"
      :loading="loading"
      flat
      bordered
      :pagination="{ rowsPerPage: 0 }"
      hide-pagination
    >
      <!-- Nombre clickeable → perfil del alumno (brief §3). -->
      <template #body-cell-miembro="props">
        <q-td :props="props" class="sticky-miembro" style="width: 170px">
          <router-link
            :to="`/alumnos/${props.row.memberId}`"
            class="text-primary"
            style="text-decoration: none"
          >
            {{ props.row.memberName }}
          </router-link>
        </q-td>
      </template>
      <!-- Motivo (DEUDA-02): short structured reason; período subtitle (DEUDA-03) -->
      <!-- and free-text nota in a tooltip (D-11), never as its own column. -->
      <template #body-cell-motivo="props">
        <q-td :props="props">
          <div class="row items-center no-wrap">
            <span>{{ props.row.reasonLabel }}</span>
            <q-icon
              v-if="props.row.notes"
              name="sticky_note_2"
              size="16px"
              class="q-ml-xs text-grey-6"
            />
          </div>
          <div v-if="props.row.periodStart && props.row.periodEnd" class="text-caption text-grey-6">
            {{ formatPeriod(props.row.periodStart, props.row.periodEnd) }}
          </div>
          <q-tooltip v-if="props.row.notes" anchor="top middle" self="bottom middle">
            {{ props.row.notes }}
          </q-tooltip>
        </q-td>
      </template>
      <template #body-cell-monto="props">
        <q-td :props="props">
          {{ formatPrice(props.row.amount, props.row.currency) }}
        </q-td>
      </template>
      <template #body-cell-bucket="props">
        <q-td :props="props">
          <q-badge :color="bucketColor(props.row.bucket)">
            {{ BUCKET_LABELS_ES[props.row.bucket as DebtBucket] }}
          </q-badge>
        </q-td>
      </template>
      <!-- Última asistencia (brief §2.3): fecha + "hace N días"; null = fantasma. -->
      <template #body-cell-ultimaAsistencia="props">
        <q-td :props="props">
          <template v-if="props.row.lastAttendanceAt">
            <div>{{ formatDate(props.row.lastAttendanceAt) }}</div>
            <div class="text-caption" :class="attendanceAgeClass(props.row.lastAttendanceAt)">
              hace {{ daysSince(props.row.lastAttendanceAt) }} días
            </div>
          </template>
          <span v-else class="text-negative">Nunca</span>
        </q-td>
      </template>
      <!-- Promesa de pago (brief §2.1): editable inline; vencida en rojo. -->
      <template #body-cell-promesa="props">
        <q-td :props="props" class="cursor-pointer">
          <span
            v-if="props.row.promisedPaymentDate"
            :class="isPromiseOverdue(props.row) ? 'text-negative text-weight-medium' : ''"
          >
            {{ formatDate(props.row.promisedPaymentDate) }}
            <q-icon v-if="isPromiseOverdue(props.row)" name="warning" size="14px" />
          </span>
          <span v-else class="text-grey-5">—</span>
          <q-popup-proxy cover transition-show="scale" transition-hide="scale">
            <q-date
              :model-value="props.row.promisedPaymentDate"
              mask="YYYY-MM-DD"
              minimal
              @update:model-value="(v: string | null) => onPromiseChange(props.row, v)"
            >
              <div class="row items-center justify-end q-gutter-sm">
                <q-btn
                  v-if="props.row.promisedPaymentDate"
                  v-close-popup
                  label="Borrar promesa"
                  color="negative"
                  flat
                  dense
                  @click="onPromiseChange(props.row, null)"
                />
                <q-btn v-close-popup label="Cerrar" color="primary" flat dense />
              </div>
            </q-date>
          </q-popup-proxy>
        </q-td>
      </template>
      <!-- Estado (brief §2.4/§3): badge + cambio rápido desde la fila. -->
      <template #body-cell-estado="props">
        <q-td :props="props" class="cursor-pointer">
          <q-badge :color="statusColor(props.row.status)">
            {{ STATUS_LABELS_ES[props.row.status as DebtManagementStatus] }}
            <q-icon name="arrow_drop_down" size="14px" />
          </q-badge>
          <q-menu auto-close>
            <q-list dense style="min-width: 180px">
              <q-item
                v-for="opt in statusChangeOptions(props.row.status)"
                :key="opt.value"
                clickable
                @click="onStatusChange(props.row, opt.value)"
              >
                <q-item-section>{{ opt.label }}</q-item-section>
              </q-item>
            </q-list>
          </q-menu>
        </q-td>
      </template>
      <!-- Observaciones (brief §2.2): campo único, editable inline. -->
      <template #body-cell-observaciones="props">
        <q-td :props="props" class="cursor-pointer" style="width: 230px; max-width: 230px">
          <div class="ellipsis" style="max-width: 200px">
            <span v-if="props.row.managementNotes">{{ props.row.managementNotes }}</span>
            <span v-else class="text-grey-5">
              <q-icon name="edit_note" size="16px" /> Agregar
            </span>
          </div>
          <q-tooltip v-if="props.row.managementNotes" anchor="top middle" self="bottom middle">
            <div style="white-space: pre-line; max-width: 320px">
              {{ props.row.managementNotes }}
            </div>
          </q-tooltip>
          <q-popup-edit
            :model-value="props.row.managementNotes ?? ''"
            buttons
            label-set="Guardar"
            label-cancel="Cancelar"
            @save="(v: string) => onNotesSave(props.row, v)"
          >
            <template #default="scope">
              <q-input
                v-model="scope.value"
                type="textarea"
                autofocus
                dense
                autogrow
                :maxlength="2000"
                hint="Una línea por gestión (fecha + qué pasó)"
              />
            </template>
          </q-popup-edit>
        </q-td>
      </template>
      <template #body-cell-fechaRegistro="props">
        <q-td :props="props">
          {{ formatDate(props.row.registeredAt) }}
        </q-td>
      </template>
      <template #body-cell-fechaDevengo="props">
        <q-td :props="props">
          {{ formatDate(props.row.effectiveDate) }}
        </q-td>
      </template>
      <template #no-data>
        <div class="full-width row q-py-md justify-center text-grey-6">
          No hay deudas pendientes
        </div>
      </template>
    </q-table>

    <div v-if="hasMore" class="row justify-center q-mt-md">
      <q-btn label="Cargar más" color="primary" flat :loading="loading" @click="loadMore" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import { formatPrice } from 'src/utils/format-price';
import { formatDate } from 'src/utils/format-date';
import { createLogger } from 'src/utils/logger';
import type {
  DebtBucket,
  DebtManagementStatus,
  DebtPromiseFilter,
  DebtSortBy,
  OutstandingBalanceRow,
  BucketTotals,
  OutstandingBalancesFilters,
  OutstandingBalancesResult,
} from 'src/types/transaction';

interface BranchOption {
  label: string;
  value: number | undefined;
}

interface Props {
  branchOptions: BranchOption[];
  displayCurrency: 'ARS' | 'EUR';
  countryScope: 'AR' | 'ES' | undefined;
  isOwner: boolean;
}

const props = defineProps<Props>();

const $q = useQuasar();
const log = createLogger('PorDeudaTab');
const api = useTransactionsApi();

// Internal naming (D-01): aging / outstanding-balances. UI labels always
// in Spanish — the constants below are what the user actually sees.
const BUCKETS: DebtBucket[] = ['0-5', '6-10', '11-15', '15+'];
const BUCKET_LABELS_ES: Record<DebtBucket, string> = {
  '0-5': 'Hasta 5 días',
  '6-10': '6-10 días',
  '11-15': '11-15 días',
  '15+': '15+ días',
};
const STATUS_LABELS_ES: Record<DebtManagementStatus, string> = {
  activa: 'Activa',
  cobrada: 'Cobrada',
  incobrable: 'Incobrable',
};
const CURRENCY_OPTIONS = ['ARS', 'EUR'];
const PAGE_SIZE = 50;

const STATUS_FILTER_OPTIONS = [
  { label: 'Activas', value: 'activa' },
  { label: 'Cobradas', value: 'cobrada' },
  { label: 'Incobrables', value: 'incobrable' },
];
const PROMISE_FILTER_OPTIONS = [
  { label: 'Con promesa', value: 'con' },
  { label: 'Sin promesa', value: 'sin' },
  { label: 'Promesa vencida', value: 'vencida' },
];
const DATE_FIELD_OPTIONS = [
  { label: 'Registro', value: 'registered' },
  { label: 'Devengo', value: 'accrued' },
];
const SORT_OPTIONS = [
  { label: 'Antigüedad', value: 'age' },
  { label: 'Monto', value: 'amount' },
  { label: 'Última asistencia', value: 'lastAttendance' },
];

const filters = reactive<{
  branchId: number | null;
  currency: string | null;
  search: string | null;
  status: DebtManagementStatus;
  promise: DebtPromiseFilter | null;
  dateField: 'registered' | 'accrued';
  dateFrom: string | null;
  dateTo: string | null;
  minDaysSinceAttendance: number | null;
  sortBy: DebtSortBy;
  sortDir: 'asc' | 'desc';
}>({
  branchId: null,
  currency: null,
  search: '',
  // Default de la vista = Activas (brief §4.5): la cola de trabajo diaria.
  status: 'activa',
  promise: null,
  dateField: 'registered',
  dateFrom: null,
  dateTo: null,
  minDaysSinceAttendance: null,
  sortBy: 'age',
  sortDir: 'desc',
});

const items = ref<OutstandingBalanceRow[]>([]);
const total = ref(0);
const currentPage = ref(1);
const loading = ref(false);
const exporting = ref(false);
const bucketTotalsFlat = ref<BucketTotals>({
  '0-5': 0,
  '6-10': 0,
  '11-15': 0,
  '15+': 0,
});
const bucketTotalsByCurrency = ref<Record<string, BucketTotals>>({});
const currencyKeys = computed(() => Object.keys(bucketTotalsByCurrency.value).sort());
const statusTotals = ref<OutstandingBalancesResult['statusTotals']>({
  cobrable: {},
  incobrable: {},
});
const statusTotalsCurrencies = computed(() =>
  [
    ...new Set([
      ...Object.keys(statusTotals.value.cobrable),
      ...Object.keys(statusTotals.value.incobrable),
    ]),
  ].sort()
);

// WR-06: for non-owner the country selector is hidden and displayCurrency is
// hardcoded to 'ARS', but the backend returns the flat bucketTotals in THAT
// user's country currency (EUR for gestión ES). Derive the display currency
// from the data (all non-owner rows share one currency) so España no ve euros
// formateados como pesos. Falls back to displayCurrency when there are no rows.
const flatCurrency = computed<string>(() => items.value[0]?.currency ?? props.displayCurrency);

const hasMore = computed(() => items.value.length < total.value);

const sortDirTooltip = computed(() => {
  if (filters.sortBy === 'age') {
    return filters.sortDir === 'desc' ? 'Más vieja primero' : 'Más reciente primero';
  }
  if (filters.sortBy === 'amount') {
    return filters.sortDir === 'desc' ? 'Mayor monto primero' : 'Menor monto primero';
  }
  return filters.sortDir === 'asc' ? 'Más abandonado primero' : 'Asistencia más reciente primero';
});

// Orden: las 6 columnas principales primero (visibles de entrada, con ancho
// acotado para que entren todas al abrir), y el resto accesible hacia la derecha
// con el scroll horizontal de la tabla. Ya no hay columnas fijadas (sticky).
const columns = [
  {
    name: 'miembro',
    label: 'Miembro',
    field: 'memberName',
    align: 'left' as const,
    sortable: false,
    headerStyle: 'width: 170px',
    // Fija a la izquierda: el nombre queda visible al scrollear horizontal.
    headerClasses: 'sticky-miembro',
  },
  {
    name: 'monto',
    label: 'Monto',
    field: 'amount',
    align: 'right' as const,
    sortable: false,
    headerStyle: 'width: 110px',
  },
  {
    name: 'antiguedad',
    label: 'Antigüedad (días)',
    field: 'ageInDays',
    align: 'right' as const,
    sortable: false,
    style: 'width: 95px',
    headerStyle: 'width: 95px',
  },
  {
    name: 'promesa',
    label: 'Promesa de pago',
    field: 'promisedPaymentDate',
    align: 'left' as const,
    sortable: false,
    headerStyle: 'width: 140px',
  },
  {
    name: 'estado',
    label: 'Estado',
    field: 'status',
    align: 'center' as const,
    sortable: false,
    headerStyle: 'width: 120px',
  },
  {
    name: 'observaciones',
    label: 'Observaciones',
    field: 'managementNotes',
    align: 'left' as const,
    sortable: false,
    headerStyle: 'width: 230px',
  },
  // ---- Columnas secundarias: a la derecha, se acceden con el scroll horizontal ----
  {
    name: 'telefono',
    label: 'Teléfono',
    field: (r: OutstandingBalanceRow) => r.memberPhone ?? '—',
    align: 'left' as const,
    sortable: false,
  },
  {
    name: 'motivo',
    label: 'Motivo',
    field: 'reasonLabel',
    align: 'left' as const,
    sortable: false,
  },
  {
    name: 'concepto',
    label: 'Plan/Concepto',
    field: 'conceptLabel',
    align: 'left' as const,
    sortable: false,
  },
  {
    name: 'sucursal',
    label: 'Sucursal',
    field: (r: OutstandingBalanceRow) => r.branchName ?? '—',
    align: 'left' as const,
    sortable: false,
  },
  {
    name: 'bucket',
    label: 'Antigüedad',
    field: 'bucket',
    align: 'center' as const,
    sortable: false,
  },
  {
    name: 'ultimaAsistencia',
    label: 'Última asistencia',
    field: 'lastAttendanceAt',
    align: 'left' as const,
    sortable: false,
  },
  {
    name: 'fechaRegistro',
    label: 'Fecha de registro',
    field: 'registeredAt',
    align: 'center' as const,
    sortable: false,
  },
  {
    name: 'fechaDevengo',
    label: 'Fecha devengo',
    field: 'effectiveDate',
    align: 'center' as const,
    sortable: false,
  },
  {
    name: 'moneda',
    label: 'Moneda',
    field: 'currency',
    align: 'center' as const,
    sortable: false,
  },
];

function bucketColor(b: DebtBucket): string {
  if (b === '0-5') return 'positive';
  if (b === '6-10') return 'warning';
  if (b === '11-15') return 'orange';
  return 'negative';
}

function statusColor(s: DebtManagementStatus): string {
  if (s === 'activa') return 'primary';
  if (s === 'cobrada') return 'positive';
  return 'grey-7';
}

function emptyBucketTotals(): BucketTotals {
  return { '0-5': 0, '6-10': 0, '11-15': 0, '15+': 0 };
}

// Period (DEUDA-03) as a dd/mm–dd/mm range under the motivo. Inputs are ISO
// YYYY-MM-DD; render locale-free short day/month to keep the cell compact.
function formatPeriod(start: string, end: string): string {
  return `${toDDMM(start)}–${toDDMM(end)}`;
}

function toDDMM(iso: string): string {
  const [, month, day] = iso.split('-');
  return day !== undefined && month !== undefined ? `${day}/${month}` : iso;
}

function rowKey(r: OutstandingBalanceRow): string {
  return `${r.targetKind}:${r.targetId}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysSince(iso: string): number {
  const then = new Date(iso + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24)));
}

function attendanceAgeClass(iso: string): string {
  const d = daysSince(iso);
  if (d > 30) return 'text-negative';
  if (d > 14) return 'text-warning';
  return 'text-grey-6';
}

// Promesa vencida (brief §2.1): fecha anterior a hoy y estado ≠ cobrada.
function isPromiseOverdue(row: OutstandingBalanceRow): boolean {
  return (
    row.promisedPaymentDate !== null &&
    row.promisedPaymentDate < todayISO() &&
    row.status !== 'cobrada'
  );
}

function statusChangeOptions(
  current: DebtManagementStatus
): Array<{ label: string; value: DebtManagementStatus }> {
  const all: Array<{ label: string; value: DebtManagementStatus }> = [
    { label: 'Marcar activa', value: 'activa' },
    { label: 'Marcar cobrada', value: 'cobrada' },
    { label: 'Marcar incobrable', value: 'incobrable' },
  ];
  return all.filter((o) => o.value !== current);
}

function currentFilters(): OutstandingBalancesFilters {
  return {
    branchId: filters.branchId ?? undefined,
    country: props.countryScope,
    currency: filters.currency ?? undefined,
    search: filters.search?.trim() ? filters.search.trim() : undefined,
    status: filters.status,
    promise: filters.promise ?? undefined,
    ...(filters.dateField === 'registered'
      ? {
          registeredFrom: filters.dateFrom ?? undefined,
          registeredTo: filters.dateTo ?? undefined,
        }
      : {
          accruedFrom: filters.dateFrom ?? undefined,
          accruedTo: filters.dateTo ?? undefined,
        }),
    minDaysSinceAttendance:
      filters.minDaysSinceAttendance !== null && filters.minDaysSinceAttendance > 0
        ? filters.minDaysSinceAttendance
        : undefined,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
  };
}

// WR-07: request token guards against out-of-order responses. A filter change
// fires load(true) while a "Cargar más" load(false) may still be in flight; if
// the older response resolves last, items.value.push(...) would mix pages from
// different filters or duplicate rows (row-key collision). Only the latest
// request is allowed to mutate state.
let requestSeq = 0;

async function load(reset = true): Promise<void> {
  const seq = ++requestSeq;
  loading.value = true;
  try {
    const page = reset ? 1 : currentPage.value + 1;
    const res: OutstandingBalancesResult = await api.getOutstandingBalances({
      ...currentFilters(),
      page,
      limit: PAGE_SIZE,
    });
    if (seq !== requestSeq) return; // stale response — a newer load() superseded it
    if (reset) {
      items.value = res.rows;
    } else {
      items.value.push(...res.rows);
    }
    currentPage.value = res.page;
    total.value = res.total;
    statusTotals.value = res.statusTotals;

    const bt = res.bucketTotals;
    // Discriminator: the flat shape is keyed by bucket strings ('0-5' …);
    // the per-currency shape is keyed by currency codes ('ARS', 'EUR' …).
    const looksFlat = Object.prototype.hasOwnProperty.call(bt, '0-5');
    if (looksFlat) {
      bucketTotalsFlat.value = bt as BucketTotals;
      bucketTotalsByCurrency.value = {};
    } else {
      bucketTotalsByCurrency.value = bt as Record<string, BucketTotals>;
      bucketTotalsFlat.value = emptyBucketTotals();
    }
  } catch (err: unknown) {
    if (seq !== requestSeq) return; // stale error — a newer load() superseded it
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Failed to load Deudas report', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

function loadMore(): Promise<void> {
  return load(false);
}

// ─── Gestión inline (brief §3) ──────────────────────────────────────────────

async function onStatusChange(
  row: OutstandingBalanceRow,
  status: DebtManagementStatus
): Promise<void> {
  try {
    await api.updateDebtManagement(row.balanceId, { status });
    $q.notify({
      type: 'positive',
      message: `Deuda de ${row.memberName} marcada como ${STATUS_LABELS_ES[status].toLowerCase()}`,
    });
    // El cambio de estado saca a la fila del filtro actual (default Activas) y
    // mueve los totales cobrable/incobrable → recargar el listado completo.
    void load(true);
  } catch {
    // updateDebtManagement ya seteó api.error; notificar y no tocar la fila.
    $q.notify({ type: 'negative', message: api.error.value ?? 'Error actualizando el estado' });
  }
}

async function onPromiseChange(
  row: OutstandingBalanceRow,
  promisedPaymentDate: string | null
): Promise<void> {
  try {
    const view = await api.updateDebtManagement(row.balanceId, { promisedPaymentDate });
    row.promisedPaymentDate = view.promisedPaymentDate;
    $q.notify({
      type: 'positive',
      message: promisedPaymentDate === null ? 'Promesa borrada' : 'Promesa de pago guardada',
    });
  } catch {
    $q.notify({ type: 'negative', message: api.error.value ?? 'Error guardando la promesa' });
  }
}

async function onNotesSave(row: OutstandingBalanceRow, value: string): Promise<void> {
  const notes = value.trim().length > 0 ? value.trim() : null;
  try {
    const view = await api.updateDebtManagement(row.balanceId, { notes });
    row.managementNotes = view.notes;
    $q.notify({ type: 'positive', message: 'Observaciones guardadas' });
  } catch {
    $q.notify({
      type: 'negative',
      message: api.error.value ?? 'Error guardando las observaciones',
    });
  }
}

watch(
  () => [
    filters.branchId,
    filters.currency,
    filters.search,
    filters.status,
    filters.promise,
    filters.dateField,
    filters.dateFrom,
    filters.dateTo,
    filters.minDaysSinceAttendance,
    filters.sortBy,
    filters.sortDir,
  ],
  () => {
    void load(true);
  }
);

watch(
  () => props.countryScope,
  () => {
    void load(true);
  }
);

onMounted(() => {
  void load(true);
});

// Server-side Excel export (Plan 109-04 redirection — backend renders
// the .xlsx, admin only triggers download via Blob → object URL).
async function onExport(): Promise<void> {
  exporting.value = true;
  try {
    const blob = await api.exportOutstandingBalancesToExcel(currentFilters());
    const today = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `deudas-${today}.xlsx`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Deudas export failed', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    exporting.value = false;
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
</script>

<style scoped>
/*
 * La tabla tiene alto propio (max-height) para que el scroll horizontal y el
 * vertical vivan DENTRO del recuadro blanco: ya no hace falta bajar al pie de la
 * página para alcanzar la barra horizontal. El header queda pegado arriba del
 * scroll (sticky) usando el scroller nativo de q-table (.q-table__middle).
 */
.por-deuda-tab :deep(.deudas-table) {
  max-height: 600px;
}

.por-deuda-tab :deep(.deudas-table thead tr th) {
  position: sticky;
  z-index: 2;
  background-color: #fff;
}

.por-deuda-tab :deep(.deudas-table thead tr:first-child th) {
  top: 0;
}

/*
 * Columna Miembro fija a la izquierda: queda visible al scrollear horizontal.
 * En el cuerpo va por encima de las celdas normales; en el header, por encima
 * también de las demás celdas sticky-top (para que la esquina superior izq. mande).
 */
.por-deuda-tab :deep(.deudas-table .sticky-miembro) {
  position: sticky;
  left: 0;
  z-index: 1;
  background-color: #fff;
  /* Sombra al borde derecho: indica que hay más columnas debajo del scroll. */
  box-shadow: 6px 0 8px -8px rgba(0, 0, 0, 0.3);
}

.por-deuda-tab :deep(.deudas-table thead .sticky-miembro) {
  z-index: 3;
}

.por-deuda-tab :deep(.deudas-table tbody tr:hover .sticky-miembro) {
  background-color: #f5f5f5;
}
</style>
