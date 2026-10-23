<template>
  <!-- Fase 200 D19: hoja desde abajo NO modal (seamless): sin backdrop, el cuerpo de atrás y sus chips
       siguen tocables. Un q-dialog modal se comería el toque (Pitfall 7). -->
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
      :style="sheetStyle"
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
        <q-icon name="close" size="18px" aria-hidden="true" />
      </button>
      <div ref="cuerpo" class="anat-sheet__body">
        <slot />
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
/**
 * Fase 200 D14, D19: hoja de abajo de Tus músculos y de Entrenar (sketch 020 `app.css` .bs): alto 54%,
 * radio 20, handle que se arrastra hacia arriba para agrandarla, hacia abajo para achicarla o
 * cerrarla (un toque la alterna) y × de 32 px con área tocable de 44. Sin backdrop. `bottomOffset`
 * sube la hoja por encima de la tab bar (Entrenar pasa su alto). Pointer events solo sobre el handle
 * (nada global que limpiar).
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useBackButtonClose } from 'src/composables/useBackButtonClose'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    full: boolean
    /** Px que la hoja deja libres abajo (alto de la tab bar). */
    bottomOffset?: number
    /** Cuando cambia (otra zona u otro músculo), el contenido vuelve arriba. */
    resetKey?: string | null
  }>(),
  { bottomOffset: 0, resetKey: null },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:full': [value: boolean]
}>()

const cuerpo = ref<HTMLElement | null>(null)

watch(
  () => props.resetKey,
  () => {
    if (cuerpo.value) cuerpo.value.scrollTop = 0
  },
)

const sheetStyle = computed<Record<string, string>>(() => ({
  marginBottom: `${props.bottomOffset}px`,
  '--anat-offset': `${props.bottomOffset}px`,
}))

// Arrastre mínimo (px) para que el gesto cuente como arrastre y no como toque.
const DRAG_THRESHOLD = 30

const y0 = ref<number | null>(null)
// Después de un gesto con puntero, el click que sigue ya fue resuelto en pointerup.
const gestureResolved = ref(false)

function onDialogUpdate(value: boolean): void {
  emit('update:modelValue', value)
}

function cerrar(): void {
  emit('update:modelValue', false)
}

// Android: el QDialog no engancha el botón atrás en Capacitor (fase 199, L40). El listener vive
// solo mientras la hoja está abierta, así atrás la cierra en vez de salir de la pantalla.
const backClose = useBackButtonClose(cerrar)

watch(
  () => props.modelValue,
  (abierta) => {
    if (abierta) void backClose.attach()
    else backClose.cleanup()
  },
  { immediate: true },
)

onUnmounted(() => {
  backClose.cleanup()
})

function onHandleDown(e: PointerEvent): void {
  y0.value = e.clientY
  gestureResolved.value = false
  const el = e.currentTarget
  if (el instanceof Element) el.setPointerCapture(e.pointerId)
}

function onHandleUp(e: PointerEvent): void {
  if (y0.value === null) return
  const dy = e.clientY - y0.value
  y0.value = null
  gestureResolved.value = true
  if (dy < -DRAG_THRESHOLD) {
    emit('update:full', true)
  } else if (dy > DRAG_THRESHOLD) {
    // Entera → media; media → cerrar.
    if (props.full) emit('update:full', false)
    else cerrar()
  } else {
    emit('update:full', !props.full)
  }
}

function onHandleCancel(): void {
  y0.value = null
}

// Teclado: Enter/Espacio disparan click con detail 0 (el puntero ya se resolvió en pointerup).
function onHandleClick(e: MouseEvent): void {
  if (gestureResolved.value) {
    gestureResolved.value = false
    return
  }
  if (e.detail === 0) emit('update:full', !props.full)
}
</script>

<style lang="scss" scoped>
@import 'src/css/brand';
@import 'src/css/premium-card';

.anat-sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  height: 54vh;
  border-radius: 20px 20px 0 0;
  background: #fff;
  color: $pd-ink;
  box-shadow: 0 -10px 28px rgba(0, 0, 0, 0.14);
}

.anat-sheet--full {
  height: calc(100vh - 50px - var(--anat-offset, 0px));
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
  @include pd-hit-44;
  position: absolute;
  top: 10px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: #f3ede4;
  color: $pd-ink;
  cursor: pointer;
}

.anat-sheet__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 2px 18px 24px;
}

@media (prefers-reduced-motion: no-preference) {
  .anat-sheet {
    transition: height 0.25s;
  }
}
</style>
