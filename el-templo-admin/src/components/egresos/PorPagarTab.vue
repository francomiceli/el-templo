<template>
  <div class="q-pa-md">
    <!-- Total pendiente a la vista (por moneda: nunca se mezclan) -->
    <div class="row items-center q-mb-md q-gutter-x-md">
      <div class="text-subtitle1">
        <span class="text-grey-7">Total pendiente</span>
        <span v-if="loadingTotals && pendingTotals === null" class="q-ml-sm text-grey-6">…</span>
        <template v-else-if="pendingTotals !== null && pendingTotals.length > 0">
          <span
            v-for="t in pendingTotals"
            :key="t.currency"
            class="q-ml-sm text-weight-bold text-deep-orange"
          >
            {{ formatPrice(t.total, t.currency) }}
          </span>
          <span v-if="totalsTruncated" class="q-ml-sm text-caption text-grey-7">
            (al menos: son muchos gastos, se suman los primeros {{ TOTALS_MAX_ROWS }})
          </span>
        </template>
        <span v-else-if="pendingTotals !== null" class="q-ml-sm text-weight-bold">
          {{ formatPrice(0, options?.countryCurrency ?? 'ARS') }}
        </span>
      </div>
      <div v-if="pagination.rowsNumber > 0" class="text-caption text-grey-7">
        {{ pagination.rowsNumber }} {{ pagination.rowsNumber === 1 ? 'gasto' : 'gastos' }}
      </div>
    </div>

    <!-- Filtros -->
    <div class="row q-col-gutter-sm q-mb-md items-end">
      <div class="col-6 col-sm-3">
        <q-select
          v-model="filters.month"
          :options="monthFilterOptions"
          label="Mes de imputación"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-6 col-sm-3">
        <q-select
          v-model="filters.destination"
          :options="destinationFilterOptions"
          label="Destino"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-6 col-sm-3">
        <q-select
          v-model="filters.costCenterId"
          :options="costCenterFilterOptions"
          label="Rubro"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-6 col-sm-3">
        <q-input
          v-model="filters.q"
          label="Buscar por concepto o beneficiario"
          dense
          outlined
          clearable
          debounce="300"
          @update:model-value="onFilterChange"
        >
          <template #prepend><q-icon name="search" /></template>
        </q-input>
      </div>
    </div>

    <q-table
      :rows="rows"
      :columns="columns"
      row-key="id"
      flat
      bordered
      :loading="loading"
      :pagination="pagination"
      :rows-per-page-options="[20, 50, 100]"
      @request="onTableRequest"
    >
      <template #no-data>
        <div class="full-width text-center q-pa-lg text-grey-6">No hay gastos por pagar.</div>
      </template>

      <template #body="slotProps">
        <q-tr
          :props="slotProps"
          class="cursor-pointer"
          @click="emit('open-detail', slotProps.row.id)"
        >
          <q-td key="mes" :props="slotProps">{{ monthLabel(slotProps.row.imputationMonth) }}</q-td>

          <!-- Concepto + beneficiario -->
          <q-td key="concepto" :props="slotProps">
            <div class="text-weight-medium">{{ slotProps.row.concept }}</div>
            <div v-if="slotProps.row.beneficiary" class="text-caption text-grey-7">
              {{ slotProps.row.beneficiary }}
            </div>
          </q-td>

          <q-td key="rubro" :props="slotProps">{{ slotProps.row.costCenterName }}</q-td>

          <!-- Importe, pagado y pendiente: en la moneda del gasto -->
          <q-td key="importe" :props="slotProps">
            {{ formatPrice(slotProps.row.amount, slotProps.row.currency) }}
            <q-badge
              v-if="slotProps.row.amountStatus === 'estimado'"
              color="amber-8"
              :label="AMOUNT_STATUS_LABELS.estimado"
              class="q-ml-xs"
            />
          </q-td>
          <q-td key="pagado" :props="slotProps">
            {{ formatPrice(slotProps.row.paid, slotProps.row.currency) }}
          </q-td>
          <q-td key="pendiente" :props="slotProps" class="text-weight-bold">
            {{ formatPrice(slotProps.row.pending, slotProps.row.currency) }}
          </q-td>

          <!-- Estado -->
          <q-td key="estado" :props="slotProps">
            <q-badge
              :color="EXPENSE_STATUS_META[slotProps.row.status as ExpensePaymentStatus].color"
              :label="EXPENSE_STATUS_META[slotProps.row.status as ExpensePaymentStatus].label"
            />
            <q-icon
              v-if="slotProps.row.incomplete"
              name="warning"
              color="deep-orange"
              size="sm"
              class="q-ml-xs"
            >
              <q-tooltip>Faltan datos: estimado, sin comprobante o sin tipo de cambio</q-tooltip>
            </q-icon>
          </q-td>

          <!-- Acción -->
          <q-td key="acciones" :props="slotProps" auto-width>
            <q-btn
              unelevated
              dense
              no-caps
              color="primary"
              icon="payments"
              label="Registrar pago"
              :disable="!options || options.country !== selectedCountry"
              @click.stop="openPay(slotProps.row)"
            />
          </q-td>
        </q-tr>
      </template>
    </q-table>

    <RegistrarPagoDialog
      v-if="options && options.country === selectedCountry && payingRecord"
      v-model="showPay"
      :country="selectedCountry"
      :options="options"
      :record="payingRecord"
      @paid="onPaid"
    />
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { useQuasar, type QTableColumn } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { formatPrice } from 'src/utils/format-price';
import { useExpensesApi, type ExpenseListParams } from 'src/composables/useExpensesApi';
import {
  AMOUNT_STATUS_LABELS,
  EXPENSE_STATUS_META,
  monthLabel,
  shiftMonth,
  sumPendingByCurrency,
} from 'src/utils/expenses';
import RegistrarPagoDialog from 'src/components/egresos/RegistrarPagoDialog.vue';
import type {
  ExpenseCountry,
  ExpenseFormOptions,
  ExpensePaymentStatus,
  ExpenseRecordDetail,
  ExpenseRecordListItem,
} from 'src/types/expense';

