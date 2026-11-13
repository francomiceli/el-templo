<template>
  <q-dialog v-model="show" @show="onShow" @hide="resetAll">
    <q-card style="width: 520px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Registrar movimiento</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-separator />

      <q-card-section>
        <!-- ============================ MOVIMIENTO ============================ -->
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

        <!-- Los gastos ya no se cargan desde Caja (fase 209, DI-15): acceso a Egresos.
             Solo para los roles que entran a Egresos (admin_sede no). -->
        <q-banner v-if="canGoToEgresos" dense rounded class="bg-amber-1 text-brown-9 q-mt-md">
          ¿Pagaste un gasto (alquiler, servicios, sueldos…)? Se carga en Egresos.
          <template #action>
            <q-btn
              flat
              no-caps
              color="brown-9"
              label="Cargar un gasto en Egresos"
              @click="goToNuevoGasto"
            />
          </template>
        </q-banner>
      </q-card-section>

      <q-separator />
      <q-card-actions align="right">
        <q-btn flat label="Cancelar" color="grey" v-close-popup />
        <q-btn
          unelevated
          color="primary"
          label="Registrar movimiento"
          :disable="!canSubmitMov || submitting"
          :loading="submitting"
          @click="submitMovimiento"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import { useRouter } from 'vue-router';
import { useAuthStore } from 'src/stores/useAuthStore';
import { EGRESOS_ROLES } from 'src/config/templo-config';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import { currencySymbol } from 'src/utils/currencies';
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
const router = useRouter();
const authStore = useAuthStore();

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

/** Etiqueta de caja: el Tesoro se distingue de la Caja central por el sufijo (fase 208). */
function cajaLabel(c: CajaSaldoRow): string {
  return `${c.name} (${c.currency})${c.isTreasury ? ' · Tesoro' : ''}`;
}

const cajaOptions = computed(() =>
  cajas.value.map((c) => ({ label: cajaLabel(c), value: c.cashRegisterId }))
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

const submitting = ref(false);

const mov = reactive({
  origenCajaId: null as number | null,
  destinoCajaId: null as number | null,
  amount: null as number | null,
  countedAmount: null as number | null,
  notes: '',
});

// Movimiento D-02: destino must share origin's currency and not be the origin.
const origenCurrency = computed(() => cajaById(mov.origenCajaId)?.currency ?? '');
const origenSymbol = computed(() => currencySymbol(origenCurrency.value));

const destinoOptions = computed(() => {
  const cur = origenCurrency.value;
  return cajas.value
    .filter((c) => c.cashRegisterId !== mov.origenCajaId && c.currency === cur)
    .map((c) => ({ label: cajaLabel(c), value: c.cashRegisterId }));
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

// =========================================================================
// Acceso a Egresos (fase 209, DI-15): la carga de gastos ya no es de este dialog.
// POST /expenses sigue en la API para los egresos viejos y los tests, y los egresos
// ya cargados se siguen viendo en Movimientos. Caja -> Egresos -> Nuevo gasto se abre
// con /caja?tab=egresos&sub=gastos&nuevo=1.
// =========================================================================

const canGoToEgresos = computed(() => {
  const role = authStore.user?.role;
  return role !== undefined && EGRESOS_ROLES.includes(role);
});

function goToNuevoGasto() {
  show.value = false;
  void router.push({ path: '/caja', query: { tab: 'egresos', sub: 'gastos', nuevo: '1' } });
}

const canSubmitMov = computed(
  () =>
    mov.origenCajaId !== null &&
    mov.destinoCajaId !== null &&
    mov.origenCajaId !== mov.destinoCajaId &&
    typeof mov.amount === 'number' &&
    mov.amount > 0
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

function resetAll() {
  mov.origenCajaId = null;
  mov.destinoCajaId = null;
  mov.amount = null;
  mov.countedAmount = null;
  mov.notes = '';
}

onUnmounted(() => {
  transactionsApi.cleanup();
});
</script>
