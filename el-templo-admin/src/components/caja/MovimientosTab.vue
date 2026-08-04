<template>
  <div>
    <!-- ========================================== -->
    <!-- Summary Cards -->
    <!-- ========================================== -->
    <div class="row q-col-gutter-md q-mb-md">
      <!-- Efectivo -->
      <div class="col-6 col-sm-3">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-caption text-grey-7">
              <q-icon name="payments" color="green" class="q-mr-xs" /> Efectivo
            </div>
            <div v-if="loadingSummary" class="q-mt-xs">
              <q-skeleton type="text" width="100px" />
            </div>
            <div v-else class="text-h5 text-weight-bold q-mt-xs">
              {{ formatPrice(summary.revenueByMethod.cash, displayCurrency) }}
            </div>
          </q-card-section>
        </q-card>
      </div>
      <!-- Transferencia -->
      <div class="col-6 col-sm-3">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-caption text-grey-7">
              <q-icon name="account_balance" color="blue" class="q-mr-xs" /> Transferencia
            </div>
            <div v-if="loadingSummary" class="q-mt-xs">
              <q-skeleton type="text" width="100px" />
            </div>
            <div v-else class="text-h5 text-weight-bold q-mt-xs">
              {{ formatPrice(summary.revenueByMethod.transfer, displayCurrency) }}
            </div>
          </q-card-section>
        </q-card>
      </div>
      <!-- Tarjeta -->
      <div class="col-6 col-sm-3">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-caption text-grey-7">
              <q-icon name="credit_card" color="purple" class="q-mr-xs" /> Tarjeta
            </div>
            <div v-if="loadingSummary" class="q-mt-xs">
              <q-skeleton type="text" width="100px" />
            </div>
            <div v-else class="text-h5 text-weight-bold q-mt-xs">
              {{ formatPrice(summary.revenueByMethod.card, displayCurrency) }}
            </div>
          </q-card-section>
        </q-card>
      </div>
      <!-- Domiciliación (SEPA) — solo sedes de España. Se muestra únicamente
           cuando hubo movimiento, así el grid de 4 columnas queda intacto en
           Argentina, donde el método no existe. -->
      <div v-if="summary.revenueByMethod.direct_debit > 0" class="col-6 col-sm-3">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-caption text-grey-7">
              <q-icon name="account_balance" color="teal" class="q-mr-xs" /> Domiciliación
            </div>
            <div v-if="loadingSummary" class="q-mt-xs">
              <q-skeleton type="text" width="100px" />
            </div>
            <div v-else class="text-h5 text-weight-bold q-mt-xs">
              {{ formatPrice(summary.revenueByMethod.direct_debit, displayCurrency) }}
            </div>
          </q-card-section>
        </q-card>
      </div>
      <!-- Total -->
      <div class="col-6 col-sm-3">
        <q-card flat bordered class="bg-grey-1">
          <q-card-section>
            <div class="text-caption text-grey-7">
              <q-icon name="account_balance_wallet" class="q-mr-xs" /> Total
            </div>
            <div v-if="loadingSummary" class="q-mt-xs">
              <q-skeleton type="text" width="100px" />
            </div>
            <div v-else class="text-h5 text-weight-bold text-positive q-mt-xs">
              {{ formatPrice(summary.monthlyRevenue, displayCurrency) }}
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- Por tipo de transacción (Phase 109 D-10) -->
    <!-- ========================================== -->
    <div class="q-mb-md">
      <div class="text-subtitle1 text-weight-medium q-mb-sm">Por tipo de transacción</div>
      <div class="row q-col-gutter-sm">
        <div v-for="kind in KIND_ORDER" :key="kind" class="col-6 col-sm">
          <q-card flat bordered>
            <q-card-section>
              <div class="text-caption text-grey-7">{{ KIND_LABELS_ES[kind] }}</div>
              <div v-if="loadingSummary" class="q-mt-xs">
                <q-skeleton type="text" width="80px" />
              </div>
              <div
                v-else
                class="text-h6 text-weight-bold q-mt-xs"
                :class="`text-${KIND_COLORS[kind]}`"
              >
                {{ formatPrice(summary.revenueByKind[kind], displayCurrency) }}
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- Filter Bar -->
    <!-- ========================================== -->
    <div class="row q-col-gutter-sm q-mb-md items-end">
      <div class="col-12 col-sm-3">
        <q-input
          v-model="filters.search"
          label="Buscar por alumno"
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
      <div class="col-6 col-sm-2">
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
      <div class="col-6 col-sm-2">
        <q-select
          v-model="filters.paymentMethod"
          :options="methodFilterOptions"
          label="Metodo"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>
      <!-- Phase 109 D-12 — Tipo filter (single-select) -->
      <div class="col-6 col-sm-2">
        <q-select
          v-model="filters.kind"
          :options="KIND_OPTIONS"
          label="Tipo"
          dense
          outlined
          emit-value
          map-options
          option-value="value"
          option-label="label"
          @update:model-value="onFilterChange"
        />
      </div>
      <!-- Phase 152 D-04 — filtro por estado de validación (server-side) -->
      <div class="col-6 col-sm-2">
        <q-select
          v-model="filters.estado"
          :options="ESTADO_OPTIONS"
          label="Estado"
          dense
          outlined
          emit-value
          map-options
          option-value="value"
          option-label="label"
          @update:model-value="onFilterChange"
        />
      </div>
      <!-- Phase 152 D-03 — rango de fecha mes↔días (control compartido) -->
      <div class="col-12 col-sm-4">
        <DateRangeFilter
          :model-value="dateRange"
          month-label="Mes"
          @update:model-value="onDateRangeChange"
        />
      </div>
      <!-- Phase 109 D-15 — Excel export (server-side, exceljs) -->
      <div class="col-12 col-sm-auto">
        <q-btn
          icon="download"
          label="Exportar Excel"
          color="primary"
          outline
          dense
          :loading="exporting"
          @click="onExportCaja"
        />
      </div>
    </div>

    <!-- ========================================== -->
    <!-- Transactions Table -->
    <!-- ========================================== -->
    <q-table
      :rows="transactions"
      :columns="columns"
      row-key="id"
      :loading="loadingTable"
      :pagination="tablePagination"
      :rows-per-page-options="[20, 50, 100]"
      @request="onTableRequest"
    >
      <!-- Fecha column -->
      <template #body-cell-fecha="slotProps">
        <q-td :props="slotProps" :class="{ 'text-grey-5': isVoided(slotProps.row) }">
          {{ formatDate(slotProps.row.transactionDate) }}
        </q-td>
      </template>

      <!-- Tipo column (Phase 109 D-13) -->
      <template #body-cell-kind="slotProps">
        <q-td :props="slotProps">
          <q-badge
            :color="isVoided(slotProps.row) ? 'grey' : kindColor(slotProps.row.kind)"
            :label="kindLabel(slotProps.row.kind)"
          />
        </q-td>
      </template>

      <!-- Alumno column (clickable) -->
      <template #body-cell-alumno="slotProps">
        <q-td :props="slotProps">
          <span
            class="text-weight-medium text-primary cursor-pointer"
            @click="goToMember(slotProps.row.memberId)"
          >
            {{ slotProps.row.memberName }}
          </span>
        </q-td>
      </template>

      <!-- Monto column -->
      <template #body-cell-monto="slotProps">
        <q-td :props="slotProps">
          <span
            :class="{
              'text-grey-5': isVoided(slotProps.row),
              'text-strike': isVoided(slotProps.row),
            }"
          >
            {{ formatPrice(slotProps.row.amount, slotProps.row.currency ?? displayCurrency) }}
          </span>
        </q-td>
      </template>

      <!-- Metodo column -->
      <template #body-cell-metodo="slotProps">
        <q-td :props="slotProps">
          <q-badge
            :color="isVoided(slotProps.row) ? 'grey' : methodColor(slotProps.row.paymentMethod)"
            :label="methodLabel(slotProps.row.paymentMethod)"
          />
        </q-td>
      </template>

      <!-- Estado de validación column (Phase 152 CAJA-02) -->
      <template #body-cell-estado="slotProps">
        <q-td :props="slotProps">
          <q-badge
            :color="validationColor(slotProps.row.validationStatus)"
            :label="validationLabel(slotProps.row.validationStatus)"
          />
        </q-td>
      </template>

      <!-- Concepto column (Phase 106 minimal binding) -->
      <template #body-cell-plan="slotProps">
        <q-td :props="slotProps" :class="{ 'text-grey-5': isVoided(slotProps.row) }">
          <div>
            {{
              slotProps.row.linkSummary[0]
                ? `${slotProps.row.linkSummary[0].targetKind} #${slotProps.row.linkSummary[0].targetId}`
                : '—'
            }}
          </div>
        </q-td>
      </template>

      <!-- Registrado por column -->
      <template #body-cell-registrado="slotProps">
        <q-td :props="slotProps" :class="{ 'text-grey-5': isVoided(slotProps.row) }">
          {{ slotProps.row.recorderName }}
        </q-td>
      </template>

      <!-- Actions column -->
      <template #body-cell-acciones="slotProps">
        <q-td :props="slotProps">
          <q-btn flat dense round icon="more_vert" size="sm">
            <q-menu>
              <q-item clickable v-close-popup @click="showTransactionDetails(slotProps.row)">
                <q-item-section avatar><q-icon name="info" /></q-item-section>
                <q-item-section>Detalles</q-item-section>
              </q-item>
              <q-item
                v-if="!isVoided(slotProps.row)"
                clickable
                v-close-popup
                @click="confirmVoid(slotProps.row)"
              >
                <q-item-section avatar><q-icon name="block" color="negative" /></q-item-section>
                <q-item-section class="text-negative">Anular</q-item-section>
              </q-item>
            </q-menu>
          </q-btn>
        </q-td>
      </template>
    </q-table>

    <!-- ========================================== -->
    <!-- Transaction Details Dialog -->
    <!-- ========================================== -->
    <q-dialog v-model="showDetailDialog">
      <q-card v-if="detailTransaction" style="width: 480px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">Detalle de la Transaccion #{{ detailTransaction.id }}</div>
        </q-card-section>
        <q-separator />
        <q-card-section>
          <q-list dense>
            <q-item>
              <q-item-section>Alumno</q-item-section>
              <q-item-section side class="text-weight-medium">
                {{ detailTransaction.memberName }}
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Monto</q-item-section>
              <q-item-section side class="text-weight-bold text-h6">
                {{
                  formatPrice(
                    detailTransaction.amount,
                    detailTransaction.currency ?? displayCurrency
                  )
                }}
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Metodo</q-item-section>
              <q-item-section side>
                <q-badge
                  :color="methodColor(detailTransaction.paymentMethod)"
                  :label="methodLabel(detailTransaction.paymentMethod)"
                />
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Fecha</q-item-section>
              <q-item-section side>
                {{ formatDate(detailTransaction.transactionDate) }}
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Fecha efectiva</q-item-section>
              <q-item-section side>
                {{ formatDate(detailTransaction.effectiveDate) }}
              </q-item-section>
            </q-item>
            <q-separator spaced />
            <q-item>
              <q-item-section>Concepto</q-item-section>
              <q-item-section side class="text-weight-medium">
                {{
                  detailTransaction.linkSummary[0]
                    ? `${detailTransaction.linkSummary[0].targetKind} #${detailTransaction.linkSummary[0].targetId}`
                    : '—'
                }}
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Sucursal</q-item-section>
              <q-item-section side>{{ detailTransaction.branchName }}</q-item-section>
            </q-item>
            <q-separator spaced />
            <q-item>
              <q-item-section>Registrado por</q-item-section>
              <q-item-section side>{{ detailTransaction.recorderName }}</q-item-section>
            </q-item>
            <!-- Validador (Phase 152 CAJA-04). Solo si el cobro está validado:
                 rama D-05 (validado por la bandeja → validador + fecha) vs D-06
                 (nacido validado, sin validador → literal de alta). -->
            <q-item v-if="detailTransaction.validatorName">
              <q-item-section>Validado por</q-item-section>
              <q-item-section side>
                {{ detailTransaction.validatorName }}
                <span v-if="detailTransaction.validatedAt" class="text-grey-7">
                  · {{ formatDate(detailTransaction.validatedAt) }}
                </span>
              </q-item-section>
            </q-item>
            <q-item v-else-if="detailTransaction.validationStatus === 'validado'">
              <q-item-section>Validación</q-item-section>
              <q-item-section side class="text-grey-7">
                Validado al registrar
                <span class="text-grey-6">
                  · {{ detailTransaction.recorderName }} ·
                  {{ formatDate(detailTransaction.createdAt) }}
                </span>
              </q-item-section>
            </q-item>
            <q-item v-if="detailTransaction.notes">
              <q-item-section>Notas</q-item-section>
              <q-item-section side class="text-italic">
                {{ detailTransaction.notes }}
              </q-item-section>
            </q-item>
            <template v-if="isVoided(detailTransaction)">
              <q-separator spaced />
              <q-item>
                <q-item-section>
                  <q-badge color="negative" label="ANULADO" class="q-pa-xs" />
                </q-item-section>
              </q-item>
              <q-item v-if="detailTransaction.voidedAt">
                <q-item-section>Fecha anulacion</q-item-section>
                <q-item-section side>
                  {{ formatDate(detailTransaction.voidedAt) }}
                </q-item-section>
              </q-item>
            </template>
          </q-list>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cerrar" color="grey" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { formatDate } from 'src/utils/format-date';
