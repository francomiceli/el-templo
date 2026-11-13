<template>
  <q-dialog v-model="show">
    <q-card style="width: 860px; max-width: 95vw; max-height: 92vh" class="column no-wrap">
      <!-- Cargando / error de carga (sin gasto todavía) -->
      <template v-if="!record">
        <q-card-section class="row items-center">
          <div class="text-h6 col">Detalle del gasto</div>
          <q-btn flat dense round icon="close" v-close-popup />
        </q-card-section>
        <q-card-section class="text-center q-pa-xl">
          <q-spinner v-if="loading" color="primary" size="32px" />
          <template v-else>
            <q-banner dense rounded class="bg-red-1 text-negative text-left">
              {{ loadError ?? 'No se pudo cargar el gasto.' }}
            </q-banner>
            <q-btn
              flat
              color="primary"
              icon="refresh"
              label="Reintentar"
              class="q-mt-md"
              @click="load"
            />
          </template>
        </q-card-section>
      </template>

      <template v-else>
        <!-- Encabezado -->
        <q-card-section class="q-pb-none">
          <div class="row items-start no-wrap">
            <div class="col">
              <div class="text-h6" :class="{ 'text-strike text-grey-6': isVoided }">
                {{ record.concept }}
              </div>
              <div v-if="record.beneficiary" class="text-body2 text-grey-8">
                {{ record.beneficiary }}
              </div>
              <div class="text-caption text-grey-7">
                {{ record.costCenterName }} · Imputado a {{ monthLabel(record.imputationMonth) }}
              </div>
            </div>
            <q-btn flat dense round icon="close" v-close-popup />
          </div>
          <div class="q-mt-sm q-gutter-xs">
            <q-badge
              :color="EXPENSE_STATUS_META[record.status].color"
              :label="EXPENSE_STATUS_META[record.status].label"
            />
            <q-badge
              v-if="record.overpaid"
              color="warning"
              text-color="grey-9"
              label="Pagado de más"
            />
            <q-badge v-if="isVoided" color="negative" label="Anulado" />
            <q-badge
              v-if="record.amountStatus === 'estimado'"
              color="amber-8"
              :label="`Importe ${AMOUNT_STATUS_LABELS.estimado.toLowerCase()}`"
            />
          </div>
          <q-banner v-if="isVoided" dense rounded class="bg-red-1 text-grey-9 q-mt-sm">
            <div class="text-weight-medium text-negative">Gasto anulado</div>
            <div v-if="record.voidReason">Motivo: {{ record.voidReason }}</div>
            <div class="text-caption text-grey-7">
              <template v-if="record.voidedByName">Por {{ record.voidedByName }}</template>
              <template v-if="record.voidedAt"> · {{ formatDateTime(record.voidedAt) }}</template>
            </div>
          </q-banner>
        </q-card-section>

        <q-card-section class="scroll col q-pt-md">
          <!-- Importe, pagado y pendiente -->
          <div class="row q-col-gutter-md">
            <div class="col-12 col-sm-4">
              <div class="text-caption text-grey-7">Importe</div>
              <div class="text-h6">{{ formatPrice(record.amount, record.currency) }}</div>
              <div class="text-caption text-grey-7">
                {{ AMOUNT_STATUS_LABELS[record.amountStatus] }}
              </div>
              <div v-if="record.currency === 'USD'" class="text-caption text-grey-7">
                <template v-if="record.fxRate !== null">
                  TC de referencia {{ formatFxRate(record.fxRate) }}
                </template>
                <template v-else>Falta el tipo de cambio</template>
                <template v-if="record.costInCountryCurrency !== null">
                  · ≈ {{ formatPrice(record.costInCountryCurrency, 'ARS') }}
                </template>
              </div>
            </div>
            <div class="col-6 col-sm-4">
              <div class="text-caption text-grey-7">Pagado</div>
              <div class="text-h6">{{ formatPrice(record.paid, record.currency) }}</div>
            </div>
            <div class="col-6 col-sm-4">
              <div class="text-caption text-grey-7">Falta pagar</div>
              <div class="text-h6">{{ formatPrice(record.pending, record.currency) }}</div>
            </div>
          </div>
          <q-banner v-if="record.overpaid" dense rounded class="bg-orange-1 text-grey-9 q-mt-sm">
            Pagado de más: lo pagado supera el importe estimado. Al confirmar el importe se corrige.
          </q-banner>

          <!-- Reparto -->
          <div class="text-subtitle1 text-weight-medium q-mt-lg">Reparto</div>
          <q-markup-table dense flat bordered separator="horizontal">
            <thead>
              <tr>
                <th class="text-left">Destino</th>
                <th class="text-right">Importe</th>
                <th v-if="record.currency === 'USD'" class="text-right">En pesos</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="a in record.allocations" :key="a.branchId ?? 'casa-matriz'">
                <td class="text-left">{{ a.branchName }}</td>
                <td class="text-right">{{ formatPrice(a.amount, record.currency) }}</td>
                <td v-if="record.currency === 'USD'" class="text-right">
                  {{
                    a.amountInCountryCurrency === null
                      ? '—'
                      : formatPrice(a.amountInCountryCurrency, 'ARS')
                  }}
                </td>
              </tr>
            </tbody>
          </q-markup-table>

          <!-- Comprobantes -->
          <div class="text-subtitle1 text-weight-medium q-mt-lg">Comprobantes</div>
          <div v-if="record.receiptLinks.length === 0" class="text-grey-7">Sin comprobante</div>
          <ul v-else class="q-my-none q-pl-md">
            <li v-for="(l, i) in record.receiptLinks" :key="i">
              <!-- Solo http(s) se vuelve link; cualquier otro esquema se ve como texto.
                   Pestaña nueva sin acceso a esta ventana (noopener noreferrer). -->
              <a
                v-if="isHttpUrl(l.url)"
                :href="l.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-primary"
              >
                {{ l.label || l.url }}
              </a>
              <span v-else>{{ l.label || l.url }}</span>
            </li>
          </ul>

          <!-- Observaciones -->
          <template v-if="record.notes">
            <div class="text-subtitle1 text-weight-medium q-mt-lg">Observaciones</div>
            <div style="white-space: pre-wrap">{{ record.notes }}</div>
          </template>

          <!-- Pagos -->
          <div class="text-subtitle1 text-weight-medium q-mt-lg">Pagos</div>
          <div v-if="record.payments.length === 0" class="text-grey-7">
            Todavía no se registraron pagos.
          </div>
          <q-list v-else bordered separator class="rounded-borders">
            <q-item v-for="p in record.payments" :key="p.id" class="items-start">
              <q-item-section>
                <div :class="{ 'text-strike text-grey-6': isPaymentVoided(p) }">
                  <div class="text-weight-medium">
                    {{ formatPrice(p.amount, p.currency) }} · {{ formatDate(p.paidOn) }}
                  </div>
                  <div class="text-body2">
                    {{ p.cashRegisterName }} · {{ EXPENSE_PAYMENT_METHOD_LABELS[p.paymentMethod] }}
                  </div>
                  <div class="text-caption">
                    Cancela {{ formatPrice(p.appliedAmount, record.currency) }} del gasto
                    <template v-if="p.fxRate !== null">
                      · TC {{ formatFxRate(p.fxRate) }}
                    </template>
                    <template v-if="p.amountArs !== null && p.currency !== 'ARS'">
                      · ≈ {{ formatPrice(p.amountArs, 'ARS') }}
                    </template>
                  </div>
                  <div v-if="p.reference" class="text-caption">Referencia: {{ p.reference }}</div>
                  <div v-if="p.notes" class="text-caption" style="white-space: pre-wrap">
                    {{ p.notes }}
                  </div>
                </div>
                <div class="text-caption text-grey-7">
                  <template v-if="p.createdByName">Cargado por {{ p.createdByName }} · </template>
                  {{ formatDateTime(p.createdAt) }}
                </div>
                <!-- Anulado: tachado arriba y acá quién, cuándo y por qué -->
                <div v-if="isPaymentVoided(p)" class="text-caption text-negative">
                  Anulado
                  <template v-if="p.voidedByName">por {{ p.voidedByName }}</template>
                  <template v-if="p.voidedAt"> · {{ formatDateTime(p.voidedAt) }}</template>
                  <template v-if="p.voidReason"> · Motivo: {{ p.voidReason }}</template>
                </div>
              </q-item-section>
              <q-item-section v-if="canVoid && !isPaymentVoided(p) && !isVoided" side>
                <q-btn
                  flat
                  dense
                  no-caps
                  color="negative"
                  icon="undo"
                  label="Anular pago"
                  :loading="voidingPaymentId === p.id"
                  :disable="busy"
                  @click="askVoidPayment(p)"
                />
              </q-item-section>
            </q-item>
          </q-list>

          <!-- Historial -->
          <div class="text-subtitle1 text-weight-medium q-mt-lg">Historial</div>
          <div v-if="historyEntries.length === 0" class="text-grey-7">Sin movimientos.</div>
          <q-timeline v-else layout="dense" color="primary" class="q-pl-sm">
            <q-timeline-entry
              v-for="h in historyEntries"
              :key="h.id"
              :icon="h.icon"
              :color="h.color"
              :title="h.title"
              :subtitle="h.subtitle"
            >
              <div v-for="(line, i) in h.lines" :key="i">{{ line }}</div>
              <div v-if="h.reason" class="text-italic text-grey-8">Motivo: {{ h.reason }}</div>
            </q-timeline-entry>
          </q-timeline>
        </q-card-section>

        <q-separator />

        <!-- Acciones: solo con el gasto vigente -->
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat no-caps label="Cerrar" v-close-popup />
          <template v-if="!isVoided">
            <!-- Anular gasto: owner y admin. Con pagos vigentes se deshabilita y se explica. -->
            <span v-if="canVoid">
              <q-btn
                flat
                no-caps
                color="negative"
                icon="block"
                label="Anular gasto"
                :disable="hasActivePayments || busy"
                :loading="voidingRecord"
                @click="askVoidRecord"
              />
              <q-tooltip v-if="hasActivePayments">Primero anulá sus pagos</q-tooltip>
            </span>
            <q-btn
              flat
              no-caps
              color="primary"
              icon="edit"
              label="Editar"
              :disable="!options || busy"
              @click="showForm = true"
            />
            <q-btn
              v-if="canPay"
              unelevated
              no-caps
              color="primary"
              icon="payments"
              label="Registrar pago"
              :disable="!options || busy"
              @click="showPay = true"
            />
          </template>
        </q-card-actions>
        <div
          v-if="canVoid && !isVoided && hasActivePayments"
          class="text-caption text-grey-7 text-right q-px-md q-pb-sm"
        >
          Para anular el gasto, primero anulá sus pagos.
        </div>
      </template>
    </q-card>
  </q-dialog>

  <!-- Registrar pago y editar: abren encima del detalle y devuelven el gasto actualizado -->
  <RegistrarPagoDialog
    v-if="record && options"
    v-model="showPay"
    :country="country"
    :options="options"
    :record="record"
    @paid="onRecordUpdated"
  />
  <GastoFormDialog
    v-if="record && options"
    v-model="showForm"
    :country="country"
    :options="options"
    :record="record"
    @saved="onRecordUpdated"
  />
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { formatDate } from 'src/utils/format-date';
import { formatPrice } from 'src/utils/format-price';
import { useExpensesApi } from 'src/composables/useExpensesApi';
import {
  AMOUNT_STATUS_LABELS,
  EXPENSE_PAYMENT_METHOD_LABELS,
  EXPENSE_STATUS_META,
  formatFxRate,
  historyEntryLines,
  isHttpUrl,
  monthLabel,
} from 'src/utils/expenses';
import GastoFormDialog from 'src/components/egresos/GastoFormDialog.vue';
import RegistrarPagoDialog from 'src/components/egresos/RegistrarPagoDialog.vue';
import type {
  ExpenseCountry,
  ExpenseFormOptions,
  ExpensePaymentItem,
  ExpenseRecordDetail,
} from 'src/types/expense';

