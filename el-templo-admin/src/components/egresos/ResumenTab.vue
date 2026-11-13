<template>
  <div class="q-pa-md">
    <!-- Selector de mes + Excel -->
    <div class="row items-center q-gutter-sm q-mb-sm">
      <q-btn
        flat
        dense
        round
        icon="chevron_left"
        aria-label="Mes anterior"
        :disable="!canShift(-1)"
        @click="goToMonth(-1)"
      >
        <q-tooltip>Mes anterior</q-tooltip>
      </q-btn>
      <div class="text-h6 resumen-month-label">{{ monthLabel(month) }}</div>
      <q-btn
        flat
        dense
        round
        icon="chevron_right"
        aria-label="Mes siguiente"
        :disable="!canShift(1)"
        @click="goToMonth(1)"
      >
        <q-tooltip>Mes siguiente</q-tooltip>
      </q-btn>
      <q-space />
      <q-btn
        unelevated
        no-caps
        color="primary"
        icon="download"
        label="Descargar Excel"
        :loading="exporting"
        :disable="exporting"
        @click="onExport"
      />
    </div>

    <!-- Moneda y leyenda: qué significa cada fila -->
    <div class="text-body2 text-grey-8 q-mb-xs">{{ currencyNote }}</div>
    <div class="text-caption text-grey-7 q-mb-md">
      <strong>Pagado en el mes:</strong> lo que salió de las cuentas en el mes, repartido según cada
      gasto, sea de la factura que sea. <strong>Costo del mes:</strong> los gastos imputados a este
      mes, pagados o no. <strong>Pendiente:</strong> la parte de ese costo que falta pagar.
    </div>

    <!-- Datos incompletos del mes -->
    <q-banner
      v-if="summary && summary.incomplete.total > 0"
      dense
      rounded
      class="bg-amber-1 text-grey-9 q-mb-md"
    >
      <template #avatar><q-icon name="warning" color="amber-9" /></template>
      {{ incompleteText }}
    </q-banner>

    <!-- Error de carga -->
    <q-banner v-if="loadError && !summary" dense rounded class="bg-red-1 text-negative q-mb-md">
      {{ loadError }}
      <template #action>
        <q-btn
          flat
          no-caps
          color="primary"
          icon="refresh"
          label="Reintentar"
          @click="load(false)"
        />
      </template>
    </q-banner>

    <!-- Cargando por primera vez (sin números todavía) -->
    <div v-else-if="!summary" class="text-center q-pa-xl">
      <q-spinner color="primary" size="32px" />
    </div>

    <!-- Mes sin gastos ni pagos -->
    <div v-else-if="isEmpty" class="text-center q-pa-xl text-grey-6 relative-position">
      No hay gastos imputados ni pagos en {{ monthLabel(month) }}.
      <q-inner-loading :showing="loading" />
    </div>

    <!-- Tabla: filas = medidas, columnas = destinos (en el orden que manda la API). Los
         números se muestran tal cual vienen: el Resumen no suma ni recalcula nada. -->
    <q-markup-table v-else flat bordered separator="cell" class="resumen-table">
      <thead>
        <tr>
          <th class="text-left resumen-sticky"></th>
          <th
            v-for="col in summary.columns"
            :key="col.key"
            class="text-right cursor-pointer"
            :class="{ 'resumen-total': col.key === TOTAL_KEY }"
            @click="openColumn(col.key)"
          >
            <div class="text-weight-bold">{{ col.name }}</div>
            <div v-if="!col.isActive" class="text-caption text-grey-7">(inactiva)</div>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in SUMMARY_ROWS" :key="row.field">
          <td class="text-left text-weight-medium resumen-sticky">{{ row.label }}</td>
          <td
            v-for="col in summary.columns"
            :key="col.key"
            class="text-right cursor-pointer"
            :class="{ 'resumen-total text-weight-bold': col.key === TOTAL_KEY }"
            @click="openColumn(col.key)"
          >
            <div>{{ formatPrice(col[row.field], summary.currency) }}</div>
            <!-- Costo del mes: cuánto de eso es estimado y cuánto ya se pagó -->
            <template v-if="row.field === 'cost'">
              <div
                v-if="col.costEstimated > 0"
                class="text-caption text-amber-9 text-weight-regular"
              >
                incluye {{ formatPrice(col.costEstimated, summary.currency) }} estimados
              </div>
              <div class="text-caption text-grey-7 text-weight-regular">
                pagado {{ formatPrice(col.costPaid, summary.currency) }}
              </div>
            </template>
          </td>
        </tr>
      </tbody>
      <q-inner-loading :showing="loading" />
    </q-markup-table>

    <!-- Detalle por rubro y concepto del destino elegido -->
    <ResumenDetalleDialog
      v-model="showDetail"
      :country="selectedCountry"
      :month="month"
      :destination="detailKey"
      :currency="summary?.currency ?? (selectedCountry === 'ES' ? 'EUR' : 'ARS')"
      :refresh-key="refreshKey"
      @open-detail="emit('open-detail', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { formatPrice } from 'src/utils/format-price';
