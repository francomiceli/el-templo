<template>
  <div class="q-pa-md">
    <!-- ========================================================== -->
    <!-- Filter bar + Excel export (REP-03 / REP-04) -->
    <!-- ========================================================== -->
    <div class="row q-col-gutter-sm q-mb-md items-end">
      <div class="col-12 col-sm-3">
        <q-select
          v-model="filters.cashRegisterId"
          :options="cashRegisterOptions"
          label="Caja"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-6 col-sm-3">
        <!-- @vue-ignore: "month" is valid HTML5 but not in Quasar's type union -->
        <q-input
          v-model="selectedMonth"
          label="Período"
          type="month"
          dense
          outlined
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-6 col-sm-3">
        <q-select
          v-model="filters.tipo"
          :options="tipoOptions"
          label="Tipo"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <q-space />
      <!-- Registrar movimiento / egreso (fase 139, MOV-01..03). Same RBAC as
           the /caja hub (gestion/admin/owner = FINANCE_VOID_ROLES). -->
      <div class="col-12 col-sm-auto">
        <q-btn
          icon="add"
          label="Registrar"
          color="primary"
          unelevated
          dense
          @click="showRegistrar = true"
        />
      </div>
      <!-- Excel only — no dead PDF control (REP-04, Excel-only v1). -->
      <div class="col-12 col-sm-auto">
        <q-btn
          icon="download"
          label="Exportar Excel"
          color="primary"
          outline
          dense
          :loading="exporting"
          @click="onExportMovEgresos"
        />
      </div>
    </div>

    <!-- ========================================================== -->
    <!-- Historial table — server-side; NULL-member rows survive    -->
    <!-- (LEFT JOIN endpoint, flag 139)                             -->
    <!-- ========================================================== -->
    <q-table
      :rows="filteredRows"
      :columns="columns"
      row-key="id"
      :loading="loadingTable"
      :pagination="tablePagination"
      :rows-per-page-options="[20, 50, 100]"
      @request="onTableRequest"
    >
      <template #no-data>
        <div class="full-width text-center q-pa-lg text-grey-6">
          Sin movimientos ni egresos para los filtros seleccionados.
        </div>
      </template>

      <!-- Fecha -->
      <template #body-cell-fecha="slotProps">
        <q-td :props="slotProps">{{ formatDate(slotProps.row.transactionDate) }}</q-td>
      </template>

      <!-- Tipo badge -->
      <template #body-cell-tipo="slotProps">
        <q-td :props="slotProps">
          <q-badge :color="kindColor(slotProps.row.kind)" :label="kindLabel(slotProps.row.kind)" />
        </q-td>
      </template>

      <!-- Concepto / Origen → Destino -->
      <template #body-cell-concepto="slotProps">
        <q-td :props="slotProps">{{ conceptoText(slotProps.row) }}</q-td>
      </template>

      <!-- Monto + moneda badge (egreso shows leading "−" warm-red) -->
      <template #body-cell-monto="slotProps">
        <q-td :props="slotProps">
          <span
            class="text-weight-bold q-mr-xs"
            :class="{ 'text-negative': isEgreso(slotProps.row) }"
          >
            {{ isEgreso(slotProps.row) ? '−' : ''
            }}{{ formatPrice(slotProps.row.amount, slotProps.row.currency) }}
          </span>
          <q-badge color="grey-3" text-color="grey-8" :label="slotProps.row.currency" />
        </q-td>
      </template>

      <!-- Caja -->
      <template #body-cell-caja="slotProps">
        <q-td :props="slotProps">{{ slotProps.row.cashRegisterName }}</q-td>
      </template>

      <!-- Estado de validación (ARQUEO-02) -->
      <template #body-cell-estado="slotProps">
        <q-td :props="slotProps">
          <q-badge
            :color="validationColor(slotProps.row.validationStatus)"
            :label="validationLabel(slotProps.row.validationStatus)"
          />
        </q-td>
      </template>

      <!-- Registrado por ("—" when absent) -->
      <template #body-cell-registrado="slotProps">
        <q-td :props="slotProps" class="text-caption text-grey-7">
          {{ slotProps.row.recorderName || '—' }}
        </q-td>
      </template>

      <!-- Detalles -->
      <template #body-cell-acciones="slotProps">
        <q-td :props="slotProps">
          <q-btn flat dense round icon="more_vert" size="sm">
            <q-menu>
              <q-list style="min-width: 140px">
                <q-item clickable v-close-popup @click="showDetails(slotProps.row)">
                  <q-item-section avatar><q-icon name="info" /></q-item-section>
                  <q-item-section>Detalles</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <!-- ========================================================== -->
    <!-- Detail dialog (reused q-list label/value pattern)          -->
    <!-- ========================================================== -->
    <q-dialog v-model="showDetailDialog">
      <q-card v-if="detailRow" style="width: 480px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">{{ kindLabel(detailRow.kind) }} #{{ detailRow.id }}</div>
        </q-card-section>
        <q-separator />
        <q-card-section>
          <q-list dense>
            <q-item>
              <q-item-section>Tipo</q-item-section>
              <q-item-section side>
                <q-badge :color="kindColor(detailRow.kind)" :label="kindLabel(detailRow.kind)" />
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Monto</q-item-section>
              <q-item-section side class="text-weight-bold text-h6">
                {{ isEgreso(detailRow) ? '−' : ''
                }}{{ formatPrice(detailRow.amount, detailRow.currency) }}
                {{ detailRow.currency }}
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Concepto</q-item-section>
              <q-item-section side class="text-weight-medium">
                {{ conceptoText(detailRow) }}
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Caja</q-item-section>
              <q-item-section side>{{ detailRow.cashRegisterName }}</q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Estado</q-item-section>
              <q-item-section side>
                <q-badge
                  :color="validationColor(detailRow.validationStatus)"
                  :label="validationLabel(detailRow.validationStatus)"
                />
              </q-item-section>
            </q-item>
            <q-item v-if="detailRow.branchName">
              <q-item-section>Sucursal</q-item-section>
              <q-item-section side>{{ detailRow.branchName }}</q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Fecha</q-item-section>
              <q-item-section side>{{ formatDate(detailRow.transactionDate) }}</q-item-section>
            </q-item>
            <q-separator spaced />
            <q-item>
              <q-item-section>Registrado por</q-item-section>
              <q-item-section side>{{ detailRow.recorderName || '—' }}</q-item-section>
            </q-item>
            <q-item v-if="detailRow.notes">
              <q-item-section>Notas</q-item-section>
              <q-item-section side class="text-italic">{{ detailRow.notes }}</q-item-section>
            </q-item>
            <template v-if="detailRow.voidedAt">
              <q-separator spaced />
              <q-item>
                <q-item-section>
                  <q-badge color="negative" label="ANULADO" class="q-pa-xs" />
                </q-item-section>
              </q-item>
              <q-item v-if="detailRow.voidReason">
                <q-item-section>Motivo anulación</q-item-section>
                <q-item-section side class="text-italic">{{ detailRow.voidReason }}</q-item-section>
              </q-item>
            </template>
          </q-list>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cerrar" color="grey" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Registrar movimiento / egreso (fase 139) -->
    <RegistrarMovEgresoDialog
      v-model="showRegistrar"
      :selected-country="selectedCountry"
      :is-owner="isOwner"
      @registered="onRegistered"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { formatDate } from 'src/utils/format-date';
