<template>
  <!-- Celebración de la sesión completa. Mismo marco que la del bloque libre (CelebrationFrame),
       sin AURA (eso es solo del bloque libre). NO avanza sola: el socio toca "Ver resumen". -->
  <CelebrationFrame
    kicker="Sesión"
    title="¡Sesión completada!"
    cta-label="Ver resumen"
    @cta="emit('view-summary')"
  >
    <CelebrationQuote :quote="quote" />
  </CelebrationFrame>
</template>

<script setup lang="ts">
import type { Quote } from '../../data/quotes'
import CelebrationFrame from './CelebrationFrame.vue'
import CelebrationQuote from './CelebrationQuote.vue'

interface Props {
  /** Final motivational quote to display */
  quote: Quote
}

interface Emits {
  (e: 'view-summary'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()
</script>
