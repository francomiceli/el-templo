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
      <div class="text-h6 resultado-month-label">{{ monthLabel(month) }}</div>
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
    <div class="text-caption text-grey-7 q-mb-md">{{ legend }}</div>

    <!-- Datos incompletos del mes -->
    <q-banner
      v-if="result && result.incomplete.total > 0"
      dense
      rounded
      class="bg-amber-1 text-grey-9 q-mb-md"
    >
      <template #avatar><q-icon name="warning" color="amber-9" /></template>
      {{ incompleteText }}
    </q-banner>

    <!-- Cobros en otra moneda: no se suman, se avisan -->
    <q-banner v-if="foreignNotice" dense rounded class="bg-amber-1 text-grey-9 q-mb-md">
      <template #avatar><q-icon name="currency_exchange" color="amber-9" /></template>
      {{ foreignNotice }}
    </q-banner>

    <!-- Error de carga -->
    <q-banner v-if="loadError && !result" dense rounded class="bg-red-1 text-negative q-mb-md">
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
    <div v-else-if="!result" class="text-center q-pa-xl">
      <q-spinner color="primary" size="32px" />
    </div>

    <!-- Mes sin cobros ni gastos -->
    <div v-else-if="isEmpty" class="text-center q-pa-xl text-grey-6 relative-position">
      No hay cobros ni gastos imputados en {{ monthLabel(month) }}.
      <q-inner-loading :showing="loading" />
    </div>

    <!-- Tabla: filas = medidas, columnas = sedes, Casa Matriz y Consolidado (en el orden que
         manda la API). Los números se muestran tal cual vienen: la pantalla no suma ni
         recalcula nada. -->
    <div v-else class="resultado-scroll">
      <q-markup-table flat bordered separator="cell" class="resultado-table">
        <thead>
          <tr>
            <th class="text-left resultado-sticky"></th>
            <th
              v-for="col in result.columns"
              :key="col.key"
              class="text-right cursor-pointer"
              :class="{ 'resultado-consolidado': isConsolidated(col) }"
              @click="openColumn(col)"
            >
              <div class="text-weight-bold">{{ col.name }}</div>
              <div v-if="columnMarks(col)" class="text-caption text-grey-7">
                {{ columnMarks(col) }}
              </div>
              <q-tooltip>Ver detalle por rubro y concepto</q-tooltip>
            </th>
          </tr>
        </thead>
        <tbody>
          <!-- Cobros a alumnos -->
          <tr>
            <td class="text-left text-weight-medium resultado-sticky">Cobros a alumnos</td>
            <td
              v-for="col in result.columns"
              :key="col.key"
              class="text-right cursor-pointer"
              :class="cellClass(col)"
              @click="openColumn(col)"
            >
              {{ col.kind === 'casa_matriz' ? '—' : formatPrice(col.income, result.currency) }}
            </td>
          </tr>

          <!-- Un renglón por rubro con costo -->
          <tr v-for="cc in result.costCenters" :key="cc.id">
            <td class="text-left text-grey-8 resultado-sticky resultado-indent">{{ cc.name }}</td>
            <td
              v-for="col in result.columns"
              :key="col.key"
              class="text-right text-grey-8 cursor-pointer"
              :class="cellClass(col)"
              @click="openColumn(col)"
            >
              {{ formatPrice(col.costsByCostCenter[String(cc.id)] ?? 0, result.currency) }}
            </td>
          </tr>

          <!-- Total costos -->
          <tr>
            <td class="text-left text-weight-bold resultado-sticky">Total costos</td>
            <td
              v-for="col in result.columns"
              :key="col.key"
              class="text-right text-weight-bold cursor-pointer"
              :class="cellClass(col)"
              @click="openColumn(col)"
            >
              <div>{{ formatPrice(col.cost, result.currency) }}</div>
              <div
                v-if="col.costEstimated > 0"
                class="text-caption text-amber-9 text-weight-regular"
              >
                incluye {{ formatPrice(col.costEstimated, result.currency) }} estimados
              </div>
            </td>
          </tr>

          <!-- Resultado -->
          <tr>
            <td class="text-left text-weight-bold resultado-sticky">Resultado</td>
            <td
              v-for="col in result.columns"
              :key="col.key"
              class="text-right text-weight-bold cursor-pointer"
              :class="[cellClass(col), { 'text-negative': col.result < 0 }]"
              @click="openColumn(col)"
            >
              {{ formatPrice(col.result, result.currency) }}
            </td>
          </tr>

          <!-- Margen -->
          <tr>
            <td class="text-left text-weight-medium resultado-sticky">Margen</td>
            <td
              v-for="col in result.columns"
              :key="col.key"
              class="text-right cursor-pointer"
              :class="[
                cellClass(col),
                { 'text-negative': col.marginPct !== null && col.marginPct < 0 },
              ]"
              @click="openColumn(col)"
            >
              {{ resultMarginLabel(col) }}
            </td>
          </tr>
        </tbody>
        <q-inner-loading :showing="loading" />
      </q-markup-table>
    </div>

    <div v-if="result && !isEmpty" class="text-caption text-grey-7 q-mt-sm">
      {{ RESULT_FOOTNOTE }}
    </div>

    <!-- Detalle por rubro y concepto de la columna elegida (Consolidado = detalle del total) -->
    <ResumenDetalleDialog
      v-model="showDetail"
      :country="selectedCountry"
      :month="month"
      :destination="detailKey"
      :currency="result?.currency ?? (selectedCountry === 'ES' ? 'EUR' : 'ARS')"
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
  RESULT_FOOTNOTE,
  expenseCurrencyNote,
  foreignIncomeNotice,
  incompleteExpensesText,
  isValidMonth,
  monthLabel,
  resultColumnLabel,
  resultDetailDestination,
  resultMarginLabel,
  shiftMonth,
} from 'src/utils/expenses';
import ResumenDetalleDialog from 'src/components/egresos/ResumenDetalleDialog.vue';
import type {
  ExpenseCountry,
  ExpenseFormOptions,
  ExpenseResult,
  ExpenseResultColumn,
} from 'src/types/expense';

