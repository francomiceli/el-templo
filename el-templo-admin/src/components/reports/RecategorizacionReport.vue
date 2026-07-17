<!--
  Banner de recategorización multisucursal (Reportes).
  Muestra cuándo corre el próximo cron y cuántos alumnos se reasignarían si el
  cálculo se hiciera HOY (simulado, read-only). El detalle de quiénes se
  reasignan queda para más adelante — acá solo el aviso.
-->
<template>
  <div class="recategorizacion-report">
    <q-banner v-if="loading" class="bg-grey-2 rounded-borders">
      <template #avatar>
        <q-spinner color="primary" size="24px" />
      </template>
      Calculando la simulación…
    </q-banner>

    <q-banner v-else-if="errorMsg" class="bg-red-1 text-negative rounded-borders">
      <template #avatar>
        <q-icon name="error_outline" color="negative" />
      </template>
      {{ errorMsg }}
      <template #action>
        <q-btn flat color="negative" label="Reintentar" @click="load" />
      </template>
    </q-banner>

    <q-banner
      v-else-if="preview"
      class="rounded-borders"
      :class="preview.wouldReassign > 0 ? 'bg-orange-1' : 'bg-green-1'"
    >
      <template #avatar>
        <q-icon
          :name="preview.wouldReassign > 0 ? 'sync_alt' : 'check_circle'"
          :color="preview.wouldReassign > 0 ? 'orange-9' : 'positive'"
          size="28px"
        />
      </template>

      <div class="text-body1">
        <template v-if="preview.wouldReassign > 0">
          En <strong>{{ preview.daysUntil }}</strong>
          {{ preview.daysUntil === 1 ? 'día' : 'días' }} (el
          <strong>{{ nextRunLabel }}</strong>) se recategorizarían
          <strong>{{ preview.wouldReassign }}</strong>
          {{ preview.wouldReassign === 1 ? 'alumno' : 'alumnos' }} a la sede
          donde más entrenan.
        </template>
        <template v-else>
          No hay alumnos para recategorizar hoy. El próximo chequeo corre el
          <strong>{{ nextRunLabel }}</strong>.
        </template>
      </div>
      <div class="text-caption text-grey-8 q-mt-xs">
        Simulado como si el cambio fuese hoy sobre {{ preview.candidates }}
        {{ preview.candidates === 1 ? 'alumno multisucursal' : 'alumnos multisucursal' }}.
        Se recalcula al abrir.
      </div>

      <template #action>
        <q-btn flat dense icon="refresh" label="Recalcular" @click="load" />
      </template>
    </q-banner>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useReportsApi } from 'src/composables/useReportsApi';
import type { MultibranchReassignmentPreview } from 'src/composables/useReportsApi';
import { createLogger } from 'src/utils/logger';

const log = createLogger('RecategorizacionReport');
const { getMultibranchReassignmentPreview } = useReportsApi();

const preview = ref<MultibranchReassignmentPreview | null>(null);
const loading = ref(false);
const errorMsg = ref<string | null>(null);

const nextRunLabel = computed(() => {
  if (!preview.value) return '';
  const d = new Date(preview.value.nextRunAt);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
});

async function load(): Promise<void> {
  loading.value = true;
  errorMsg.value = null;
  try {
    preview.value = await getMultibranchReassignmentPreview();
  } catch (err: unknown) {
    errorMsg.value = 'No pudimos calcular la recategorización. Reintentá en un momento.';
    log.error('Failed to load reassignment preview', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