import { formatPrice } from 'src/utils/format-price';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import RegistrarMovEgresoDialog from 'src/components/caja/RegistrarMovEgresoDialog.vue';
import type { MovEgresoItem, MovEgresoParams } from 'src/types/transaction';

// =========================================================================
// Props — shared selectedCountry / isOwner from the CajaPage hub.
// =========================================================================

const props = defineProps<{
  selectedCountry: 'AR' | 'ES';
  isOwner: boolean;
}>();

const log = createLogger('MovEgresosTab');
const $q = useQuasar();
const transactionsApi = useTransactionsApi();

// =========================================================================
// Kind rendering. Phase 146 (ARQUEO): el endpoint ahora devuelve TODO lo
// imputado a la caja — cobros de socio (plan_charge / debt_settlement /
// advance_payment / refund) + egresos (expense) + traspasos (cash_transfer) +
// ajustes (adjustment). `kind` es un string ensanchado, así que mapeamos a
// etiquetas ES acá.
// =========================================================================

// Kinds de cobro de socio — opción "Cobros" del filtro Tipo (ARQUEO-03).
const COBRO_KINDS = ['plan_charge', 'debt_settlement', 'advance_payment', 'refund'];

const KIND_LABELS: Record<string, string> = {
  plan_charge: 'Cobro de plan',
  debt_settlement: 'Pago de saldo',
  advance_payment: 'Cobro suelto',
  refund: 'Reintegro',
  expense: 'Egreso',
  cash_transfer: 'Movimiento',
  adjustment: 'Ajuste',
};

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

