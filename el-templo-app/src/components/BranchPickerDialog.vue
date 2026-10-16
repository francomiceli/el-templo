<template>
  <!-- D-07/D-08: salteable → el q-dialog NO usa el modo bloqueante. Sketch 012 A: card clara,
       filas blancas con borde #e5dbcd y "Cómo llegar" en terracota; "Ahora no" como link. -->
  <q-dialog :model-value="modelValue" @update:model-value="onUpdateModelValue">
    <PremiumDialogCard tone="light">
      <h3 class="pd-title">¿En qué sede querés entrenar?</h3>

      <div class="pd-rows">
        <div
          v-for="branch in branches"
          :key="branch.id"
          class="pd-row"
          role="button"
          tabindex="0"
          @click="onSelect(branch.id)"
          @keydown.enter.self="onSelect(branch.id)"
        >
          <div class="branch-picker-dialog__row-info">
            <p class="pd-row-name">{{ branch.name }}</p>
            <p class="pd-row-sub">{{ branch.address ?? 'Dirección no disponible' }}</p>
          </div>
          <q-btn
            v-if="branch.mapsUrl"
            flat
            dense
            no-caps
            class="pd-row-go"
            label="Cómo llegar"
            @click.stop="onOpenMaps(branch.mapsUrl)"
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

<style lang="scss" scoped>
// El texto de la fila puede encogerse para que "Cómo llegar" no se corte en 360px.
.branch-picker-dialog__row-info {
  min-width: 0;
}
</style>
