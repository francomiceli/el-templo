<template>
  <div class="cq-fig">
    <BodyFigure
      :gender="gender"
      :lit="primaryZones"
      :lit2="secondaryZones"
      tone="sage"
      :height="height"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BodyFigure from 'src/components/anatomy/BodyFigure.vue'
import { isZoneSlug } from 'src/components/anatomy/zones'

// Fase 201 D-13, D-22: la figura compartida de la 197 con el tema dorado de Conquer. Solo se
// encienden las zonas que manda el API (sin números ni rojo). `BodyFigure` mide con `getBBox`:
// quien use este componente lo monta con `v-if` cuando el contenedor ya es visible (nunca dentro
// de `v-show`/`display:none`). No se edita `BodyFigure.vue`: el color se pisa con `:deep()`.
const props = withDefaults(
  defineProps<{
    primary: readonly string[]
    secondary: readonly string[]
    gender: string | null
    height?: number
  }>(),
  { height: 220 },
)

// El API puede mandar zonas que la figura no dibuja (p. ej. de la fase 200): se descartan.
const primaryZones = computed(() => props.primary.filter(isZoneSlug))
const secondaryZones = computed(() => props.secondary.filter(isZoneSlug))
</script>

<style scoped lang="scss">
.cq-fig {
  display: flex;
  justify-content: center;
  width: 100%;

  :deep(.body-figure--sage .mu--lit path) {
    fill: var(--cq-gold-hi);
    stroke: var(--cq-gold);
  }

  :deep(.body-figure--sage .mu--lit2 path) {
    fill: var(--cq-gold);
    stroke: var(--cq-gold);
  }

  :deep(.body-figure__caption) {
    color: var(--cq-muted);
  }
}
</style>