/**
 * Pestaña Por pagar de Egresos (DI-17): gastos con plata pendiente (pendientes y
 * parciales, filtro `por_pagar` de la API: lo más viejo primero) y registro de
 * pagos desde cada uno.
 *
 * - `selectedCountry` viaja siempre a la API (solo el owner lo elige).
 * - `isOwner` queda declarado como en las demás pestañas (hoy no cambia nada acá).
 * - `options`: las opciones del formulario de Egresos, que carga `EgresosHub` una
 *   sola vez por país y comparte con las pestañas y el detalle (sirven para los
 *   filtros y para el diálogo de pago). Null mientras cargan.
 * - Click en una fila: emite `open-detail(id)` (lo escucha el detalle del gasto,
 *   209-15). El botón "Registrar pago" no abre el detalle.
 * - Tras un pago se recarga la lista y el total; un gasto que quedó pagado sale.
 *   `paid(record)` avisa a la página por si otra pestaña tiene que refrescarse.
 * - Expone `reload()` y se recarga sola al volver a mostrarse (los paneles están
 *   en keep-alive): así refleja un pago hecho desde el detalle.
 * - `refreshKey`: la página lo incrementa cuando el detalle cambió algo; si la pestaña
 *   está a la vista recarga ya, y si está oculta lo hace al activarse.
 */
const props = withDefaults(
  defineProps<{
    selectedCountry: ExpenseCountry;
    isOwner: boolean;
    options: ExpenseFormOptions | null;
    refreshKey?: number;
  }>(),
  { refreshKey: 0 }
);

const emit = defineEmits<{
  (e: 'open-detail', id: number): void;
  (e: 'paid', record: ExpenseRecordDetail): void;
}>();

const log = createLogger('PorPagarTab');
const $q = useQuasar();
const expensesApi = useExpensesApi();

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

const CASA_MATRIZ_KEY = 'casa_matriz';

const filters = reactive({
  /** `AAAA-MM`; null = todos los meses (el default: lo viejo es lo que más importa) */
  month: null as string | null,
  /** id de sede como string o 'casa_matriz'; null = todos */
  destination: null as string | null,
  costCenterId: null as number | null,
  q: null as string | null,
});

/** Mes de hoy hasta 24 meses atrás y 2 por delante, más "Todos". */
const monthFilterOptions = computed<Array<{ label: string; value: string | null }>>(() => {
  const list: Array<{ label: string; value: string | null }> = [
    { label: 'Todos los meses', value: null },
  ];
  if (!props.options) return list;
  const base = props.options.today.slice(0, 7);
  for (let k = 2; k >= -24; k--) {
    const m = shiftMonth(base, k);
    list.push({ label: monthLabel(m), value: m });
  }
  return list;
});

const destinationFilterOptions = computed<Array<{ label: string; value: string | null }>>(() => [
  { label: 'Todos los destinos', value: null },
  ...(props.options?.destinations ?? []).map((d) => ({
    label: d.name,
    value: d.branchId === null ? CASA_MATRIZ_KEY : String(d.branchId),
  })),
]);

const costCenterFilterOptions = computed<Array<{ label: string; value: number | null }>>(() => [
  { label: 'Todos los rubros', value: null },
  ...(props.options?.costCenters ?? []).map((c) => ({ label: c.name, value: c.id })),
]);

