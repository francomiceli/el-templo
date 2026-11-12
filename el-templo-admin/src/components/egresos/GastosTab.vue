<template>
  <div class="q-pa-md">
    <!-- Barra: nuevo gasto + filtros -->
    <div class="row q-col-gutter-sm q-mb-md items-end">
      <div class="col-12 col-sm-auto">
        <q-btn
          icon="add"
          label="Nuevo gasto"
          color="primary"
          unelevated
          :disable="!options"
          @click="openCreate"
        />
      </div>
      <q-space />
      <div class="col-6 col-sm-2">
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
      <div class="col-6 col-sm-2">
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
      <div class="col-6 col-sm-2">
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
      <div class="col-6 col-sm-2">
        <q-select
          v-model="filters.status"
          :options="STATUS_FILTER_OPTIONS"
          label="Estado"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-12 col-sm-3">
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
      <div class="col-12 col-sm-auto">
        <q-toggle
          v-model="filters.includeVoided"
          label="Ver anulados"
          @update:model-value="onFilterChange"
        />
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
        <div class="full-width text-center q-pa-lg text-grey-6">
          No hay gastos para estos filtros.
        </div>
      </template>

      <template #body="slotProps">
        <q-tr
          :props="slotProps"
          class="cursor-pointer"
          :class="{ 'text-strike text-grey-6': slotProps.row.voidedAt !== null }"
          @click="emit('open-detail', slotProps.row.id)"
        >
          <!-- Mes de imputación -->
          <q-td key="mes" :props="slotProps">{{ monthLabel(slotProps.row.imputationMonth) }}</q-td>

          <!-- Concepto + beneficiario -->
          <q-td key="concepto" :props="slotProps">
            <div class="text-weight-medium">{{ slotProps.row.concept }}</div>
            <div v-if="slotProps.row.beneficiary" class="text-caption text-grey-7">
              {{ slotProps.row.beneficiary }}
            </div>
          </q-td>

          <q-td key="rubro" :props="slotProps">{{ slotProps.row.costCenterName }}</q-td>

          <!-- Importe: moneda del gasto, estimado y equivalente en pesos para USD -->
          <q-td key="importe" :props="slotProps">
            <div class="text-weight-bold">
              {{ formatPrice(slotProps.row.amount, slotProps.row.currency) }}
              <q-badge
                v-if="slotProps.row.amountStatus === 'estimado'"
                color="amber-8"
                :label="AMOUNT_STATUS_LABELS.estimado"
                class="q-ml-xs"
              />
            </div>
            <div v-if="slotProps.row.currency === 'USD'" class="text-caption text-grey-7">
              <template v-if="slotProps.row.costInCountryCurrency !== null">
                ≈ {{ formatPrice(slotProps.row.costInCountryCurrency, 'ARS') }}
              </template>
              <template v-else>Falta el tipo de cambio</template>
            </div>
          </q-td>

          <!-- Reparto -->
          <q-td key="reparto" :props="slotProps">
            <template v-if="slotProps.row.allocations.length === 1">
              {{ slotProps.row.allocations[0].branchName }}
            </template>
            <span v-else class="cursor-pointer">
              {{ slotProps.row.allocations.length }} destinos
              <q-tooltip>
                <div v-for="a in slotProps.row.allocations" :key="a.branchId ?? 'cm'">
                  {{ a.branchName }}: {{ formatPrice(a.amount, slotProps.row.currency) }}
                </div>
              </q-tooltip>
            </span>
          </q-td>

          <!-- Pagado / pendiente (en la moneda del gasto) -->
          <q-td key="pagos" :props="slotProps">
            <div>Pagado {{ formatPrice(slotProps.row.paid, slotProps.row.currency) }}</div>
            <div class="text-caption text-grey-7">
              Pendiente {{ formatPrice(slotProps.row.pending, slotProps.row.currency) }}
            </div>
          </q-td>

          <!-- Estado -->
          <q-td key="estado" :props="slotProps">
            <span class="inline-block" style="text-decoration: none">
              <q-badge
                :color="EXPENSE_STATUS_META[slotProps.row.status as ExpensePaymentStatus].color"
                :label="EXPENSE_STATUS_META[slotProps.row.status as ExpensePaymentStatus].label"
              />
              <q-badge
                v-if="slotProps.row.overpaid"
                color="warning"
                text-color="grey-9"
                label="Pagado de más"
                class="q-ml-xs"
              />
              <q-badge
                v-if="slotProps.row.voidedAt !== null"
                color="negative"
                label="Anulado"
                class="q-ml-xs"
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
            </span>
          </q-td>

          <!-- Acciones -->
          <q-td key="acciones" :props="slotProps" auto-width>
            <q-btn
              v-if="slotProps.row.voidedAt === null"
              flat
              dense
              round
              icon="edit"
              color="primary"
              :loading="loadingEditId === slotProps.row.id"
              @click.stop="onEdit(slotProps.row)"
            >
              <q-tooltip>Editar</q-tooltip>
            </q-btn>
          </q-td>
        </q-tr>
      </template>
    </q-table>

    <!-- Alta y edición -->
    <GastoFormDialog
      v-if="options"
      v-model="showForm"
      :country="selectedCountry"
      :options="options"
      :record="editingRecord"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useQuasar, type QTableColumn } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { formatPrice } from 'src/utils/format-price';
