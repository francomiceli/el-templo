<template>
  <!-- D-18: bottom sheet — primer precedente en el repo (sin BottomSheet de Quasar,
       para poder aplicar el styling de marca de PlanExpiryDialog/BranchPickerDialog). -->
  <q-dialog :model-value="modelValue" position="bottom" @update:model-value="onUpdateModelValue">
    <q-card class="activity-info-sheet">
      <div class="activity-info-sheet__handle" />

      <q-card-section class="activity-info-sheet__body">
        <h3 class="activity-info-sheet__title">{{ title }}</h3>
        <!-- Interpolación de Vue (escapada por defecto): el copy lo escribe un admin
             y NUNCA debe poder inyectar markup — sin directivas de HTML crudo (T-180-59). -->
        <p v-if="description" class="activity-info-sheet__text">{{ description }}</p>
      </q-card-section>

      <q-card-section class="activity-info-sheet__footer">
        <q-icon name="groups" size="18px" class="activity-info-sheet__footer-icon" />
        <span>Todas las clases son aptas para todos los niveles.</span>
      </q-card-section>

      <q-card-actions class="activity-info-sheet__actions">
        <q-btn
          flat
          no-caps
          dense
          class="activity-info-sheet__secondary full-width"
          label="Cerrar"
          @click="onClose"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: boolean
  title: string
  description: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function onUpdateModelValue(value: boolean): void {
  emit('update:modelValue', value)
}

function onClose(): void {
  emit('update:modelValue', false)
}
</script>

<style lang="scss" scoped>
@import 'src/css/brand';

$terracotta: $brand-terracotta;
$cream: #f2ede5;
$charcoal: #2e2a26;

// Bottom sheet: mismos tokens de marca que PlanExpiryDialog/BranchPickerDialog
// (card charcoal #2e2a26, borde terracotta, secundario flat cream-55), pero
// anclado abajo y a lo ancho, con handle visual arriba — NO re-estilizar.
.activity-info-sheet {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  background: $charcoal;
  color: $cream;
  border-radius: 16px 16px 0 0;
  border-top: 2px solid rgba($terracotta, 0.6);
  padding: 8px 4px 16px;
}

.activity-info-sheet__handle {
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: rgba($cream, 0.25);
  margin: 8px auto 0;
}

.activity-info-sheet__body {
  padding-top: 16px;
}

.activity-info-sheet__title {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.125rem;
  letter-spacing: 0.04em;
  margin: 0 0 12px 0;
  color: $cream;
}

.activity-info-sheet__text {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: rgba($cream, 0.85);
  margin: 0;
  white-space: pre-line;
}

.activity-info-sheet__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px 0;
  font-family: 'Geologica', sans-serif;
  font-size: 0.8125rem;
  color: rgba($cream, 0.65);
}

.activity-info-sheet__footer-icon {
  color: $terracotta;
  flex-shrink: 0;
}

.activity-info-sheet__actions {
  display: flex;
  flex-direction: column;
  padding: 12px 20px 4px;
}

.activity-info-sheet__secondary {
  color: rgba($cream, 0.55) !important;
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.8125rem;
}
</style>
