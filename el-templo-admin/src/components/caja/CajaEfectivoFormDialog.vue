<template>
  <q-dialog v-model="show" @show="onShow" @hide="resetAll">
    <q-card style="width: 480px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Abrir caja de efectivo</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section class="q-gutter-sm">
        <div class="text-caption text-grey-7">
          Cada sucursal tiene una sola caja de efectivo por moneda. Es la caja a la que van todos
          los cobros en efectivo de esa sede.
        </div>

        <q-select
          v-model="form.branchId"
          :options="branchOptions"
          label="Sucursal *"
          dense
          outlined
          emit-value
          map-options
          :loading="loadingBranches"
        />

        <q-select
          v-model="form.currency"
          :options="currencyOptions"
          label="Moneda *"
          dense
          outlined
          emit-value
          map-options
          hint="No se puede cambiar después de abrir la caja"
        />

        <q-input
          v-model.number="form.openingBalance"
          type="number"
          inputmode="numeric"
          label="Saldo inicial"
          dense
          outlined
          :rules="[(v) => v == null || v >= 0 || 'El saldo inicial no puede ser negativo']"
          hint="Arqueo del efectivo que ya hay en la caja hoy. Dejalo en 0 si arranca vacía."
        />
      </q-card-section>

      <q-separator />
      <q-card-actions align="right">
        <q-btn flat label="Cancelar" color="grey" v-close-popup />
        <q-btn
          unelevated
          color="primary"
          label="Abrir caja"
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
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import type { BranchOption } from 'src/types/member';

const props = defineProps<{
  modelValue: boolean;
  /** País del hub: acota las sucursales ofrecidas y la moneda por defecto. */
  selectedCountry: 'AR' | 'ES';
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'saved'): void;
}>();

const log = createLogger('CajaEfectivoFormDialog');
const $q = useQuasar();
const transactionsApi = useTransactionsApi();
const membersApi = useMembersApi();

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const currencyOptions: Array<{ label: string; value: 'ARS' | 'EUR' }> = [
  { label: 'Pesos (ARS)', value: 'ARS' },
  { label: 'Euros (EUR)', value: 'EUR' },
];

const submitting = ref(false);
const loadingBranches = ref(false);
const branchOptions = ref<Array<{ label: string; value: number }>>([]);

const form = reactive({
  branchId: null as number | null,
  currency: 'ARS' as 'ARS' | 'EUR',
  openingBalance: 0,
});

const canSubmit = computed(
  () => form.branchId !== null && !!form.currency && form.openingBalance >= 0
);

// La moneda por defecto sigue al país del hub — es la combinación correcta en
// el 99% de los casos y se puede cambiar a mano si hace falta.
function defaultCurrencyForCountry(): 'ARS' | 'EUR' {
  return props.selectedCountry === 'ES' ? 'EUR' : 'ARS';
}

async function onShow() {
  form.currency = defaultCurrencyForCountry();
  loadingBranches.value = true;
  try {
    const branches = await membersApi.getBranches();
    // Las sedes virtuales (Templo Online) no tienen caja física, y se acota al
    // país del hub para no ofrecer una sede de otro país con la moneda cambiada.
    branchOptions.value = branches
      .filter(
        (b: BranchOption) =>
          b.isVirtual !== true && (b.country === undefined || b.country === props.selectedCountry)
      )
      .map((b: BranchOption) => ({ label: b.name, value: b.id }));
  } catch (err: unknown) {
    log.error('Error cargando sucursales', {
      error: err instanceof Error ? err.message : String(err),
    });
    branchOptions.value = [];
  } finally {
    loadingBranches.value = false;
  }
}

function resetAll() {
  form.branchId = null;
  form.currency = defaultCurrencyForCountry();
  form.openingBalance = 0;
  submitting.value = false;
}

async function submit() {
  if (form.branchId === null) return;
  submitting.value = true;
  try {
    await transactionsApi.createEfectivoCaja({
      branchId: form.branchId,
      currency: form.currency,
      openingBalance: form.openingBalance,
    });
    $q.notify({ type: 'positive', message: 'Caja abierta' });
    emit('saved');
    show.value = false;
  } catch (err: unknown) {
    // El 409 (la sucursal ya tiene caja en esa moneda) trae un mensaje claro del
    // backend: se muestra tal cual en vez de un genérico.
    $q.notify({ type: 'negative', message: extractError(err, 'Error abriendo la caja') });
    log.warn('No se pudo abrir la caja', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    submitting.value = false;
  }
}
</script>
