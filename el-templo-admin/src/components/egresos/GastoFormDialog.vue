<template>
  <q-dialog v-model="show" persistent>
    <q-card style="width: 760px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">{{ isEdit ? 'Editar gasto' : 'Nuevo gasto' }}</div>
        <q-space />
        <q-btn icon="close" flat round dense :disable="submitting" v-close-popup />
      </q-card-section>

      <q-card-section class="scroll q-gutter-y-sm" style="max-height: 70vh">
        <!-- Concepto y beneficiario -->
        <div class="row q-col-gutter-sm">
          <div class="col-12 col-sm-7">
            <q-input
              v-model="form.concept"
              label="Concepto *"
              dense
              outlined
              maxlength="200"
              :rules="[(v: string) => v.trim().length > 0 || 'El concepto es obligatorio']"
              lazy-rules
            />
          </div>
          <div class="col-12 col-sm-5">
            <q-input
              v-model="form.beneficiary"
              label="Beneficiario"
              dense
              outlined
              maxlength="200"
              hint="A quién se le paga (opcional)."
            />
          </div>
        </div>

        <!-- Rubro y mes de imputación -->
        <div class="row q-col-gutter-sm">
          <div class="col-12 col-sm-6">
            <q-select
              v-model="form.costCenterId"
              :options="costCenterOptions"
              label="Rubro *"
              dense
              outlined
              emit-value
              map-options
            />
          </div>
          <div class="col-12 col-sm-6">
            <q-select
              v-model="form.imputationMonth"
              :options="monthOptions"
              label="Mes de imputación *"
              dense
              outlined
              emit-value
              map-options
              hint="El mes al que corresponde el costo, aunque se pague después."
            />
          </div>
        </div>

        <!-- Importe, moneda y estado del importe -->
        <div class="row q-col-gutter-sm">
          <div class="col-12 col-sm-5">
            <q-input
              :model-value="form.amount"
              type="number"
              inputmode="numeric"
              step="1"
              min="1"
              label="Importe *"
              dense
              outlined
              :rules="[moneyIntegerRule]"
              lazy-rules
              @update:model-value="(v: string | number | null) => (form.amount = toNumberOrNull(v))"
            />
          </div>
          <div class="col-12 col-sm-3">
            <q-select
              v-model="form.currency"
              :options="currencyOptions"
              label="Moneda *"
              dense
              outlined
              :disable="isEdit"
              :hint="isEdit ? 'No se cambia al editar.' : undefined"
            />
          </div>
          <div class="col-12 col-sm-4">
            <q-btn-toggle
              v-model="form.amountStatus"
              :options="AMOUNT_STATUS_OPTIONS"
              unelevated
              no-caps
              dense
              toggle-color="primary"
              color="grey-3"
              text-color="grey-8"
            />
            <div class="text-caption text-grey-7 q-mt-xs">
              Estimado = todavía no llegó la factura real.
            </div>
          </div>
        </div>

        <!-- Tipo de cambio de referencia: solo gastos en USD de Argentina -->
        <div v-if="needsFx" class="row q-col-gutter-sm">
          <div class="col-12 col-sm-5">
            <q-input
              :model-value="form.fxRate"
              type="number"
              inputmode="decimal"
              step="0.0001"
              min="0"
              label="Tipo de cambio de referencia *"
              dense
              outlined
              :rules="[fxRule]"
              lazy-rules
              hint="Pesos por dólar, cargado a mano. Con esto se calcula el costo en pesos."
              @update:model-value="(v: string | number | null) => (form.fxRate = toNumberOrNull(v))"
            />
          </div>
          <div class="col-12 col-sm-7 flex items-center">
            <div v-if="fxEquivalent !== null" class="text-body2">
              ≈ {{ formatPrice(fxEquivalent, 'ARS') }}
              <span class="text-caption text-grey-7">(importe × tipo de cambio, redondeado)</span>
            </div>
          </div>
        </div>

        <!-- Links de comprobante -->
        <div>
          <div class="text-subtitle2 q-mb-xs">Comprobantes</div>
          <div class="text-caption text-grey-7 q-mb-xs">
            Links a la factura o al comprobante (por ejemplo, una carpeta compartida). Hasta
            {{ MAX_LINKS }}.
          </div>
          <div
            v-for="(link, i) in form.links"
            :key="link.uid"
            class="row q-col-gutter-sm items-start q-mb-xs"
          >
            <div class="col-12 col-sm-4">
              <q-input
                v-model="link.label"
                label="Descripción"
                dense
                outlined
                maxlength="80"
                placeholder="Factura, remito…"
              />
            </div>
            <div class="col-10 col-sm-7">
              <q-input
                v-model="link.url"
                label="Link"
                dense
                outlined
                maxlength="500"
                :rules="[linkRule]"
                lazy-rules
              />
            </div>
            <div class="col-2 col-sm-1 text-right">
              <q-btn flat round dense icon="delete" color="negative" @click="removeLink(i)">
                <q-tooltip>Quitar link</q-tooltip>
              </q-btn>
            </div>
          </div>
          <q-btn
            flat
            dense
            no-caps
            icon="add"
            label="Agregar link"
            color="primary"
            :disable="form.links.length >= MAX_LINKS"
            @click="addLink"
          />
        </div>

        <q-input
          v-model="form.notes"
          type="textarea"
          label="Observaciones"
          dense
          outlined
          autogrow
          maxlength="2000"
        />

        <q-separator class="q-my-md" />

        <!-- Reparto entre sedes y Casa Matriz -->
        <RepartoEditor
          v-model="allocations"
          :amount="amountNumber"
          :currency="form.currency"
          :country="country"
          :destinations="options.destinations"
          :extra-destinations="extraDestinations"
          @update:valid="onAllocationsValid"
        />

        <!-- Motivo: solo si cambia importe, estado del importe o tipo de cambio -->
        <template v-if="isEdit && needsReason">
          <q-separator class="q-my-md" />
          <q-input
            v-model="form.reason"
            label="Motivo del cambio *"
            dense
            outlined
            maxlength="500"
            hint="Cambiar el importe, su estado o el tipo de cambio queda registrado con este motivo."
            :rules="[(v: string) => v.trim().length > 0 || 'Contanos el motivo del cambio']"
            lazy-rules
          />
        </template>
      </q-card-section>

      <q-separator />
      <q-card-actions align="right">
        <q-btn flat label="Cancelar" color="grey" :disable="submitting" v-close-popup />
        <q-btn
          unelevated
          color="primary"
          label="Guardar"
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
import { formatPrice } from 'src/utils/format-price';
import { useExpensesApi } from 'src/composables/useExpensesApi';
import {
  AMOUNT_STATUS_LABELS,
  amountAtRate,
  cleanReceiptLinks,
  diffExpenseUpdate,
  isHttpUrl,
  isValidFxRate,
  isValidMoneyInteger,
  moneyIntegerRule,
  monthLabel,
  needsExpenseFx,
  shiftMonth,
  toNumberOrNull,
  type ExpenseFormValues,
} from 'src/utils/expenses';
import RepartoEditor from 'src/components/egresos/RepartoEditor.vue';
import type {
  CreateExpenseRecordInput,
  ExpenseAllocationInput,
  ExpenseAmountStatus,
  ExpenseCountry,
  ExpenseCurrency,
  ExpenseDestinationOption,
  ExpenseFormOptions,
  ExpenseRecordDetail,
} from 'src/types/expense';