import { formatPrice } from 'src/utils/format-price';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import DateRangeFilter from 'src/components/caja/DateRangeFilter.vue';
import { currentMonthRange, type DateRangeValue } from 'src/utils/date-range';
import { validationLabel, validationColor } from 'src/utils/validation-status';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_COLORS,
  PAYMENT_METHOD_FILTER_OPTIONS,
  type TransactionListItem,
  type PaymentMethod,
  type TransactionKind,
  type FinanceSummary,
} from 'src/types/transaction';
import type { BranchOption } from 'src/types/member';

// =========================================================================
// Props — selectedCountry / isOwner are owned by the CajaPage hub and passed
// down so every tab scopes to the same country (D-01 / UI-SPEC). The owner
// country q-select lives in the hub header, NOT here.
// =========================================================================

const props = defineProps<{
  selectedCountry: 'AR' | 'ES';
  isOwner: boolean;
}>();

const log = createLogger('MovimientosTab');
const $q = useQuasar();
const router = useRouter();
const membersApi = useMembersApi();
const transactionsApi = useTransactionsApi();

// Summary totals are derived from the selected country for owners; non-owners
// see their own country's currency. Server auto-scopes, so the label matches.
const displayCurrency = computed<'ARS' | 'EUR'>(() =>
  props.selectedCountry === 'ES' ? 'EUR' : 'ARS'
);