import { useExpensesApi } from 'src/composables/useExpensesApi';
import {
  expenseCurrencyNote,
  incompleteExpensesText,
  isValidMonth,
  monthLabel,
  shiftMonth,
} from 'src/utils/expenses';
import ResumenDetalleDialog from 'src/components/egresos/ResumenDetalleDialog.vue';
import type {
  ExpenseCountry,
  ExpenseFormOptions,
  ExpenseSummary,
  ExpenseSummaryColumn,
} from 'src/types/expense';

/**
 * Pestaña Resumen de Egresos (DI-12): pagado vs imputado por mes y por destino.
 *
 * - `selectedCountry` viaja siempre a la API (solo el owner lo elige).
 * - `isOwner` queda declarado como en las demás pestañas (hoy no cambia nada acá).
 * - `options`: las opciones del formulario que carga `EgresosHub` por país; de ahí sale
 *   el "hoy" del país para el mes por defecto. Null mientras cargan (entonces se usa el
 *   mes del navegador y, si el usuario no tocó el selector, se corrige al llegar).
 * - `refreshKey`: la página lo incrementa cuando el detalle de un gasto cambió algo; si la
 *   pestaña está a la vista recarga ya, y si está oculta lo hace al activarse.
 *
 * La pantalla NO calcula números: las columnas (sedes, Casa Matriz y Total, en ese orden)
 * y sus importes enteros vienen de la API, y se muestran con `formatPrice` en la moneda del
 * resumen. El Excel sale del mismo cálculo del servidor.
 */
const props = withDefaults(
  defineProps<{
    selectedCountry: ExpenseCountry;
    isOwner: boolean;
    options?: ExpenseFormOptions | null;
    refreshKey?: number;
  }>(),
  { options: null, refreshKey: 0 }
);

const emit = defineEmits<{
  (e: 'open-detail', id: number): void;
}>();

const log = createLogger('ResumenTab');
const $q = useQuasar();
const expensesApi = useExpensesApi();

const TOTAL_KEY = 'total';

/** Las tres medidas del pedido de administración, con sus nombres. */
const SUMMARY_ROWS: ReadonlyArray<{
  field: keyof Pick<ExpenseSummaryColumn, 'paidInMonth' | 'cost' | 'pending'>;
  label: string;
}> = [
  { field: 'paidInMonth', label: 'Pagado en el mes' },
  { field: 'cost', label: 'Costo del mes' },
  { field: 'pending', label: 'Pendiente de ese costo' },
];

// ---------------------------------------------------------------------------
// Mes
// ---------------------------------------------------------------------------