/**
 * Alta y edición de un gasto (DI-03, DI-09, DI-16).
 *
 * - `record` null/ausente = alta. Con `record` = edición: el país y la moneda
 *   no se cambian, y el PATCH lleva solo lo que cambió (más `reason` cuando
 *   cambia el importe, su estado o el tipo de cambio).
 * - Alta: `idempotencyKey` = `crypto.randomUUID()` generado al abrir el
 *   diálogo y reusado si se reintenta con el mismo diálogo abierto.
 * - Emite `saved(record)` con el gasto guardado (también si la API devolvió el
 *   que ya existía) y cierra.
 */
const props = defineProps<{
  modelValue: boolean;
  country: ExpenseCountry;
  options: ExpenseFormOptions;
  record?: ExpenseRecordDetail | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'saved', record: ExpenseRecordDetail): void;
}>();

const log = createLogger('GastoFormDialog');
const $q = useQuasar();
const expensesApi = useExpensesApi();

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const isEdit = computed(() => !!props.record);

const MAX_LINKS = 10;

const AMOUNT_STATUS_OPTIONS: Array<{ label: string; value: ExpenseAmountStatus }> = [
  { label: AMOUNT_STATUS_LABELS.estimado, value: 'estimado' },
  { label: AMOUNT_STATUS_LABELS.confirmado, value: 'confirmado' },
];

