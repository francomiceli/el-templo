<template>
  <!-- Fase 197 D-15 (pantalla 4): celebración del bloque libre. Mismo marco que el inicio.
       T-197-38: el "+5 AURA" se muestra SOLO con `auraAwarded`, que viene de la respuesta del
       servidor (el cliente nunca lo decide). -->
  <div class="fb-overlay" role="dialog" aria-modal="true" :aria-labelledby="titleId">
    <PremiumDialogCard kicker="Bloque libre">
      <div class="fb-body">
        <h2 :id="titleId" class="fb-title">¡Bloque completado!</h2>

        <template v-if="auraAwarded">
          <div class="fb-aura">
            <span class="fb-aura__amount">+5</span>
            <span class="fb-aura__label">AURA</span>
          </div>
          <p class="fb-meta">Tu primer bloque libre de hoy</p>
        </template>
        <p v-else class="fb-meta">Sumaste otro bloque a tu día.</p>

        <figure class="fb-quote">
          <blockquote class="fb-quote__text">
            {{ quote.text }}<span v-if="quote.goldText" class="fb-quote__hl">{{
              quote.goldText
            }}</span>
          </blockquote>
          <figcaption class="fb-quote__author">&mdash; {{ quote.author }}</figcaption>
        </figure>

        <div class="pd-acts">
          <button ref="summaryBtn" type="button" class="pd-cta" @click="emit('view-summary')">
            Ver resumen
          </button>
        </div>
      </div>
    </PremiumDialogCard>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, useId } from 'vue'
import PremiumDialogCard from 'src/components/PremiumDialogCard.vue'
import type { Quote } from '../../data/quotes'

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

const titleId = `fb-celebration-title-${useId()}`
const summaryBtn = ref<HTMLButtonElement | null>(null)

// Foco inicial en el CTA: el diálogo es modal.
onMounted(() => {
  summaryBtn.value?.focus()
})
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.fb-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(30, 24, 18, 0.82);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

// El kicker lo pinta PremiumDialogCard alineado a la izquierda: acá va centrado.
.fb-overlay :deep(.pd-kicker) {
  text-align: center;
}

.fb-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding-top: 8px;
  text-align: center;
}

.fb-title {
  margin: 0;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 28px;
  line-height: 1.15;
  color: $pd-cream;
}

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

.fb-quote {
  margin: 4px 0 0;
  padding: 0;
}

.fb-quote__text {
  margin: 0;
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-weight: 500;
  font-size: 17px;
  line-height: 1.4;
  color: $pd-cream-2;
}

// D-18: el dorado es solo de AURA. El tramo destacado de la cita va en crema, más pesado.
.fb-quote__hl {
  font-weight: 600;
  color: $pd-cream;
}

.fb-quote__author {
  margin-top: 6px;
  font-family: 'Geologica', sans-serif;
  font-size: 13px;
  color: $pd-cream-3;
}

.fb-body .pd-acts {
  align-self: stretch;
  margin-top: 4px;
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
