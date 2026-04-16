<template>
  <div class="recommendation-screen">
    <h2 class="recommendation-heading">Gracias por tus respuestas!</h2>

    <div class="glass-card">
      <!-- Zone A: Program info -->
      <div class="program-info">
        <p class="program-label">Tu programa ideal</p>
        <h3 class="program-name">{{ programName }}</h3>
        <p class="program-description">{{ programDescription }}</p>
      </div>

      <!-- "Incluido en tu plan" badge for subscribers -->
      <div v-if="hasPlan" class="included-badge">
        <q-icon name="check_circle" size="16px" class="included-badge__icon" />
        Incluido en tu plan
      </div>

      <!-- Zone B: AURA reward -->
      <div class="aura-reward">
        <div class="aura-glow">
          <span class="aura-number">+{{ auraAwarded || 50 }}</span>
        </div>
        <span class="aura-label">AURA</span>
        <span class="aura-subtitle">Ganaste tu primera recompensa</span>
        <!-- Celebration particles -->
        <div v-if="showCelebration" class="celebration">
          <div v-for="n in 10" :key="n" :class="`particle particle--${n}`"></div>
        </div>
      </div>

      <!-- Zone C: CTAs -->

      <!-- Scenario 3: No subscription + Foundation -->
      <template v-if="!hasPlan && !isUpgradeRecommendation">
        <p class="cta-context">Este programa esta incluido cuando entrenas con nosotros</p>
        <q-btn
          unelevated
          no-caps
          class="recommendation-cta recommendation-cta--whatsapp full-width"
          @click="openWhatsApp"
        >
          <q-icon
            name="img:/icons/whatsapp.svg"
            size="18px"
            class="q-mr-sm"
            style="filter: brightness(0) invert(1)"
          />
          Proba una clase
        </q-btn>
        <button class="explore-link" @click="emit('enter')">Explorar la app</button>
      </template>

      <!-- Scenario 4: No subscription + paid program -->
      <template v-else-if="!hasPlan && isUpgradeRecommendation">
        <q-btn
          unelevated
          no-caps
          class="recommendation-cta recommendation-cta--whatsapp full-width"
          @click="openWhatsApp"
        >
          <q-icon
            name="img:/icons/whatsapp.svg"
            size="18px"
            class="q-mr-sm"
            style="filter: brightness(0) invert(1)"
          />
          Quiero empezar
        </q-btn>
        <p class="cta-subtitle">Escribinos y te armamos tu plan personalizado</p>
        <button class="explore-link" @click="emit('enter')">Explorar la app</button>
      </template>

      <!-- Scenarios 1 & 2: Has subscription -->
      <template v-else>
        <q-btn
          label="Entrar al Templo"
          unelevated
          no-caps
          :loading="submitting"
          class="recommendation-cta full-width"
          @click="emit('enter')"
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

const WHATSAPP_NUMBER = '5492235820521'
const FOUNDATION_PROGRAM = 'Foundation - Cuerpo Completo'

const props = defineProps<{
  programName: string
  programDescription: string
  auraAwarded: number
  submitting: boolean
  hasPlan: boolean
}>()

/** True when the recommendation is a paid program (not the free Foundation included with presencial plans) */
const isUpgradeRecommendation = computed(() => props.programName !== FOUNDATION_PROGRAM)

const emit = defineEmits<{
  enter: []
}>()

function openWhatsApp(): void {
  const message = isUpgradeRecommendation.value
    ? `Hola! Acabo de hacer el quiz en la app y me recomendaron: ${props.programName}. Quiero empezar!`
    : 'Hola! Hice el quiz en la app y quiero probar una clase.'
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
  window.open(url, '_blank')
}

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

.program-label {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 0.8125rem;
  color: rgba($cream, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0 0 4px 0;
  text-align: center;
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
// Included badge (subscribers)
// =========================================================================
.included-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-family: 'Montserrat', sans-serif;
  font-weight: 600;
  font-size: 0.8125rem;
  color: #4caf50;
  margin-bottom: 12px;

  &__icon {
    color: #4caf50;
  }
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

.aura-subtitle {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.8125rem;
  color: rgba($cream, 0.5);
  margin-top: 6px;
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
// CTA zone
// =========================================================================
.cta-context {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.875rem;
  color: rgba($cream, 0.6);
  line-height: 1.4;
  margin: 0 0 16px 0;
  text-align: center;
}

.cta-subtitle {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.8125rem;
  color: rgba($cream, 0.5);
  margin: 10px 0 0 0;
  text-align: center;
}

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

  &--whatsapp {
    background: linear-gradient(135deg, #25d366 0%, #128c7e 100%) !important;
  }
}

.explore-link {
  display: block;
  width: 100%;
  margin-top: 16px;
  padding: 8px 0;
  background: none;
  border: none;
  cursor: pointer;
  font-family: 'Montserrat', sans-serif;
  font-weight: 600;
  font-size: 0.875rem;
  letter-spacing: 0.04em;
  color: $cream;
  text-align: center;
  transition: color 0.2s ease;

  &:hover {
    color: $terracotta;
  }
}
</style>
