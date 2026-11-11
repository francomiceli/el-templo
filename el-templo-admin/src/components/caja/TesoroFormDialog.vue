<template>
  <q-dialog v-model="show" @show="resetAll" @hide="resetAll">
    <q-card style="width: 480px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Nuevo Tesoro</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section class="q-gutter-sm">
        <div class="text-caption text-grey-7">
          El Tesoro es la reserva de efectivo sin sede (caja fuerte), aparte de la Caja central. Hay
          uno por moneda.
        </div>

        <q-select
          v-model="form.currency"
          :options="ACCOUNT_CURRENCY_OPTIONS"
          label="Moneda *"
          dense
          outlined
          emit-value
          map-options
          hint="Un Tesoro por moneda. No se puede cambiar después."
          @update:model-value="onCurrencyChange"
        />

        <q-input
          v-model="form.name"
          label="Nombre *"
          dense
          outlined
          maxlength="100"
          :rules="[(v) => !!(v && v.trim()) || 'El nombre es obligatorio']"
        />

        <MoneyInput
          v-model="form.openingBalance"
          label="Saldo de apertura *"
          dense
          outlined
          :prefix="currencySymbol(form.currency)"
          :rules="[(v) => v !== null || 'Ingresá el saldo de apertura (0 si arranca vacío)']"
          hint="Efectivo que hay hoy en el Tesoro"
        />
      </q-card-section>

      <q-separator />
      <q-card-actions align="right">
        <q-btn flat label="Cancelar" color="grey" v-close-popup />
        <q-btn
          unelevated
          color="primary"
          label="Crear Tesoro"
          :disable="!canSubmit || submitting"
          :loading="submitting"
          @click="submit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { reactive, computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { compareMoney } from 'src/utils/money';
import {
  ACCOUNT_CURRENCY_OPTIONS,
  currencySymbol,
  type AccountCurrency,
} from 'src/utils/currencies';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import MoneyInput from 'src/components/MoneyInput.vue';
import type { CajaSaldoRow } from 'src/types/transaction';

const props = defineProps<{
  modelValue: boolean;
  /** Moneda inicial sugerida (la del país del hub). */
  defaultCurrency?: AccountCurrency;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'created', caja: CajaSaldoRow): void;
}>();

const log = createLogger('TesoroFormDialog');
const $q = useQuasar();
const transactionsApi = useTransactionsApi();

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const submitting = ref(false);

function defaultName(currency: AccountCurrency): string {
  return `Tesoro ${currency}`;
}

const form = reactive({
  currency: 'ARS' as AccountCurrency,
  name: defaultName('ARS'),
  // null = vacío o texto inválido: bloquea el alta (el 0 se tipea explícito).
  openingBalance: 0 as number | null,
});

const canSubmit = computed(
  () =>
    !!form.name.trim() &&
    !!form.currency &&
    form.openingBalance !== null &&
    compareMoney(form.openingBalance, 0) >= 0
);

// Al cambiar la moneda el nombre sugerido la sigue, salvo que lo hayan editado
// a mano (distinto del sugerido anterior y no vacío).
function onCurrencyChange(next: AccountCurrency) {
  const wasAuto =
    !form.name.trim() || ACCOUNT_CURRENCY_OPTIONS.some((o) => form.name === defaultName(o.value));
  if (wasAuto) form.name = defaultName(next);
}

function resetAll() {
  const currency = props.defaultCurrency ?? 'ARS';
  form.currency = currency;
  form.name = defaultName(currency);
  form.openingBalance = 0;
  submitting.value = false;
}

async function submit() {
  if (!canSubmit.value || form.openingBalance === null) return;
  submitting.value = true;
  try {
    const { caja } = await transactionsApi.createTreasury({
      name: form.name.trim(),
      currency: form.currency,
      openingBalance: form.openingBalance,
    });
    $q.notify({ type: 'positive', message: 'Tesoro creado' });
    emit('created', caja);
    show.value = false;
  } catch (err: unknown) {
    // 403 (no es dueño) y 409 (ya hay un Tesoro en esa moneda) traen un mensaje
    // claro del server: se muestra tal cual.
    $q.notify({ type: 'negative', message: extractError(err, 'Error creando el Tesoro') });
    log.warn('No se pudo crear el Tesoro', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    submitting.value = false;
  }
}
</script>
