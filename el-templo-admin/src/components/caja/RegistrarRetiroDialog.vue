<template>
  <q-dialog v-model="show" @show="onShow" @hide="resetAll">
    <q-card style="width: 820px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Registrar retiro</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <div v-if="loadingCajas" class="text-center q-pa-md text-grey-6">
          <q-spinner size="24px" /> Cargando cajas…
        </div>
        <div v-else class="q-gutter-sm">
          <q-select
            v-model="selectedCajaId"
            :options="cajaOptions"
            label="Caja *"
            dense
            outlined
            emit-value
            map-options
            :disable="lockCaja"
            @update:model-value="onCajaChange"
          />

          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-4">
              <q-input
                v-model="transactionDate"
                type="date"
                label="Fecha del retiro *"
                dense
                outlined
                :max="today"
                hint="Puede ser pasada, para cargar retiros ya hechos (sin conteo)."
              />
            </div>
            <div class="col-12 col-sm-8">
              <!-- Texto libre con sugerencias (staff + responsables ya usados):
                   quien retira no siempre es un usuario del admin. -->
              <q-select
                v-model="responsibleName"
                :options="responsibleOptions"
                label="Responsable (quién se lleva la plata) *"
                dense
                outlined
                use-input
                fill-input
                hide-selected
                input-debounce="0"
                new-value-mode="add-unique"
                :loading="loadingResponsibles"
                @filter="filterResponsibles"
                @input-value="onResponsibleInput"
              >
                <template #no-option>
                  <q-item>
                    <q-item-section class="text-grey">
                      Escribí el nombre y presioná Enter
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>
            </div>
          </div>

          <!-- ======================= EFECTIVO: masa de plata ======================= -->
          <template v-if="selectedCaja && selectedCaja.type === 'efectivo'">
            <div v-if="loadingPending" class="text-center q-pa-md text-grey-6">
              <q-spinner size="24px" /> Calculando lo que hay en la caja…
            </div>
            <q-card v-else-if="pending" flat bordered class="q-pa-sm">
              <CajaResumenRetiro
                :summary="pending.summary"
                :awaiting-validation="pending.awaitingValidation"
                :currency="selectedCaja.currency"
              />
            </q-card>

            <div v-if="pending" class="row q-col-gutter-sm">
              <div v-if="isToday" class="col-12 col-sm-6">
                <q-input
                  v-model.number="countedAmount"
                  type="number"
                  label="¿Cuánto contaste en la caja?"
                  dense
                  outlined
                  clearable
                  min="0"
                  :prefix="currencySymbol(selectedCaja.currency)"
                  :hint="`Todo lo del cajón, fondo de cambio incluido. Esperado: ${formatPrice(pending.summary.expectedInDrawer, selectedCaja.currency)}`"
                />
              </div>
              <div class="col-12" :class="isToday ? 'col-sm-6' : ''">
                <q-input
                  :model-value="amount"
                  type="number"
                  label="¿Cuánto te llevás? *"
                  dense
                  outlined
                  min="1"
                  :prefix="currencySymbol(selectedCaja.currency)"
                  :error="amountError !== null"
                  :error-message="amountError ?? undefined"
                  :hint="`Disponible: ${formatPrice(available, selectedCaja.currency)}`"
                  @update:model-value="onAmountInput"
                />
              </div>
            </div>

            <q-banner
              v-if="difference !== null && difference !== 0"
              dense
              rounded
              :class="difference < 0 ? 'bg-red-1 text-negative' : 'bg-orange-1 text-grey-9'"
            >
              <template #avatar>
                <q-icon :name="difference < 0 ? 'error_outline' : 'info'" />
              </template>
              <strong>
                {{ difference < 0 ? 'Faltante' : 'Sobrante' }} de
                {{ formatPrice(Math.abs(difference), selectedCaja.currency) }}
              </strong>
              contra lo esperado. Se asienta como ajuste de caja junto con el retiro: explicá la
              diferencia en las notas.
            </q-banner>
            <div v-if="pending && amountError === null && amountValue !== null" class="text-caption text-grey-8">
              Después del retiro quedan
              <strong>{{ formatPrice(available - amountValue, selectedCaja.currency) }}</strong>
              en la caja<span v-if="pending.summary.changeFund > 0">
                más el fondo de cambio</span
              >.
            </div>
          </template>

          <!-- ======================= BANCO: monto explícito ======================= -->
          <template v-else-if="selectedCaja">
            <q-input
              :model-value="amount"
              type="number"
              label="Monto *"
              dense
              outlined
              min="1"
              :suffix="currencySymbol(selectedCaja.currency)"
              @update:model-value="onAmountInput"
            />
          </template>

          <q-input
            v-model="notes"
            type="textarea"
            :label="notesRequired ? 'Notas * (explicá la diferencia)' : 'Notas (opcional)'"
            :error="notesRequired && notes.trim().length === 0"
            dense
            outlined
            autogrow
            maxlength="2000"
          />
        </div>
      </q-card-section>

      <q-separator />
      <q-card-actions align="right">
        <q-btn flat label="Cancelar" color="grey" v-close-popup />
        <q-btn
          unelevated
          color="primary"
          :label="submitLabel"
          :disable="!canSubmit || submitting"
          :loading="submitting"
          @click="submit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { formatPrice } from 'src/utils/format-price';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import CajaResumenRetiro from 'src/components/caja/CajaResumenRetiro.vue';
