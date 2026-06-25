<template>
  <q-dialog v-model="show" @show="onShow" @hide="resetAll">
    <q-card style="width: 520px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Registrar movimiento o egreso</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-tabs v-model="tab" class="text-primary" align="left" narrow-indicator>
        <q-tab name="movimiento" label="Movimiento entre cajas" />
        <q-tab name="egreso" label="Egreso" />
      </q-tabs>
      <q-separator />

      <q-tab-panels v-model="tab" animated>
        <!-- ============================ MOVIMIENTO ============================ -->
        <q-tab-panel name="movimiento">
          <div v-if="loadingCajas" class="text-center q-pa-md text-grey-6">
            <q-spinner size="24px" /> Cargando cajas…
          </div>
          <div v-else class="q-gutter-sm">
            <q-select
              v-model="mov.origenCajaId"
              :options="cajaOptions"
              label="Caja origen *"
              dense
              outlined
              emit-value
              map-options
              @update:model-value="onOrigenChange"
            />
            <q-select
              v-model="mov.destinoCajaId"
              :options="destinoOptions"
              label="Caja destino *"
              dense
              outlined
              emit-value
              map-options
              :disable="mov.origenCajaId === null"
              :hint="
                mov.origenCajaId === null
                  ? 'Elegí primero la caja origen'
                  : `Solo cajas en ${origenCurrency}`
              "
            />
            <q-input
              v-model.number="mov.amount"
              type="number"
              label="Monto *"
              dense
              outlined
              min="1"
              :suffix="origenSymbol"
            />
            <q-input
              v-model.number="mov.countedAmount"
              type="number"
              label="Conteo físico de origen (opcional)"
              dense
              outlined
              min="0"
              :suffix="origenSymbol"
              hint="Si lo cargás, se concilia contra el saldo esperado y se asienta el ajuste por la diferencia."
            />
            <q-input
              v-model="mov.notes"
              type="textarea"
              label="Notas (opcional)"
              dense
              outlined
              autogrow
              maxlength="2000"
            />
          </div>
        </q-tab-panel>

        <!-- ============================== EGRESO ============================== -->
        <q-tab-panel name="egreso">
          <div v-if="loadingCajas" class="text-center q-pa-md text-grey-6">
            <q-spinner size="24px" /> Cargando cajas…
          </div>
          <div v-else class="q-gutter-sm">
            <q-select
              v-model="egreso.cajaId"
              :options="cajaOptions"
              label="Caja *"
              dense
              outlined
              emit-value
              map-options
            />
            <q-input
              v-model.number="egreso.amount"
              type="number"
              label="Monto *"
              dense
              outlined
              min="1"
              :suffix="egresoSymbol"
            />
            <q-input
              v-model="egreso.notes"
              type="textarea"
              label="Concepto / notas (opcional)"
              dense
              outlined
              autogrow
              maxlength="2000"
              placeholder="Ej.: insumos de limpieza, servicios, etc."
            />
          </div>
        </q-tab-panel>
      </q-tab-panels>

      <q-separator />
      <q-card-actions align="right">
        <q-btn flat label="Cancelar" color="grey" v-close-popup />
        <q-btn
          v-if="tab === 'movimiento'"
          unelevated
          color="primary"
          label="Registrar movimiento"
          :disable="!canSubmitMov || submitting"
          :loading="submitting"
          @click="submitMovimiento"
        />
        <q-btn
          v-else
          unelevated
          color="primary"
          label="Registrar egreso"
          :disable="!canSubmitEgreso || submitting"
          :loading="submitting"
          @click="submitEgreso"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import type { CajaSaldoRow } from 'src/types/transaction';

const props = defineProps<{
  modelValue: boolean;
  selectedCountry: 'AR' | 'ES';
  isOwner: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'registered'): void;
}>();

const log = createLogger('RegistrarMovEgresoDialog');
const $q = useQuasar();
const transactionsApi = useTransactionsApi();

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

// =========================================================================
// Cajas — loaded once per open from getCashRegisterBalances (all active
// registers, country-scoped for owners). Drives both selectores.
// =========================================================================

const cajas = ref<CajaSaldoRow[]>([]);
const loadingCajas = ref(false);

const cajaOptions = computed(() =>
  cajas.value.map((c) => ({ label: `${c.name} (${c.currency})`, value: c.cashRegisterId }))
);

