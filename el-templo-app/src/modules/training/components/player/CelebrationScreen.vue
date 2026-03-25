<template>
  <div class="celebration-overlay">
    <div class="celebration-overlay__backdrop" />
    <div class="celebration-overlay__card">
      <!-- Flame icon with pulse animation -->
      <div class="celebration-overlay__flame">
        <q-icon name="local_fire_department" size="80px" />
      </div>

      <!-- Title -->
      <div class="celebration-overlay__title">Sesión Completada!</div>

      <!-- Final quote -->
      <div class="celebration-overlay__quote">
        <div class="celebration-overlay__quote-text">
          {{ quote.text
          }}<span v-if="quote.goldText" class="celebration-overlay__quote-gold">{{
            quote.goldText
          }}</span>
        </div>
        <div class="celebration-overlay__quote-author">&mdash; {{ quote.author }}</div>
      </div>

      <!-- Ver Resumen button — NO auto-advance per CONTEXT.md -->
      <div class="celebration-overlay__action">
        <q-btn
          color="primary"
          unelevated
          label="Ver Resumen"
          class="full-width"
          size="lg"
          @click="emit('view-summary')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  /** Final motivational quote to display */
  quote: { text: string; goldText: string; author: string }
}

interface Emits {
  (e: 'view-summary'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()
</script>

<style scoped lang="scss">
.celebration-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.celebration-overlay__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(46, 42, 38, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.celebration-overlay__card {
  position: relative;
  max-width: 360px;
  width: 100%;
  border-radius: 20px;
  background: rgba(61, 55, 50, 0.95);
  padding: 40px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
}

.celebration-overlay__flame {
  color: #b89b5e; // Aged Gold
  animation: flame-pulse 1s ease-in-out infinite;
}

@keyframes flame-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
}

.celebration-overlay__title {
  font-family: 'Montserrat', sans-serif;
  font-size: 28px;
  font-weight: 800;
  color: white;
  letter-spacing: 0.05em;
  line-height: 1.2;
}

.celebration-overlay__quote {
  margin-top: 8px;
}

.celebration-overlay__quote-text {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: 18px;
  color: white;
  line-height: 1.5;
}

.celebration-overlay__quote-gold {
  color: #b89b5e; // Aged Gold
}

.celebration-overlay__quote-author {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 8px;
}

.celebration-overlay__action {
  width: 100%;
  margin-top: 16px;
}
</style>