/** Filtros de la API: siempre `por_pagar`. */
function listParams(): ExpenseListParams {
  return {
    status: 'por_pagar',
    month: filters.month ?? undefined,
    destination:
      filters.destination === null
        ? undefined
        : filters.destination === CASA_MATRIZ_KEY
          ? CASA_MATRIZ_KEY
          : Number(filters.destination),
    costCenterId: filters.costCenterId ?? undefined,
    q: filters.q ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Tabla (server-side)
// ---------------------------------------------------------------------------

const rows = ref<ExpenseRecordListItem[]>([]);
const loading = ref(false);
const pagination = ref({
  page: 1,
  rowsPerPage: 20,
  rowsNumber: 0,
  sortBy: null as string | null,
  descending: false,
});

const columns: QTableColumn<ExpenseRecordListItem>[] = [
  { name: 'mes', label: 'Mes', field: 'imputationMonth', align: 'left' },
  { name: 'concepto', label: 'Concepto', field: 'concept', align: 'left' },
  { name: 'rubro', label: 'Rubro', field: 'costCenterName', align: 'left' },
  { name: 'importe', label: 'Importe', field: 'amount', align: 'left' },
  { name: 'pagado', label: 'Pagado', field: 'paid', align: 'left' },
  { name: 'pendiente', label: 'Pendiente', field: 'pending', align: 'left' },
  { name: 'estado', label: 'Estado', field: 'status', align: 'left' },
  { name: 'acciones', label: '', field: 'id', align: 'right' },
];

let loadSeq = 0;

async function loadRows() {
  const seq = ++loadSeq;
  loading.value = true;
  try {
    const result = await expensesApi.listExpenseRecords(props.selectedCountry, {
      ...listParams(),
      page: pagination.value.page,
      limit: pagination.value.rowsPerPage,
    });
    // Una respuesta vieja (filtros anteriores) no pisa a la más reciente.
    if (seq !== loadSeq) return;
    rows.value = result.rows;
    pagination.value.rowsNumber = result.total;
  } catch (err: unknown) {
    if (seq !== loadSeq) return;
    const message = extractError(err, 'Error cargando los gastos por pagar');
    log.error('Error cargando gastos por pagar', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

// ---------------------------------------------------------------------------
// Total pendiente de TODO lo filtrado (no solo de la página visible)
// ---------------------------------------------------------------------------

const TOTALS_PAGE_SIZE = 200;
const TOTALS_MAX_PAGES = 10;
const TOTALS_MAX_ROWS = TOTALS_PAGE_SIZE * TOTALS_MAX_PAGES;

const pendingTotals = ref<Array<{ currency: string; total: number }> | null>(null);
const totalsTruncated = ref(false);
const loadingTotals = ref(false);
let totalsSeq = 0;

/** La API no devuelve totales: se recorren las páginas del mismo filtro y se suma acá. */
async function loadTotals() {
  const seq = ++totalsSeq;
  loadingTotals.value = true;
  try {
    const all: ExpenseRecordListItem[] = [];
    let total = 0;
    for (let page = 1; page <= TOTALS_MAX_PAGES; page++) {
      const result = await expensesApi.listExpenseRecords(props.selectedCountry, {
        ...listParams(),
        page,
        limit: TOTALS_PAGE_SIZE,
      });
      if (seq !== totalsSeq) return;
      all.push(...result.rows);
      total = result.total;
      if (all.length >= total || result.rows.length === 0) break;
    }
    pendingTotals.value = sumPendingByCurrency(all);
    totalsTruncated.value = all.length < total;
  } catch (err: unknown) {
    if (seq !== totalsSeq) return;
    // El total es informativo: si falla no se interrumpe con un aviso, la tabla ya avisa.
    log.warn('No se pudo calcular el total pendiente', {
      error: err instanceof Error ? err.message : String(err),
    });
    pendingTotals.value = null;
  } finally {
    if (seq === totalsSeq) loadingTotals.value = false;
  }
}

function reload() {
  void loadRows();
  void loadTotals();
}

function onFilterChange() {
  pagination.value.page = 1;
  reload();
}

function onTableRequest(tableProps: { pagination: { page: number; rowsPerPage: number } }) {
  // Cambiar de página no cambia el total: solo se vuelve a pedir la tabla.
  pagination.value.page = tableProps.pagination.page;
  pagination.value.rowsPerPage = tableProps.pagination.rowsPerPage;
  void loadRows();
}

// ---------------------------------------------------------------------------
// Pago
// ---------------------------------------------------------------------------

const showPay = ref(false);
const payingRecord = ref<ExpenseRecordListItem | null>(null);

function openPay(row: ExpenseRecordListItem) {
  payingRecord.value = row;
  showPay.value = true;
}

function onPaid(record: ExpenseRecordDetail) {
  reload();
  emit('paid', record);
}

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------

onMounted(reload);

// Los paneles están en keep-alive: al volver a mostrarse se refresca (un pago hecho
// desde el detalle, por ejemplo). La primera activación coincide con el montaje.
let firstActivation = true;
let isActive = false;
onActivated(() => {
  isActive = true;
  if (firstActivation) {
    firstActivation = false;
    return;
  }
  reload();
});
onDeactivated(() => {
  isActive = false;
});

// El detalle cambió algo: si la pestaña está a la vista se recarga ya; si no, lo hace al activarse.
watch(
  () => props.refreshKey,
  () => {
    if (isActive) reload();
  }
);

// Otro país: otras sedes y otros rubros, así que se vuelve a empezar con los filtros.
watch(
  () => props.selectedCountry,
  () => {
    filters.destination = null;
    filters.costCenterId = null;
    pagination.value.page = 1;
    payingRecord.value = null;
    showPay.value = false;
    reload();
  }
);

defineExpose({ reload });

onUnmounted(() => {
  expensesApi.cleanup();
});
</script>
