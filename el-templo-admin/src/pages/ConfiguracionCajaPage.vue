<template>
  <q-page class="q-pa-md">
    <!-- Header (text-h5, mirrors CajaPage) -->
    <div class="row items-center q-mb-md">
      <div class="text-h5">Configuración de Caja</div>
    </div>

    <!-- Single-field config form (142-UI-SPEC) — width-capped so the lone
         input doesn't stretch across a wide admin viewport. -->
    <q-card flat bordered style="max-width: 480px">
      <q-card-section>
        <q-form @submit.prevent="onSave">
          <q-input
            v-model.number="thresholdDays"
            type="number"
            min="1"
            label="Umbral de pendientes (días)"
            outlined
            dense
            :loading="loading"
            :disable="loading"
            :rules="rules"
            hint="Días sin validar tras los que un pendiente dispara la alerta de la bandeja de Caja."
          />

          <div class="q-mt-md">
            <q-btn
              type="submit"
              label="Guardar"
              color="primary"
              :loading="saving"
              :disable="loading"
            />
          </div>
        </q-form>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import { useFinanceConfigApi } from 'src/composables/useFinanceConfigApi';
import { createLogger } from 'src/utils/logger';

const log = createLogger('ConfiguracionCajaPage');
const $q = useQuasar();
const { loading, saving, getThreshold, setThreshold, cleanup } = useFinanceConfigApi();

// `null` until the current value loads on mount; `v-model.number` keeps it numeric.
const thresholdDays = ref<number | null>(null);

// Validation (locked, 142-UI-SPEC): required + integer + min 1. No upper bound
// in the UI (the backend clamps to 1..365); invalid input blocks submit so no
// request is sent.
const rules = [
  (val: number | null) =>
    (val !== null && val !== undefined && (val as unknown as string) !== '') || 'Ingresá un valor.',
  (val: number | null) =>
    (typeof val === 'number' && Number.isInteger(val) && val >= 1) ||
    'Debe ser un número entero mayor o igual a 1.',
];

async function onSave() {
  if (thresholdDays.value === null) return;
  try {
    await setThreshold(thresholdDays.value);
    $q.notify({ type: 'positive', message: 'Configuración guardada' });
  } catch (err) {
    log.error('Failed to save Caja config', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'No se pudo guardar. Reintentá.' });
  }
}

onMounted(async () => {
  try {
    thresholdDays.value = await getThreshold();
  } catch (err) {
    log.error('Failed to load Caja config', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'No se pudo cargar la configuración.' });
  }
});

onUnmounted(() => {
  cleanup();
});
</script>
