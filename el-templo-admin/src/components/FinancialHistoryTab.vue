<template>
  <div>
    <!-- Empty state -->
    <div
      v-if="items.length === 0 && !loading"
      class="text-grey-6 q-pa-md text-center"
    >
      Sin movimientos registrados.
    </div>

    <!-- Spinner inicial (sin items aún) -->
    <div v-if="loading && items.length === 0" class="flex flex-center q-pa-lg">
      <q-spinner color="primary" size="32px" />
    </div>

    <!-- Timeline -->
    <q-list v-if="items.length > 0" separator bordered class="rounded-borders">
      <q-expansion-item
        v-for="item in items"
        :key="item.transaction.id"
        :header-class="isVoided(item) ? 'bg-grey-1' : ''"
      >
        <template #header>
          <q-item-section>
            <q-item-label>
              <span :class="{ 'text-strike text-grey-5': isVoided(item) }">
                {{ formatDate(item.transaction.transactionDate) }} ·
                {{ kindLabel(item.transaction.kind) }} ·
                {{ formatPrice(item.transaction.amount, item.transaction.currency) }}
              </span>
              <q-badge
                v-if="isVoided(item)"
                color="negative"
                label="ANULADO"
                class="q-ml-sm"
              />
            </q-item-label>
            <q-item-label
              caption
              :class="{ 'text-grey-5': isVoided(item) }"
            >
              {{ methodLabel(item.transaction.paymentMethod) }}
              <span v-if="item.transaction.notes"> · {{ item.transaction.notes }}</span>
            </q-item-label>
          </q-item-section>

          <q-item-section v-if="canVoid && !isVoided(item)" side>
            <q-btn
              flat
              dense
              round
              icon="cancel"
              color="negative"
              @click.stop="onAnularClick(item)"
            >
              <q-tooltip>Anular transacción</q-tooltip>
            </q-btn>
          </q-item-section>
        </template>

        <q-card flat>
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">Distribución</div>
            <q-list dense>
              <q-item v-for="(link, idx) in item.links" :key="idx">
                <q-item-section>
                  <q-item-label>
                    {{ link.conceptLabel ?? `${link.targetKind} #${link.targetId}` }}
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  {{ formatPrice(link.allocatedAmount, item.transaction.currency) }}
                </q-item-section>
              </q-item>
              <q-item v-if="item.links.length === 0">
                <q-item-section class="text-grey-6 text-italic">
                  Sin links
                </q-item-section>
              </q-item>
            </q-list>

            <div v-if="item.voidInfo" class="q-mt-md text-negative">
              <div class="text-subtitle2">Información de anulación</div>
              <div class="text-body2">
                Anulada el {{ formatDate(item.voidInfo.voidedAt) }} · Razón:
                {{ item.voidInfo.voidReason }}
              </div>
            </div>
          </q-card-section>
        </q-card>
      </q-expansion-item>
    </q-list>

    <!-- Cargar más (D-14) -->
    <div class="row justify-center q-mt-md">
      <q-btn
        v-if="items.length > 0 && hasMore"
        flat
        label="Cargar más"
        color="primary"
        :loading="loading"
        :disable="loading"
        @click="loadMore"
      />
    </div>

    <!-- Void dialog -->
    <VoidTransactionDialog
      v-model="showVoidDialog"
      :transaction-id="voidTargetId"
      :transaction-label="voidTargetLabel"
      @voided="onVoided"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useAuthStore } from 'src/stores/useAuthStore';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import type {
  FinancialHistoryItem,
  TransactionKind,
  PaymentMethod,
} from 'src/types/transaction';
import { formatPrice } from 'src/utils/format-price';
import { formatDate } from 'src/utils/format-date';
import { createLogger } from 'src/utils/logger';
import VoidTransactionDialog from './VoidTransactionDialog.vue';

const props = defineProps<{ userId: number }>();
const emit = defineEmits<{ (e: 'voided'): void }>();

const $q = useQuasar();
const authStore = useAuthStore();
const transactionsApi = useTransactionsApi();
const log = createLogger('FinancialHistoryTab');

// D-14: paginación append-mode con default 50.
const PAGE_SIZE = 50;

const items = ref<FinancialHistoryItem[]>([]);
const total = ref(0);
const currentPage = ref(0);
const loading = ref(false);

const showVoidDialog = ref(false);
const voidTargetId = ref<number | null>(null);
const voidTargetLabel = ref<string>('');

// hasMore se deriva de total vs items.length (PaginatedResult no expone hasMore).
const hasMore = computed(() => items.value.length < total.value);

// D-16 — FINANCE_VOID_ROLES = owner | admin | gestion (NO recepcion, NO coach).
const canVoid = computed(() => {
  const role = authStore.user?.role;
  return role === 'owner' || role === 'admin' || role === 'gestion';
});

// Verificación del enum: estos 5 valores se corresponden 1:1 con el union TransactionKind
// (`src/types/transaction.ts` líneas 9-14) y con el mysqlEnum del schema
// (`el-templo-api/src/db/schema/financial-transactions.ts` líneas 26-32). Si surge un kind
// nuevo no contemplado acá, el fallback `?? kind` lo muestra en snake_case (degradación
// visual aceptable; agregar la traducción explícita en un fix posterior).
const KIND_LABELS_ES: Record<TransactionKind, string> = {
  plan_charge: 'Cobro de plan',
  debt_settlement: 'Pago de saldo',
  adjustment: 'Ajuste',
  refund: 'Reembolso',
  advance_payment: 'Pago anticipado',
};

const PAYMENT_METHOD_LABELS_ES: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  aura_credit: 'AURA',
  internal: 'Interno',
};

function isVoided(item: FinancialHistoryItem): boolean {
  return item.transaction.voidedAt !== null;
}

function kindLabel(kind: TransactionKind): string {
  return KIND_LABELS_ES[kind] ?? kind;
}

function methodLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS_ES[method] ?? method;
}

async function load(page: number, append: boolean): Promise<void> {
  loading.value = true;
  try {
    const res = await transactionsApi.getFinancialHistory(props.userId, page, PAGE_SIZE);
    if (append) {
      items.value = [...items.value, ...res.rows];
    } else {
      items.value = res.rows;
    }
    total.value = res.total;
    currentPage.value = res.page;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error cargando historial financiero', {
      error: message,
      userId: props.userId,
      page,
    });
    $q.notify({ type: 'negative', message });
  } finally {
    loading.value = false;
  }
}

function loadMore(): void {
  void load(currentPage.value + 1, true);
}

function refresh(): void {
  void load(1, false);
}

function onAnularClick(item: FinancialHistoryItem): void {
  voidTargetId.value = item.transaction.id;
  voidTargetLabel.value =
    `${kindLabel(item.transaction.kind)} de ` +
    `${formatPrice(item.transaction.amount, item.transaction.currency)} ` +
    `del ${formatDate(item.transaction.transactionDate)}`;
  showVoidDialog.value = true;
}

function onVoided(): void {
  // Refrescar historial (saldos cambiaron) + notificar al parent para que recargue
  // outstanding-concepts (los saldos revirtieron del lado backend).
  refresh();
  emit('voided');
}

defineExpose({ refresh });

onMounted(() => {
  void load(1, false);
});
</script>
