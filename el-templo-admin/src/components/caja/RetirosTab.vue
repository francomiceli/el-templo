<template>
  <div class="q-pa-md">
    <!-- Nota fija: qué es un retiro y cómo se registra. -->
    <q-banner rounded class="bg-blue-1 text-grey-9 q-mb-md">
      <template #avatar>
        <q-icon name="info" color="primary" />
      </template>
      Un <strong>retiro</strong> es la plata que alguien se lleva de una caja. En efectivo se
      eligen los cobros que se retiran (el monto es la suma) y siempre queda registrado
      <strong>quién</strong> se la llevó. Lo que no se retiró es lo que debería haber en el cajón.
    </q-banner>

    <div class="row items-center q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-4">
        <q-select
          v-model="selectedCajaId"
          :options="cajaOptions"
          label="Caja"
          dense
          outlined
          emit-value
          map-options
          :loading="loadingCajas"
          @update:model-value="onCajaChange"
        />
      </div>
      <div class="col-12 col-sm-4">
        <DateRangeFilter
          :model-value="dateRange"
          month-label="Retiros del mes"
          @update:model-value="onDateRangeChange"
        />
      </div>
      <div class="col-12 col-sm row justify-end">
        <q-btn
          icon="payments"
          label="Registrar retiro"
          color="primary"
          unelevated
          dense
          :disable="selectedCajaId === null"
          @click="showRegistrar = true"
        />
      </div>
    </div>

    <!-- ====================== En caja, pendiente de retiro ====================== -->
    <q-card v-if="selectedCaja && selectedCaja.type === 'efectivo'" flat bordered class="q-mb-lg">
      <q-card-section class="row items-center">
        <div class="col">
          <div class="text-subtitle2 text-grey-7">En caja, pendiente de retiro</div>
          <div v-if="loadingPending" class="q-mt-xs">
            <q-skeleton type="text" width="140px" />
          </div>
          <div v-else class="text-h5 text-weight-bold q-mt-xs">
            {{ formatPrice(pending?.total ?? 0, selectedCaja.currency) }}
          </div>
          <div v-if="!loadingPending" class="text-caption text-grey-7">
            {{ pending?.rows.length ?? 0 }} cobros en efectivo validados sin retirar
            <span v-if="oldestPending"> · el más viejo del {{ formatDate(oldestPending) }}</span>
          </div>
        </div>
        <q-btn
          v-if="(pending?.rows.length ?? 0) > 0"
          flat
          dense
          no-caps
          color="primary"
          :icon="showPendingRows ? 'expand_less' : 'expand_more'"
          :label="showPendingRows ? 'Ocultar cobros' : 'Ver cobros'"
          @click="showPendingRows = !showPendingRows"
        />
      </q-card-section>
      <q-slide-transition>
        <div v-show="showPendingRows && (pending?.rows.length ?? 0) > 0">
          <q-separator />
          <q-table
            :rows="pending?.rows ?? []"
            :columns="pendingColumns"
            row-key="id"
            flat
            dense
            :pagination="{ rowsPerPage: 10 }"
          >
            <template #body-cell-monto="cellProps">
              <q-td :props="cellProps" class="text-weight-medium">
                {{ formatPrice(cellProps.row.amount, cellProps.row.currency) }}
              </q-td>
            </template>
          </q-table>
        </div>
      </q-slide-transition>
    </q-card>

    <!-- ============================ Historial ============================ -->
    <div class="text-subtitle1 text-weight-medium q-mb-sm">Retiros registrados</div>
    <q-table
      :rows="withdrawals"
      :columns="columns"
      row-key="id"
      flat
      bordered
      :loading="loadingWithdrawals"
      v-model:pagination="pagination"
      :rows-per-page-options="[25, 50, 100]"
      @request="onRequest"
    >
      <template #body-cell-fecha="cellProps">
        <q-td :props="cellProps" :class="{ 'text-grey-5': cellProps.row.voidedAt }">
          {{ formatDate(cellProps.row.transactionDate) }}
        </q-td>
      </template>
      <template #body-cell-monto="cellProps">
        <q-td
          :props="cellProps"
          class="text-weight-medium"
          :class="{ 'text-grey-5 text-strike': cellProps.row.voidedAt }"
        >
          {{ formatPrice(cellProps.row.amount, cellProps.row.currency) }}
        </q-td>
      </template>
      <template #body-cell-cobros="cellProps">
        <q-td :props="cellProps">
          <span v-if="cellProps.row.cashRegisterType === 'efectivo'">
            {{ cellProps.row.paymentCount }}
          </span>
          <span v-else class="text-grey-6">banco</span>
        </q-td>
      </template>
      <template #body-cell-estado="cellProps">
        <q-td :props="cellProps">
          <q-badge v-if="cellProps.row.voidedAt" color="grey-6" label="Anulado">
            <q-tooltip v-if="cellProps.row.voidReason">{{ cellProps.row.voidReason }}</q-tooltip>
          </q-badge>
          <q-badge v-else color="positive" label="Registrado" />
        </q-td>
      </template>
      <template #body-cell-acciones="cellProps">
        <q-td :props="cellProps">
          <div class="row items-center q-gutter-xs no-wrap justify-end">
            <q-btn
              flat
              dense
              round
              icon="visibility"
              color="primary"
              @click="openDetail(cellProps.row)"
            >
              <q-tooltip>Ver cobros del retiro</q-tooltip>
            </q-btn>
            <q-btn
              v-if="!cellProps.row.voidedAt"
              flat
              dense
              round
              icon="cancel"
              color="negative"
              @click="confirmVoid(cellProps.row)"
            >
              <q-tooltip>Anular retiro (libera sus cobros)</q-tooltip>
            </q-btn>
          </div>
        </q-td>
      </template>
      <template #no-data>
        <div class="full-width text-center text-grey-6 q-pa-md">
          No hay retiros registrados para esta caja en el período.
        </div>
      </template>
    </q-table>

    <!-- Alta -->
    <RegistrarRetiroDialog
      v-model="showRegistrar"
      :selected-country="selectedCountry"
      :is-owner="isOwner"
      :caja-id="selectedCajaId ?? undefined"
      @registered="onRegistered"
    />

    <!-- Detalle -->
    <q-dialog v-model="showDetail">
      <q-card style="width: 720px; max-width: 95vw">
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">Retiro #{{ detail?.id }}</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>
        <q-card-section v-if="detail">
          <div class="row q-col-gutter-md text-body2">
            <div class="col-6 col-sm-3">
              <div class="text-caption text-grey-7">Fecha</div>
              {{ formatDate(detail.transactionDate) }}
            </div>
            <div class="col-6 col-sm-3">
              <div class="text-caption text-grey-7">Monto</div>
              <span class="text-weight-medium">{{
                formatPrice(detail.amount, detail.currency)
              }}</span>
            </div>
            <div class="col-6 col-sm-3">
              <div class="text-caption text-grey-7">Responsable</div>
              {{ detail.responsibleName }}
            </div>
            <div class="col-6 col-sm-3">
              <div class="text-caption text-grey-7">Registró</div>
              {{ detail.recorderName }}
            </div>
            <div v-if="detail.notes" class="col-12">
              <div class="text-caption text-grey-7">Notas</div>
              {{ detail.notes }}
            </div>
          </div>
          <q-table
            v-if="detail.payments.length > 0"
            class="q-mt-md"
            :rows="detail.payments"
            :columns="pendingColumns"
            row-key="id"
            flat
            bordered
            dense
            :pagination="{ rowsPerPage: 0 }"
            hide-bottom
          >
            <template #body-cell-monto="cellProps">
              <q-td :props="cellProps" class="text-weight-medium">
                {{ formatPrice(cellProps.row.amount, cellProps.row.currency) }}
              </q-td>
            </template>
          </q-table>
          <div v-else class="text-caption text-grey-6 q-mt-md">
            Retiro de cuenta banco: sin cobros vinculados.
          </div>
        </q-card-section>
        <q-inner-loading :showing="loadingDetail" />
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useQuasar, type QTableColumn } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { formatPrice } from 'src/utils/format-price';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import DateRangeFilter from 'src/components/caja/DateRangeFilter.vue';
import RegistrarRetiroDialog from 'src/components/caja/RegistrarRetiroDialog.vue';
import { currentMonthRange, type DateRangeValue } from 'src/utils/date-range';
import type {
  CajaSaldoRow,
  PendingWithdrawalResult,
  WithdrawalDetail,
  WithdrawalListItem,
  WithdrawalPaymentItem,
} from 'src/types/transaction';

