<template>
  <p class="cq-runs">
    <template v-for="(run, i) in runs" :key="i">
      <strong v-if="run.strong">{{ run.text }}</strong>
      <template v-else>{{ run.text }}</template>
    </template>
  </p>
</template>

<script setup lang="ts">
import type { GuideRun } from '../../utils/guide'

// Fase 201 DA-27: un párrafo de la guía a partir de sus tramos (`GuideRun[]`). El énfasis es un
// `<strong>`, nunca `v-html`. Es para la pantalla oscura de la guía: el énfasis va en
// `--cq-on-night-hi`; el color del texto lo pone quien lo usa.
defineProps<{
  runs: GuideRun[]
}>()
</script>

<style scoped lang="scss">
.cq-runs {
  margin: 0;

  strong {
    font-weight: 600;
    color: var(--cq-on-night-hi);
  }
}
</style>
