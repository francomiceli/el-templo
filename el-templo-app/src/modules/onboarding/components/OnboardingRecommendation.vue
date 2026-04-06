<template>
  <div class="recommendation-screen">
    <h2 class="recommendation-heading">Tu programa sugerido</h2>

    <div class="glass-card">
      <!-- Program info -->
      <div class="program-info">
        <h3 class="program-name">{{ programName }}</h3>
        <p class="program-description">{{ programDescription }}</p>
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
        class="recommendation-cta full-width"
        @click="emit('enter')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

defineProps<{
  programName: string
  programDescription: string
  auraAwarded: number
  submitting: boolean
}>()

const emit = defineEmits<{
  enter: []
}>()

const showCelebration = ref(false)

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

.recommendation-screen {
  width: 100%;
  max-width: 380px;
  padding: 0 20px;
  text-align: center;
}

.recommendation-heading {
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
// Program info
// =========================================================================
.program-info {
  margin-bottom: 20px;
}

.program-name {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.125rem;
  color: $cream;
  text-align: center;
  margin: 0 0 8px 0;
}

.program-description {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.9375rem;
  color: rgba($cream, 0.7);
  text-align: center;
  line-height: 1.5;
  margin: 0 0 20px 0;
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
.recommendation-cta {
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