/**
 * Detalle de un gasto (DI-09, DI-10, DI-11): datos, importe, reparto, comprobantes,
 * pagos con sus anulaciones e historial de cambios, y las acciones del gasto.
 *
 * - `recordId`: gasto a mostrar; se carga cada vez que el diálogo se abre.
 * - `options`: opciones del formulario del país (las carga EgresosHub); sin ellas
 *   "Registrar pago" y "Editar" quedan deshabilitados.
 * - `canVoid`: owner y admin. Sin él no se ofrece anular nada (la API igual da 403).
 * - Emite `changed` tras cada acción exitosa (pago, edición, anulación) para que las
 *   listas se refresquen.
 */
const props = defineProps<{
  modelValue: boolean;
  recordId: number | null;
  country: ExpenseCountry;
  options: ExpenseFormOptions | null;
  canVoid: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'changed'): void;
}>();

const log = createLogger('GastoDetailDialog');
const $q = useQuasar();
const expensesApi = useExpensesApi();

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------

const record = ref<ExpenseRecordDetail | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
let loadSeq = 0;

async function load() {
  if (props.recordId === null) return;
  const seq = ++loadSeq;
  loading.value = true;
  loadError.value = null;
  try {
    const result = await expensesApi.getExpenseRecord(props.recordId, props.country);
    if (seq === loadSeq) record.value = result;
  } catch (err: unknown) {
    if (seq !== loadSeq) return;
    loadError.value = extractError(err, 'Error cargando el gasto');
    log.error('Error cargando el detalle del gasto', { error: loadError.value });
  } finally {
    if (seq === loadSeq) loading.value = false;
  }
}

