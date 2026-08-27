<template>
  <!-- D-07/D-08: salteable → el q-dialog NO usa el modo bloqueante. -->
  <q-dialog :model-value="modelValue" @update:model-value="onUpdateModelValue">
    <q-card class="branch-picker-dialog">
      <q-card-section class="branch-picker-dialog__body">
        <q-icon name="location_on" class="branch-picker-dialog__icon" size="40px" />

        <h3 class="branch-picker-dialog__title">¿En qué sede querés entrenar?</h3>

        <div class="branch-picker-dialog__list">
          <div
            v-for="branch in branches"
            :key="branch.id"
            class="branch-picker-dialog__row"
            @click="onSelect(branch.id)"
          >
            <div class="branch-picker-dialog__row-info">
              <p class="branch-picker-dialog__row-name">{{ branch.name }}</p>
              <p class="branch-picker-dialog__row-address">
                {{ branch.address ?? 'Dirección no disponible' }}
              </p>
            </div>
            <q-btn
              v-if="branch.mapsUrl"
              flat
              dense
              no-caps
              size="sm"
              class="branch-picker-dialog__maps-btn"
              label="Cómo llegar"
              @click.stop="onOpenMaps(branch.mapsUrl)"
            />
          </div>
        </div>
      </q-card-section>

      <q-card-actions class="branch-picker-dialog__actions">
        <q-btn
          flat
          no-caps
          dense
          class="branch-picker-dialog__secondary"
          label="Ahora no"
          @click="onSkip"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { createLogger } from 'src/utils/logger'
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
@import 'src/css/brand';

$terracotta: $brand-terracotta;
$cream: #f2ede5;
$charcoal: #2e2a26;

// Estilos copiados de PlanExpiryDialog.vue (mismo mandato de reuse de UI-SPEC):
// card charcoal #2e2a26, gradiente terracotta, secundario flat cream-55,
// max-width 340px, border-radius 16px. NO re-estilizar.
.branch-picker-dialog {
  width: 100%;
  max-width: 340px;
  background: $charcoal;
  color: $cream;
  border-radius: 16px;
  border-top: 2px solid rgba($terracotta, 0.6);
  padding: 8px 4px 16px;
}

.branch-picker-dialog__body {
  text-align: center;
  padding-top: 16px;
}

.branch-picker-dialog__icon {
  color: $terracotta;
  margin-bottom: 8px;
}

.branch-picker-dialog__title {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.125rem;
  letter-spacing: 0.04em;
  margin: 0 0 16px 0;
  color: $cream;
}

.branch-picker-dialog__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.branch-picker-dialog__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  text-align: left;
  background: rgba($cream, 0.06);
  border: 1px solid rgba($cream, 0.12);
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;

  &:hover {
    background: rgba($cream, 0.1);
  }
}

.branch-picker-dialog__row-info {
  min-width: 0;
}

.branch-picker-dialog__row-name {
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 0.9375rem;
  margin: 0;
  color: $cream;
}

.branch-picker-dialog__row-address {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.8125rem;
  margin: 2px 0 0 0;
  color: rgba($cream, 0.7);
}

.branch-picker-dialog__maps-btn {
  color: $terracotta !important;
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 0.75rem;
  flex-shrink: 0;
}

.branch-picker-dialog__actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 20px 4px;
}

.branch-picker-dialog__secondary {
  color: rgba($cream, 0.55) !important;
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.8125rem;
  margin-top: 4px;
}
</style>