/**
 * Pestaña Resultado de Egresos (fase 211, DI-11): cobros a alumnos menos costos imputados,
 * por sede, Casa Matriz (solo Argentina) y Consolidado del país, para un mes.
 *
 * Base mixta (§12): los cobros son por fecha de pago y los costos son los imputados al mes
 * (incluidos los estimados), no lo pagado. Por eso conviven avisos de gastos incompletos y
 * de cobros en otra moneda.
 *
 * Solo la ven owner y admin (la página oculta la pestaña; el gate real es la API).
 *
 * - `selectedCountry` viaja siempre a la API (solo el owner lo elige).
 * - `isOwner` queda declarado como en las demás pestañas (hoy no cambia nada acá).
 * - `options`: opciones del formulario que carga `EgresosHub`; de ahí sale el "hoy" del
 *   país para el mes por defecto (si no llegaron, el del navegador, y se corrige al llegar
 *   salvo que el usuario ya haya movido el selector).
 * - `refreshKey`: la página lo incrementa cuando el detalle de un gasto cambió algo.
 *
 * La pantalla NO calcula plata: columnas, Consolidado, resultado y margen vienen de la API
 * y se muestran con `formatPrice` en la moneda del informe. El Excel sale del mismo cálculo
 * del servidor.
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

const log = createLogger('ResultadoTab');
const $q = useQuasar();
const expensesApi = useExpensesApi();

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

const result = ref<ExpenseResult | null>(null);
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
  if (!keepCurrent) result.value = null;
  loading.value = true;
  loadError.value = null;
  try {
    const data = await expensesApi.getExpenseResult(props.selectedCountry, month.value);
    // Una respuesta vieja (otro mes o país) no pisa a la más reciente.
    if (seq === loadSeq) result.value = data;
  } catch (err: unknown) {
    if (seq !== loadSeq) return;
    loadError.value = extractError(err, 'Error cargando el resultado por sede');
    log.error('Error cargando el resultado', { error: loadError.value });
    // Si había números del mismo mes, se dejan y se avisa; si no, queda el banner de error.
    if (result.value) $q.notify({ type: 'negative', message: loadError.value });
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
/** Destino que entiende el detalle: id de sede, `casa_matriz` o `total` (Consolidado). */
const detailKey = ref<string | null>(null);