import type {
  CajaSaldoRow,
  PendingWithdrawalResult,
  WithdrawalDetail,
} from 'src/types/transaction';

// =========================================================================
// Registrar retiro (feedback caja/cobros 2026-09-07, rediseño 2026-09-23).
// En efectivo el retiro es una masa de plata, no una lista de cobros: se
// muestra la cuenta del cajón (quedó al último retiro + ingresos − salidas =
// disponible), quien retira puede cargar cuánto contó (si no coincide con lo
// esperado, la diferencia se asienta como ajuste y pide nota) y cuánto se
// lleva, con tope en el disponible. Los cobros se vinculan solos en la API.
// Para cuentas banco, monto explícito. La API (POST /withdrawals) es la
// autoridad de todas las reglas; acá solo se anticipan para no mandar algo
// que va a rebotar.
// =========================================================================

const props = defineProps<{
  modelValue: boolean;
  selectedCountry: 'AR' | 'ES';
  isOwner: boolean;
  /** Caja preseleccionada (fila de Cuentas / selector de la pestaña Retiros). */
  cajaId?: number;
  /** Si viene, el selector de caja queda fijo. */
  lockCaja?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'registered', withdrawal: WithdrawalDetail): void;
}>();

const log = createLogger('RegistrarRetiroDialog');
const $q = useQuasar();
const transactionsApi = useTransactionsApi();

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const today = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- cajas
const cajas = ref<CajaSaldoRow[]>([]);
const loadingCajas = ref(false);
const selectedCajaId = ref<number | null>(null);

const cajaOptions = computed(() =>
  [...cajas.value]
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'efectivo' ? -1 : 1))
    .map((c) => ({
      label: `${c.name} · ${c.type === 'efectivo' ? 'Efectivo' : 'Banco'} (${c.currency})`,
      value: c.cashRegisterId,
    }))
);

const selectedCaja = computed(
  () => cajas.value.find((c) => c.cashRegisterId === selectedCajaId.value) ?? null
);

async function loadCajas() {
  loadingCajas.value = true;
  try {
    cajas.value = await transactionsApi.getCashRegisterBalances({
      country: props.isOwner ? props.selectedCountry : undefined,
    });
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando cajas');
    log.error('Error loading cash registers', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    loadingCajas.value = false;
  }
}

// ---------------------------------------------------------------- form
const transactionDate = ref(today);
const responsibleName = ref<string | null>(null);
const notes = ref('');
const amount = ref<number | null>(null);
/** Si el usuario escribió el monto, no se lo pisamos con la sugerencia. */
const amountTouched = ref(false);
const countedAmount = ref<number | null>(null);
const submitting = ref(false);

/** El conteo es de la plata de AHORA: solo en un retiro con fecha de hoy. */
const isToday = computed(() => transactionDate.value === today);

/** q-input number entrega '' al borrar: todo lo que no sea entero ≥ 0 es "vacío". */
function toInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;
}

// ---------------------------------------------------------------- responsables
const allResponsibles = ref<string[]>([]);
const responsibleOptions = ref<string[]>([]);
const loadingResponsibles = ref(false);

async function loadResponsibles() {
  loadingResponsibles.value = true;
  try {
    allResponsibles.value = await transactionsApi.getWithdrawalResponsibles();
    responsibleOptions.value = allResponsibles.value;
  } catch (err: unknown) {
    // Sugerencias nada más: sin ellas el campo sigue siendo texto libre.
    log.warn('Error loading withdrawal responsibles', { error: extractError(err, '') });
  } finally {
    loadingResponsibles.value = false;
  }
}

function filterResponsibles(val: string, update: (fn: () => void) => void) {
  update(() => {
    const needle = val.toLowerCase();
    responsibleOptions.value = needle
      ? allResponsibles.value.filter((n) => n.toLowerCase().includes(needle))
      : allResponsibles.value;
  });
}

// Lo tipeado cuenta aunque el usuario no presione Enter (fill-input).
function onResponsibleInput(val: string) {
  if (val.trim()) responsibleName.value = val;
}

// ---------------------------------------------------------------- resumen (efectivo)
const pending = ref<PendingWithdrawalResult | null>(null);
const loadingPending = ref(false);