// ---------------------------------------------------------------------------
// Estado derivado
// ---------------------------------------------------------------------------

const isVoided = computed(() => (record.value?.voidedAt ?? null) !== null);

function isPaymentVoided(p: ExpensePaymentItem): boolean {
  return p.voidedAt !== null;
}

const hasActivePayments = computed(
  () => record.value?.payments.some((p) => p.voidedAt === null) ?? false
);

// Registrar pago: hay saldo, o el importe es estimado (admite pagar de más).
const canPay = computed(
  () =>
    record.value !== null && (record.value.pending > 0 || record.value.amountStatus === 'estimado')
);

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

// ---------------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------------

interface HistoryView {
  id: number;
  title: string;
  subtitle: string;
  lines: string[];
  reason: string | null;
  icon: string;
  color: string;
}

// Paleta cálida de la marca: nada de azul.
const HISTORY_STYLE: Record<string, { icon: string; color: string }> = {
  expense_record_created: { icon: 'add', color: 'primary' },
  expense_record_update: { icon: 'edit', color: 'brown' },
  expense_payment_registered: { icon: 'payments', color: 'primary' },
  expense_payment_voided: { icon: 'undo', color: 'grey' },
  expense_record_voided: { icon: 'block', color: 'grey' },
};

const historyEntries = computed<HistoryView[]>(() => {
  const rec = record.value;
  if (!rec) return [];
  // Nombres de rubro para las correcciones: los de las opciones y el actual del gasto.
  const costCenterNames: Record<number, string> = {};
  for (const c of props.options?.costCenters ?? []) costCenterNames[c.id] = c.name;
  costCenterNames[rec.costCenterId] = rec.costCenterName;

  return rec.history.map((item) => {
    const { title, lines } = historyEntryLines(item, {
      currency: rec.currency,
      costCenterNames,
    });
    const style = HISTORY_STYLE[item.action] ?? { icon: 'history', color: 'grey' };
    return {
      id: item.id,
      title,
      subtitle: [formatDateTime(item.at), item.actorName].filter(Boolean).join(' · '),
      lines,
      reason: item.reason,
      icon: style.icon,
      color: style.color,
    };
  });
});