import { useExpensesApi } from 'src/composables/useExpensesApi';
import {
  AMOUNT_STATUS_LABELS,
  EXPENSE_STATUS_META,
  monthLabel,
  shiftMonth,
} from 'src/utils/expenses';
import GastoFormDialog from 'src/components/egresos/GastoFormDialog.vue';
import type {
  ExpenseCountry,
  ExpenseFormOptions,
  ExpensePaymentStatus,
  ExpenseRecordDetail,
  ExpenseRecordListItem,
} from 'src/types/expense';

/**
 * Pestaña Gastos de Egresos (DI-17): listado con filtros, alta y edición.
 *
 * - `selectedCountry` viaja siempre a la API (solo el owner lo elige; el resto
 *   usa su país y el server lo ignora).
 * - `isOwner` queda declarado como en las demás pestañas (hoy no cambia nada acá).
 * - `openNew` en true abre el alta apenas hay opciones del formulario y emite
 *   `new-consumed` para que la página limpie `?nuevo=1` de la URL.
 * - `open-detail(id)`: click en una fila (lo escucha el detalle del gasto, 209-15).
 */
const props = withDefaults(
  defineProps<{
    selectedCountry: ExpenseCountry;
    isOwner: boolean;
    openNew?: boolean;
  }>(),
  { openNew: false }
);

const emit = defineEmits<{
  (e: 'new-consumed'): void;
  (e: 'open-detail', id: number): void;
}>();

const log = createLogger('GastosTab');
const $q = useQuasar();
const expensesApi = useExpensesApi();

// ---------------------------------------------------------------------------
// Opciones del formulario (también alimentan los filtros)
// ---------------------------------------------------------------------------

const options = ref<ExpenseFormOptions | null>(null);
let optionsSeq = 0;

