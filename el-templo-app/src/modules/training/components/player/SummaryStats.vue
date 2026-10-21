<template>
  <!-- Grilla de números de los resúmenes (sesión completa y bloque libre): una columna por dato,
       separadas por una línea. Superficie clara de FreeBlockSummary. -->
  <div class="sstats">
    <div v-for="stat in stats" :key="stat.label" class="sstats__item">
      <strong class="sstats__num">{{ stat.value }}</strong>
      <span class="sstats__label">{{ stat.label }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
interface SummaryStat {
  /** Número ya formateado ("12'", "3") */
  value: string | number
  label: string
}

defineProps<{
  stats: SummaryStat[]
}>()
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.sstats {
  @include pd-surface-light;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
}

.sstats__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 12px 8px;

  & + & {
    border-left: 1px solid $pd-light-line;
  }
}

.sstats__num {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 17px;
  color: $pd-ink;
}

.sstats__label {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: $pd-ink-2;
}
</style>