// ---------------------------------------------------------------------------
// Pago y edición (diálogos hijos)
// ---------------------------------------------------------------------------

const showPay = ref(false);
const showForm = ref(false);

// Cada apertura (o cambio de gasto) arranca de cero: nunca se ve el gasto anterior.
watch(
  () => [props.modelValue, props.recordId] as const,
  ([open, id]) => {
    if (!open || id === null) return;
    record.value = null;
    showPay.value = false;
    showForm.value = false;
    void load();
  },
  { immediate: true }
);

/** Tras pagar o editar: el detalle pasa a mostrar el gasto que devolvió la API y se avisa a las listas. */
function onRecordUpdated(updated: ExpenseRecordDetail) {
  record.value = updated;
  emit('changed');
}

// ---------------------------------------------------------------------------
// Anulaciones (owner y admin; motivo obligatorio y confirmación explícita)
// ---------------------------------------------------------------------------

const voidingPaymentId = ref<number | null>(null);
const voidingRecord = ref(false);
const busy = computed(() => voidingPaymentId.value !== null || voidingRecord.value);

function askVoidPayment(p: ExpensePaymentItem) {
  if (!props.canVoid) return;
  $q.dialog({
    title: 'Anular pago',
    message: `Vas a anular el pago de ${formatPrice(p.amount, p.currency)} del ${formatDate(p.paidOn)} desde ${p.cashRegisterName}. La plata vuelve a esa cuenta y el gasto recupera el saldo pendiente. Escribí el motivo (es obligatorio).`,
    prompt: {
      model: '',
      type: 'text',
      label: 'Motivo',
      outlined: true,
      maxlength: 500,
      isValid: (v: string) => v.trim().length > 0,
    },
    cancel: { label: 'Volver', flat: true },
    ok: { label: 'Anular pago', color: 'negative', unelevated: true },
    persistent: true,
  }).onOk((reason: string) => {
    void voidPayment(p, reason.trim());
  });
}

