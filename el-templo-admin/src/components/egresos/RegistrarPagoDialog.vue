<template>
  <q-dialog v-model="show" persistent>
    <q-card style="width: 620px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Registrar pago</div>
        <q-space />
        <q-btn icon="close" flat round dense :disable="submitting" v-close-popup />
      </q-card-section>

      <q-card-section class="scroll q-gutter-y-sm" style="max-height: 70vh">
        <!-- Encabezado: qué gasto se está pagando -->
        <div class="q-pa-sm bg-grey-2 rounded-borders">
          <div class="text-subtitle1 text-weight-medium">{{ record.concept }}</div>
          <div v-if="record.beneficiary" class="text-caption text-grey-7">
            {{ record.beneficiary }}
          </div>
          <div class="row q-col-gutter-sm q-mt-xs">
            <div class="col-12 col-sm-4">
              <div class="text-caption text-grey-7">Importe</div>
              <div class="text-weight-bold">{{ formatPrice(record.amount, record.currency) }}</div>
            </div>
            <div class="col-6 col-sm-4">
              <div class="text-caption text-grey-7">Pagado</div>
              <div>{{ formatPrice(record.paid, record.currency) }}</div>
            </div>
            <div class="col-6 col-sm-4">
              <div class="text-caption text-grey-7">
                {{ record.overpaid ? 'Situación' : 'Falta pagar' }}
              </div>
              <div v-if="record.overpaid" class="text-weight-bold text-deep-orange">
                Pagado de más
              </div>
              <div v-else-if="record.pending === 0" class="text-weight-bold text-positive">
                Pagado por completo
              </div>
              <div v-else class="text-weight-bold text-deep-orange">
                {{ formatPrice(record.pending, record.currency) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Fecha -->
        <q-input
          v-model="form.paidOn"
          type="date"
          label="Fecha del pago *"
          dense
          outlined
          :max="options.today"
          :error="dateError !== null"
          :error-message="dateError ?? ''"
        />

        <!-- Cuenta de origen (DI-07: sin importes de las cuentas) -->
        <q-select
          v-model="form.accountId"
          :options="accountOptions"
          label="Cuenta de origen *"
          dense
          outlined
          emit-value
          map-options
          option-disable="disable"
          :hint="accountOptions.length === 0 ? 'No hay cuentas disponibles para pagar.' : undefined"
        >
          <template #option="scope">
            <q-item-label v-if="scope.opt.header" header class="text-weight-bold">
              {{ scope.opt.label }}
            </q-item-label>
            <q-item v-else v-bind="scope.itemProps">
              <q-item-section>{{ scope.opt.label }}</q-item-section>
            </q-item>
          </template>
        </q-select>

        <!-- Medio de pago: solo los que admite la cuenta elegida -->
        <q-select
          v-model="form.method"
          :options="methodOptions"
          label="Medio de pago *"
          dense
          outlined
          emit-value
          map-options
          :disable="selectedAccount === null"
          :hint="selectedAccount === null ? 'Elegí primero la cuenta.' : undefined"
        />

        <!-- Importe, en la moneda de la cuenta -->
        <div>
          <q-input
            :model-value="form.amount"
            type="number"
            inputmode="numeric"
            step="1"
            min="1"
            :label="amountLabel"
            :prefix="accountCurrencyPrefix"
            dense
            outlined
            :disable="selectedAccount === null"
            :rules="[moneyIntegerRule]"
            lazy-rules
            @update:model-value="onAmountInput"
          />
          <q-btn
            v-if="canPayAll"
            flat
            dense
            no-caps
            icon="done_all"
            color="primary"
            label="Pagar todo lo pendiente"
            :disable="form.amount === record.pending"
            @click="payAll"
          />
        </div>

        <!-- Tipo de cambio: solo cuando la cuenta o el gasto lo piden -->
        <q-input
          v-if="needsFx"
          :model-value="form.fxRate"
          type="number"
          inputmode="decimal"
          step="0.0001"
          min="0"
          label="Tipo de cambio *"
          dense
          outlined
          :rules="[fxRule]"
          lazy-rules
          hint="Pesos por dólar, cargado a mano."
          @update:model-value="(v: string | number | null) => (form.fxRate = toNumberOrNull(v))"
        />

        <!-- Vista previa: cuánto cancela del gasto antes de confirmar -->
        <div v-if="selectedAccount !== null" class="q-pa-sm bg-grey-2 rounded-borders">
          <template v-if="preview !== null && preview.appliedAmount !== null">
            <div class="text-weight-medium">
              Cancela {{ formatPrice(preview.appliedAmount, record.currency) }} del gasto · Quedan
              {{ formatPrice(remainingAfter, record.currency) }}
            </div>
            <div
              v-if="needsFx && preview.amountArs !== null"
              class="text-caption text-grey-7 q-mt-xs"
            >
              Equivale a {{ formatPrice(preview.amountArs, 'ARS') }} en pesos
            </div>
          </template>
          <div v-else-if="needsFx" class="text-caption text-grey-7">
            Ingresá el importe y el tipo de cambio para ver cuánto cancela del gasto.
          </div>
          <div v-else class="text-caption text-grey-7">
            Ingresá el importe para ver cuánto cancela del gasto.
          </div>
        </div>

        <!-- Pago de más: gasto confirmado = no deja; estimado = avisa -->
        <q-banner v-if="overpay === 'blocked'" dense rounded class="bg-red-1 text-negative">
          {{ overpayBlockedMessage }}
        </q-banner>
        <q-banner v-else-if="overpay === 'warning'" dense rounded class="bg-orange-1 text-grey-9">
          Vas a pagar de más sobre un importe estimado: el pago se registra y el gasto queda pagado
          de más.
        </q-banner>

        <q-input
          v-model="form.reference"
          label="Referencia"
          dense
          outlined
          maxlength="100"
          hint="Por ejemplo: Transferencia 12345."
        />
        <q-input
          v-model="form.notes"
          type="textarea"
          label="Nota"
          dense
          outlined
          autogrow
          maxlength="2000"
        />
      </q-card-section>

      <q-separator />
      <q-card-actions align="right">
        <q-btn flat label="Cancelar" color="grey" :disable="submitting" v-close-popup />
        <q-btn
          unelevated
          color="primary"
          label="Confirmar pago"
          :disable="!canSubmit || submitting"
          :loading="submitting"
          @click="submit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { formatDate } from 'src/utils/format-date';
import { formatPrice } from 'src/utils/format-price';
import { useExpensesApi } from 'src/composables/useExpensesApi';
import {
  EXPENSE_PAYMENT_METHOD_LABELS,
  isValidFxRate,
  isValidMoneyInteger,
  moneyIntegerRule,
  paymentDateError,
  paymentMethodsForAccount,
  paymentNeedsFx,
  paymentOverpayState,
  previewPayment,
  toNumberOrNull,
} from 'src/utils/expenses';
import type {
  ExpenseCountry,
  ExpenseFormOptions,
  ExpensePaymentAccount,
  ExpensePaymentMethod,
  ExpenseRecordDetail,
  ExpenseRecordListItem,
  RegisterExpensePaymentInput,
} from 'src/types/expense';

/**
 * Registro de un pago de un gasto (DI-03, DI-05, DI-07, DI-16).
 *
 * - `record`: el gasto a pagar. Alcanza con el item del listado (también sirve
 *   el detalle, que lo extiende): se usan importe, moneda, pagado, pendiente,
 *   estado del importe, concepto y beneficiario.
 * - `options`: las opciones del formulario de Egresos (`form-options`), con la
 *   fecha de hoy y las cuentas de origen. Las cuentas no traen cuánta plata
 *   tienen (DI-07): esta pantalla no lo muestra ni lo pide.
 * - La pantalla anticipa las guardas de la API (fecha, corte de la cuenta, medio
 *   según la cuenta, tipo de cambio, pago de más) con las funciones puras de
 *   `utils/expenses.ts`; la API decide y su mensaje se muestra tal cual.
 * - `idempotencyKey` = `crypto.randomUUID()` al abrir el diálogo, reusada si se
 *   reintenta con el mismo diálogo abierto.
 * - Emite `paid(record)` con el gasto actualizado (también si la API dijo que el
 *   pago ya estaba registrado) y cierra.
 */
const props = defineProps<{
  modelValue: boolean;
  country: ExpenseCountry;
  options: ExpenseFormOptions;
  record: ExpenseRecordListItem | ExpenseRecordDetail;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'paid', record: ExpenseRecordDetail): void;
}>();

const log = createLogger('RegistrarPagoDialog');
const $q = useQuasar();
const expensesApi = useExpensesApi();

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

// ---------------------------------------------------------------------------
// Estado del formulario
// ---------------------------------------------------------------------------

const form = reactive({
  paidOn: '',
  accountId: null as number | null,
  method: null as ExpensePaymentMethod | null,
  amount: null as number | null,
  fxRate: null as number | null,
  reference: '',
  notes: '',
});

const submitting = ref(false);

/** El usuario ya tocó el importe: cambiar de cuenta no se lo pisa con el pendiente. */
const amountTouched = ref(false);

// Una clave por apertura del diálogo: se reusa si se reintenta tras un error.
let idempotencyKey: string | null = null;

function resetForm() {
  submitting.value = false;
  amountTouched.value = false;
  form.paidOn = props.options.today;
  form.accountId = null;
  form.method = null;
  form.amount = null;
  form.fxRate = null;
  form.reference = '';
  form.notes = '';
  idempotencyKey = crypto.randomUUID();
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) resetForm();
  },
  { immediate: true }
);

