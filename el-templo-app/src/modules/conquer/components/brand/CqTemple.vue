<template>
  <span class="cq-temple" role="img" :aria-label="accessibleLabel">
    <span class="cq-temple__cols">
      <i v-for="n in 3" :key="n" :class="{ 'cq-temple__col--on': n <= count }" />
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

// Fase 201 D-09: el templo de cada ejercicio (prototipo `temple`): tres columnas que se llenan con
// las series hechas. `filled` va de 0 a 3 (se recorta); `label` es el texto accesible.
const props = withDefaults(
  defineProps<{
    filled: number
    label?: string
  }>(),
  { label: '' },
)

const count = computed(() => Math.min(3, Math.max(0, Math.floor(props.filled))))
const accessibleLabel = computed(() => props.label || `${count.value} de 3 series hechas`)
</script>

<style scoped lang="scss">
.cq-temple {
  width: 48px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;

  // Frontón
  &::before {
    content: '';
    height: 11px;
    background: var(--cq-gold);
    clip-path: polygon(50% 0, 100% 100%, 0 100%);
  }

  // Basamento
  &::after {
    content: '';
    height: 2px;
    margin: 1px -3px 0;
    background: var(--cq-gold);
  }

  &__cols {
    display: flex;
    justify-content: space-between;
    padding: 2px 5px 0;
    border-top: 2px solid var(--cq-gold);
    border-bottom: 2px solid var(--cq-gold);

    i {
      width: 8px;
      height: 20px;
      border: 1px solid var(--cq-gold);
      display: block;
    }
  }

  &__col--on {
    background: var(--cq-gold);
  }
}
</style>
