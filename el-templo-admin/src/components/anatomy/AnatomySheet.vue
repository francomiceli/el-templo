<template>
  <!-- Fase 200 D8: hoja desde abajo, no modal (seamless) para que el cuerpo de atrás siga tocable -->
  <q-dialog
    :model-value="modelValue"
    seamless
    position="bottom"
    no-refocus
    @update:model-value="onDialogUpdate"
  >
    <q-card
      class="anat-sheet"
      :class="{ 'anat-sheet--full': full }"
      role="dialog"
      aria-label="Detalle de la zona"
    >
      <button
        type="button"
        class="anat-sheet__handle"
        :aria-label="full ? 'Achicar la hoja' : 'Agrandar la hoja'"
        @pointerdown="onHandleDown"
        @pointerup="onHandleUp"
        @pointercancel="onHandleCancel"
        @click="onHandleClick"
      >
        <span class="anat-sheet__grip" aria-hidden="true" />
      </button>
      <button type="button" class="anat-sheet__x" aria-label="Cerrar" @click="cerrar">
        <span aria-hidden="true">✕</span>
      </button>
      <div class="anat-sheet__body">
        <slot />
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
/**
 * Fase 200 D8: hoja de abajo de Admin › Anatomía (sketch 019 ronda 2, B2). Media pantalla (52vh);
 * el handle se arrastra hacia arriba para agrandarla, hacia abajo para achicarla o cerrarla, y un
 * toque la alterna. Sin backdrop: se puede tocar otra zona del cuerpo detrás. Escape cierra.
 * Pointer events solo sobre el handle (nada global que limpiar).
 */
import { ref } from 'vue';

const props = defineProps<{
  modelValue: boolean;
  full: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'update:full': [value: boolean];
}>();

// Arrastre mínimo (px) para que el gesto cuente como arrastre y no como toque.
const UMBRAL_ARRASTRE = 30;

const y0 = ref<number | null>(null);
// Después de un gesto con puntero, el click que sigue ya fue resuelto en pointerup.
const gestoResuelto = ref(false);

function onDialogUpdate(value: boolean): void {
  emit('update:modelValue', value);
}

function cerrar(): void {
  emit('update:modelValue', false);
}

function onHandleDown(e: PointerEvent): void {
  y0.value = e.clientY;
  gestoResuelto.value = false;
  const el = e.currentTarget;
  if (el instanceof Element) el.setPointerCapture(e.pointerId);
}

function onHandleUp(e: PointerEvent): void {
  if (y0.value === null) return;
  const dy = e.clientY - y0.value;
  y0.value = null;
  gestoResuelto.value = true;
  if (dy < -UMBRAL_ARRASTRE) {
    emit('update:full', true);
  } else if (dy > UMBRAL_ARRASTRE) {
    // Entera → media; media → cerrar.
    if (props.full) emit('update:full', false);
    else cerrar();
  } else {
    emit('update:full', !props.full);
  }
}

function onHandleCancel(): void {
  y0.value = null;
}

// Teclado: Enter/Espacio disparan click con detail 0 (el puntero ya se resolvió en pointerup).
function onHandleClick(e: MouseEvent): void {
  if (gestoResuelto.value) {
    gestoResuelto.value = false;
    return;
  }
  if (e.detail === 0) emit('update:full', !props.full);
}
</script>

<style lang="scss" scoped>
@import 'src/css/anatomia';

.anat-sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  height: 52vh;
  border-radius: 18px 18px 0 0;
  background: #fff;
  color: $anat-ink;
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.14);
}

.anat-sheet--full {
  height: calc(100vh - 60px);
}

.anat-sheet__handle {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: grab;
  touch-action: none;
}

.anat-sheet__grip {
  display: block;
  width: 40px;
  height: 5px;
  border-radius: 3px;
  background: #d6cabb;
}

.anat-sheet__x {
  position: absolute;
  top: 0;
  right: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 14px;
  color: $anat-ink-2;
  cursor: pointer;
}

.anat-sheet__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 16px 24px;
}

@media (prefers-reduced-motion: no-preference) {
  .anat-sheet {
    transition: height 0.25s;
  }
}
</style>