function kindColor(kind: string): string {
  if (kind === 'expense' || kind === 'refund') return 'negative';
  if (kind === 'cash_transfer') return 'grey-7';
  if (COBRO_KINDS.includes(kind)) return 'positive'; // cobros de socio
  return 'warning'; // adjustment
}

// =========================================================================
// Estado de validación (ARQUEO-02). El enum del schema es
// pendiente | observado | corregido | validado.
// =========================================================================

const VALIDATION_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  observado: 'Observado',
  corregido: 'Corregido',
  validado: 'Validado',
};

function validationLabel(status: string): string {
  return VALIDATION_LABELS[status] ?? status;
}

function validationColor(status: string): string {
  if (status === 'validado') return 'positive';
  if (status === 'pendiente') return 'warning';
  if (status === 'observado') return 'info';
  return 'grey-6'; // corregido
}

// Filas que restan de la caja (se muestran con "−" rojo): egresos y reintegros.
// No incluye cash_transfer (su leg de origen/destino se narra en Concepto, sin
// signo, para no romper el display de movimientos ya consolidado).
function isEgreso(row: MovEgresoItem): boolean {
  return row.kind === 'expense' || row.kind === 'refund';
}

/**
 * Concepto column: for a transfer render origen → destino as one logical row;
 * for an egreso show the concepto/notes. Falls back to "—" when nothing.
 */
function conceptoText(row: MovEgresoItem): string {
  if (row.kind === 'cash_transfer') {
    // Transfer notes encode the origen/destino narrative; show them as-is.
    return row.notes || `${row.cashRegisterName}`;
  }
  return row.notes || '—';
}

// =========================================================================
// State
// =========================================================================

const rows = ref<MovEgresoItem[]>([]);
const loadingTable = ref(false);
const exporting = ref(false);

const selectedMonth = ref(new Date().toISOString().slice(0, 7));

const filters = reactive({
  cashRegisterId: null as number | null,
  // Client-side tipo filter. Phase 146: el endpoint devuelve TODO lo imputado a
  // la caja (cobros de socio + egresos + traspasos + ajustes), así que el filtro
  // suma "Cobros".
  tipo: 'todos' as 'movimientos' | 'egresos' | 'ajustes' | 'cobros' | 'todos',
});

const tipoOptions = [
  { label: 'Todos', value: 'todos' },
  { label: 'Cobros', value: 'cobros' },
  { label: 'Movimientos', value: 'movimientos' },
  { label: 'Egresos', value: 'egresos' },
  { label: 'Ajustes', value: 'ajustes' },
];

const tablePagination = ref({
  page: 1,
  rowsPerPage: 20,
  rowsNumber: 0,
  sortBy: null as string | null,
  descending: false,
});

// Caja options built from the rows that come back (the endpoint already scopes
// by country); "Todas" resets the filter.
const cashRegisterOptions = ref<Array<{ label: string; value: number | null }>>([
  { label: 'Todas', value: null },
]);

const dateRange = computed(() => {
  if (!selectedMonth.value) return { dateFrom: undefined, dateTo: undefined };
  const [year, month] = selectedMonth.value.split('-').map(Number);
  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { dateFrom, dateTo };
});

// Tipo is a client-side filter over the page (kind → tipo mapping).
const filteredRows = computed<MovEgresoItem[]>(() => {
  if (filters.tipo === 'cobros') {
    return rows.value.filter((r) => COBRO_KINDS.includes(r.kind));
  }
  if (filters.tipo === 'movimientos') {
    return rows.value.filter((r) => r.kind === 'cash_transfer');
  }
  if (filters.tipo === 'egresos') {
    return rows.value.filter((r) => r.kind === 'expense');
  }
  if (filters.tipo === 'ajustes') {
    return rows.value.filter((r) => r.kind === 'adjustment');
  }
  return rows.value;
});

// =========================================================================
// Columns
// =========================================================================