// =========================================================================
// Phase 109 — Kind labels / colors / filter options (D-10, D-12, D-13)
// =========================================================================

const KIND_LABELS_ES: Record<TransactionKind, string> = {
  plan_charge: 'Cobro de plan',
  debt_settlement: 'Pago de saldo',
  refund: 'Reembolso',
  adjustment: 'Ajuste',
  advance_payment: 'Pago anticipado',
};

// Quasar color tokens per D-10:
//   plan_charge   = positive  (verde)
//   debt_settlement = primary  (terracotta)
//   refund        = negative  (rojo)
//   adjustment    = warning   (amarillo)
//   advance_payment = purple  (violeta)
const KIND_COLORS: Record<TransactionKind, string> = {
  plan_charge: 'positive',
  debt_settlement: 'primary',
  refund: 'negative',
  adjustment: 'warning',
  advance_payment: 'purple',
};

const KIND_ORDER: TransactionKind[] = [
  'plan_charge',
  'debt_settlement',
  'refund',
  'adjustment',
  'advance_payment',
];

const KIND_OPTIONS: Array<{ label: string; value: TransactionKind | null }> = [
  { label: 'Todos', value: null },
  { label: KIND_LABELS_ES.plan_charge, value: 'plan_charge' },
  { label: KIND_LABELS_ES.debt_settlement, value: 'debt_settlement' },
  { label: KIND_LABELS_ES.refund, value: 'refund' },
  { label: KIND_LABELS_ES.adjustment, value: 'adjustment' },
  { label: KIND_LABELS_ES.advance_payment, value: 'advance_payment' },
];