async function loadOptions(): Promise<boolean> {
  const seq = ++optionsSeq;
  try {
    const result = await expensesApi.getExpenseFormOptions(props.selectedCountry);
    if (seq !== optionsSeq) return false;
    options.value = result;
    return true;
  } catch (err: unknown) {
    if (seq !== optionsSeq) return false;
    const message = extractError(err, 'Error cargando las opciones del formulario');
    log.error('Error cargando form-options', { error: message });
    $q.notify({ type: 'negative', message });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

const CASA_MATRIZ_KEY = 'casa_matriz';

const filters = reactive({
  /** `AAAA-MM`; null = todos los meses */
  month: null as string | null,
  /** id de sede como string o 'casa_matriz'; null = todos */
  destination: null as string | null,
  costCenterId: null as number | null,
  status: null as ExpensePaymentStatus | null,
  q: null as string | null,
  includeVoided: false,
});

const STATUS_FILTER_OPTIONS: Array<{ label: string; value: ExpensePaymentStatus | null }> = [
  { label: 'Todos', value: null },
  { label: EXPENSE_STATUS_META.pendiente.label, value: 'pendiente' },
  { label: EXPENSE_STATUS_META.parcial.label, value: 'parcial' },
  { label: EXPENSE_STATUS_META.pagado.label, value: 'pagado' },
];

/** Mes de hoy hasta 24 meses atrás y 2 por delante, más "Todos". */
const monthFilterOptions = computed<Array<{ label: string; value: string | null }>>(() => {
  const list: Array<{ label: string; value: string | null }> = [
    { label: 'Todos los meses', value: null },
  ];
  if (!options.value) return list;
  const base = options.value.today.slice(0, 7);
  for (let k = 2; k >= -24; k--) {
    const m = shiftMonth(base, k);
    list.push({ label: monthLabel(m), value: m });
  }
  return list;
});

const destinationFilterOptions = computed<Array<{ label: string; value: string | null }>>(() => [
  { label: 'Todos los destinos', value: null },
  ...(options.value?.destinations ?? []).map((d) => ({
    label: d.name,
    value: d.branchId === null ? CASA_MATRIZ_KEY : String(d.branchId),
  })),
]);

const costCenterFilterOptions = computed<Array<{ label: string; value: number | null }>>(() => [
  { label: 'Todos los rubros', value: null },
  ...(options.value?.costCenters ?? []).map((c) => ({ label: c.name, value: c.id })),
]);

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
  { name: 'reparto', label: 'Reparto', field: 'allocations', align: 'left' },
  { name: 'pagos', label: 'Pagado / Pendiente', field: 'paid', align: 'left' },
  { name: 'estado', label: 'Estado', field: 'status', align: 'left' },
  { name: 'acciones', label: '', field: 'id', align: 'right' },
];

let loadSeq = 0;

async function loadRows() {
  const seq = ++loadSeq;
  loading.value = true;
  try {
    const result = await expensesApi.listExpenseRecords(props.selectedCountry, {
      month: filters.month ?? undefined,
      destination:
        filters.destination === null
          ? undefined
          : filters.destination === CASA_MATRIZ_KEY
            ? CASA_MATRIZ_KEY
            : Number(filters.destination),
      costCenterId: filters.costCenterId ?? undefined,
      status: filters.status ?? undefined,
      q: filters.q ?? undefined,
      includeVoided: filters.includeVoided,
      page: pagination.value.page,
      limit: pagination.value.rowsPerPage,
    });
    // Una respuesta vieja (filtros anteriores) no pisa a la más reciente.
    if (seq !== loadSeq) return;
    rows.value = result.rows;
    pagination.value.rowsNumber = result.total;
  } catch (err: unknown) {
    if (seq !== loadSeq) return;
    const message = extractError(err, 'Error cargando los gastos');
    log.error('Error cargando gastos', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

function onFilterChange() {
  pagination.value.page = 1;
  void loadRows();
}

function onTableRequest(tableProps: { pagination: { page: number; rowsPerPage: number } }) {
  pagination.value.page = tableProps.pagination.page;
  pagination.value.rowsPerPage = tableProps.pagination.rowsPerPage;
  void loadRows();
}

// ---------------------------------------------------------------------------
// Alta y edición
// ---------------------------------------------------------------------------

const showForm = ref(false);
const editingRecord = ref<ExpenseRecordDetail | null>(null);
const loadingEditId = ref<number | null>(null);

function openCreate() {
  if (!options.value) return;
  editingRecord.value = null;
  showForm.value = true;
}

async function onEdit(row: ExpenseRecordListItem) {
  if (!options.value) return;
  loadingEditId.value = row.id;
  try {
    // El detalle trae reparto, links y observaciones completos para precargar.
    editingRecord.value = await expensesApi.getExpenseRecord(row.id, props.selectedCountry);
    showForm.value = true;
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando el gasto');
    log.error('Error cargando el detalle del gasto', { error: message, id: row.id });
    $q.notify({ type: 'negative', message });
  } finally {
    loadingEditId.value = null;
  }
}

function onSaved() {
  void loadRows();
}

// `openNew` puede llegar con la pestaña ya montada (los paneles están en
// keep-alive) o junto con el montaje: se anota el pedido, se avisa a la página
// para que limpie la URL, y el alta se abre apenas hay opciones del formulario.
const newRequested = ref(false);

watch(
  () => props.openNew,
  (value) => {
    if (!value) return;
    newRequested.value = true;
    emit('new-consumed');
  },
  { immediate: true }
);

watch([newRequested, options], () => {
  if (newRequested.value && options.value) {
    newRequested.value = false;
    openCreate();
  }
});

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------

onMounted(async () => {
  if (await loadOptions()) {
    // Por defecto, el mes de imputación actual (según la fecha del gimnasio).
    if (options.value) filters.month = options.value.today.slice(0, 7);
  }
  await loadRows();
});

// Otro país: otras sedes y otros rubros, así que se vuelve a empezar con los filtros.
watch(
  () => props.selectedCountry,
  async () => {
    filters.destination = null;
    filters.costCenterId = null;
    pagination.value.page = 1;
    await loadOptions();
    await loadRows();
  }
);

onUnmounted(() => {
  expensesApi.cleanup();
});
</script>
