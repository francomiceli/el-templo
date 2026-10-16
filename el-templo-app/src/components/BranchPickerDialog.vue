<template>
  <!-- D-07/D-08: salteable → el q-dialog NO usa el modo bloqueante. Sketch 012 A: card clara,
       filas blancas con borde claro y "Cómo llegar" en terracota; "Ahora no" como link. -->
  <q-dialog :model-value="modelValue" @update:model-value="onUpdateModelValue">
    <PremiumDialogCard tone="light">
      <h3 class="pd-title">¿En qué sede querés entrenar?</h3>

      <div class="pd-rows">
        <div v-for="branch in branches" :key="branch.id" class="pd-row">
          <button type="button" class="pd-row-main" @click="onSelect(branch.id)">
            <span class="pd-row-name">{{ branch.name }}</span>
            <span class="pd-row-sub">{{ branch.address ?? 'Dirección no disponible' }}</span>
          </button>
          <q-btn
            v-if="branch.mapsUrl"
            flat
            dense
            no-caps
            class="pd-row-go"
            label="Cómo llegar"
            @click="onOpenMaps(branch.mapsUrl)"
          />
        </div>
      </div>

      <div class="pd-acts">
        <q-btn flat no-caps dense class="pd-skip" label="Ahora no" @click="onSkip" />
      </div>
    </PremiumDialogCard>
  </q-dialog>
</template>

<script setup lang="ts">
import { createLogger } from 'src/utils/logger'
import PremiumDialogCard from 'src/components/PremiumDialogCard.vue'
import type { BranchOption } from 'src/composables/useSchedulingApi'

const log = createLogger('BranchPickerDialog')

defineProps<{
  modelValue: boolean
  branches: BranchOption[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  select: [id: number]
}>()

function onUpdateModelValue(value: boolean): void {
  emit('update:modelValue', value)
}

function onSelect(id: number): void {
  emit('select', id)
  emit('update:modelValue', false)
}

function onSkip(): void {
  emit('update:modelValue', false)
}

function onOpenMaps(mapsUrl: string): void {
  log.info('Cómo llegar → abre Maps', { mapsUrl })
  window.open(mapsUrl, '_blank', 'noopener')
}
</script>
