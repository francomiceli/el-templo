<template>
  <q-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    persistent
  >
    <q-card style="min-width: 500px; max-width: 700px">
      <q-card-section class="row items-center">
        <div class="text-h6">Intercambiar Bloque</div>
        <q-space />
        <q-btn icon="close" flat round dense v-close-popup />
      </q-card-section>

      <q-card-section class="q-pt-none">
        <div class="text-caption text-grey q-mb-md">
          Reemplazar bloque {{ block.role }} ({{ block.route }}) con uno del pool de sesiones
          aprobadas
        </div>

        <div v-if="poolLoading" class="flex flex-center q-pa-lg">
          <q-spinner-dots size="40px" color="primary" />
        </div>

        <div v-else-if="pool.length === 0" class="text-center q-pa-lg text-grey">
          <q-icon name="info" size="md" class="q-mb-sm" /><br />
          No hay bloques disponibles para esta ruta y nivel
        </div>

        <q-list
          v-else
          separator
          bordered
          class="rounded-borders"
          style="max-height: 400px; overflow-y: auto"
        >
          <q-item
            v-for="poolBlock in pool"
            :key="poolBlock.id"
            clickable
            @click="handleSwap(poolBlock.id)"
          >
            <q-item-section>
              <q-item-label>
                <q-badge :color="poolBlock.formatName ? 'primary' : 'grey'" class="q-mr-sm">
                  {{ poolBlock.formatName }}
                </q-badge>
                {{ poolBlock.exerciseCount }} ejercicios
              </q-item-label>
              <q-item-label caption>
                <span class="q-mr-md">
                  <q-icon name="speed" size="xs" /> {{ poolBlock.intensity }}%
                </span>
                <span class="q-mr-md">
                  <q-icon name="replay" size="xs" /> {{ poolBlock.repsBudget }} reps
                </span>
                <span class="text-italic">
                  {{ formatWeekLabel(poolBlock.sourceWeek) }} - {{ dayLabel(poolBlock.sourceDay) }}
                </span>
              </q-item-label>
              <q-item-label caption class="q-mt-xs">
                <span v-for="(ex, i) in poolBlock.exercises.slice(0, 4)" :key="ex.id">
                  {{ ex.exerciseName
                  }}<span v-if="i < Math.min(poolBlock.exercises.length, 4) - 1">, </span>
                </span>
                <span v-if="poolBlock.exercises.length > 4">
                  ... +{{ poolBlock.exercises.length - 4 }}
                </span>
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-btn flat dense icon="swap_horiz" color="positive">
                <q-tooltip>Usar este bloque</q-tooltip>
              </q-btn>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useSessionsApi } from 'src/composables/useSessionsApi';
import { formatWeekLabel } from 'src/utils/weekDates';
import type { SessionBlock, PoolBlock } from 'src/types/session';

const props = defineProps<{
  modelValue: boolean;
  sessionId: number;
  block: SessionBlock;
  memberLevel: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'swapped'): void;
}>();

const $q = useQuasar();
const sessionsApi = useSessionsApi();

const pool = ref<PoolBlock[]>([]);
const poolLoading = ref(false);

function dayLabel(d: string): string {
  const labels: Record<string, string> = {
    lunes: 'Lunes',
    martes: 'Martes',
    miercoles: 'Miércoles',
    jueves: 'Jueves',
    viernes: 'Viernes',
    sabado: 'Sábado',
  };
  return labels[d] || d;
}

watch(
  () => props.modelValue,
  async (isOpen) => {
    if (isOpen) {
      pool.value = [];
      poolLoading.value = true;
      try {
        const result = await sessionsApi.fetchBlockPool(
          props.block.route,
          props.memberLevel,
          props.sessionId,
          props.block.id
        );
        pool.value = result.blocks;
      } catch {
        $q.notify({ type: 'negative', message: 'Error cargando pool de bloques' });
      } finally {
        poolLoading.value = false;
      }
    }
  },
  { immediate: true }
);

async function handleSwap(sourceBlockId: number) {
  $q.dialog({
    title: 'Confirmar Intercambio',
    message: 'Se reemplazara el contenido del bloque actual con el bloque seleccionado. Continuar?',
    cancel: true,
  }).onOk(async () => {
    try {
      await sessionsApi.swapBlock(props.sessionId, props.block.id, sourceBlockId);
      $q.notify({ type: 'positive', message: 'Bloque intercambiado' });
      emit('update:modelValue', false);
      emit('swapped');
    } catch {
      $q.notify({ type: 'negative', message: 'Error intercambiando bloque' });
    }
  });
}
</script>