/** Mes `AAAA-MM` del navegador: solo hasta que lleguen las opciones con el "hoy" del país. */
function browserMonth(): string {
  const d = new Date();
  return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function optionsMonth(): string | null {
  const opts = props.options;
  if (!opts || opts.country !== props.selectedCountry) return null;
  const m = opts.today.slice(0, 7);
  return isValidMonth(m) ? m : null;
}

const month = ref<string>(optionsMonth() ?? browserMonth());
// Si el usuario ya movió el selector, las opciones tardías no le cambian el mes.
let monthTouched = false;

function canShift(n: number): boolean {
  return isValidMonth(shiftMonth(month.value, n));
}

function goToMonth(n: number) {
  if (!canShift(n)) return;
  monthTouched = true;
  month.value = shiftMonth(month.value, n);
}

// Llegaron (o cambiaron) las opciones: el mes por defecto es el "hoy" del país.
watch(
  () => props.options,
  () => {
    if (monthTouched) return;
    const m = optionsMonth();
    if (m !== null && m !== month.value) month.value = m;
  }
);

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------

const summary = ref<ExpenseSummary | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
let loadSeq = 0;

/**
 * `keepCurrent`: al refrescar (mismo mes y país) se dejan los números a la vista mientras
 * llegan los nuevos. Al cambiar de mes o de país se vacían para no mostrar un mes con
 * la etiqueta de otro.
 */
async function load(keepCurrent: boolean) {
  const seq = ++loadSeq;
  if (!keepCurrent) summary.value = null;
  loading.value = true;
  loadError.value = null;
  try {
    const result = await expensesApi.getExpenseSummary(props.selectedCountry, month.value);
    // Una respuesta vieja (otro mes o país) no pisa a la más reciente.
    if (seq === loadSeq) summary.value = result;
  } catch (err: unknown) {
    if (seq !== loadSeq) return;
    loadError.value = extractError(err, 'Error cargando el resumen de egresos');
    log.error('Error cargando el resumen', { error: loadError.value });
    // Si había números del mismo mes, se dejan y se avisa; si no, queda el banner de error.
    if (summary.value) $q.notify({ type: 'negative', message: loadError.value });
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

watch([month, () => props.selectedCountry], () => {
  showDetail.value = false;
  void load(false);
});

// ---------------------------------------------------------------------------
// Detalle por rubro y concepto
// ---------------------------------------------------------------------------

const showDetail = ref(false);
/** `key` de la columna elegida: id de sede, `casa_matriz` o `total`. */
const detailKey = ref<string | null>(null);

function openColumn(key: string) {
  detailKey.value = key;
  showDetail.value = true;
}

// ---------------------------------------------------------------------------
// Estado derivado (solo presentación, sin cuentas de plata)
// ---------------------------------------------------------------------------

const currencyNote = computed(() => expenseCurrencyNote(props.selectedCountry));

/** Mes sin nada: ninguna columna tiene pagos, costo ni pendiente. */
const isEmpty = computed(
  () =>
    summary.value !== null &&
    summary.value.columns.every((c) => c.paidInMonth === 0 && c.cost === 0 && c.pending === 0)
);

/** Texto de gastos incompletos (helper compartido con el Resultado). */
const incompleteText = computed(() =>
  summary.value ? incompleteExpensesText(summary.value.incomplete) : ''
);

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

const exporting = ref(false);

/** Baja el Excel del mes y país que se están viendo (patrón de blob de SaldosPorCajaTab). */
async function onExport() {
  const country = props.selectedCountry;
  const exportMonth = month.value;
  exporting.value = true;
  try {
    const blob = await expensesApi.exportExpenseSummary(country, exportMonth);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `egresos-resumen-${country}-${exportMonth}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    $q.notify({ type: 'positive', message: 'Excel exportado' });
  } catch (err: unknown) {
    const message = extractError(err, 'Error exportando el resumen de egresos');
    log.error('Error exportando el resumen', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    exporting.value = false;
  }
}

// ---------------------------------------------------------------------------
// Ciclo de vida (mismo patrón que Gastos y Por pagar: paneles en keep-alive)
// ---------------------------------------------------------------------------

onMounted(() => {
  void load(false);
});

// Al volver a mostrarse se refresca (un pago hecho desde otra pestaña, por ejemplo).
// La primera activación coincide con el montaje.
let firstActivation = true;
let isActive = false;
onActivated(() => {
  isActive = true;
  if (firstActivation) {
    firstActivation = false;
    return;
  }
  void load(true);
});
onDeactivated(() => {
  isActive = false;
});

// El detalle de un gasto cambió algo: si la pestaña está a la vista se recarga ya; si no, al activarse.
watch(
  () => props.refreshKey,
  () => {
    if (isActive) void load(true);
  }
);

onUnmounted(() => {
  expensesApi.cleanup();
});
</script>

<style scoped>
.resumen-month-label {
  min-width: 170px;
  text-align: center;
}

/* La primera columna (el nombre de la fila) queda fija al scrollear en horizontal. */
.resumen-table :deep(.resumen-sticky) {
  position: sticky;
  left: 0;
  z-index: 1;
  background: #fff;
  min-width: 150px;
}

/* La columna Total, con fondo cálido suave. */
.resumen-table :deep(.resumen-total) {
  background: #fff8e1;
}
</style>
