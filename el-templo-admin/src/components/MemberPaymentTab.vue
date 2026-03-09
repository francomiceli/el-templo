<template>
  <div>
    <!-- Loading -->
    <div v-if="loadingBalance && loadingPayments" class="flex flex-center q-pa-lg">
      <q-spinner-dots size="40px" color="primary" />
    </div>

    <template v-else>
      <!-- ========================================== -->
      <!-- Balance Card -->
      <!-- ========================================== -->
      <q-card v-if="balance" flat bordered class="q-mb-md">
        <q-card-section>
          <!-- Header: plan name + overdue badge -->
          <div class="row items-center q-gutter-sm q-mb-md">
            <div class="text-h6">{{ balance.planName }}</div>
            <q-badge v-if="balance.isOverdue" color="negative" label="DEUDA" />
            <q-badge v-else-if="balance.remaining === 0" color="positive" label="AL DIA" />
            <q-badge v-else color="warning" label="PENDIENTE" />
          </div>

          <!-- Balance details -->
          <div class="row q-gutter-x-lg q-mb-md">
            <div>
              <div class="text-caption text-grey-7">Debe</div>
              <div class="text-weight-medium">${{ balance.pricePaid.toLocaleString() }}</div>
            </div>
            <div>
              <div class="text-caption text-grey-7">Pagado</div>
              <div class="text-weight-medium text-positive">
                ${{ balance.totalPaid.toLocaleString() }}
              </div>
            </div>
            <div>
              <div class="text-caption text-grey-7">Restante</div>
              <div class="text-weight-medium" :class="{ 'text-negative': balance.remaining > 0 }">
                ${{ balance.remaining.toLocaleString() }}
              </div>
            </div>
          </div>

          <!-- Register payment button -->
          <q-btn
            icon="add"
            label="Registrar Pago"
            color="primary"
            outline
            @click="showRegisterDialog = true"
          />
        </q-card-section>
      </q-card>

      <!-- No subscription balance state -->
      <q-card v-else flat bordered class="q-mb-md">
        <q-card-section class="text-center q-pa-lg">
          <div class="text-grey-5 text-italic q-mb-md">
            Sin suscripcion activa para calcular balance
          </div>
          <q-btn
            icon="add"
            label="Registrar Pago"
            color="primary"
            outline
            @click="showRegisterDialog = true"
          />
        </q-card-section>
      </q-card>

      <!-- ========================================== -->
      <!-- Payment History Table -->
      <!-- ========================================== -->
      <q-card flat bordered>
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold q-mb-sm">Historial de Pagos</div>

          <div v-if="loadingPayments" class="flex flex-center q-pa-md">
            <q-spinner-dots size="30px" color="primary" />
          </div>

          <div v-else-if="payments.length === 0" class="text-grey-5 text-italic">
            Sin pagos registrados
          </div>

          <q-table
            v-else
            :rows="payments"
            :columns="paymentColumns"
            row-key="id"
            flat
            hide-bottom
            :rows-per-page-options="[0]"
          >
            <!-- Fecha column -->
            <template #body-cell-fecha="slotProps">
              <q-td :props="slotProps" :class="{ 'text-grey-5': isVoided(slotProps.row) }">
                {{ formatDate(slotProps.row.paymentDate) }}
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
                  :color="
                    isVoided(slotProps.row) ? 'grey' : methodColor(slotProps.row.paymentMethod)
                  "
                  :label="methodLabel(slotProps.row.paymentMethod)"
                />
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
                    <!-- Details (reference / notes) -->
                    <q-item
                      v-if="slotProps.row.reference || slotProps.row.notes"
                      clickable
                      v-close-popup
                      @click="showPaymentDetails(slotProps.row)"
                    >
                      <q-item-section avatar><q-icon name="info" /></q-item-section>
                      <q-item-section>Detalles</q-item-section>
                    </q-item>
                    <!-- Void reason info -->
                    <q-item
                      v-if="isVoided(slotProps.row)"
                      clickable
                      v-close-popup
                      @click="showVoidDetails(slotProps.row)"
                    >
                      <q-item-section avatar
                        ><q-icon name="block" color="negative"
                      /></q-item-section>
                      <q-item-section>Motivo anulacion</q-item-section>
                    </q-item>
                    <!-- Void action -->
                    <q-item
                      v-if="!isVoided(slotProps.row)"
                      clickable
                      v-close-popup
                      @click="confirmVoid(slotProps.row)"
                    >
                      <q-item-section avatar
                        ><q-icon name="block" color="negative"
                      /></q-item-section>
                      <q-item-section class="text-negative">Anular</q-item-section>
                    </q-item>
                  </q-menu>
                </q-btn>
              </q-td>
            </template>
          </q-table>
        </q-card-section>
      </q-card>
    </template>

    <!-- ========================================== -->
    <!-- Register Payment Dialog -->
    <!-- ========================================== -->
    <RegisterPaymentDialog
      v-model="showRegisterDialog"
      :userId="userId"
      :memberName="memberName"
      :defaultAmount="balance?.remaining"
      @saved="onPaymentSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { usePaymentsApi } from 'src/composables/usePaymentsApi';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_COLORS,
  type PaymentListItem,
  type MemberBalance,
  type PaymentMethod,
} from 'src/types/payment';
import RegisterPaymentDialog from 'src/components/RegisterPaymentDialog.vue';

const log = createLogger('MemberPaymentTab');
const $q = useQuasar();

// =========================================================================
// Props & Emits
// =========================================================================

const props = defineProps<{
  userId: number;
  memberName: string;
}>();

const emit = defineEmits<{
  'payment-changed': [];
}>();

// =========================================================================
// State
// =========================================================================

const balance = ref<MemberBalance | null>(null);
const payments = ref<PaymentListItem[]>([]);
const loadingBalance = ref(false);
const loadingPayments = ref(false);
const showRegisterDialog = ref(false);

// =========================================================================
// Table columns
// =========================================================================

const paymentColumns: QTableProps['columns'] = [
  { name: 'fecha', label: 'Fecha', field: 'paymentDate', align: 'left', sortable: false },
  { name: 'monto', label: 'Monto', field: 'amount', align: 'left', sortable: false },
  { name: 'metodo', label: 'Metodo', field: 'paymentMethod', align: 'left', sortable: false },
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

async function loadBalance() {
  loadingBalance.value = true;
  try {
    const paymentsApi = usePaymentsApi();
    balance.value = await paymentsApi.getMemberBalance(props.userId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading balance', { error: message, userId: props.userId });
  } finally {
    loadingBalance.value = false;
  }
}

async function loadPayments() {
  loadingPayments.value = true;
  try {
    const paymentsApi = usePaymentsApi();
    payments.value = await paymentsApi.getMemberPayments(props.userId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading payments', { error: message, userId: props.userId });
    $q.notify({ type: 'negative', message: 'Error cargando pagos' });
  } finally {
    loadingPayments.value = false;
  }
}

async function refreshAll() {
  await Promise.all([loadBalance(), loadPayments()]);
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
    message: `Anular el pago de $${payment.amount.toLocaleString()}? Esta accion no se puede deshacer.`,
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
      refreshAll();
      emit('payment-changed');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error voiding payment', { error: message });
      $q.notify({ type: 'negative', message: 'Error anulando pago' });
    }
  });
}

// =========================================================================
// Register dialog callback
// =========================================================================

function onPaymentSaved() {
  refreshAll();
  emit('payment-changed');
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  refreshAll();
});
</script>
