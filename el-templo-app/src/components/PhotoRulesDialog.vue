<template>
  <!-- Fase 214 (plan 21, D-50): normas antes de subir la foto. Se muestra en CADA subida y solo
       "Acepto, elegir foto" (`accept`) abre la cámara, la galería o el selector de archivos. Cerrar
       de cualquier otra forma (Cancelar, Esc, tocar afuera) emite `cancel`. Textos del UI-SPEC
       (Borrador 1). -->
  <q-dialog
    :model-value="modelValue"
    :transition-duration="dialogDuration"
    aria-labelledby="photo-rules-title"
    @update:model-value="onUpdateModelValue"
  >
    <PremiumDialogCard tone="light">
      <h3 id="photo-rules-title" class="pd-title">Antes de subir tu foto</h3>
      <ul class="photo-rules__list">
        <li>Que sea una foto tuya, donde se te vea la cara.</li>
        <li>Sin desnudos ni contenido sexual.</li>
        <li>Sin insultos, símbolos ofensivos ni nada que discrimine.</li>
        <li>Sin publicidad ni datos de contacto.</li>
        <li>
          El equipo de El Templo revisa cada foto antes de mostrarla y puede quitarla en cualquier
          momento.
        </li>
      </ul>
      <p class="pd-text">Tu foto la ven los alumnos con plan vigente en las listas de la clase.</p>
      <div class="pd-acts">
        <q-btn unelevated no-caps class="pd-cta" label="Acepto, elegir foto" @click="onAccept" />
        <q-btn flat no-caps dense class="pd-skip" label="Cancelar" @click="onCancel" />
      </div>
    </PremiumDialogCard>
  </q-dialog>
</template>

<script setup lang="ts">
import PremiumDialogCard from 'src/components/PremiumDialogCard.vue'
import { prefersReducedMotion } from 'src/utils/reduced-motion'

defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  accept: []
  cancel: []
}>()

// Movimiento reducido: el diálogo aparece sin transición.
const dialogDuration = prefersReducedMotion() ? 0 : 300

function onAccept(): void {
  // `accept` va primero y sin esperas: el padre abre el selector de archivos dentro de este mismo
  // gesto del usuario (si no, el navegador lo bloquea).
  emit('accept')
  emit('update:modelValue', false)
}

function onCancel(): void {
  emit('cancel')
  emit('update:modelValue', false)
}

// Esc o tocar afuera: es cancelar.
function onUpdateModelValue(value: boolean): void {
  if (!value) emit('cancel')
  emit('update:modelValue', value)
}
</script>

<style scoped lang="scss">
.photo-rules__list {
  margin: 10px 0 0;
  padding-left: 20px;
  font-size: 15px;
  line-height: 1.5;
  color: var(--pd-fg, #2c2318);

  li + li {
    margin-top: 4px;
  }
}
</style>