function cajaById(id: number | null): CajaSaldoRow | undefined {
  if (id === null) return undefined;
  return cajas.value.find((c) => c.cashRegisterId === id);
}

async function loadCajas() {
  loadingCajas.value = true;
  try {
    const data = await transactionsApi.getCashRegisterBalances({
      country: props.isOwner ? props.selectedCountry : undefined,
    });
    cajas.value = data;
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando cajas');
    log.error('Error loading cash registers', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    loadingCajas.value = false;
  }
}

function onShow() {
  void loadCajas();
}

// =========================================================================
// Form state
// =========================================================================

const tab = ref<'movimiento' | 'egreso'>('movimiento');
const submitting = ref(false);

const mov = reactive({
  origenCajaId: null as number | null,
  destinoCajaId: null as number | null,
  amount: null as number | null,
  countedAmount: null as number | null,
  notes: '',
});

const egreso = reactive({
  cajaId: null as number | null,
  amount: null as number | null,
  notes: '',
});

// Movimiento D-02: destino must share origin's currency and not be the origin.
const origenCurrency = computed(() => cajaById(mov.origenCajaId)?.currency ?? '');
const origenSymbol = computed(() => currencySymbol(origenCurrency.value));
const egresoSymbol = computed(() => currencySymbol(cajaById(egreso.cajaId)?.currency ?? ''));

const destinoOptions = computed(() => {
  const cur = origenCurrency.value;
  return cajas.value
    .filter((c) => c.cashRegisterId !== mov.origenCajaId && c.currency === cur)
    .map((c) => ({ label: `${c.name} (${c.currency})`, value: c.cashRegisterId }));
});

function onOrigenChange() {
  // Clear destino if it no longer matches the new origin's currency.
  const destino = cajaById(mov.destinoCajaId);
  if (
    mov.destinoCajaId === mov.origenCajaId ||
    (destino && destino.currency !== origenCurrency.value)
  ) {
    mov.destinoCajaId = null;
  }
}

function currencySymbol(currency: string): string {
  if (currency === 'EUR') return '€';
  if (currency === 'ARS') return '$';
  return currency;
}

const canSubmitMov = computed(
  () =>
    mov.origenCajaId !== null &&
    mov.destinoCajaId !== null &&
    mov.origenCajaId !== mov.destinoCajaId &&
    typeof mov.amount === 'number' &&
    mov.amount > 0
);

const canSubmitEgreso = computed(
  () => egreso.cajaId !== null && typeof egreso.amount === 'number' && egreso.amount > 0
);

// =========================================================================
// Submit
// =========================================================================

async function submitMovimiento() {
  if (!canSubmitMov.value) return;
  submitting.value = true;
  try {
    const { movement } = await transactionsApi.registerMovement({
      origenCajaId: mov.origenCajaId as number,
      destinoCajaId: mov.destinoCajaId as number,
      amount: mov.amount as number,
      ...(typeof mov.countedAmount === 'number' ? { countedAmount: mov.countedAmount } : {}),
      ...(mov.notes.trim() ? { notes: mov.notes.trim() } : {}),
    });
    $q.notify({
      type: 'positive',
      message: movement.adjustmentTxId
        ? 'Movimiento registrado (con ajuste de reconciliación)'
        : 'Movimiento registrado',
    });
    show.value = false;
    emit('registered');
  } catch (err: unknown) {
    const message = extractError(err, 'Error registrando movimiento');
    log.error('Error registering movement', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    submitting.value = false;
  }
}

async function submitEgreso() {
  if (!canSubmitEgreso.value) return;
  submitting.value = true;
  try {
    await transactionsApi.registerExpense({
      cajaId: egreso.cajaId as number,
      amount: egreso.amount as number,
      ...(egreso.notes.trim() ? { notes: egreso.notes.trim() } : {}),
    });
    $q.notify({ type: 'positive', message: 'Egreso registrado' });
    show.value = false;
    emit('registered');
  } catch (err: unknown) {
    const message = extractError(err, 'Error registrando egreso');
    log.error('Error registering expense', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    submitting.value = false;
  }
}

function resetAll() {
  mov.origenCajaId = null;
  mov.destinoCajaId = null;
  mov.amount = null;
  mov.countedAmount = null;
  mov.notes = '';
  egreso.cajaId = null;
  egreso.amount = null;
  egreso.notes = '';
  tab.value = 'movimiento';
}

onUnmounted(() => {
  transactionsApi.cleanup();
});
</script>
