<template>
  <div class="question-screen">
    <PremiumGlassCard>
      <p v-if="question.frame" class="question-frame">{{ question.frame }}</p>
      <h3 class="question-text">{{ question.text }}</h3>

      <div :class="['options-stack', { 'options-stack--scrollable': scrollable }]">
        <button
          v-for="option in question.options"
          :key="option.value"
          :class="['option-btn', { 'option-btn--selected': selectedValue === option.value }]"
          :aria-pressed="selectedValue === option.value"
          @click="onSelectOption(option.value)"
        >
          <span class="option-label">{{ option.label }}</span>
          <q-icon
            v-if="selectedValue === option.value"
            name="check_circle"
            size="16px"
            class="option-check"
          />
        </button>
      </div>
    </PremiumGlassCard>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { QuizQuestion, QuizQuestionV2 } from '../types'
import PremiumGlassCard from 'src/components/PremiumGlassCard.vue'

const props = defineProps<{
  question: QuizQuestion | QuizQuestionV2
  questionIndex: number
  selectedValue: string | null
}>()

const scrollable = computed(() => props.question.options.length > 5)

const emit = defineEmits<{
  select: [value: string]
}>()

function onSelectOption(value: string) {
  emit('select', value)
}
</script>

<style lang="scss" scoped>
@import 'src/css/premium-card';

.question-screen {
  width: 100%;
  max-width: 380px;
  padding: 0 20px;
}

// Marco, superficie translúcida y línea luminosa: PremiumGlassCard.
.question-frame {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-weight: 500;
  font-size: 1rem;
  color: $pd-cream-3;
  margin: 0 0 6px 0;
  text-align: center;
  line-height: 1.35;
}

.question-text {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.2rem;
  color: $pd-cream;
  margin: 0 0 16px 0;
  text-align: center;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5);
  line-height: 1.3;
}

.options-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;

  // El degradé de las puntas cae sobre este padding (8px): en reposo no se come el borde de la primera
  // ni de la última opción. El margen negativo deja el layout igual.
  &--scrollable {
    max-height: 396px;
    padding: 8px 0;
    margin: -8px 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    mask-image: linear-gradient(
      to bottom,
      transparent 0px,
      black 8px,
      black calc(100% - 8px),
      transparent 100%
    );
    -webkit-mask-image: linear-gradient(
      to bottom,
      transparent 0px,
      black 8px,
      black calc(100% - 8px),
      transparent 100%
    );
  }
}

.option-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 46px;
  padding: 0 14px;
  border-radius: 10px;
  background: rgba(46, 42, 38, 0.5);
  border: 1px solid rgba(240, 230, 214, 0.22);
  color: $pd-cream;
  font-family: 'Geologica', sans-serif;
  font-weight: 500;
  font-size: 0.9375rem;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  line-height: 1.4;

  &:hover {
    border-color: rgba(240, 230, 214, 0.4);
    background: rgba(46, 42, 38, 0.6);
  }

  &:active {
    transform: scale(0.98);
    transition-duration: 100ms;
  }

  // Elegida: terracota SÓLIDO (el mismo degradé del botón), texto e ícono blancos.
  &--selected,
  &--selected:hover {
    border-color: transparent;
    background: linear-gradient(135deg, $pd-btn-a, $pd-btn-b);
    color: #fff;
    box-shadow: 0 4px 14px rgba(126, 69, 41, 0.35);
  }
}

.option-label {
  flex: 1;
}

.option-check {
  color: #fff;
  flex-shrink: 0;
  margin-left: 8px;
}
</style>
