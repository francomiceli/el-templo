<!--
  Esqueleto reutilizable de una card (fase 203, D-01): reserva el lugar FINAL de la card con un
  alto fijo (el mismo que la card resuelta), así al llegar el dato no salta el layout. Nunca
  muestra un default que se lea como respuesta: sin textos ni acciones, solo un bloque neutro
  (aria-busy + aria-label para lectores de pantalla).

  - `height`: px reservados, iguales a los de la card final.
  - `dark`: true sobre superficies oscuras (como la card de hoy).
  - `inline` + `width`: para usar dentro de un riel horizontal (flex: 0 0 auto con ancho fijo).
-->
<template>
  <div
    class="card-skeleton"
    :class="{ 'card-skeleton--inline': inline }"
    :style="rootStyle"
    role="status"
    aria-busy="true"
    :aria-label="label"
  >
    <q-skeleton :dark="dark" animation="none" class="card-skeleton__block" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    height: number
    dark?: boolean
    radius?: number
    label?: string
    inline?: boolean
    width?: number
  }>(),
  { dark: false, radius: 20, label: 'Cargando', inline: false, width: undefined },
)

const rootStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {
    height: `${props.height}px`,
    '--card-skeleton-radius': `${props.radius}px`,
  }
  if (props.inline && props.width !== undefined) style.width = `${props.width}px`
  return style
})
</script>

<style lang="scss" scoped>
.card-skeleton {
  width: 100%;
  border-radius: var(--card-skeleton-radius);
  overflow: hidden;

  &--inline {
    flex: 0 0 auto;
  }

  &__block {
    width: 100%;
    height: 100%;
    border-radius: var(--card-skeleton-radius);
  }
}
</style>
