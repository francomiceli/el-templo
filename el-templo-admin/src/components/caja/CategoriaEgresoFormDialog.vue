<template>
  <q-dialog v-model="show" @show="onShow" @hide="resetAll">
    <q-card style="width: 420px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">
          {{ isEditMode ? 'Renombrar categoría' : 'Nueva categoría de egreso' }}
        </div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section>
        <q-input
          v-model="form.name"
          label="Nombre *"
          dense
          outlined
          maxlength="100"
          autofocus
          :rules="[(v) => !!(v && v.trim()) || 'El nombre es obligatorio']"
          @keyup.enter="submit"
        />
      </q-card-section>

      <q-separator />
      <q-card-actions align="right">
        <q-btn flat label="Cancelar" color="grey" v-close-popup />
        <q-btn
          unelevated
          color="primary"
          :label="isEditMode ? 'Guardar cambios' : 'Crear categoría'"
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
import type { CostCenter } from 'src/types/transaction';

const props = defineProps<{
  modelValue: boolean;
  /** País del selector de CajaPage — se usa en el alta (nombre único por país, D-08). */
  selectedCountry: 'AR' | 'ES';
  /** Presente = modo edición (renombrar); ausente/null = alta. */
  categoria?: CostCenter | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'saved'): void;
}>();

const log = createLogger('CategoriaEgresoFormDialog');
const $q = useQuasar();
const transactionsApi = useTransactionsApi();

const show = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
});

const isEditMode = computed(() => !!props.categoria);

const submitting = ref(false);

const form = reactive({
  name: '',
});

const canSubmit = computed(() => !!form.name.trim());

// =========================================================================
// Prefill (modo edición) desde props.categoria al abrir.
// =========================================================================

function onShow() {
  const cat = props.categoria;
  form.name = cat ? cat.name : '';
}

// =========================================================================
// Submit — ramifica alta (createCostCenter) vs edición (renameCostCenter).
// El 409 de unicidad por país (D-08) se surfacea vía extractError + notify.
// =========================================================================

async function submit() {
  if (!canSubmit.value || submitting.value) return;
  submitting.value = true;
  try {
    const cat = props.categoria;
    if (cat) {
      await transactionsApi.renameCostCenter(cat.id, { name: form.name.trim() });
      $q.notify({ type: 'positive', message: 'Categoría renombrada' });
    } else {
      await transactionsApi.createCostCenter({
        name: form.name.trim(),
        country: props.selectedCountry,
      });
      $q.notify({ type: 'positive', message: 'Categoría creada' });
    }
    show.value = false;
    emit('saved');
  } catch (err: unknown) {
    const message = extractError(err, 'Error guardando la categoría de egreso');
    log.error('Error saving cost center', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    submitting.value = false;
  }
}

function resetAll() {
  form.name = '';
}

onUnmounted(() => {
  transactionsApi.cleanup();
});
</script>
