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
        <MoneyInput
          v-model="montoRecibido"
          label="Monto recibido *"
          dense
          outlined
          prefix="$"
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
              <MoneyInput
                :model-value="allocations[conceptKey(c)] ?? null"
                dense
                outlined
                prefix="$"
                :rules="[maxBalanceRule(c.balance)]"
                @update:model-value="(v: number | null) => (allocations[conceptKey(c)] = v)"
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
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
import { formatPrice } from 'src/utils/format-price';
import {
  compareMoney,
  fromCents,
  moneyEquals,
  roundMoney,
  sumMoney,
  toCents,
} from 'src/utils/money';
import MoneyInput from 'src/components/MoneyInput.vue';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import {
  PAYMENT_METHOD_OPTIONS,
  paymentMethodOptionsFor,
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

// Domiciliación sólo en España: el país se deriva de la moneda del cobro, mismo
// criterio que CobrosPage. `displayCurrency` se define más abajo — el computed es
// lazy, así que se resuelve recién al renderizar el selector.
const paymentMethodOptions = computed(() =>
  paymentMethodOptionsFor(displayCurrency.value === 'EUR' ? 'ES' : 'AR')
);

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
// Composite key (`${targetKind}:${targetId}`) → allocated amount. `null` = el
// usuario dejó el campo vacío o con texto inválido: cuenta como 0 en las sumas.
const allocations = reactive<Record<string, number | null>>({});
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

// Importes en centavos (DI-02): 0,1 + 0,2 tiene que cuadrar con 0,3.
const totalSaldos = computed<number>(() => sumMoney(visibleConcepts.value.map((c) => c.balance)));

function conceptKey(c: OutstandingConcept): string {
  return `${c.targetKind}:${c.targetId}`;
}

const sumAllocated = computed<number>(() =>
  sumMoney(visibleConcepts.value.map((c) => allocations[conceptKey(c)] ?? 0))
);

// Regla de cada campo de asignación: no puede superar el saldo del concepto.
function maxBalanceRule(balance: number): (v: number | null) => true | string {
  return (v) =>
    v === null ||
    compareMoney(v, balance) <= 0 ||
    `No puede superar ${formatPrice(balance, displayCurrency.value)}`;
}

const hasOverAllocation = computed<boolean>(() =>
  visibleConcepts.value.some((c) => compareMoney(allocations[conceptKey(c)] ?? 0, c.balance) > 0)
);

// D-09 / D-10 / D-11: Confirmar disabled cuando:
//   - montoRecibido es null/empty/NaN/<= 0
//   - Σ allocated ≠ montoRecibido (comparado en centavos)
//   - alguna asignación supera el saldo de su concepto
// `MoneyInput` emite `null` si el campo está vacío o el texto es inválido.
const isInvalid = computed<boolean>(() => {
  if (
    montoRecibido.value === null ||
    !Number.isFinite(montoRecibido.value) ||
    montoRecibido.value <= 0
  ) {
    return true;
  }
  if (!moneyEquals(sumAllocated.value, montoRecibido.value)) return true;
  if (hasOverAllocation.value) return true;
  return false;
});

const sumStatus = computed<'ok' | 'short' | 'over'>(() => {
  if (montoRecibido.value === null) return 'short';
  const cmp = compareMoney(sumAllocated.value, montoRecibido.value);
  if (cmp === 0) return 'ok';
  return cmp < 0 ? 'short' : 'over';
});

const sumDiff = computed<number>(() =>
  roundMoney(Math.abs(roundMoney((montoRecibido.value ?? 0) - sumAllocated.value)))
);

// =========================================================================
// Auto-FIFO greedy (D-07, per 108-PATTERNS §8)
// =========================================================================

function clearAllocations(): void {
  for (const key of Object.keys(allocations)) {
    delete allocations[key];
  }
}

function autoFifoAllocate(amount: number): void {
  // En centavos enteros: restar floats dejaría residuos (0,3 - 0,1 - 0,2 ≠ 0).
  let remaining = toCents(amount);
  clearAllocations();
  for (const c of visibleConcepts.value) {
    // Already FIFO (oldest first) from backend ordering.
    const key = conceptKey(c);
    if (remaining <= 0) {
      allocations[key] = 0;
      continue;
    }
    const allocated = Math.min(toCents(c.balance), remaining);
    allocations[key] = fromCents(allocated);
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
  if (val === null || !Number.isFinite(val) || val <= 0) {
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
        allocatedAmount: roundMoney(allocations[conceptKey(c)] ?? 0),
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
      amount: roundMoney(montoRecibido.value as number),
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
    // El backend manda un `message` específico y accionable (p.ej. "No existe
    // caja efectivo para la sucursal N", "Moneda inconsistente…"). Antes se
    // mostraba y logueaba el `err.message` genérico de axios ("Request failed
    // with status code 400"), inútil para el admin y ruido en Sentry.
    const message = extractError(err, 'Error desconocido');
    if (isExpectedClientError(err)) {
      // 4xx = rechazo de negocio corregible por el usuario: NO es un error para
      // Sentry, solo se avisa por consola.
      log.warn('Pago rechazado por el backend', { error: message });
    } else {
      log.error('Error registrando pago', { error: message });
    }
    $q.notify({ type: 'negative', message });
  } finally {
    submitting.value = false;
  }
}
</script>