async function loadPending() {
  if (!selectedCaja.value || selectedCaja.value.type !== 'efectivo') {
    pending.value = null;
    return;
  }
  loadingPending.value = true;
  try {
    // Sin dateTo: la cuenta del cajón es siempre a hoy, también para cargar
    // un retiro con fecha pasada (la API vincula solo lo cobrado hasta esa fecha).
    pending.value = await transactionsApi.getPendingWithdrawals(selectedCaja.value.cashRegisterId);
    suggestAmount();
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando lo que hay en la caja');
    log.error('Error loading withdrawal summary', { error: message });
    $q.notify({ type: 'negative', message });
    pending.value = null;
  } finally {
    loadingPending.value = false;
  }
}

const counted = computed(() => (isToday.value ? toInt(countedAmount.value) : null));

/** Contado − esperado (fondo + firme + sin validar). null sin conteo. */
const difference = computed(() =>
  pending.value && counted.value !== null
    ? counted.value - pending.value.summary.expectedInDrawer
    : null
);

/** Tope del retiro: el saldo firme, corregido por la diferencia del conteo. */
const available = computed(() =>
  pending.value ? pending.value.summary.firmeBalance + (difference.value ?? 0) : 0
);

const notesRequired = computed(() => difference.value !== null && difference.value !== 0);

const amountValue = computed(() => {
  const v = toInt(amount.value);
  return v !== null && v > 0 ? v : null;
});

const amountError = computed(() => {
  if (!selectedCaja.value || selectedCaja.value.type !== 'efectivo' || !pending.value) return null;
  if (amount.value === null) return null;
  if (amountValue.value === null) return 'Ingresá un monto mayor a 0';
  if (amountValue.value > available.value) {
    return `Supera lo disponible (${formatPrice(available.value, selectedCaja.value.currency)})`;
  }
  return null;
});

/** Sugerencia: llevarse todo lo disponible, mientras el usuario no escriba otro monto. */
function suggestAmount() {
  if (amountTouched.value) return;
  amount.value = available.value > 0 ? available.value : null;
}

function onAmountInput(v: string | number | null) {
  amountTouched.value = true;
  amount.value = typeof v === 'number' ? v : v === null || v === '' ? null : Number(v);
}

watch([countedAmount, isToday], () => suggestAmount());

function onCajaChange() {
  amount.value = null;
  amountTouched.value = false;
  countedAmount.value = null;
  void loadPending();
}

// ---------------------------------------------------------------- submit
const canSubmit = computed(() => {
  if (!selectedCaja.value) return false;
  if (!responsibleName.value || responsibleName.value.trim().length === 0) return false;
  if (!transactionDate.value || transactionDate.value > today) return false;
  if (amountValue.value === null) return false;
  if (selectedCaja.value.type === 'efectivo') {
    if (!pending.value || amountError.value !== null) return false;
    if (notesRequired.value && notes.value.trim().length === 0) return false;
  }
  return true;
});

const submitLabel = computed(() =>
  selectedCaja.value && amountValue.value !== null
    ? `Registrar retiro · ${formatPrice(amountValue.value, selectedCaja.value.currency)}`
    : 'Registrar retiro'
);

async function submit() {
  if (!canSubmit.value || !selectedCaja.value || amountValue.value === null) return;
  submitting.value = true;
  try {
    const isEfectivo = selectedCaja.value.type === 'efectivo';
    const { withdrawal } = await transactionsApi.registerWithdrawal({
      cajaId: selectedCaja.value.cashRegisterId,
      responsibleName: (responsibleName.value ?? '').trim(),
      transactionDate: transactionDate.value,
      amount: amountValue.value,
      ...(notes.value.trim() ? { notes: notes.value.trim() } : {}),
      ...(isEfectivo && counted.value !== null ? { countedAmount: counted.value } : {}),
    });
    $q.notify({
      type: 'positive',
      message: `Retiro registrado: ${formatPrice(withdrawal.amount, withdrawal.currency)} · ${withdrawal.responsibleName}`,
    });
    show.value = false;
    emit('registered', withdrawal);
  } catch (err: unknown) {
    const message = extractError(err, 'Error registrando el retiro');
    log.error('Error registering withdrawal', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    submitting.value = false;
  }
}

// ---------------------------------------------------------------- lifecycle
async function onShow() {
  await Promise.all([loadCajas(), loadResponsibles()]);
  if (props.cajaId !== undefined) {
    const caja = cajas.value.find((c) => c.cashRegisterId === props.cajaId);
    if (caja) {
      selectedCajaId.value = caja.cashRegisterId;
    } else {
      $q.notify({
        type: 'warning',
        message: 'La caja indicada no está disponible en tu vista; elegí una caja.',
      });
    }
  }
  await loadPending();
}

function resetAll() {
  selectedCajaId.value = null;
  transactionDate.value = today;
  responsibleName.value = null;
  notes.value = '';
  amount.value = null;
  amountTouched.value = false;
  countedAmount.value = null;
  pending.value = null;
}

function currencySymbol(currency: string): string {
  if (currency === 'EUR') return '€';
  if (currency === 'ARS') return '$';
  return currency;
}

onUnmounted(() => {
  transactionsApi.cleanup();
});
</script>