// ---------------------------------------------------------------------------
// Estado del formulario
// ---------------------------------------------------------------------------

interface LinkRow {
  uid: number;
  label: string;
  url: string;
}

let nextUid = 1;
function newLink(label = '', url = ''): LinkRow {
  return { uid: nextUid++, label, url };
}

const form = reactive({
  concept: '',
  beneficiary: '',
  costCenterId: null as number | null,
  imputationMonth: '',
  amount: null as number | null,
  currency: 'ARS' as ExpenseCurrency,
  fxRate: null as number | null,
  amountStatus: 'confirmado' as ExpenseAmountStatus,
  links: [] as LinkRow[],
  notes: '',
  reason: '',
});

const allocations = ref<ExpenseAllocationInput[]>([]);
const allocationsValid = ref(false);
const submitting = ref(false);

// Una clave por apertura del diálogo de alta: se reusa si se reintenta tras un error.
let idempotencyKey: string | null = null;

function onAllocationsValid(value: boolean) {
  allocationsValid.value = value;
}

function resetForm() {
  const rec = props.record ?? null;
  submitting.value = false;
  allocationsValid.value = false;
  form.reason = '';
  if (rec) {
    form.concept = rec.concept;
    form.beneficiary = rec.beneficiary ?? '';
    form.costCenterId = rec.costCenterId;
    form.imputationMonth = rec.imputationMonth;
    form.amount = rec.amount;
    form.currency = rec.currency;
    form.fxRate = rec.fxRate;
    form.amountStatus = rec.amountStatus;
    form.links = rec.receiptLinks.map((l) => newLink(l.label, l.url));
    form.notes = rec.notes ?? '';
    allocations.value = rec.allocations.map((a) => ({ branchId: a.branchId, amount: a.amount }));
    idempotencyKey = null;
  } else {
    form.concept = '';
    form.beneficiary = '';
    form.costCenterId = null;
    form.imputationMonth = props.options.today.slice(0, 7);
    form.amount = null;
    form.currency = props.options.countryCurrency;
    form.fxRate = null;
    form.amountStatus = 'confirmado';
    form.links = [];
    form.notes = '';
    allocations.value = [];
    idempotencyKey = crypto.randomUUID();
  }
}

// Se resetea ANTES de que se renderice el contenido del diálogo, así el editor
// de reparto monta con el reparto guardado (edición) o vacío (alta).
watch(
  () => props.modelValue,
  (open) => {
    if (open) resetForm();
  },
  { immediate: true }
);

// ---------------------------------------------------------------------------
// Opciones de los selects
// ---------------------------------------------------------------------------

const currencyOptions = computed(() => props.options.expenseCurrencies);

/** Rubros activos; en edición, el del gasto aunque hoy esté desactivado. */
const costCenterOptions = computed<Array<{ label: string; value: number }>>(() => {
  const out = props.options.costCenters.map((c) => ({ label: c.name, value: c.id }));
  const rec = props.record;
  if (rec && !out.some((o) => o.value === rec.costCenterId)) {
    out.push({ label: `${rec.costCenterName} (desactivado)`, value: rec.costCenterId });
  }
  return out;
});

/** 12 meses antes a 2 después del mes de hoy (más recientes primero). */
const monthOptions = computed<Array<{ label: string; value: string }>>(() => {
  const base = props.options.today.slice(0, 7);
  const months: string[] = [];
  for (let k = 2; k >= -12; k--) months.push(shiftMonth(base, k));
  const current = props.record?.imputationMonth;
  if (current && !months.includes(current)) months.push(current);
  return months.map((m) => ({ label: monthLabel(m), value: m }));
});

/** Sedes del reparto guardado que hoy no se ofrecen (inactivas): se conservan. */
const extraDestinations = computed<ExpenseDestinationOption[]>(() => {
  const rec = props.record;
  if (!rec) return [];
  const offered = new Set(props.options.destinations.map((d) => d.branchId));
  return rec.allocations
    .filter((a) => !offered.has(a.branchId))
    .map((a) => ({ branchId: a.branchId, name: `${a.branchName} (inactiva)` }));
});

// ---------------------------------------------------------------------------
// Derivados y validación
// ---------------------------------------------------------------------------

const amountNumber = computed(() => (isValidMoneyInteger(form.amount) ? form.amount : null));

const needsFx = computed(() => needsExpenseFx(props.country, form.currency));

