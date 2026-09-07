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
                hint="Puede ser pasada, para cargar retiros ya hechos."
                @update:model-value="onDateChange"
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

          <!-- ======================= EFECTIVO: cobros a retirar ======================= -->
          <template v-if="selectedCaja && selectedCaja.type === 'efectivo'">
            <q-banner dense rounded class="bg-blue-1 text-grey-9">
              <template #avatar>
                <q-icon name="info" color="primary" />
              </template>
              Tildá los cobros en efectivo que te llevás. El monto del retiro es la suma de
              los tildados. Lo que quede sin tildar sigue "en caja".
            </q-banner>

            <q-table
              :rows="pending"
              :columns="pendingColumns"
              row-key="id"
              flat
              bordered
              dense
              selection="multiple"
              v-model:selected="selected"
              :loading="loadingPending"
              :pagination="{ rowsPerPage: 0 }"
              hide-bottom
              style="max-height: 340px"
              virtual-scroll
            >
              <template #body-cell-monto="cellProps">
                <q-td :props="cellProps" class="text-weight-medium">
                  {{ formatPrice(cellProps.row.amount, cellProps.row.currency) }}
                </q-td>
              </template>
              <template #no-data>
                <div class="full-width text-center text-grey-6 q-pa-md">
                  No hay cobros en efectivo pendientes de retiro hasta la fecha elegida.
                </div>
              </template>
            </q-table>

            <div class="row items-center justify-between q-mt-sm">
              <div class="text-caption text-grey-7">
                {{ selected.length }} de {{ pending.length }} cobros tildados
                <span v-if="pending.length > 0">
                  ·
                  <a href="#" class="text-primary" @click.prevent="selectAll">todos</a> /
                  <a href="#" class="text-primary" @click.prevent="selected = []">ninguno</a>
                </span>
              </div>
              <div class="text-subtitle1 text-weight-bold">
                Retiro: {{ formatPrice(selectedTotal, selectedCaja.currency) }}
              </div>
            </div>
          </template>

          <!-- ======================= BANCO: monto explícito ======================= -->
          <template v-else-if="selectedCaja">
            <q-input
              v-model.number="amount"
              type="number"
              label="Monto *"
              dense
              outlined
              min="1"
              :suffix="currencySymbol(selectedCaja.currency)"
              hint="En una cuenta banco el retiro no se vincula a cobros."
            />
          </template>

          <q-input
            v-model="notes"
            type="textarea"
            label="Notas (opcional)"
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
import { ref, computed, onUnmounted } from 'vue';
import { useQuasar, type QTableColumn } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { formatPrice } from 'src/utils/format-price';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import type {
  CajaSaldoRow,
  WithdrawalDetail,
  WithdrawalPaymentItem,
} from 'src/types/transaction';

// =========================================================================
// Registrar retiro (feedback caja/cobros 2026-09-07). Replica el Excel
// "Control de caja efectivo" de Martín: por caja, la lista de cobros en
// efectivo que todavía están en el cajón, tildar los que se retiran, el monto
// es la suma, y un responsable obligatorio. Para cuentas banco, monto
// explícito. La API (POST /withdrawals) es la autoridad de todas las reglas.
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
const submitting = ref(false);

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

// ---------------------------------------------------------------- pending (efectivo)
const pending = ref<WithdrawalPaymentItem[]>([]);
const selected = ref<WithdrawalPaymentItem[]>([]);
const loadingPending = ref(false);

const pendingColumns: QTableColumn<WithdrawalPaymentItem>[] = [
  { name: 'fecha', label: 'Fecha', field: 'transactionDate', align: 'left', sortable: true },
  { name: 'socio', label: 'Socio', field: 'memberName', align: 'left' },
  { name: 'dni', label: 'DNI', field: (r) => r.memberDni ?? '—', align: 'left' },
  { name: 'concepto', label: 'Concepto', field: (r) => r.concept ?? '—', align: 'left' },
  { name: 'monto', label: 'Monto', field: 'amount', align: 'right' },
];

async function loadPending() {
  if (!selectedCaja.value || selectedCaja.value.type !== 'efectivo') {
    pending.value = [];
    selected.value = [];
    return;
  }
  loadingPending.value = true;
  try {
    const res = await transactionsApi.getPendingWithdrawals(
      selectedCaja.value.cashRegisterId,
      transactionDate.value || undefined
    );
    pending.value = res.rows;
    // Default: todo tildado (el caso común es "me llevo todo lo que hay").
    selected.value = [...res.rows];
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando cobros pendientes de retiro');
    log.error('Error loading pending withdrawals', { error: message });
    $q.notify({ type: 'negative', message });
    pending.value = [];
    selected.value = [];
  } finally {
    loadingPending.value = false;
  }
}

const selectedTotal = computed(() => selected.value.reduce((acc, r) => acc + r.amount, 0));

function selectAll() {
  selected.value = [...pending.value];
}

function onCajaChange() {
  amount.value = null;
  void loadPending();
}

function onDateChange() {
  void loadPending();
}

// ---------------------------------------------------------------- submit
const canSubmit = computed(() => {
  if (!selectedCaja.value) return false;
  if (!responsibleName.value || responsibleName.value.trim().length === 0) return false;
  if (!transactionDate.value || transactionDate.value > today) return false;
  if (selectedCaja.value.type === 'efectivo') return selected.value.length > 0;
  return typeof amount.value === 'number' && amount.value > 0;
});

const submitLabel = computed(() => {
  if (!selectedCaja.value) return 'Registrar retiro';
  const total = selectedCaja.value.type === 'efectivo' ? selectedTotal.value : (amount.value ?? 0);
  return total > 0
    ? `Registrar retiro · ${formatPrice(total, selectedCaja.value.currency)}`
    : 'Registrar retiro';
});

async function submit() {
  if (!canSubmit.value || !selectedCaja.value) return;
  submitting.value = true;
  try {
    const isEfectivo = selectedCaja.value.type === 'efectivo';
    const { withdrawal } = await transactionsApi.registerWithdrawal({
      cajaId: selectedCaja.value.cashRegisterId,
      responsibleName: (responsibleName.value ?? '').trim(),
      transactionDate: transactionDate.value,
      ...(notes.value.trim() ? { notes: notes.value.trim() } : {}),
      ...(isEfectivo
        ? { transactionIds: selected.value.map((r) => r.id) }
        : { amount: amount.value as number }),
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
  pending.value = [];
  selected.value = [];
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