// Phase 152 D-04 — filtro por estado de validación. `null` === "Todas" (omite el
// query param); el backend (152-03) solo valida validado/pendiente.
const ESTADO_OPTIONS: Array<{ label: string; value: 'validado' | 'pendiente' | null }> = [
  { label: 'Todas', value: null },
  { label: 'Validadas', value: 'validado' },
  { label: 'Pendientes', value: 'pendiente' },
];

// =========================================================================
// State
// =========================================================================

const transactions = ref<TransactionListItem[]>([]);
const loadingTable = ref(false);
const loadingSummary = ref(false);
const exporting = ref(false);

const summary = reactive<FinanceSummary>({
  monthlyRevenue: 0,
  revenueByMethod: {
    cash: 0,
    transfer: 0,
    card: 0,
    aura_credit: 0,
    internal: 0,
    direct_debit: 0,
  },
  revenueByBranch: [],
  // Phase 109 D-11 — additive field for "Por tipo de transaccion" block.
  revenueByKind: {
    plan_charge: 0,
    debt_settlement: 0,
    refund: 0,
    adjustment: 0,
    advance_payment: 0,
  },
});

// Rango de fecha manejado por <DateRangeFilter> (mes default + toggle a días,
// D-03). Arranca en el mes corriente para que el load inicial sea idéntico al
// comportamiento previo.
const dateRange = ref<DateRangeValue>(currentMonthRange());