// ---------------------------------------------------------------------------
// Cuentas de origen
// ---------------------------------------------------------------------------

type AccountGroup = 'sede' | 'central' | 'tesoro' | 'banco';

const GROUP_ORDER: AccountGroup[] = ['sede', 'central', 'tesoro', 'banco'];

const GROUP_LABELS: Record<AccountGroup, string> = {
  sede: 'Cajas de sedes',
  central: 'Caja central',
  tesoro: 'Tesoro',
  banco: 'Bancos',
};

function accountGroup(a: ExpensePaymentAccount): AccountGroup {
  if (a.type === 'banco') return 'banco';
  if (a.isTreasury) return 'tesoro';
  return a.branchId === null ? 'central' : 'sede';
}

/** "Caja Alberti · Alberti · ARS", "Caja central · Caja central · ARS", "Galicia · Banco · ARS". */
function accountLabel(a: ExpensePaymentAccount): string {
  const group = accountGroup(a);
  const kind =
    group === 'sede'
      ? (a.branchName ?? 'Sede')
      : group === 'central'
        ? 'Caja central'
        : group === 'tesoro'
          ? 'Tesoro'
          : 'Banco';
  return `${a.name} · ${kind} · ${a.currency}`;
}

interface AccountOption {
  label: string;
  value: number | null;
  header?: boolean;
  disable?: boolean;
}

