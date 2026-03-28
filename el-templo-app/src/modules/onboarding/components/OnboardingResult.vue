<template>
  <div class="result-screen">
    <h2 class="result-heading">Tu perfil est&aacute; listo</h2>

    <div class="glass-card">
      <!-- Profile summary rows -->
      <div class="summary-rows">
        <div
          v-for="(row, idx) in SUMMARY_ROWS"
          :key="row.key"
          :class="['summary-row', { 'summary-row--last': idx === SUMMARY_ROWS.length - 1 }]"
        >
          <q-icon :name="row.icon" size="20px" class="summary-icon" />
          <div class="summary-content">
            <span class="summary-label">{{ row.label }}</span>
            <span class="summary-value">{{ getDisplayValue(row) }}</span>
          </div>
        </div>
      </div>

      <!-- AURA reward -->
      <div class="aura-reward">
        <div class="aura-glow">
          <span class="aura-number">+{{ auraAwarded || 50 }}</span>
        </div>
        <span class="aura-label">AURA</span>
        <!-- Celebration particles -->
        <div v-if="showCelebration" class="celebration">
          <div v-for="n in 10" :key="n" :class="`particle particle--${n}`"></div>
        </div>
      </div>

      <!-- CTA -->
      <q-btn
        label="Entrar al Templo"
        unelevated
        no-caps
        :loading="submitting"
        class="result-cta full-width"
        @click="emit('enter')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { SUMMARY_ROWS } from '../types'
import type { OnboardingAnswers } from '../types'

const props = defineProps<{
  answers: OnboardingAnswers
  auraAwarded: number
  submitting: boolean
}>()

const emit = defineEmits<{
  enter: []
}>()

const showCelebration = ref(false)

function getDisplayValue(row: (typeof SUMMARY_ROWS)[number]) {
  const answerValue = props.answers[row.key]
  if (!answerValue) return ''
  // Type assertion: answerValue is one of the keys in row.labels
  return (row.labels as Record<string, string>)[answerValue] ?? answerValue
}

onMounted(() => {
  // Fire celebration particles 200ms after screen is visible
  setTimeout(() => {
    showCelebration.value = true
  }, 200)
})
</script>

<style lang="scss" scoped>
@import 'src/css/brand';
$terracotta: $brand-terracotta;
$amber: #d4a843;
$bronze: #d4b896;
$cream: #f2ede5;
$charcoal-mid: #3d3732;

.result-screen {
  width: 100%;
  max-width: 380px;
  padding: 0 20px;
  text-align: center;
}

.result-heading {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.375rem;
  letter-spacing: 0.08em;
  color: $cream;
  margin: 0 0 20px 0;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5);
  line-height: 1.2;
}

.glass-card {
  width: 100%;
  background: rgba($charcoal-mid, 0.85);
  border-top: 2px solid rgba($terracotta, 0.6);
  border-radius: 8px;
  padding: 28px 24px 20px;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

// =========================================================================
// Profile summary rows
// =========================================================================
.summary-rows {
  margin-bottom: 20px;
}

.summary-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba($cream, 0.08);

  &--last {
    border-bottom: none;
  }
}

.summary-icon {
  color: $terracotta;
  flex-shrink: 0;
}

.summary-content {
  display: flex;
  flex-direction: column;
  text-align: left;
}

.summary-label {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.8125rem;
  color: rgba($cream, 0.5);
  line-height: 1.5;
}

.summary-value {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.9375rem;
  color: $cream;
  line-height: 1.5;
}

// =========================================================================
// AURA reward
// =========================================================================
.aura-reward {
  margin: 20px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.aura-glow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  animation: aura-pulse 2s ease-in-out infinite;
}

.aura-number {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.75rem;
  color: $amber;
}

.aura-label {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 0.75rem;
  color: rgba($amber, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.15em;
  margin-top: 4px;
}

@keyframes aura-pulse {
  0%,
  100% {
    box-shadow: 0 0 20px rgba($amber, 0.2);
  }
  50% {
    box-shadow: 0 0 35px rgba($amber, 0.35);
  }
}

// =========================================================================
// Celebration particles
// =========================================================================
.celebration {
  position: absolute;
  top: 40px;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
}

.particle {
  position: absolute;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  animation: particle-burst 1s ease-out forwards;
}

$particle-colors: $bronze, $amber;

@for $i from 1 through 10 {
  .particle--#{$i} {
    $angle: random(360) * 1deg;
    $distance: 30px + random(40) * 1px;
    background: nth($particle-colors, ($i % 2) + 1);
    animation-delay: #{random(200)}ms;
    --px: #{cos($angle) * $distance};
    --py: #{sin($angle) * $distance - 20px};
  }
}

@keyframes particle-burst {
  0% {
    opacity: 1;
    transform: translate(0, 0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(var(--px, 20px), var(--py, -30px)) scale(0.3);
  }
}

// =========================================================================
// CTA
// =========================================================================
.result-cta {
  background: linear-gradient(135deg, $terracotta 0%, #ad6540 100%) !important;
  color: $cream !important;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 0.9375rem;
  letter-spacing: 0.12em;
  padding: 12px 0;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition:
    box-shadow 0.3s ease,
    transform 0.2s ease;

  &:hover {
    box-shadow:
      0 4px 24px rgba($terracotta, 0.5),
      0 0 40px rgba($terracotta, 0.15);
    transform: scale(1.02);
  }

  &:active {
    transform: scale(0.98);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
}
</style>
