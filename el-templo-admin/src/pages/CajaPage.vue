<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-md">
      <div class="text-h5 col">Caja</div>
    </div>

    <!-- Owner-only country selector (D-06 / D-10) -->
    <div v-if="isOwner" class="row q-gutter-md q-mb-md">
      <div class="col-auto" style="min-width: 180px">
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
    </div>

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
      <div class="col-6 col-sm-2">
        <!-- @vue-ignore: "month" is valid HTML5 but not in Quasar's type union -->
        <q-input
          v-model="selectedMonth"
          label="Mes"
          type="month"
          dense
          outlined
          @update:model-value="onFilterChange"
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
    <!-- Egresos Placeholder -->
    <!-- ========================================== -->
    <q-card flat bordered class="q-mt-lg">
      <q-card-section>
        <div class="row items-center q-gutter-sm">
          <div class="text-subtitle1 text-weight-bold text-grey-7">Egresos</div>
          <q-badge color="grey" label="Proximamente" />
        </div>
        <div class="text-caption text-grey-5 q-mt-sm">
          Seguimiento de gastos y fondo de caja. Disponible en una futura actualizacion.
        </div>
      </q-card-section>
    </q-card>
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
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { formatDate } from 'src/utils/format-date';
import { formatPrice } from 'src/utils/format-price';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_COLORS,
  PAYMENT_METHOD_FILTER_OPTIONS,
  type TransactionListItem,
  type PaymentMethod,
  type FinanceSummary,
} from 'src/types/transaction';
import type { BranchOption } from 'src/types/member';

const log = createLogger('CajaPage');
const $q = useQuasar();
const router = useRouter();
const membersApi = useMembersApi();
const transactionsApi = useTransactionsApi();
const authStore = useAuthStore();

// =========================================================================
// Country selector (owner-only per D-06 / D-10)
// =========================================================================

const isOwner = computed(() => authStore.user?.role === 'owner');

const countryOptions = [
  { label: 'Argentina', value: 'AR' as const },
  { label: 'España', value: 'ES' as const },
];

// Default Argentina per D-06 (no Todos mode, no session persistence)
const selectedCountry = ref<'AR' | 'ES'>('AR');

// Summary totals are derived from the selected country for owners; non-owners
// see their own country's currency. Server auto-scopes, so the label matches.
const displayCurrency = computed<'ARS' | 'EUR'>(() =>
  selectedCountry.value === 'ES' ? 'EUR' : 'ARS'
);

async function onCountryChange() {
  tablePagination.value.page = 1;
  await Promise.all([loadSummary(), loadTransactions()]);
}

// =========================================================================
// State
// =========================================================================

const transactions = ref<TransactionListItem[]>([]);
const loadingTable = ref(false);
const loadingSummary = ref(false);

const summary = reactive<FinanceSummary>({
  monthlyRevenue: 0,
  revenueByMethod: { cash: 0, transfer: 0, card: 0, aura_credit: 0, internal: 0 },
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

const selectedMonth = ref(new Date().toISOString().slice(0, 7));

const dateRange = computed(() => {
  if (!selectedMonth.value) return { dateFrom: undefined, dateTo: undefined };
  const [year, month] = selectedMonth.value.split('-').map(Number);
  const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const dateTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { dateFrom, dateTo };
});

const filters = reactive({
  search: '',
  branchId: null as number | null,
  paymentMethod: null as PaymentMethod | null,
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
  { name: 'alumno', label: 'Alumno', field: 'memberName', align: 'left', sortable: false },
  { name: 'monto', label: 'Monto', field: 'amount', align: 'left', sortable: false },
  { name: 'metodo', label: 'Metodo', field: 'paymentMethod', align: 'left', sortable: false },
  {
    name: 'plan',
    label: 'Concepto',
    // Phase 106 minimal binding — Phase 109 will replace with a richer
    // kind-driven concept label (e.g. plan name + period). For now we
    // surface the first link target as "<targetKind> #<targetId>".
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
      country: isOwner.value ? selectedCountry.value : undefined,
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
    // Phase 106 scope: bind to the inflow revenue types only so the
    // Caja list keeps its "cobros" semantics (the legacy /payments
    // endpoint was inherently inflow-only). We only request
    // plan_charge here; debt_settlement transactions surface in the
    // member financial-history endpoint (Plan 04). Phase 109 widens
    // CajaPage to a unified transaction view with a kind dropdown.
    const result = await transactionsApi.listTransactions({
      search: filters.search || undefined,
      branchId: filters.branchId ?? undefined,
      country: isOwner.value ? selectedCountry.value : undefined,
      paymentMethod: filters.paymentMethod ?? undefined,
      kind: 'plan_charge',
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

function onTableRequest(props: { pagination: { page: number; rowsPerPage: number } }) {
  tablePagination.value.page = props.pagination.page;
  tablePagination.value.rowsPerPage = props.pagination.rowsPerPage;
  loadTransactions();
}

function goToMember(memberId: number) {
  router.push(`/alumnos/${memberId}`);
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadBranches();
  loadSummary();
  loadTransactions();
});
</script>
