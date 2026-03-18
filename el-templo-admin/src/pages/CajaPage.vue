<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-md">
      <div class="text-h5 col">Caja</div>
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
              ${{ summary.revenueByMethod.cash.toLocaleString() }}
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
              ${{ summary.revenueByMethod.transfer.toLocaleString() }}
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
              ${{ summary.revenueByMethod.card.toLocaleString() }}
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
              ${{ summary.monthlyRevenue.toLocaleString() }}
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
    <!-- Payments Table -->
    <!-- ========================================== -->
    <q-table
      :rows="payments"
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
          {{ formatDate(slotProps.row.paymentDate) }}
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
            ${{ slotProps.row.amount.toLocaleString() }}
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

      <!-- Plan / Periodo column -->
      <template #body-cell-plan="slotProps">
        <q-td :props="slotProps" :class="{ 'text-grey-5': isVoided(slotProps.row) }">
          <div>{{ slotProps.row.planName ?? '—' }}</div>
          <div v-if="slotProps.row.subscriptionStartDate" class="text-caption text-grey-6">
            {{ formatDate(slotProps.row.subscriptionStartDate) }}
            <template v-if="slotProps.row.subscriptionEndDate">
              — {{ formatDate(slotProps.row.subscriptionEndDate) }}
            </template>
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
              <q-item clickable v-close-popup @click="showPaymentDetails(slotProps.row)">
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
    <!-- Payment Details Dialog -->
    <!-- ========================================== -->
    <q-dialog v-model="showDetailDialog">
      <q-card v-if="detailPayment" style="width: 480px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">Detalle del Pago #{{ detailPayment.id }}</div>
        </q-card-section>
        <q-separator />
        <q-card-section>
          <q-list dense>
            <q-item>
              <q-item-section>Alumno</q-item-section>
              <q-item-section side class="text-weight-medium">
                {{ detailPayment.memberName }}
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Monto</q-item-section>
              <q-item-section side class="text-weight-bold text-h6">
                ${{ detailPayment.amount.toLocaleString() }}
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Metodo</q-item-section>
              <q-item-section side>
                <q-badge
                  :color="methodColor(detailPayment.paymentMethod)"
                  :label="methodLabel(detailPayment.paymentMethod)"
                />
              </q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Fecha de pago</q-item-section>
              <q-item-section side>{{ formatDate(detailPayment.paymentDate) }}</q-item-section>
            </q-item>
            <q-separator spaced />
            <q-item>
              <q-item-section>Plan</q-item-section>
              <q-item-section side class="text-weight-medium">
                {{ detailPayment.planName ?? '—' }}
              </q-item-section>
            </q-item>
            <q-item v-if="detailPayment.subscriptionStartDate">
              <q-item-section>Periodo</q-item-section>
              <q-item-section side>
                {{ formatDate(detailPayment.subscriptionStartDate) }}
                <template v-if="detailPayment.subscriptionEndDate">
                  — {{ formatDate(detailPayment.subscriptionEndDate) }}
                </template>
              </q-item-section>
            </q-item>
            <q-separator spaced />
            <q-item>
              <q-item-section>Registrado por</q-item-section>
              <q-item-section side>{{ detailPayment.recorderName }}</q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Fecha registro</q-item-section>
              <q-item-section side>{{ formatDate(detailPayment.createdAt) }}</q-item-section>
            </q-item>
            <q-item v-if="detailPayment.reference">
              <q-item-section>Referencia</q-item-section>
              <q-item-section side>{{ detailPayment.reference }}</q-item-section>
            </q-item>
            <q-item v-if="detailPayment.notes">
              <q-item-section>Notas</q-item-section>
              <q-item-section side class="text-italic">{{ detailPayment.notes }}</q-item-section>
            </q-item>
            <template v-if="isVoided(detailPayment)">
              <q-separator spaced />
              <q-item>
                <q-item-section>
                  <q-badge color="negative" label="ANULADO" class="q-pa-xs" />
                </q-item-section>
              </q-item>
              <q-item>
                <q-item-section>Motivo</q-item-section>
                <q-item-section side class="text-negative text-italic">
                  {{ detailPayment.voidReason ?? 'Sin motivo' }}
                </q-item-section>
              </q-item>
              <q-item v-if="detailPayment.voidedAt">
                <q-item-section>Fecha anulacion</q-item-section>
                <q-item-section side>{{ formatDate(detailPayment.voidedAt) }}</q-item-section>
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
import { usePaymentsApi } from 'src/composables/usePaymentsApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_COLORS,
  PAYMENT_METHOD_OPTIONS,
  type PaymentListItem,
  type PaymentMethod,
  type FinancialSummary,
} from 'src/types/payment';
import type { BranchOption } from 'src/types/member';

