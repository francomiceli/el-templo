<template>
  <figure class="cq">
    <blockquote class="cq__text">
      {{ quote.text }}<span v-if="quote.goldText" class="cq__hl">{{ quote.goldText }}</span>
    </blockquote>
    <figcaption class="cq__author">&mdash; {{ quote.author }}</figcaption>
  </figure>
</template>

<script setup lang="ts">
import type { Quote } from '../../data/quotes'

// Cita de cierre de las celebraciones (sesión completa y bloque libre). Tratamiento premium:
// Cormorant en crema, y el tramo destacado en crema más pesado (D-18: el dorado es solo de AURA).
defineProps<{
  quote: Quote
}>()
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.cq {
  margin: 4px 0 0;
  padding: 0;
}

.cq__text {
  margin: 0;
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-weight: 500;
  font-size: 17px;
  line-height: 1.4;
  color: $pd-cream-2;
}

.cq__hl {
  font-weight: 600;
  color: $pd-cream;
}

.cq__author {
  margin-top: 6px;
  font-family: 'Geologica', sans-serif;
  font-size: 13px;
  color: $pd-cream-3;
}
</style>
