<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-md">
      <div class="text-h5 col">Pagos</div>
      <q-btn icon="add" label="Registrar Pago" color="primary" @click="showRegisterDialog = true" />
    </div>

    <!-- ========================================== -->
    <!-- Summary Cards -->
    <!-- ========================================== -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-4">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-caption text-grey-7">Ingresos del mes</div>
            <div v-if="loadingSummary" class="q-mt-xs">
              <q-skeleton type="text" width="100px" />
            </div>
            <div v-else class="text-h5 text-weight-bold text-positive q-mt-xs">
              ${{ summary.monthlyRevenue.toLocaleString() }}
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-4">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-caption text-grey-7">Deudas pendientes</div>
            <div v-if="loadingSummary" class="q-mt-xs">
              <q-skeleton type="text" width="100px" />
            </div>
            <div
              v-else
              class="text-h5 text-weight-bold q-mt-xs"
              :class="summary.totalOutstanding > 0 ? 'text-negative' : ''"
            >
              ${{ summary.totalOutstanding.toLocaleString() }}
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-4">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-caption text-grey-7">Tasa de cobro</div>
            <div v-if="loadingSummary" class="q-mt-xs">
              <q-skeleton type="text" width="80px" />
            </div>
            <div v-else class="text-h5 text-weight-bold q-mt-xs">{{ summary.collectionRate }}%</div>
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
        <q-input
          v-model="filters.dateFrom"
          label="Desde"
          type="date"
          dense
          outlined
          clearable
          @update:model-value="onFilterChange"
        />
      </div>
      <div class="col-6 col-sm-2">
        <q-input
          v-model="filters.dateTo"
          label="Hasta"
          type="date"
          dense
          outlined
          clearable
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

      <!-- Plan column -->
      <template #body-cell-plan="slotProps">
        <q-td :props="slotProps" :class="{ 'text-grey-5': isVoided(slotProps.row) }">
          {{ slotProps.row.planName ?? '—' }}
        </q-td>
      </template>

      <!-- Estado column -->
      <template #body-cell-estado="slotProps">
        <q-td :props="slotProps">
          <q-badge v-if="isVoided(slotProps.row)" color="negative" label="Anulado" />
          <q-badge v-else color="positive" label="Completado" />
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
              <q-item
                v-if="slotProps.row.reference || slotProps.row.notes"
                clickable
                v-close-popup
                @click="showPaymentDetails(slotProps.row)"
              >
                <q-item-section avatar><q-icon name="info" /></q-item-section>
                <q-item-section>Detalles</q-item-section>
              </q-item>
              <q-item
                v-if="isVoided(slotProps.row)"
                clickable
                v-close-popup
                @click="showVoidDetails(slotProps.row)"
              >
                <q-item-section avatar><q-icon name="block" color="negative" /></q-item-section>
                <q-item-section>Motivo anulacion</q-item-section>
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
    <!-- Register Payment Dialog -->
    <!-- ========================================== -->
    <RegisterPaymentDialog v-model="showRegisterDialog" @saved="onPaymentSaved" />
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
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
import RegisterPaymentDialog from 'src/components/RegisterPaymentDialog.vue';

const log = createLogger('PagosPage');
const $q = useQuasar();
const router = useRouter();

// =========================================================================
// State
// =========================================================================

const payments = ref<PaymentListItem[]>([]);
const loadingTable = ref(false);
const loadingSummary = ref(false);
const showRegisterDialog = ref(false);

const summary = reactive<FinancialSummary>({
  monthlyRevenue: 0,
  totalOutstanding: 0,
  collectionRate: 0,
  revenueByMethod: { cash: 0, transfer: 0, card: 0 },
  revenueByBranch: [],
});

const filters = reactive({
  search: '',
  branchId: null as number | null,
  paymentMethod: null as PaymentMethod | null,
  dateFrom: null as string | null,
  dateTo: null as string | null,
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
  { name: 'plan', label: 'Plan', field: 'planName', align: 'left', sortable: false },
  {
    name: 'estado',
    label: 'Estado',
    field: 'voidedAt',
    align: 'center',
    sortable: false,
    style: 'width: 110px',
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

function isVoided(payment: PaymentListItem): boolean {
  return payment.voidedAt !== null;
}

function methodLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

function methodColor(method: PaymentMethod): string {
  return PAYMENT_METHOD_COLORS[method] ?? 'grey';
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// =========================================================================
// Data loading
// =========================================================================

async function loadBranches() {
  try {
    const membersApi = useMembersApi();
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
    const paymentsApi = usePaymentsApi();
    const data = await paymentsApi.getFinancialSummary(
      filters.branchId ?? undefined,
      filters.dateFrom ?? undefined,
      filters.dateTo ?? undefined
    );
    summary.monthlyRevenue = data.monthlyRevenue;
    summary.totalOutstanding = data.totalOutstanding;
    summary.collectionRate = data.collectionRate;
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
    const paymentsApi = usePaymentsApi();
    const result = await paymentsApi.listPayments({
      search: filters.search || undefined,
      branchId: filters.branchId ?? undefined,
      paymentMethod: filters.paymentMethod ?? undefined,
      dateFrom: filters.dateFrom ?? undefined,
      dateTo: filters.dateTo ?? undefined,
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

function showPaymentDetails(payment: PaymentListItem) {
  const parts: string[] = [];
  if (payment.reference) parts.push(`Referencia: ${payment.reference}`);
  if (payment.notes) parts.push(`Notas: ${payment.notes}`);
  $q.dialog({
    title: 'Detalles del pago',
    message: parts.join('\n\n'),
  });
}

function showVoidDetails(payment: PaymentListItem) {
  $q.dialog({
    title: 'Pago anulado',
    message: `Motivo: ${payment.voidReason ?? 'Sin motivo'}`,
  });
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
      const paymentsApi = usePaymentsApi();
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

function onPaymentSaved() {
  loadPayments();
  loadSummary();
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
