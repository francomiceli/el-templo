<template>
  <div class="splash-overlay">
    <div class="splash-overlay__backdrop" />
    <div class="splash-overlay__card">
      <!-- Flame icon -->
      <div class="splash-overlay__icon">
        <q-icon name="local_fire_department" size="64px" />
      </div>

      <!-- Day + Level label -->
      <div class="splash-overlay__label">
        {{ formattedDayLevel }}
      </div>

      <!-- Title -->
      <div class="splash-overlay__title">Vamos a entrenar!</div>

      <!-- Welcome quote -->
      <div class="splash-overlay__quote">
        <div class="splash-overlay__quote-text">
          {{ welcomeQuote.text
          }}<span v-if="welcomeQuote.goldText" class="splash-overlay__quote-gold">{{
            welcomeQuote.goldText
          }}</span>
        </div>
        <div class="splash-overlay__quote-author">&mdash; {{ welcomeQuote.author }}</div>
      </div>

      <!-- Comenzar button — user MUST tap to start -->
      <div class="splash-overlay__action">
        <q-btn
          color="primary"
          unelevated
          label="COMENZAR"
          class="full-width"
          size="lg"
          @click="emit('start')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatLevelName } from '../../utils/levelDisplay'
import { QUOTES } from '../../data/quotes'

interface Props {
  /** Session day (e.g., "lunes") */
  day: string
  /** Member level (e.g., "alfa") */
  level: string
}

interface Emits {
  (e: 'start'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const formattedDayLevel = computed(() => {
  const dayCapitalized = props.day.charAt(0).toUpperCase() + props.day.slice(1)
  const levelName = formatLevelName(props.level)
  return `${dayCapitalized} - Nivel ${levelName}`
})

/**
 * Select a welcome quote deterministically based on day string hash.
 */
const welcomeQuote = computed(() => {
  let hash = 0
  for (let i = 0; i < props.day.length; i++) {
    hash = ((hash << 5) - hash + props.day.charCodeAt(i)) | 0
  }
  const index = Math.abs(hash) % QUOTES.length
  return QUOTES[index]
})
</script>

<style scoped lang="scss">
.splash-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.splash-overlay__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(46, 42, 38, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.splash-overlay__card {
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

.splash-overlay__icon {
  color: #b89b5e; // Aged Gold
}

.splash-overlay__label {
  font-family: 'Montserrat', sans-serif;
  font-size: 16px;
  color: white;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.splash-overlay__title {
  font-family: 'Montserrat', sans-serif;
  font-size: 28px;
  font-weight: 800;
  color: white;
  line-height: 1.2;
}

.splash-overlay__subtitle {
  font-family: 'Geologica', sans-serif;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.65);
}

.splash-overlay__quote {
  margin-top: 8px;
}

.splash-overlay__quote-text {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
}

.splash-overlay__quote-gold {
  color: #b89b5e; // Aged Gold
}

.splash-overlay__quote-author {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 8px;
}

.splash-overlay__action {
  width: 100%;
  margin-top: 16px;
}
</style>
