<template>
  <!-- Celebración de la sesión completa: aparece al tildar el último ejercicio. Mismo marco que la
       del bloque libre (CelebrationFrame), sin AURA ni kicker. NO avanza sola: el socio toca "Ver
       resumen" o vuelve al último ejercicio (lo destilda). -->
  <CelebrationFrame
    title="¡Sesión completada!"
    cta-label="Ver resumen"
    link-label="Volver al último ejercicio"
    @cta="emit('view-summary')"
    @link="emit('back')"
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
  (e: 'back'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()
</script>
