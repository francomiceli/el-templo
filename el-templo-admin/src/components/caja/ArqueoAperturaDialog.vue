<template>
  <q-dialog v-model="show" @show="resetAll" @hide="resetAll">
    <q-card style="width: 480px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">{{ texts.title }}{{ caja ? ` · ${caja.name}` : '' }}</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section v-if="caja" class="q-gutter-sm">
        <div class="text-caption text-grey-7">{{ texts.caption }}</div>

        <div class="text-body2">
          {{ texts.firmeLabel }}:
          <span class="text-weight-medium">{{
            formatPrice(caja.firmeBalance, caja.currency)
          }}</span>
        </div>
        <div v-if="!isBanco && caja.changeFund > 0" class="text-body2">
          Fondo de cambio:
          <span class="text-weight-medium">{{ formatPrice(caja.changeFund, caja.currency) }}</span>
          <span class="text-caption text-grey-7"> (el contado incluye el fondo de cambio)</span>
        </div>
        <div v-if="caja.pendienteAmount > 0" class="text-body2">
          {{ texts.pendienteLabel }}:
          <span class="text-weight-medium">{{
            formatPrice(caja.pendienteAmount, caja.currency)
          }}</span>
          <span class="text-caption text-grey-7"> ({{ texts.pendienteHint }})</span>
        </div>
        <div v-if="isBanco && caja.pendienteAmount > 0" class="text-body2">
          La app espera en el banco:
          <span class="text-weight-medium">{{ formatPrice(expectedAmount, caja.currency) }}</span>
        </div>

        <q-input
          v-model.number="countedInput"
          type="number"
          inputmode="numeric"
          min="0"
          step="1"
          :label="texts.inputLabel"
          dense
          outlined
          autofocus
          :prefix="currencySymbol(caja.currency)"
          :rules="[() => countedAmount !== null || texts.inputRule]"
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
            Se asienta un ajuste de +{{ formatPrice(difference.amount, caja.currency) }} ({{
              texts.sobrante
            }}).
          </template>
          <template v-else>
            Se asienta un ajuste de −{{ formatPrice(difference.amount, caja.currency) }} ({{
              texts.faltante
            }}).
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
          :label="texts.submitLabel"
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
import { openingExpected, openingDifference, type OpeningMode } from 'src/utils/opening-count';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    /** Caja central, Tesoro o cuenta bancaria sobre la que se registra la apertura. */
    caja: CajaSaldoRow | null;
    /** 'efectivo' = arqueo de Central/Tesoro (default), 'banco' = saldo de apertura (209.1). */
    mode?: OpeningMode;
  }>(),
  { mode: 'efectivo' }
);

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

const isBanco = computed(() => props.mode === 'banco');

// Textos por modo. El modo 'efectivo' conserva exactamente los de Central/Tesoro.
const texts = computed(() =>
  isBanco.value
    ? {
        title: 'Saldo de apertura',
        caption:
          'Deja la cuenta en el saldo real que muestra el banco hoy. Queda registrado como ajuste "Saldo de apertura del banco" con tu usuario y la fecha. Si lo cargás de nuevo, ajusta contra el saldo que tenga la app en ese momento.',
        firmeLabel: 'Saldo firme en la app',
        pendienteLabel: 'Cobros por transferencia sin validar',
        pendienteHint: 'ya están en el banco aunque no estén validados',
        inputLabel: 'Saldo según el banco *',
        inputRule: 'Ingresá el saldo del banco en números enteros (0 si está vacía)',
        sobrante: 'el banco tiene más que la app',
        faltante: 'el banco tiene menos que la app',
        submitLabel: 'Cargar saldo de apertura',
        errorMessage: 'Error cargando el saldo de apertura',
        logMessage: 'No se pudo cargar el saldo de apertura del banco',
      }
    : {
        title: 'Arqueo de apertura',
        caption:
          'Deja la cuenta en el efectivo real contado. Queda registrado como ajuste "Arqueo de apertura" con tu usuario y la fecha.',
        firmeLabel: 'Saldo en el sistema',
        pendienteLabel: 'Pendiente de validar',
        pendienteHint: 'está en el cajón aunque no esté validado',
        inputLabel: '¿Cuánto efectivo contaste? *',
        inputRule: 'Ingresá el efectivo contado en números enteros (0 si no hay nada)',
        sobrante: 'sobrante',
        faltante: 'faltante',
        submitLabel: 'Registrar arqueo',
        errorMessage: 'Error registrando el arqueo',
        logMessage: 'No se pudo registrar el arqueo de apertura',
      }
);

// Mismo esperado que calcula la API (helper puro, con test).
const expectedAmount = computed(() => (props.caja ? openingExpected(props.caja, props.mode) : 0));

const difference = computed(() => openingDifference(countedAmount.value, expectedAmount.value));

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
    const saldoFinal = formatPrice(openingCount.firmeBalance, props.caja.currency);
    const sinValidar =
      isBanco.value && props.caja.pendienteAmount > 0
        ? ` (+ ${formatPrice(props.caja.pendienteAmount, props.caja.currency)} sin validar)`
        : '';
    $q.notify({
      type: 'positive',
      message: isBanco.value
        ? `Saldo de apertura cargado. Saldo firme: ${saldoFinal}${sinValidar}`
        : `Arqueo registrado. Saldo final: ${saldoFinal}`,
    });
    emit('registered', openingCount);
    show.value = false;
  } catch (err: unknown) {
    $q.notify({ type: 'negative', message: extractError(err, texts.value.errorMessage) });
    log.warn(texts.value.logMessage, {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    submitting.value = false;
  }
}
</script>