const columns: QTableProps['columns'] = [
  { name: 'fecha', label: 'Fecha', field: 'transactionDate', align: 'left', sortable: false },
  { name: 'tipo', label: 'Tipo', field: 'kind', align: 'left', sortable: false },
  { name: 'concepto', label: 'Concepto', field: 'notes', align: 'left', sortable: false },
  { name: 'monto', label: 'Monto', field: 'amount', align: 'left', sortable: false },
  { name: 'caja', label: 'Caja', field: 'cashRegisterName', align: 'left', sortable: false },
  {
    name: 'estado',
    label: 'Estado',
    field: 'validationStatus',
    align: 'left',
    sortable: false,
  },
  {
    name: 'registrado',
    label: 'Registrado por',
    field: 'recorderName',
    align: 'left',
    sortable: false,
  },
  {
    name: 'acciones',
    label: '',
    field: 'id',
    align: 'center',
    sortable: false,
    style: 'width: 50px',
  },
];

// =========================================================================
// Data loading
// =========================================================================

function rebuildCashRegisterOptions() {
  const seen = new Map<number, string>();
  for (const r of rows.value) {
    if (r.cashRegisterId !== null && !seen.has(r.cashRegisterId)) {
      seen.set(r.cashRegisterId, r.cashRegisterName);
    }
  }
  const options: Array<{ label: string; value: number | null }> = [{ label: 'Todas', value: null }];
  for (const [id, name] of seen) {
    options.push({ label: name, value: id });
  }
  // Preserve any already-selected caja that isn't on the current page.
  if (filters.cashRegisterId !== null && !options.some((o) => o.value === filters.cashRegisterId)) {
    options.push({ label: `Caja #${filters.cashRegisterId}`, value: filters.cashRegisterId });
  }
  cashRegisterOptions.value = options;
}

async function loadHistory() {
  loadingTable.value = true;
  try {
    const params: MovEgresoParams = {
      cashRegisterId: filters.cashRegisterId ?? undefined,
      dateFrom: dateRange.value.dateFrom,
      dateTo: dateRange.value.dateTo,
      country: props.isOwner ? props.selectedCountry : undefined,
      page: tablePagination.value.page,
      limit: tablePagination.value.rowsPerPage,
    };
    const result = await transactionsApi.getMovEgresosHistory(params);
    rows.value = result.rows;
    tablePagination.value.rowsNumber = result.total;
    rebuildCashRegisterOptions();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading mov/egresos history', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando movimientos' });
  } finally {
    loadingTable.value = false;
  }
}

function onFilterChange() {
  tablePagination.value.page = 1;
  loadHistory();
}

function onTableRequest(tableProps: { pagination: { page: number; rowsPerPage: number } }) {
  tablePagination.value.page = tableProps.pagination.page;
  tablePagination.value.rowsPerPage = tableProps.pagination.rowsPerPage;
  loadHistory();
}

// =========================================================================
// Detail dialog
// =========================================================================

const detailRow = ref<MovEgresoItem | null>(null);
const showDetailDialog = ref(false);

function showDetails(row: MovEgresoItem) {
  detailRow.value = row;
  showDetailDialog.value = true;
}

// =========================================================================
// Registrar movimiento / egreso (fase 139). On success the dialog notifies;
// we just reload the history (and saldos refresh on their own tab).
// =========================================================================

const showRegistrar = ref(false);

function onRegistered() {
  loadHistory();
}

// =========================================================================
// Excel export (REP-04) — blob-download pattern.
// =========================================================================

async function onExportMovEgresos(): Promise<void> {
  exporting.value = true;
  try {
    const blob = await transactionsApi.exportMovEgresosToExcel({
      cashRegisterId: filters.cashRegisterId ?? undefined,
      dateFrom: dateRange.value.dateFrom,
      dateTo: dateRange.value.dateTo,
      country: props.isOwner ? props.selectedCountry : undefined,
    });
    const today = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mov-egresos-${today}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    $q.notify({ type: 'positive', message: 'Excel exportado' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error exportando mov/egresos', { error: message });
    $q.notify({ type: 'negative', message: 'Error exportando movimientos' });
  } finally {
    exporting.value = false;
  }
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(loadHistory);

// Re-fetch when the hub switches country (owner AR/ES).
watch(
  () => props.selectedCountry,
  () => {
    tablePagination.value.page = 1;
    loadHistory();
  }
);

// Component-level onUnmounted is allowed (the rule forbids onUnmounted INSIDE
// the composable, not in the SFC). Drives the composable cleanup().
onUnmounted(() => {
  transactionsApi.cleanup();
});
</script>
