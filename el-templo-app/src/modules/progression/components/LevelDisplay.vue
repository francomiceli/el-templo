<template>
  <div class="level-display">
    <div class="level-display__letter">
      {{ greekLetter }}
    </div>
    <div class="level-display__name">
      {{ levelName }}
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * LevelDisplay component
 *
 * Shows the member's current level with Greek letter badge and level name.
 * Uses brand colors: bronze for Greek letter, navy for level name.
 */

interface Props {
  /** Greek letter symbol (alpha, delta, sigma, omega) */
  greekLetter: string;
  /** Full level name (Alfa, Delta, Sigma, Omega, Spartan) */
  levelName: string;
}

defineProps<Props>();
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.level-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 16px;
}

.level-display__letter {
  font-family: 'Cinzel', serif;
  font-size: 64px;
  font-weight: 700;
  color: $secondary;
  line-height: 1;
  margin-bottom: 8px;
}

.level-display__name {
  font-family: 'Cinzel', serif;
  font-size: 18px;
  font-weight: 500;
  color: $primary;
  text-transform: uppercase;
  letter-spacing: 0.15em;
}
</style>