/** Cuentas agrupadas por tipo, con un encabezado por grupo. */
const accountOptions = computed<AccountOption[]>(() => {
  const out: AccountOption[] = [];
  for (const group of GROUP_ORDER) {
    const inGroup = props.options.accounts.filter((a) => accountGroup(a) === group);
    if (inGroup.length === 0) continue;
    out.push({ label: GROUP_LABELS[group], value: null, header: true, disable: true });
    for (const a of inGroup) out.push({ label: accountLabel(a), value: a.id });
  }
  return out;
});

const selectedAccount = computed<ExpensePaymentAccount | null>(
  () => props.options.accounts.find((a) => a.id === form.accountId) ?? null
);

// ---------------------------------------------------------------------------
// Medio, importe y tipo de cambio
// ---------------------------------------------------------------------------

const allowedMethods = computed<ExpensePaymentMethod[]>(() =>
  selectedAccount.value ? paymentMethodsForAccount(selectedAccount.value.type) : []
);

const methodOptions = computed(() =>
  allowedMethods.value.map((m) => ({ label: EXPENSE_PAYMENT_METHOD_LABELS[m], value: m }))
);

const CURRENCY_PREFIX: Record<string, string> = { ARS: '$', USD: 'US$', EUR: '€' };

const accountCurrencyPrefix = computed(() =>
  selectedAccount.value
    ? (CURRENCY_PREFIX[selectedAccount.value.currency] ?? selectedAccount.value.currency)
    : undefined
);

const amountLabel = computed(() =>
  selectedAccount.value
    ? `Importe en ${selectedAccount.value.currency} *`
    : 'Importe (en la moneda de la cuenta) *'
);

const needsFx = computed(() =>
  selectedAccount.value
    ? paymentNeedsFx({
        country: props.country,
        accountCurrency: selectedAccount.value.currency,
        expenseCurrency: props.record.currency,
      })
    : false
);

// Al cambiar de cuenta: el medio que ya no vale se limpia (y si queda uno solo, se
// elige solo), el importe sin tocar se ajusta a la moneda de la cuenta y el tipo de
// cambio se descarta si ya no hace falta.
watch(
  () => form.accountId,
  () => {
    const account = selectedAccount.value;
    if (account === null) {
      form.method = null;
      return;
    }
    const allowed = paymentMethodsForAccount(account.type);
    if (form.method === null || !allowed.includes(form.method)) {
      form.method = allowed.length === 1 ? (allowed[0] ?? null) : null;
    }
    if (!amountTouched.value) {
      form.amount =
        account.currency === props.record.currency && props.record.pending > 0
          ? props.record.pending
          : null;
    }
    if (!needsFx.value) form.fxRate = null;
  }
);

function onAmountInput(v: string | number | null) {
  amountTouched.value = true;
  form.amount = toNumberOrNull(v);
}