const fxEquivalent = computed(() =>
  needsFx.value && amountNumber.value !== null && isValidFxRate(form.fxRate)
    ? amountAtRate(amountNumber.value, form.fxRate)
    : null
);

function fxRule(v: unknown): true | string {
  return (
    isValidFxRate(toNumberOrNull(v)) || 'Ingresá un tipo de cambio mayor a 0 (hasta 4 decimales)'
  );
}

function linkRule(v: string): true | string {
  return isHttpUrl(v.trim()) || 'Pegá un link que empiece con https://';
}

function addLink() {
  if (form.links.length < MAX_LINKS) form.links.push(newLink());
}

function removeLink(index: number) {
  form.links.splice(index, 1);
}

/** Cada fila de comprobante con contenido tiene que traer un link válido. */
const linksValid = computed(() =>
  cleanReceiptLinks(form.links).every((l) => isHttpUrl(l.url) && l.url.length <= 500)
);

/** Valores del formulario con los tipos de la API; null mientras falte un obligatorio. */
const values = computed<ExpenseFormValues | null>(() => {
  if (
    form.costCenterId === null ||
    form.imputationMonth === '' ||
    amountNumber.value === null ||
    form.concept.trim() === ''
  ) {
    return null;
  }
  return {
    concept: form.concept,
    beneficiary: form.beneficiary,
    costCenterId: form.costCenterId,
    imputationMonth: form.imputationMonth,
    amount: amountNumber.value,
    amountStatus: form.amountStatus,
    fxRate: needsFx.value ? form.fxRate : null,
    receiptLinks: form.links.map((l) => ({ label: l.label, url: l.url })),
    notes: form.notes,
    allocations: allocations.value,
  };
});

/** Edición: qué cambió respecto del gasto guardado. */
const diff = computed(() =>
  props.record && values.value ? diffExpenseUpdate(props.record, values.value) : null
);

const needsReason = computed(() => diff.value?.needsReason === true);

const canSubmit = computed(() => {
  if (values.value === null) return false;
  if (needsFx.value && !isValidFxRate(form.fxRate)) return false;
  if (!linksValid.value) return false;
  if (!allocationsValid.value) return false;
  if (isEdit.value) {
    if (!diff.value?.hasChanges) return false;
    if (needsReason.value && form.reason.trim() === '') return false;
  }
  return true;
});

// ---------------------------------------------------------------------------
// Guardar
// ---------------------------------------------------------------------------

async function submit() {
  const v = values.value;
  if (!v || !canSubmit.value) return;
  submitting.value = true;
  try {
    let saved: ExpenseRecordDetail;
    if (props.record) {
      const changes = diff.value?.changes ?? {};
      const result = await expensesApi.updateExpenseRecord(props.record.id, props.country, {
        ...changes,
        ...(needsReason.value ? { reason: form.reason.trim() } : {}),
      });
      saved = result;
      $q.notify({ type: 'positive', message: 'Gasto actualizado' });
    } else {
      const input: CreateExpenseRecordInput = {
        concept: v.concept.trim(),
        beneficiary: v.beneficiary.trim() === '' ? null : v.beneficiary.trim(),
        costCenterId: v.costCenterId,
        imputationMonth: v.imputationMonth,
        amount: v.amount,
        currency: form.currency,
        amountStatus: v.amountStatus,
        receiptLinks: cleanReceiptLinks(v.receiptLinks),
        notes: v.notes.trim() === '' ? null : v.notes.trim(),
        allocations: v.allocations.map((a) => ({ branchId: a.branchId, amount: a.amount })),
        idempotencyKey,
      };
      if (needsFx.value) input.fxRate = v.fxRate;
      const result = await expensesApi.createExpenseRecord(props.country, input);
      saved = result.record;
      // La API devolvió el gasto que ya existía con esta clave: no se duplicó nada.
      $q.notify(
        result.created
          ? { type: 'positive', message: 'Gasto guardado' }
          : { type: 'warning', message: 'Ese gasto ya estaba cargado' }
      );
    }
    emit('saved', saved);
    show.value = false;
  } catch (err: unknown) {
    // Se muestra el mensaje de la API tal cual. La clave de idempotencia se
    // conserva: si el usuario reintenta con el diálogo abierto, es el mismo intento.
    $q.notify({ type: 'negative', message: extractError(err, 'Error guardando el gasto') });
    log.warn('No se pudo guardar el gasto', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    submitting.value = false;
  }
}

onUnmounted(() => {
  expensesApi.cleanup();
});
</script>