function openColumn(col: ExpenseResultColumn) {
  detailKey.value = resultDetailDestination(col);
  showDetail.value = true;
}

// ---------------------------------------------------------------------------
// Estado derivado (solo presentación, sin cuentas de plata)
// ---------------------------------------------------------------------------

const currencyNote = computed(() => expenseCurrencyNote(props.selectedCountry));

const legend = computed(() =>
  props.selectedCountry === 'AR'
    ? 'Resultado = cobros a alumnos − costos imputados. Consolidado = suma de las sedes menos los costos de Casa Matriz, una sola vez.'
    : 'Resultado = cobros a alumnos − costos imputados. Consolidado = suma de las sedes.'
);

/** Mes sin nada: ninguna columna tiene cobros ni costos. */
const isEmpty = computed(
  () => result.value !== null && result.value.columns.every((c) => c.income === 0 && c.cost === 0)
);

/** Texto de gastos incompletos (helper compartido con el Resumen). */
const incompleteText = computed(() =>
  result.value ? incompleteExpensesText(result.value.incomplete) : ''
);

/** Aviso de cobros en otra moneda ('' si no hay). */
const foreignNotice = computed(() =>
  result.value ? foreignIncomeNotice(result.value.foreignIncome) : ''
);

function isConsolidated(col: ExpenseResultColumn): boolean {
  return col.kind === 'consolidado';
}

/** Clases de celda de datos: la columna Consolidado va en negrita y con fondo cálido. */
function cellClass(col: ExpenseResultColumn): Record<string, boolean> {
  const consolidated = isConsolidated(col);
  return { 'resultado-consolidado': consolidated, 'text-weight-bold': consolidated };
}

/** Marca de la columna ("(inactiva)", "(virtual)") a partir del rótulo del helper compartido. */
function columnMarks(col: ExpenseResultColumn): string {
  const label = resultColumnLabel(col);
  return label.length > col.name.length ? label.slice(col.name.length).trim() : '';
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

const exporting = ref(false);

/** Baja el Excel del mes y país que se están viendo (patrón de blob del Resumen). */
async function onExport() {
  const country = props.selectedCountry;
  const exportMonth = month.value;
  exporting.value = true;
  try {
    const blob = await expensesApi.exportExpenseResult(country, exportMonth);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `egresos-resultado-${country}-${exportMonth}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    $q.notify({ type: 'positive', message: 'Excel exportado' });
  } catch (err: unknown) {
    const message = extractError(err, 'Error exportando el resultado por sede');
    log.error('Error exportando el resultado', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    exporting.value = false;
  }
}

// ---------------------------------------------------------------------------
// Ciclo de vida (mismo patrón que Gastos, Por pagar y Resumen: paneles en keep-alive)
// ---------------------------------------------------------------------------

onMounted(() => {
  void load(false);
});

// Al volver a mostrarse se refresca. La primera activación coincide con el montaje.
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
.resultado-month-label {
  min-width: 170px;
  text-align: center;
}

/* Pantallas angostas: la tabla scrollea en horizontal. */
.resultado-scroll {
  overflow-x: auto;
}

/* La primera columna (el nombre de la fila) queda fija al scrollear en horizontal. */
.resultado-table :deep(.resultado-sticky) {
  position: sticky;
  left: 0;
  z-index: 1;
  background: #fff;
  min-width: 150px;
}

/* Los renglones de rubro van con sangría. */
.resultado-table :deep(.resultado-indent) {
  padding-left: 24px;
}

/* La columna Consolidado, con fondo cálido suave (igual que el Total del Resumen). */
.resultado-table :deep(.resultado-consolidado) {
  background: #fff8e1;
}
</style>
