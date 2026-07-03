<template>
  <q-dialog v-model="show" @show="onShow" @hide="resetAll">
    <q-card style="width: 520px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">
          {{ isEditMode ? 'Editar cuenta bancaria' : 'Nueva cuenta bancaria' }}
        </div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section class="q-gutter-sm">
        <q-input
          v-model="form.bankName"
          label="Banco *"
          dense
          outlined
          maxlength="100"
          :rules="[(v) => !!(v && v.trim()) || 'El banco es obligatorio']"
        />
        <q-input
          v-model="form.accountHolder"
          label="Titular *"
          dense
          outlined
          maxlength="120"
          :rules="[(v) => !!(v && v.trim()) || 'El titular es obligatorio']"
        />
        <q-select
          v-model="form.currency"
          :options="currencyOptions"
          label="Moneda *"
          dense
          outlined
          emit-value
          map-options
          :disable="isEditMode"
          :hint="isEditMode ? 'La moneda no se puede cambiar una vez creada la cuenta' : undefined"
        />

        <q-separator class="q-my-sm" />
        <div class="text-caption text-grey-7">Cargá al menos un CBU/CVU o un Alias.</div>

        <q-input
          v-model="form.cbuCvu"
          label="CBU / CVU"
          dense
          outlined
          maxlength="34"
          :rules="[cbuCvuRule]"
          hint="22 dígitos para cuentas locales (opcional para cuentas del exterior)"
        />
        <q-input v-model="form.accountAlias" label="Alias" dense outlined maxlength="60" />
        <q-input
          v-model="form.taxId"
          label="CUIT / CUIL / identificación fiscal"
          dense
          outlined
          maxlength="20"
          :rules="[taxIdRule]"
        />
        <q-input
          v-model="form.accountNumber"
          label="Número de cuenta"
          dense
          outlined
          maxlength="50"
        />

        <div v-if="!oneOfTwoOk" class="text-caption text-negative">
          Ingresá un CBU/CVU o un Alias.
        </div>
      </q-card-section>

      <q-separator />
      <q-card-actions align="right">
        <q-btn flat label="Cancelar" color="grey" v-close-popup />
        <q-btn
          unelevated
          color="primary"
          :label="isEditMode ? 'Guardar cambios' : 'Crear cuenta'"
          :disable="!canSubmit || submitting"
          :loading="submitting"
          @click="submit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { reactive, computed, ref, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import type {
  BankAccount,
  CreateBankAccountInput,
  UpdateBankAccountInput,
} from 'src/types/transaction';

const props = defineProps<{
  modelValue: boolean;
  selectedCountry: 'AR' | 'ES';
  isOwner: boolean;
  /** Presente = modo edición; ausente/null = alta. */
  account?: BankAccount | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'saved'): void;
}>();

const log = createLogger('CuentaBancariaFormDialog');
const $q = useQuasar();
const transactionsApi = useTransactionsApi();

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const isEditMode = computed(() => !!props.account);

const currencyOptions: Array<{ label: string; value: 'ARS' | 'EUR' }> = [
  { label: 'Pesos (ARS)', value: 'ARS' },
  { label: 'Euros (EUR)', value: 'EUR' },
];

// =========================================================================
// Form state — SIN campo "Nombre" (derivado en el backend, D-03).
// =========================================================================

const submitting = ref(false);

const form = reactive({
  bankName: '',
  accountHolder: '',
  currency: 'ARS' as 'ARS' | 'EUR', // default ARS (D-04)
  cbuCvu: '',
  accountAlias: '',
  taxId: '',
  accountNumber: '',
});

// Regla uno-de-dos (D-02) — espejo del backend: al menos CBU/CVU o Alias.
const oneOfTwoOk = computed(() => !!form.cbuCvu.trim() || !!form.accountAlias.trim());

const canSubmit = computed(
  () => !!form.bankName.trim() && !!form.accountHolder.trim() && !!form.currency && oneOfTwoOk.value
);

// Validación de formato liviana — NO bloquea cuentas del exterior (solo alerta
// si hay dígitos pero no cuadran con el formato local esperado).
function cbuCvuRule(v: string | null): true | string {
  const val = (v ?? '').trim();
  if (!val) return true;
  if (/^\d+$/.test(val) && val.length !== 22) {
    return 'El CBU/CVU local suele tener 22 dígitos';
  }
  return true;
}

function taxIdRule(v: string | null): true | string {
  const val = (v ?? '').trim();
  if (!val) return true;
  const digits = val.replace(/\D/g, '');
  if (/^\d+$/.test(val.replace(/-/g, '')) && digits.length !== 11) {
    return 'El CUIT/CUIL suele tener 11 dígitos';
  }
  return true;
}

// =========================================================================
// Prefill (modo edición) desde props.account al abrir.
// =========================================================================

function onShow() {
  const acc = props.account;
  if (acc) {
    form.bankName = acc.bankName;
    form.accountHolder = acc.accountHolder;
    form.currency = acc.currency;
    form.cbuCvu = acc.cbuCvu ?? '';
    form.accountAlias = acc.accountAlias ?? '';
    form.taxId = acc.taxId ?? '';
    form.accountNumber = acc.accountNumber ?? '';
  }
}

// =========================================================================
// Submit — ramifica create vs update según props.account. El update NO envía
// currency (moneda fija post-creación, D-04).
// =========================================================================

/** Normaliza un campo opcional: string vacío → null. */
function optional(v: string): string | null {
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  try {
    const acc = props.account;
    if (acc) {
      const input: UpdateBankAccountInput = {
        bankName: form.bankName.trim(),
        accountHolder: form.accountHolder.trim(),
        cbuCvu: optional(form.cbuCvu),
        accountAlias: optional(form.accountAlias),
        taxId: optional(form.taxId),
        accountNumber: optional(form.accountNumber),
      };
      await transactionsApi.updateBankAccount(acc.id, input);
      $q.notify({ type: 'positive', message: 'Cuenta bancaria actualizada' });
    } else {
      const input: CreateBankAccountInput = {
        bankName: form.bankName.trim(),
        accountHolder: form.accountHolder.trim(),
        currency: form.currency,
        cbuCvu: optional(form.cbuCvu),
        accountAlias: optional(form.accountAlias),
        taxId: optional(form.taxId),
        accountNumber: optional(form.accountNumber),
      };
      await transactionsApi.createBankAccount(input);
      $q.notify({ type: 'positive', message: 'Cuenta bancaria creada' });
    }
    show.value = false;
    emit('saved');
  } catch (err: unknown) {
    const message = extractError(err, 'Error guardando la cuenta bancaria');
    log.error('Error saving bank account', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    submitting.value = false;
  }
}

function resetAll() {
  form.bankName = '';
  form.accountHolder = '';
  form.currency = 'ARS';
  form.cbuCvu = '';
  form.accountAlias = '';
  form.taxId = '';
  form.accountNumber = '';
}

onUnmounted(() => {
  transactionsApi.cleanup();
});
</script>