const log = createLogger('CajaPage');
const $q = useQuasar();
const router = useRouter();
const membersApi = useMembersApi();
const paymentsApi = usePaymentsApi();

// =========================================================================
// State
// =========================================================================

const payments = ref<PaymentListItem[]>([]);
const loadingTable = ref(false);
const loadingSummary = ref(false);

const summary = reactive<FinancialSummary>({
  monthlyRevenue: 0,
  revenueByMethod: { cash: 0, transfer: 0, card: 0 },
  revenueByBranch: [],
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

const methodFilterOptions = [{ label: 'Todos', value: null }, ...PAYMENT_METHOD_OPTIONS];

// =========================================================================
// Table columns
// =========================================================================

const columns: QTableProps['columns'] = [
  { name: 'fecha', label: 'Fecha', field: 'paymentDate', align: 'left', sortable: false },
  { name: 'alumno', label: 'Alumno', field: 'memberName', align: 'left', sortable: false },
  { name: 'monto', label: 'Monto', field: 'amount', align: 'left', sortable: false },
  { name: 'metodo', label: 'Metodo', field: 'paymentMethod', align: 'left', sortable: false },
  { name: 'plan', label: 'Plan / Periodo', field: 'planName', align: 'left', sortable: false },
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

function isVoided(payment: PaymentListItem): boolean {
  return payment.voidedAt !== null;
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
    const data = await paymentsApi.getFinancialSummary(
      filters.branchId ?? undefined,
      dateRange.value.dateFrom,
      dateRange.value.dateTo
    );
    summary.monthlyRevenue = data.monthlyRevenue;
    summary.revenueByMethod = data.revenueByMethod;
    summary.revenueByBranch = data.revenueByBranch;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading financial summary', { error: message });
  } finally {
    loadingSummary.value = false;
  }
}

async function loadPayments() {
  loadingTable.value = true;
  try {
    const result = await paymentsApi.listPayments({
      search: filters.search || undefined,
      branchId: filters.branchId ?? undefined,
      paymentMethod: filters.paymentMethod ?? undefined,
      dateFrom: dateRange.value.dateFrom,
      dateTo: dateRange.value.dateTo,
      page: tablePagination.value.page,
      limit: tablePagination.value.rowsPerPage,
    });
    payments.value = result.payments;
    tablePagination.value.rowsNumber = result.total;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading payments', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando pagos' });
  } finally {
    loadingTable.value = false;
  }
}

// =========================================================================
// Payment details
// =========================================================================

const detailPayment = ref<PaymentListItem | null>(null);
const showDetailDialog = ref(false);

function showPaymentDetails(payment: PaymentListItem) {
  detailPayment.value = payment;
  showDetailDialog.value = true;
}

// =========================================================================
// Void action
// =========================================================================

function confirmVoid(payment: PaymentListItem) {
  $q.dialog({
    title: 'Anular pago',
    message: `Anular el pago de $${payment.amount.toLocaleString()} de ${payment.memberName}? Esta accion no se puede deshacer.`,
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
      await paymentsApi.voidPayment(payment.id, reason.trim());
      $q.notify({ type: 'positive', message: 'Pago anulado' });
      loadPayments();
      loadSummary();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error voiding payment', { error: message });
      $q.notify({ type: 'negative', message: 'Error anulando pago' });
    }
  });
}

// =========================================================================
// Event handlers
// =========================================================================

function onFilterChange() {
  tablePagination.value.page = 1;
  loadPayments();
  loadSummary();
}

function onTableRequest(props: { pagination: { page: number; rowsPerPage: number } }) {
  tablePagination.value.page = props.pagination.page;
  tablePagination.value.rowsPerPage = props.pagination.rowsPerPage;
  loadPayments();
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
  loadPayments();
});
</script>
