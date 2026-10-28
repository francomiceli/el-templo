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

// Fase 201 D-13, DA-33: la figura compartida de la 197 con el tema de Conquer sobre claro (azul noche
// y dorado). Solo se
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

  // Zona principal: azul noche. Sobre el musculo sin trabajar contrasta de sobra
  :deep(.body-figure--sage .mu--lit path) {
    fill: var(--cq-night);
    stroke: var(--cq-night);
  }

  // Zona secundaria: relleno dorado de control con borde dorado oscuro (el relleno solo daria
  // 2,5:1 contra el musculo sin trabajar, el borde la separa a 3:1 o mas)
  :deep(.body-figure--sage .mu--lit2 path) {
    fill: var(--cq-edge-gold);
    stroke: var(--cq-text-gold);
  }

  :deep(.body-figure__caption) {
    color: var(--cq-text-2);
  }
}
</style>