async function voidPayment(p: ExpensePaymentItem, reason: string) {
  const rec = record.value;
  if (!rec || reason === '') return;
  voidingPaymentId.value = p.id;
  try {
    record.value = await expensesApi.voidExpensePayment(rec.id, p.id, props.country, reason);
    $q.notify({ type: 'positive', message: 'Pago anulado' });
    emit('changed');
  } catch (err: unknown) {
    // El mensaje de la API se muestra tal cual.
    const message = extractError(err, 'Error anulando el pago');
    log.error('Error anulando el pago', {
      error: message,
      expenseRecordId: rec.id,
      paymentId: p.id,
    });
    $q.notify({ type: 'negative', message });
  } finally {
    voidingPaymentId.value = null;
  }
}

function askVoidRecord() {
  if (!props.canVoid || !record.value || hasActivePayments.value) return;
  $q.dialog({
    title: 'Anular gasto',
    message: `Vas a anular el gasto "${record.value.concept}". Deja de contar en el Resumen y en lo pendiente, y no se puede deshacer. Escribí el motivo (es obligatorio).`,
    prompt: {
      model: '',
      type: 'text',
      label: 'Motivo',
      outlined: true,
      maxlength: 500,
      isValid: (v: string) => v.trim().length > 0,
    },
    cancel: { label: 'Volver', flat: true },
    ok: { label: 'Anular gasto', color: 'negative', unelevated: true },
    persistent: true,
  }).onOk((reason: string) => {
    void voidRecord(reason.trim());
  });
}

async function voidRecord(reason: string) {
  const rec = record.value;
  if (!rec || reason === '') return;
  voidingRecord.value = true;
  try {
    record.value = await expensesApi.voidExpenseRecord(rec.id, props.country, reason);
    $q.notify({ type: 'positive', message: 'Gasto anulado' });
    emit('changed');
  } catch (err: unknown) {
    // Un 409 (pagos vigentes) llega con su mensaje: se muestra tal cual.
    const message = extractError(err, 'Error anulando el gasto');
    log.error('Error anulando el gasto', { error: message, expenseRecordId: rec.id });
    $q.notify({ type: 'negative', message });
  } finally {
    voidingRecord.value = false;
  }
}

onUnmounted(() => {
  expensesApi.cleanup();
});
</script>
