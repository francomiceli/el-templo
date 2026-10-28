<template>
  <!-- Fase 197 D-15 (pantalla 4): celebración del bloque libre. Mismo marco que la de la sesión
       completa (CelebrationFrame).
       T-197-38: el "+5 AURA" se muestra SOLO con `auraAwarded`, que viene de la respuesta del
       servidor (el cliente nunca lo decide). -->
  <CelebrationFrame
    kicker="Bloque libre"
    title="¡Bloque completado!"
    cta-label="Ver resumen"
    @cta="emit('view-summary')"
  >
    <template v-if="auraAwarded">
      <div class="fb-aura">
        <span class="fb-aura__amount">+5</span>
        <span class="fb-aura__label">AURA</span>
      </div>
      <p class="fb-meta">Tu primer bloque libre de hoy</p>
    </template>
    <p v-else class="fb-meta">Sumaste otro bloque a tu día.</p>

    <CelebrationQuote :quote="quote" />
  </CelebrationFrame>
</template>

<script setup lang="ts">
import type { Quote } from '../../data/quotes'
import CelebrationFrame from './CelebrationFrame.vue'
import CelebrationQuote from './CelebrationQuote.vue'

interface Props {
  /** true solo si el servidor acreditó los +5 AURA de este bloque */
  auraAwarded: boolean
  /** Cita de cierre */
  quote: Quote
}

interface Emits {
  (e: 'view-summary'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

// "+5 AURA": el único dorado de la pantalla (D-18). El glow es decoración, el texto es sólido.
.fb-aura {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: $pd-gold;
}

.fb-aura__amount {
  font-family: 'Montserrat', sans-serif;
  font-weight: 800;
  font-size: 44px;
  line-height: 1;
  color: $pd-gold;
  text-shadow: 0 0 28px rgba(212, 180, 106, 0.35);
}

.fb-aura__label {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.14em;
  color: $pd-gold;
}

.fb-meta {
  margin: 0;
  font-family: 'Geologica', sans-serif;
  font-size: 13px;
  color: $pd-cream-3;
}

// Pulso del "+5": solo escala (el texto nunca baja su opacidad) y solo con movimiento permitido.
@media (prefers-reduced-motion: no-preference) {
  .fb-aura__amount {
    animation: fb-aura-pulse 1.6s ease-in-out infinite;
  }

  @keyframes fb-aura-pulse {
    50% {
      transform: scale(1.08);
    }
  }
}
</style>
