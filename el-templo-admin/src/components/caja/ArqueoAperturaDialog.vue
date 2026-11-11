<template>
  <q-dialog v-model="show" @show="resetAll" @hide="resetAll">
    <q-card style="width: 480px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Arqueo de apertura{{ caja ? ` · ${caja.name}` : '' }}</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section v-if="caja" class="q-gutter-sm">
        <div class="text-caption text-grey-7">
          Deja la cuenta en el efectivo real contado. Queda registrado como ajuste "Arqueo de
          apertura" con tu usuario y la fecha.
        </div>

        <div class="text-body2">
          Saldo en el sistema:
          <span class="text-weight-medium">{{
            formatPrice(caja.firmeBalance, caja.currency)
          }}</span>
        </div>
        <div v-if="caja.changeFund > 0" class="text-body2">
          Fondo de cambio:
          <span class="text-weight-medium">{{ formatPrice(caja.changeFund, caja.currency) }}</span>
          <span class="text-caption text-grey-7"> (el contado incluye el fondo de cambio)</span>
        </div>
        <div v-if="caja.pendienteAmount > 0" class="text-body2">
          Pendiente de validar:
          <span class="text-weight-medium">{{
            formatPrice(caja.pendienteAmount, caja.currency)
          }}</span>
          <span class="text-caption text-grey-7"> (está en el cajón aunque no esté validado)</span>
        </div>

        <q-input
          v-model.number="countedInput"
          type="number"
          inputmode="numeric"
          min="0"
          step="1"
          label="¿Cuánto efectivo contaste? *"
          dense
          outlined
          autofocus
          :prefix="currencySymbol(caja.currency)"
          :rules="[
            () =>
              countedAmount !== null ||
              'Ingresá el efectivo contado en números enteros (0 si no hay nada)',
          ]"
        />

        <q-banner
          v-if="difference !== null"
          dense
          rounded
          :class="
            difference.kind === 'ok' ? 'bg-green-1 text-green-9' : 'bg-orange-1 text-orange-10'
          "
        >
          <template v-if="difference.kind === 'ok'">Coincide: no se crea ajuste.</template>
          <template v-else-if="difference.kind === 'sobrante'">
            Se asienta un ajuste de +{{ formatPrice(difference.amount, caja.currency) }} (sobrante).
          </template>
          <template v-else>
            Se asienta un ajuste de −{{ formatPrice(difference.amount, caja.currency) }} (faltante).
          </template>
        </q-banner>

        <q-input
          v-model="notes"
          type="textarea"
          label="Notas (opcional)"
          outlined
          dense
          autogrow
          maxlength="1000"
        />
      </q-card-section>

      <q-separator />
      <q-card-actions align="right">
        <q-btn flat label="Cancelar" color="grey" v-close-popup />
        <q-btn
          unelevated
          color="primary"
          label="Registrar arqueo"
          :disable="!canSubmit || submitting"
          :loading="submitting"
          @click="submit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { formatPrice } from 'src/utils/format-price';
import { currencySymbol } from 'src/utils/currencies';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import type { CajaSaldoRow, OpeningCountResult } from 'src/types/transaction';

const props = defineProps<{
  modelValue: boolean;
  /** Caja central o Tesoro sobre la que se registra el arqueo. */
  caja: CajaSaldoRow | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'registered', result: OpeningCountResult): void;
}>();

const log = createLogger('ArqueoAperturaDialog');
const $q = useQuasar();
const transactionsApi = useTransactionsApi();

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const submitting = ref(false);
// Lo que hay en el campo. Vacío o no numérico bloquea el envío (el 0 se tipea
// explícito). La plata va en unidades enteras.
const countedInput = ref<number | string | null>(null);
const countedAmount = computed<number | null>(() => {
  const v = countedInput.value;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
});
const notes = ref('');

// Mismo esperado que calcula la API: fondo de cambio + firme + pendiente.
const expectedAmount = computed(() =>
  props.caja ? props.caja.changeFund + props.caja.firmeBalance + props.caja.pendienteAmount : 0
);

type Difference = { kind: 'ok' | 'sobrante' | 'faltante'; amount: number };

const difference = computed<Difference | null>(() => {
  if (countedAmount.value === null) return null;
  const diff = countedAmount.value - expectedAmount.value;
  if (diff === 0) return { kind: 'ok', amount: 0 };
  return diff > 0
    ? { kind: 'sobrante', amount: diff }
    : { kind: 'faltante', amount: Math.abs(diff) };
});

const canSubmit = computed(() => props.caja !== null && countedAmount.value !== null);

function resetAll() {
  countedInput.value = null;
  notes.value = '';
  submitting.value = false;
}

async function submit() {
  if (!props.caja || countedAmount.value === null) return;
  submitting.value = true;
  try {
    const { openingCount } = await transactionsApi.registerOpeningCount(props.caja.cashRegisterId, {
      countedAmount: countedAmount.value,
      notes: notes.value.trim() || null,
    });
    $q.notify({
      type: 'positive',
      message: `Arqueo registrado. Saldo final: ${formatPrice(openingCount.firmeBalance, props.caja.currency)}`,
    });
    emit('registered', openingCount);
    show.value = false;
  } catch (err: unknown) {
    $q.notify({ type: 'negative', message: extractError(err, 'Error registrando el arqueo') });
    log.warn('No se pudo registrar el arqueo de apertura', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    submitting.value = false;
  }
}
</script>
