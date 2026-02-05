<template>
  <div class="row q-gutter-md q-mb-md">
    <q-select
      v-model="localFilter.status"
      :options="statusOptions"
      label="Estado"
      emit-value
      map-options
      clearable
      dense
      outlined
      style="min-width: 150px"
      @update:model-value="emitFilter"
    />
    <q-select
      v-model="localFilter.levelGroup"
      :options="levelGroupOptions"
      label="Nivel"
      emit-value
      map-options
      clearable
      dense
      outlined
      style="min-width: 150px"
      @update:model-value="emitFilter"
    />
    <q-input
      v-model.number="localFilter.week"
      label="Semana"
      type="number"
      min="1"
      max="52"
      dense
      outlined
      style="width: 100px"
      @update:model-value="emitFilter"
    />
    <q-btn
      icon="refresh"
      flat
      round
      @click="$emit('refresh')"
    >
      <q-tooltip>Actualizar</q-tooltip>
    </q-btn>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { SessionFilter, SessionStatus, LevelGroup } from 'src/types/session';

const props = defineProps<{
  modelValue: SessionFilter;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: SessionFilter): void;
  (e: 'refresh'): void;
}>();

const localFilter = reactive<SessionFilter>({ ...props.modelValue });

watch(() => props.modelValue, (newVal) => {
  Object.assign(localFilter, newVal);
}, { deep: true });

function emitFilter() {
  emit('update:modelValue', { ...localFilter });
}

const statusOptions = [
  { label: 'Pendiente', value: 'pending_review' as SessionStatus },
  { label: 'Aprobada', value: 'approved' as SessionStatus },
  { label: 'Descartada', value: 'discarded' as SessionStatus },
];

const levelGroupOptions = [
  { label: 'Alfa/Delta', value: 'alfa_delta' as LevelGroup },
  { label: 'Sigma', value: 'sigma' as LevelGroup },
  { label: 'Omega', value: 'omega' as LevelGroup },
];
</script>