const filters = reactive({
  search: '',
  branchId: null as number | null,
  paymentMethod: null as PaymentMethod | null,
  // Phase 109 D-12 — single-select kind filter, null = "Todos".
  kind: null as TransactionKind | null,
  // Phase 152 D-04 — filtro por estado de validación, null = "Todas".
  estado: null as 'validado' | 'pendiente' | null,
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

const branchFilterOptions = ref<Array<{ label: string; value: number | null }>>([
  { label: 'Todas', value: null },
]);

const methodFilterOptions = [{ label: 'Todos', value: null }, ...PAYMENT_METHOD_FILTER_OPTIONS];

// =========================================================================
// Table columns
// =========================================================================

const columns: QTableProps['columns'] = [
  { name: 'fecha', label: 'Fecha', field: 'transactionDate', align: 'left', sortable: false },
  { name: 'kind', label: 'Tipo', field: 'kind', align: 'left', sortable: false },
  { name: 'alumno', label: 'Alumno', field: 'memberName', align: 'left', sortable: false },
  { name: 'monto', label: 'Monto', field: 'amount', align: 'left', sortable: false },
  { name: 'metodo', label: 'Metodo', field: 'paymentMethod', align: 'left', sortable: false },
  {
    name: 'estado',
    label: 'Estado',
    field: 'validationStatus',
    align: 'left',
    sortable: false,
  },
  {
    name: 'plan',
    label: 'Concepto',
    field: (row: TransactionListItem) =>
      row.linkSummary[0] ? `${row.linkSummary[0].targetKind} #${row.linkSummary[0].targetId}` : '—',
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
// Display helpers
// =========================================================================

function isVoided(transaction: TransactionListItem): boolean {
  return transaction.voidedAt !== null;
}

function methodLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

function methodColor(method: PaymentMethod): string {
  return PAYMENT_METHOD_COLORS[method] ?? 'grey';
}

function kindLabel(kind: TransactionKind): string {
  return KIND_LABELS_ES[kind] ?? kind;
}

function kindColor(kind: TransactionKind): string {
  return KIND_COLORS[kind] ?? 'grey';
}

// =========================================================================
// Data loading
// =========================================================================

async function loadBranches() {
  try {
    const branches: BranchOption[] = await membersApi.getBranches();
    branchFilterOptions.value = [
      { label: 'Todas', value: null },
      ...branches.map((b) => ({ label: b.name, value: b.id })),
    ];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading branches', { error: message });
  }
}

async function loadSummary() {
  loadingSummary.value = true;
  try {
    const data = await transactionsApi.getSummary({
      branchId: filters.branchId ?? undefined,
      dateFrom: dateRange.value.dateFrom,
      dateTo: dateRange.value.dateTo,
      country: props.isOwner ? props.selectedCountry : undefined,
    });
    summary.monthlyRevenue = data.monthlyRevenue;
    summary.revenueByMethod = data.revenueByMethod;
    summary.revenueByBranch = data.revenueByBranch;
    // D-11 — defensive fallback if backend omits the field (older API).
    summary.revenueByKind = data.revenueByKind ?? {
      plan_charge: 0,
      debt_settlement: 0,
      refund: 0,
      adjustment: 0,
      advance_payment: 0,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading financial summary', { error: message });
  } finally {
    loadingSummary.value = false;
  }
}

async function loadTransactions() {
  loadingTable.value = true;
  try {
    const result = await transactionsApi.listTransactions({
      search: filters.search || undefined,
      branchId: filters.branchId ?? undefined,
      country: props.isOwner ? props.selectedCountry : undefined,
      paymentMethod: filters.paymentMethod ?? undefined,
      kind: filters.kind ?? undefined,
      validationStatus: filters.estado ?? undefined,
      dateFrom: dateRange.value.dateFrom,
      dateTo: dateRange.value.dateTo,
      page: tablePagination.value.page,
      limit: tablePagination.value.rowsPerPage,
    });
    transactions.value = result.rows;
    tablePagination.value.rowsNumber = result.total;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading transactions', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando transacciones' });
  } finally {
    loadingTable.value = false;
  }
}

// =========================================================================
// Transaction details
// =========================================================================

const detailTransaction = ref<TransactionListItem | null>(null);
const showDetailDialog = ref(false);

function showTransactionDetails(transaction: TransactionListItem) {
  detailTransaction.value = transaction;
  showDetailDialog.value = true;
}

// =========================================================================
// Void action
// =========================================================================

function confirmVoid(transaction: TransactionListItem) {
  $q.dialog({
    title: 'Anular transaccion',
    message: `Anular la transaccion de ${formatPrice(transaction.amount, transaction.currency ?? displayCurrency.value)} de ${transaction.memberName}? Esta accion no se puede deshacer.`,
    prompt: {
      model: '',
      type: 'textarea',
      label: 'Motivo de anulacion *',
      isValid: (v: string) => v.trim().length > 0,
    },
    cancel: { flat: true, label: 'Cancelar' },
    ok: { color: 'negative', label: 'Anular' },
  }).onOk(async (reason: string) => {
    try {
      await transactionsApi.voidTransaction(transaction.id, reason.trim());
      $q.notify({ type: 'positive', message: 'Transaccion anulada' });
      loadTransactions();
      loadSummary();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error voiding transaction', { error: message });
      $q.notify({ type: 'negative', message: 'Error anulando transaccion' });
    }
  });
}

// =========================================================================
// Event handlers
// =========================================================================

function onFilterChange() {
  tablePagination.value.page = 1;
  loadTransactions();
  loadSummary();
}

// Emitido por <DateRangeFilter> al cambiar mes/día. Resetea a la primera página
// y recarga listado + resumen (mismo contrato { dateFrom, dateTo } que el mes).
function onDateRangeChange(value: DateRangeValue) {
  dateRange.value = value;
  tablePagination.value.page = 1;
  loadTransactions();
  loadSummary();
}

function onTableRequest(tableProps: { pagination: { page: number; rowsPerPage: number } }) {
  tablePagination.value.page = tableProps.pagination.page;
  tablePagination.value.rowsPerPage = tableProps.pagination.rowsPerPage;
  loadTransactions();
}

function goToMember(memberId: number) {
  router.push(`/alumnos/${memberId}`);
}

// =========================================================================
// Excel export (Phase 109 D-15)
// =========================================================================

/**
 * Server-side Excel export. Calls GET /admin/finance/transactions/export
 * which returns a fully-rendered .xlsx (exceljs). No client-side pagination
 * loop or xlsx library — the backend handles it in one shot per the
 * Phase 64 P03 reports pattern.
 */
async function onExportCaja(): Promise<void> {
  exporting.value = true;
  try {
    const blob = await transactionsApi.exportToExcel({
      search: filters.search || undefined,
      branchId: filters.branchId ?? undefined,
      country: props.isOwner ? props.selectedCountry : undefined,
      paymentMethod: filters.paymentMethod ?? undefined,
      kind: filters.kind ?? undefined,
      dateFrom: dateRange.value.dateFrom,
      dateTo: dateRange.value.dateTo,
    });
    const today = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caja-${today}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    $q.notify({ type: 'positive', message: 'Excel exportado' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error exportando caja', { error: message });
    $q.notify({ type: 'negative', message: 'Error exportando caja' });
  } finally {
    exporting.value = false;
  }
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadBranches();
  loadSummary();
  loadTransactions();
});

// Re-fetch when the hub changes the shared country (owner switches AR/ES).
// Replaces the old in-page @update:model-value on the country selector that
// now lives in the CajaPage hub header.
watch(
  () => props.selectedCountry,
  () => {
    tablePagination.value.page = 1;
    loadSummary();
    loadTransactions();
  }
);

// Component-level onUnmounted is fine — the rule forbids onUnmounted INSIDE
// the composable, not in the SFC. Drives the composable cleanup().
onUnmounted(() => {
  transactionsApi.cleanup();
});
</script>
