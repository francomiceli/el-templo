<template>
  <q-dialog
    :model-value="modelValue"
    persistent
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
  >
    <q-card style="min-width: 480px; max-width: 640px">
      <q-card-section>
        <div class="text-h6">Registrar pago</div>
      </q-card-section>

      <q-card-section class="q-pt-none q-gutter-sm">
        <q-input
          v-model.number="montoRecibido"
          label="Monto recibido *"
          type="number"
          dense
          outlined
          prefix="$"
          :min="0"
          hint="Tipeá el monto en efectivo / transferencia / tarjeta que recibiste"
        />
        <q-select
          v-model="paymentMethod"
          :options="paymentMethodOptions"
          label="Método de pago *"
          dense
          outlined
          emit-value
          map-options
        />
        <q-input v-model="fecha" label="Fecha *" type="date" dense outlined />
        <q-input v-model="notes" label="Notas (opcional)" type="textarea" dense outlined autogrow />
      </q-card-section>

      <q-separator />

      <q-card-section>
        <div class="row items-center justify-between q-mb-xs">
          <div class="text-subtitle2">Conceptos pendientes</div>
          <q-btn
            flat
            dense
            color="primary"
            label="Pagar todo"
            :disable="totalSaldos === 0"
            @click="pagarTodo"
          />
        </div>

        <div v-if="visibleConcepts.length > 0" class="text-caption text-grey-7 q-mb-sm">
          El monto se reparte automáticamente entre los saldos pendientes, empezando por el más
          antiguo. Podés ajustar cuánto se asigna a cada concepto en los campos de la derecha.
        </div>

        <div v-if="visibleConcepts.length === 0" class="text-grey-6">Sin saldos pendientes</div>

        <q-list v-else separator>
          <q-item v-for="c in visibleConcepts" :key="conceptKey(c)">
            <q-item-section>
              <q-item-label>{{ c.description }}</q-item-label>
              <q-item-label caption>
                Saldo: {{ formatPrice(c.balance, c.currency) }} · Hace {{ c.ageInDays }} día{{
                  c.ageInDays === 1 ? '' : 's'
                }}
              </q-item-label>
            </q-item-section>
            <q-item-section side style="min-width: 140px">
              <q-input
                v-model.number="allocations[conceptKey(c)]"
                type="number"
                dense
                outlined
                prefix="$"
                :min="0"
                :max="c.balance"
              />
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>

      <q-card-section v-if="visibleConcepts.length > 0" class="q-pt-none">
        <div
          class="text-body1 text-weight-bold"
          :class="{
            'text-positive': sumStatus === 'ok',
            'text-negative': sumStatus !== 'ok' && montoRecibido !== null,
          }"
        >
          Total asignado:
          {{ formatPrice(sumAllocated, displayCurrency) }} /
          {{ formatPrice(montoRecibido ?? 0, displayCurrency) }}
          <q-icon v-if="sumStatus === 'ok'" name="check_circle" />
          <span v-else-if="sumStatus === 'short' && montoRecibido !== null">
            · Faltan {{ formatPrice(sumDiff, displayCurrency) }}
          </span>
          <span v-else-if="sumStatus === 'over'">
            · Sobran {{ formatPrice(sumDiff, displayCurrency) }}
          </span>
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn
          flat
          label="Cancelar"
          :disable="submitting"
          @click="emit('update:modelValue', false)"
        />
        <q-btn
          color="primary"
          label="Confirmar"
          icon="check"
          :loading="submitting"
          :disable="isInvalid"
          @click="onConfirm"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { formatPrice } from 'src/utils/format-price';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import {
  PAYMENT_METHOD_OPTIONS,
  type OutstandingConcept,
  type PaymentMethod,
  type RegisterPaymentInput,
} from 'src/types/transaction';

// =========================================================================
// Props & Emits (D-22 — payload backbone)
// =========================================================================

const props = defineProps<{
  modelValue: boolean;
  userId: number;
  memberBranchId: number;
  outstandingConcepts: OutstandingConcept[];
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'paid'): void;
}>();

const $q = useQuasar();
const transactionsApi = useTransactionsApi();
const log = createLogger('RegisterPaymentDialog');

// =========================================================================
// Constants
// =========================================================================

const paymentMethodOptions = PAYMENT_METHOD_OPTIONS;

// Default desde el array — NO hardcodear 'cash'. Si el array estuviera vacío (no debería),
// caemos a 'cash' que es un valor presente en el enum del schema (financial-transactions.ts).
const defaultPaymentMethod: PaymentMethod = PAYMENT_METHOD_OPTIONS[0]?.value ?? 'cash';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// =========================================================================
// State
// =========================================================================

const montoRecibido = ref<number | null>(null);
const paymentMethod = ref<PaymentMethod>(defaultPaymentMethod);
const fecha = ref<string>(todayISO());
const notes = ref<string>('');
// Composite key (`${targetKind}:${targetId}`) → allocated amount.
const allocations = reactive<Record<string, number>>({});
const submitting = ref(false);

// =========================================================================
// Computeds
// =========================================================================