// =========================================================================
// Pestaña Retiros (feedback caja/cobros 2026-09-07). Por caja: lo que está
// en el cajón pendiente de retiro (el "hay 3 pagos de 65.000 desde el 25/8"
// del Excel de Martín), el botón para registrar el retiro eligiendo cobros, y
// el historial de retiros con responsable, cobros vinculados y anulación.
// =========================================================================

const props = defineProps<{
  selectedCountry: 'AR' | 'ES';
  isOwner: boolean;
}>();

const log = createLogger('RetirosTab');
const $q = useQuasar();
const transactionsApi = useTransactionsApi();

// ---------------------------------------------------------------- cajas
const cajas = ref<CajaSaldoRow[]>([]);
const loadingCajas = ref(false);
const selectedCajaId = ref<number | null>(null);

const cajaOptions = computed(() =>
  [...cajas.value]
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'efectivo' ? -1 : 1))
    .map((c) => ({
      label: `${c.name} · ${c.type === 'efectivo' ? 'Efectivo' : 'Banco'} (${c.currency})`,
      value: c.cashRegisterId,
    }))
);
const selectedCaja = computed(
  () => cajas.value.find((c) => c.cashRegisterId === selectedCajaId.value) ?? null
);

async function loadCajas() {
  loadingCajas.value = true;
  try {
    cajas.value = await transactionsApi.getCashRegisterBalances({
      country: props.isOwner ? props.selectedCountry : undefined,
    });
    // Default: la primera caja de efectivo con sede (lo que se retira a diario).
    if (
      selectedCajaId.value === null ||
      !cajas.value.some((c) => c.cashRegisterId === selectedCajaId.value)
    ) {
      const first =
        cajas.value.find((c) => c.type === 'efectivo' && c.branchId !== null) ?? cajas.value[0];
      selectedCajaId.value = first?.cashRegisterId ?? null;
    }
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando cajas');
    log.error('Error loading cash registers', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    loadingCajas.value = false;
  }
}

// ---------------------------------------------------------------- pendiente de retiro
const pending = ref<PendingWithdrawalResult | null>(null);
const loadingPending = ref(false);
const showPendingRows = ref(false);

const pendingColumns: QTableColumn<WithdrawalPaymentItem>[] = [
  { name: 'fecha', label: 'Fecha', field: 'transactionDate', align: 'left', sortable: true },
  { name: 'socio', label: 'Socio', field: 'memberName', align: 'left' },
  { name: 'dni', label: 'DNI', field: (r) => r.memberDni ?? '—', align: 'left' },
  { name: 'concepto', label: 'Concepto', field: (r) => r.concept ?? '—', align: 'left' },
  { name: 'registro', label: 'Registró', field: 'recorderName', align: 'left' },
  { name: 'monto', label: 'Monto', field: 'amount', align: 'right' },
];

const oldestPending = computed(() => pending.value?.rows[0]?.transactionDate ?? null);

async function loadPending() {
  if (!selectedCaja.value || selectedCaja.value.type !== 'efectivo') {
    pending.value = null;
    return;
  }
  loadingPending.value = true;
  try {
    pending.value = await transactionsApi.getPendingWithdrawals(selectedCaja.value.cashRegisterId);
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando cobros pendientes de retiro');
    log.error('Error loading pending withdrawals', { error: message });
    $q.notify({ type: 'negative', message });
    pending.value = null;
  } finally {
    loadingPending.value = false;
  }
}

// ---------------------------------------------------------------- historial
const withdrawals = ref<WithdrawalListItem[]>([]);
const loadingWithdrawals = ref(false);
const dateRange = ref<DateRangeValue>(currentMonthRange());
const pagination = ref({
  page: 1,
  rowsPerPage: 25,
  rowsNumber: 0,
  sortBy: 'fecha',
  descending: true,
});

const columns: QTableColumn<WithdrawalListItem>[] = [
  { name: 'fecha', label: 'Fecha', field: 'transactionDate', align: 'left' },
  { name: 'monto', label: 'Monto', field: 'amount', align: 'right' },
  { name: 'responsable', label: 'Responsable', field: 'responsibleName', align: 'left' },
  { name: 'cobros', label: 'Cobros', field: 'paymentCount', align: 'center' },
  { name: 'notas', label: 'Notas', field: (r) => r.notes ?? '', align: 'left' },
  { name: 'registro', label: 'Registró', field: 'recorderName', align: 'left' },
  { name: 'estado', label: 'Estado', field: 'voidedAt', align: 'left' },
  { name: 'acciones', label: '', field: 'id', align: 'right' },
];

async function loadWithdrawals() {
  if (selectedCajaId.value === null) {
    withdrawals.value = [];
    pagination.value.rowsNumber = 0;
    return;
  }
  loadingWithdrawals.value = true;
  try {
    const { dateFrom, dateTo } = dateRange.value;
    const res = await transactionsApi.listWithdrawals({
      cashRegisterId: selectedCajaId.value,
      country: props.isOwner ? props.selectedCountry : undefined,
      ...(dateFrom !== undefined && dateTo !== undefined ? { dateFrom, dateTo } : {}),
      page: pagination.value.page,
      limit: pagination.value.rowsPerPage,
    });
    withdrawals.value = res.rows;
    pagination.value.rowsNumber = res.total;
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando retiros');
    log.error('Error loading withdrawals', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    loadingWithdrawals.value = false;
  }
}

function onRequest(reqProps: { pagination: { page: number; rowsPerPage: number } }) {
  pagination.value.page = reqProps.pagination.page;
  pagination.value.rowsPerPage = reqProps.pagination.rowsPerPage;
  void loadWithdrawals();
}

function onDateRangeChange(value: DateRangeValue) {
  dateRange.value = value;
  pagination.value.page = 1;
  void loadWithdrawals();
}

function onCajaChange() {
  pagination.value.page = 1;
  showPendingRows.value = false;
  void Promise.all([loadPending(), loadWithdrawals()]);
}

// ---------------------------------------------------------------- alta / detalle / anular
const showRegistrar = ref(false);

function onRegistered() {
  void Promise.all([loadPending(), loadWithdrawals(), loadCajas()]);
}

const showDetail = ref(false);
const loadingDetail = ref(false);
const detail = ref<WithdrawalDetail | null>(null);

async function openDetail(row: WithdrawalListItem) {
  showDetail.value = true;
  loadingDetail.value = true;
  detail.value = null;
  try {
    detail.value = await transactionsApi.getWithdrawal(row.id);
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando el retiro');
    log.error('Error loading withdrawal detail', { error: message });
    $q.notify({ type: 'negative', message });
    showDetail.value = false;
  } finally {
    loadingDetail.value = false;
  }
}

function confirmVoid(row: WithdrawalListItem) {
  $q.dialog({
    title: `Anular retiro #${row.id}`,
    message: `${formatPrice(row.amount, row.currency)} · ${row.responsibleName}. Los cobros vinculados vuelven a quedar "en caja". Indicá el motivo:`,
    prompt: { model: '', type: 'text', isValid: (v: string) => v.trim().length > 0 },
    cancel: true,
    persistent: true,
  }).onOk((reason: string) => {
    void voidWithdrawal(row.id, reason.trim());
  });
}

async function voidWithdrawal(id: number, reason: string) {
  try {
    await transactionsApi.voidExpense(id, reason);
    $q.notify({ type: 'positive', message: 'Retiro anulado' });
    onRegistered();
  } catch (err: unknown) {
    const message = extractError(err, 'Error anulando el retiro');
    log.error('Error voiding withdrawal', { error: message });
    $q.notify({ type: 'negative', message });
  }
}

// ---------------------------------------------------------------- utils / lifecycle
function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

onMounted(async () => {
  await loadCajas();
  await Promise.all([loadPending(), loadWithdrawals()]);
});

watch(
  () => props.selectedCountry,
  async () => {
    selectedCajaId.value = null;
    await loadCajas();
    await Promise.all([loadPending(), loadWithdrawals()]);
  }
);

onUnmounted(() => {
  transactionsApi.cleanup();
});
</script>
