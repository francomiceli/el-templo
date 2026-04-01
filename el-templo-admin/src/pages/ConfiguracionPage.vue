<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Configuracion</div>

    <!-- Loading -->
    <div v-if="loading" class="flex flex-center q-pa-xl">
      <q-spinner-dots size="50px" color="primary" />
    </div>

    <template v-else>
      <!-- Segmentacion Config Card -->
      <q-card flat bordered class="q-mb-md" style="max-width: 600px">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold q-mb-md">Segmentacion</div>
          <div class="text-caption text-grey-7 q-mb-md">
            Umbrales para la clasificacion automatica de alumnos. Los porcentajes son relativos al
            presupuesto de clases del plan de cada alumno.
          </div>

          <q-form @submit.prevent="onSave" class="q-gutter-md">
            <q-input
              v-model.number="form.espartanoPct"
              label="Espartano (% minimo de asistencia)"
              type="number"
              :rules="[positiveInt]"
              dense
              outlined
              hint="Default: 80"
            />
            <q-input
              v-model.number="form.intermitentePct"
              label="Intermitente (% minimo de asistencia)"
              type="number"
              :rules="[positiveInt]"
              dense
              outlined
              hint="Default: 40"
            />
            <q-input
              v-model.number="form.enRiesgoWeeks"
              label="En Riesgo (semanas de inactividad)"
              type="number"
              :rules="[positiveInt]"
              dense
              outlined
              hint="Default: 2"
            />
            <q-input
              v-model.number="form.ghostWeeks"
              label="Ghost (semanas de inactividad)"
              type="number"
              :rules="[positiveInt]"
              dense
              outlined
              hint="Default: 8"
            />
            <q-input
              v-model.number="form.nuevoDays"
              label="Nuevo (dias desde registro)"
              type="number"
              :rules="[positiveInt]"
              dense
              outlined
              hint="Default: 30"
            />
            <q-input
              v-model.number="form.windowDays"
              label="Ventana de evaluacion (dias)"
              type="number"
              :rules="[positiveInt]"
              dense
              outlined
              hint="Default: 28"
            />

            <div class="q-mt-md">
              <q-btn
                type="submit"
                label="Guardar"
                color="primary"
                :loading="saving"
                :disable="!hasChanges"
              />
            </div>
          </q-form>
        </q-card-section>
      </q-card>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSettingsApi } from 'src/composables/useSettingsApi';
import type { SegmentThresholds } from 'src/types/member';

const log = createLogger('ConfiguracionPage');
const $q = useQuasar();
const settingsApi = useSettingsApi();

const loading = ref(true);
const saving = ref(false);
const originalValues = ref<SegmentThresholds | null>(null);

const form = reactive<SegmentThresholds>({
  espartanoPct: 80,
  intermitentePct: 40,
  enRiesgoWeeks: 2,
  ghostWeeks: 8,
  nuevoDays: 30,
  windowDays: 28,
});

const hasChanges = computed(() => {
  if (!originalValues.value) return false;
  const orig = originalValues.value;
  return (
    form.espartanoPct !== orig.espartanoPct ||
    form.intermitentePct !== orig.intermitentePct ||
    form.enRiesgoWeeks !== orig.enRiesgoWeeks ||
    form.ghostWeeks !== orig.ghostWeeks ||
    form.nuevoDays !== orig.nuevoDays ||
    form.windowDays !== orig.windowDays
  );
});

function positiveInt(val: number): boolean | string {
  return (Number.isInteger(val) && val > 0) || 'Debe ser un numero entero positivo';
}

async function loadThresholds() {
  loading.value = true;
  try {
    const data = await settingsApi.getSegmentThresholds();
    Object.assign(form, data);
    originalValues.value = { ...data };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading thresholds', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando configuracion' });
  } finally {
    loading.value = false;
  }
}

async function onSave() {
  saving.value = true;
  try {
    await settingsApi.updateSegmentThresholds({ ...form });
    originalValues.value = { ...form };
    $q.notify({ type: 'positive', message: 'Configuracion guardada' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error saving thresholds', { error: message });
    $q.notify({ type: 'negative', message: 'Error guardando configuracion' });
  } finally {
    saving.value = false;
  }
}

onMounted(loadThresholds);
</script>