/** El atajo solo existe cuando el importe de la cuenta y el del gasto son la misma moneda. */
const canPayAll = computed(
  () =>
    selectedAccount.value !== null &&
    selectedAccount.value.currency === props.record.currency &&
    props.record.pending > 0
);

function payAll() {
  amountTouched.value = true;
  form.amount = props.record.pending;
}

function fxRule(v: unknown): true | string {
  return (
    isValidFxRate(toNumberOrNull(v)) || 'Ingresá un tipo de cambio mayor a 0 (hasta 4 decimales)'
  );
}

// ---------------------------------------------------------------------------
// Fecha, vista previa y pago de más
// ---------------------------------------------------------------------------

const dateError = computed<string | null>(() => {
  const err = paymentDateError(
    form.paidOn,
    props.options.today,
    selectedAccount.value?.cutoffDate ?? null
  );
  if (err === null) return null;
  if (err.kind === 'required') return 'Elegí la fecha del pago';
  if (err.kind === 'future') return 'No puede ser futura';
  return `Es anterior al corte de la cuenta (${formatDate(err.cutoffDate ?? '')}): el pago no restaría del saldo`;
});

const amountNumber = computed(() => (isValidMoneyInteger(form.amount) ? form.amount : null));

const preview = computed(() =>
  selectedAccount.value
    ? previewPayment({
        country: props.country,
        accountCurrency: selectedAccount.value.currency,
        expenseCurrency: props.record.currency,
        amount: amountNumber.value,
        fxRate: needsFx.value ? form.fxRate : null,
      })
    : null
);

const remainingAfter = computed(() =>
  Math.max(props.record.pending - (preview.value?.appliedAmount ?? 0), 0)
);

const overpay = computed(() =>
  paymentOverpayState(
    preview.value?.appliedAmount ?? null,
    props.record.pending,
    props.record.amountStatus
  )
);

const overpayBlockedMessage = computed(() => {
  const pending = props.record.pending;
  if (pending <= 0) return 'Este gasto ya está pagado por completo: no admite más pagos.';
  const base = `Supera lo que falta pagar (${formatPrice(pending, props.record.currency)}).`;
  // En la misma moneda el máximo es exacto; con tipo de cambio depende de lo que se cargue.
  return selectedAccount.value?.currency === props.record.currency
    ? `${base} Podés pagar hasta ${formatPrice(pending, props.record.currency)}.`
    : base;
});

const canSubmit = computed(() => {
  if (selectedAccount.value === null || form.method === null) return false;
  if (!allowedMethods.value.includes(form.method)) return false;
  if (dateError.value !== null) return false;
  if (amountNumber.value === null) return false;
  if (needsFx.value && !isValidFxRate(form.fxRate)) return false;
  if (preview.value === null || preview.value.appliedAmount === null) return false;
  if (overpay.value === 'blocked') return false;
  return true;
});

// ---------------------------------------------------------------------------
// Confirmar
// ---------------------------------------------------------------------------

async function submit() {
  const account = selectedAccount.value;
  if (!canSubmit.value || submitting.value || account === null) return;
  if (form.method === null || amountNumber.value === null) return;
  submitting.value = true;
  try {
    const input: RegisterExpensePaymentInput = {
      paidOn: form.paidOn,
      cashRegisterId: account.id,
      paymentMethod: form.method,
      amount: amountNumber.value,
      reference: form.reference.trim() === '' ? null : form.reference.trim(),
      notes: form.notes.trim() === '' ? null : form.notes.trim(),
      idempotencyKey,
    };
    // Sin tipo de cambio cuando no corresponde: la API responde 400 si llega.
    if (needsFx.value) input.fxRate = form.fxRate;

    const result = await expensesApi.registerExpensePayment(props.record.id, props.country, input);
    $q.notify(
      result.created
        ? { type: 'positive', message: 'Pago registrado' }
        : { type: 'warning', message: 'Ese pago ya estaba registrado' }
    );
    emit('paid', result.record);
    show.value = false;
  } catch (err: unknown) {
    // El mensaje de la API va tal cual (tope de efectivo, cuenta inactiva, etc.). La
    // clave se conserva: reintentar con el diálogo abierto es el mismo intento.
    $q.notify({ type: 'negative', message: extractError(err, 'Error registrando el pago') });
    log.warn('No se pudo registrar el pago', {
      error: err instanceof Error ? err.message : String(err),
      id: props.record.id,
    });
  } finally {
    submitting.value = false;
  }
}

onUnmounted(() => {
  expensesApi.cleanup();
});
</script>
