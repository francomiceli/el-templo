<template>
  <div class="transition-overlay">
    <div class="transition-overlay__backdrop" />
    <div class="transition-overlay__card">
      <!-- Completed badge -->
      <div class="transition-overlay__badge">
        <q-icon name="check_circle" color="positive" size="20px" />
        <span class="transition-overlay__badge-text">{{ completedBlockName }} completado</span>
      </div>

      <!-- Mobility reminder (if present) -->
      <div v-if="mobilityExerciseName" class="transition-overlay__mobility">
        <div class="transition-overlay__mobility-overline">DESCANSO ACTIVO</div>
        <div class="transition-overlay__mobility-name">{{ mobilityExerciseName }}</div>
        <q-icon name="self_improvement" size="24px" class="transition-overlay__mobility-icon" />
      </div>

      <!-- Motivational quote -->
      <div class="transition-overlay__quote">
        <div class="transition-overlay__quote-text">
          {{ quote.text
          }}<span v-if="quote.goldText" class="transition-overlay__quote-gold">{{
            quote.goldText
          }}</span>
        </div>
        <div class="transition-overlay__quote-author">&mdash; {{ quote.author }}</div>
      </div>

      <!-- Action button — button-only dismissal per CONTEXT.md -->
      <div class="transition-overlay__action">
        <q-btn
          color="primary"
          unelevated
          :label="actionLabel"
          class="full-width"
          size="lg"
          @click="emit('continue')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  /** Name of the completed block (e.g., "Initium") */
  completedBlockName: string
  /** Mobility exercise name for the completed block (null if INITIUM) */
  mobilityExerciseName: string | null
  /** Motivational quote to display */
  quote: { text: string; goldText: string; author: string }
  /** Label for the action button */
  actionLabel: string
}

interface Emits {
  (e: 'continue'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()
</script>

<style scoped lang="scss">
.transition-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.transition-overlay__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(46, 42, 38, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.transition-overlay__card {
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
  gap: 20px;
}

.transition-overlay__badge {
  display: flex;
  align-items: center;
  gap: 8px;
}

.transition-overlay__badge-text {
  font-size: 14px;
  text-transform: uppercase;
  color: white;
  letter-spacing: 1px;
}

.transition-overlay__mobility {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.transition-overlay__mobility-overline {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.5);
}

.transition-overlay__mobility-name {
  font-family: 'Montserrat', sans-serif;
  font-size: 18px;
  font-weight: 500;
  color: white;
}

.transition-overlay__mobility-icon {
  color: #b89b5e; // Aged Gold
}

.transition-overlay__quote {
  margin-top: 4px;
}

.transition-overlay__quote-text {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: 18px;
  color: white;
  line-height: 1.5;
}

.transition-overlay__quote-gold {
  color: #b89b5e; // Aged Gold
}

.transition-overlay__quote-author {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 8px;
}

.transition-overlay__action {
  width: 100%;
  margin-top: 8px;
}
</style>
