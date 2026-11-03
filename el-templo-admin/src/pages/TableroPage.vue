<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-col-gutter-md q-mb-md">
      <div class="col">
        <h1 class="text-h5 q-my-none">Tablero semanal</h1>
        <div class="text-caption tablero-page__caption">
          <template v-if="board">
            Semana del {{ ddmm(board.weekStart) }} al {{ ddmm(board.weekEnd) }}
          </template>
          <template v-else>Lo que se mira el lunes para decidir</template>
        </div>
      </div>
      <div class="col-auto">
        <TableroWeekSelector :model-value="weekStart" @update:model-value="onWeekChange" />
      </div>
    </div>

    <q-banner v-if="api.error.value && !api.loading.value" rounded class="tablero-banner q-mb-md">
      <template #avatar>
        <q-icon name="error_outline" color="negative" />
      </template>
      {{ api.error.value }}
      <template #action>
        <q-btn flat color="primary" label="Reintentar" @click="load" />
      </template>
    </q-banner>

    <q-banner
      v-if="board && board.warnings.length > 0"
      rounded
      class="tablero-banner tablero-banner--warning q-mb-md"
    >
      <template #avatar>
        <q-icon name="warning_amber" color="warning" />
      </template>
      Hay montos en otra moneda que no se suman:
      <ul class="q-my-xs q-pl-md">
        <li v-for="(w, i) in board.warnings" :key="i">
          {{ branchName(w.branchId) }}: {{ WARNING_METRIC_LABELS[w.metric] }}
          {{ formatPrice(w.amount, w.currency) }} ({{ w.currency }})
        </li>
      </ul>
    </q-banner>

    <div class="tablero-page__body">
      <q-inner-loading :showing="api.loading.value" />

      <template v-if="board">
        <TableroMatrix
          v-for="group in board.groups"
          :key="group.country"
          :group="group"
          :metrics="board.metrics"
          :blocks="board.blocks"
          :week-start="board.weekStart"
          :leads-editable="board.leadsEditable"
          :saving="api.saving.value"
          @save-leads="onSaveLeads"
        />
        <div
          v-if="board.groups.length === 0"
          class="text-center q-pa-xl tablero-page__caption"
          data-test="tablero-empty"
        >
          No hay sedes para mostrar
        </div>
      </template>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type { WeeklyBoardResponse } from 'src/types/weekly-board';
import { useWeeklyBoardApi } from 'src/composables/useWeeklyBoardApi';
import { createLogger } from 'src/utils/logger';
import { formatPrice } from 'src/utils/format-price';
import { ddmm, weekOptions } from 'src/utils/weekly-board-format';
import TableroMatrix from 'src/components/tablero/TableroMatrix.vue';
import TableroWeekSelector from 'src/components/tablero/TableroWeekSelector.vue';

const log = createLogger('TableroPage');
const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const api = useWeeklyBoardApi();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WARNING_METRIC_LABELS: Record<WeeklyBoardResponse['warnings'][number]['metric'], string> = {
  cobrado: 'cobrado',
  deuda: 'deuda',
};

/** Lunes de la semana en curso (el domingo sigue en la semana que termina, no salta a la próxima). */
const currentWeek = weekOptions(1)[0]!.value;

// La semana vive en la URL (?semana=YYYY-MM-DD): sin el parámetro, la semana en curso.
const weekStart = computed(() => {
  const raw = route.query.semana;
  return typeof raw === 'string' && ISO_DATE.test(raw) ? raw : currentWeek;
});

const board = ref<WeeklyBoardResponse | null>(null);
const pagePath = route.path;

async function load() {
  log.debug('Cargando tablero', { weekStart: weekStart.value });
  try {
    board.value = await api.getBoard(weekStart.value);
  } catch (err: unknown) {
    if (api.isCanceled(err)) return;
    // El mensaje ya quedó en api.error (banner con "Reintentar"); no se muestra una semana ajena.
    board.value = null;
  }
}

// Un solo origen de verdad: cambia la URL (selector, atrás/adelante) -> se recarga.
watch(
  weekStart,
  () => {
    // Al salir de la página la ruta cambia antes del desmontaje: no pedir nada.
    if (route.path !== pagePath) return;
    void load();
  },
  { immediate: true }
);

function onWeekChange(next: string) {
  void router.replace({
    query: { ...route.query, semana: next === currentWeek ? undefined : next },
  });
}

async function onSaveLeads(payload: { branchId: number; leads: number | null }) {
  const week = weekStart.value;
  try {
    await api.saveLeads({ branchId: payload.branchId, weekStart: week, leads: payload.leads });
    $q.notify({ type: 'positive', message: 'Leads guardados' });
  } catch (err: unknown) {
    if (api.isCanceled(err)) return;
    $q.notify({ type: 'negative', message: api.error.value ?? 'No se pudieron guardar los leads' });
    return;
  }
  await load();
}

/** Nombre de la sede para los avisos; las que no son columna (ej. Online) salen por id. */
function branchName(branchId: number): string {
  for (const group of board.value?.groups ?? []) {
    const found = group.branches.find((b) => b.id === branchId);
    if (found) return found.name;
  }
  return `Sede ${branchId}`;
}

onUnmounted(() => api.cleanup());
</script>

<style scoped>
.tablero-page__caption {
  color: #6b6459;
}
.tablero-page__body {
  position: relative;
  min-height: 160px;
}
.tablero-banner {
  background: #f2ede5;
  color: #3d3732;
  border: 1px solid #d9cfc1;
}
.tablero-banner--warning {
  background: #f7edc9;
  border-color: #7d6520;
}
</style>