// D-21: Multi-currency anomaly. Si hay >1 currency, log warning a Sentry +
// mostrar solo la moneda mayoritaria (la que tiene más conceptos abiertos).
const visibleConcepts = computed<OutstandingConcept[]>(() => {
  const byCurrency = new Map<string, OutstandingConcept[]>();
  for (const c of props.outstandingConcepts) {
    const arr = byCurrency.get(c.currency);
    if (arr) {
      arr.push(c);
    } else {
      byCurrency.set(c.currency, [c]);
    }
  }
  if (byCurrency.size > 1) {
    log.warn('Multi-currency outstanding detectado', {
      memberId: props.userId,
      currencies: Array.from(byCurrency.keys()),
    });
    let majority = '';
    let max = 0;
    for (const [cur, arr] of byCurrency) {
      if (arr.length > max) {
        max = arr.length;
        majority = cur;
      }
    }
    return byCurrency.get(majority) ?? [];
  }
  return props.outstandingConcepts;
});

// Fallback 'ARS' es safe porque isInvalid bloquea Confirmar cuando visibleConcepts
// está vacío (montoRecibido === null al abrir + auto-FIFO no aloca nada → sumAllocated === 0
// → isInvalid === true). El currency real se usa solo cuando hay al menos 1 concepto visible.
const displayCurrency = computed<string>(() => visibleConcepts.value[0]?.currency ?? 'ARS');

const totalSaldos = computed<number>(() =>
  visibleConcepts.value.reduce((sum, c) => sum + c.balance, 0)
);

function conceptKey(c: OutstandingConcept): string {
  return `${c.targetKind}:${c.targetId}`;
}

const sumAllocated = computed<number>(() =>
  visibleConcepts.value.reduce((sum, c) => sum + (allocations[conceptKey(c)] ?? 0), 0)
);

// D-09 / D-10 / D-11: Confirmar disabled cuando:
//   - montoRecibido es null/empty/NaN/<= 0
//   - Σ allocated ≠ montoRecibido
// `v-model.number` puede dejar `null`, string vacío o `NaN` según el browser —
// guard explícito contra los 3 casos.
const isInvalid = computed<boolean>(() => {
  if (
    montoRecibido.value === null ||
    typeof montoRecibido.value !== 'number' ||
    !Number.isFinite(montoRecibido.value) ||
    montoRecibido.value <= 0
  ) {
    return true;
  }
  if (sumAllocated.value !== montoRecibido.value) return true;
  return false;
});

const sumStatus = computed<'ok' | 'short' | 'over'>(() => {
  if (montoRecibido.value === null) return 'short';
  if (sumAllocated.value === montoRecibido.value) return 'ok';
  if (sumAllocated.value < montoRecibido.value) return 'short';
  return 'over';
});

const sumDiff = computed<number>(() => Math.abs((montoRecibido.value ?? 0) - sumAllocated.value));

// =========================================================================
// Auto-FIFO greedy (D-07, per 108-PATTERNS §8)
// =========================================================================

function clearAllocations(): void {
  for (const key of Object.keys(allocations)) {
    delete allocations[key];
  }
}

function autoFifoAllocate(amount: number): void {
  let remaining = amount;
  clearAllocations();
  for (const c of visibleConcepts.value) {
    // Already FIFO (oldest first) from backend ordering.
    const key = conceptKey(c);
    if (remaining <= 0) {
      allocations[key] = 0;
      continue;
    }
    const allocated = Math.min(c.balance, remaining);
    allocations[key] = allocated;
    remaining -= allocated;
  }
}

function resetAllocationsToZero(): void {
  clearAllocations();
  for (const c of visibleConcepts.value) {
    allocations[conceptKey(c)] = 0;
  }
}

// =========================================================================
// Watchers
// =========================================================================

// D-07: re-ejecutar auto-FIFO cuando cambia el monto recibido.
watch(montoRecibido, (val) => {
  if (val === null || typeof val !== 'number' || !Number.isFinite(val) || val <= 0) {
    resetAllocationsToZero();
    return;
  }
  autoFifoAllocate(val);
});

// Auto-FIFO + reset state cuando se abre el dialog.
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      montoRecibido.value = null;
      paymentMethod.value = defaultPaymentMethod;
      fecha.value = todayISO();
      notes.value = '';
      resetAllocationsToZero();
      submitting.value = false;
    }
  }
);

// =========================================================================
// Actions
// =========================================================================

function pagarTodo(): void {
  // Setear montoRecibido = Σ saldos. El watcher dispara autoFifoAllocate.
  montoRecibido.value = totalSaldos.value;
}

async function onConfirm(): Promise<void> {
  if (isInvalid.value) return;
  submitting.value = true;
  try {
    // D-08: filtrar allocations === 0 (no enviar links de $0 — service backend rechaza).
    const links = visibleConcepts.value
      .map((c) => ({
        targetKind: c.targetKind,
        targetId: c.targetId,
        allocatedAmount: allocations[conceptKey(c)] ?? 0,
      }))
      .filter((l) => l.allocatedAmount > 0);

    // D-11: Σ allocated > 0. Defensa adicional aunque isInvalid ya lo cubre.
    if (links.length === 0) {
      $q.notify({
        type: 'negative',
        message: 'No hay conceptos con monto asignado',
      });
      return;
    }

    const payload: RegisterPaymentInput = {
      memberId: props.userId,
      kind: 'debt_settlement',
      direction: 'inflow',
      amount: montoRecibido.value as number,
      currency: displayCurrency.value,
      paymentMethod: paymentMethod.value,
      transactionDate: fecha.value,
      effectiveDate: fecha.value,
      branchId: props.memberBranchId,
      notes: notes.value.trim() || null,
      links,
    };

    await transactionsApi.createTransaction(payload);
    $q.notify({ type: 'positive', message: 'Pago registrado correctamente' });
    emit('paid');
    emit('update:modelValue', false);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error registrando pago', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    submitting.value = false;
  }
}
</script>
