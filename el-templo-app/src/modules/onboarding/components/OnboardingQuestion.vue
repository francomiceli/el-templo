<template>
  <div class="question-screen">
    <div class="glass-card">
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { QuizQuestion, QuizQuestionV2 } from '../types'

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
@import 'src/css/brand';
$terracotta: $brand-terracotta;
$cream: #f2ede5;
$charcoal: #2e2a26;
$charcoal-mid: #3d3732;

.question-screen {
  width: 100%;
  max-width: 380px;
  padding: 0 20px;
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

.question-frame {
  font-family: 'Geologica', sans-serif;
  font-style: italic;
  font-weight: 300;
  font-size: 0.8125rem;
  letter-spacing: 0.02em;
  color: rgba($cream, 0.5);
  margin: 0 0 12px 0;
  text-align: center;
  line-height: 1.45;
}

.question-text {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.125rem;
  letter-spacing: 0.06em;
  color: $cream;
  margin: 0 0 24px 0;
  text-align: center;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5);
  line-height: 1.3;
}

.options-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;

  &--scrollable {
    max-height: 360px;
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
  min-height: 48px;
  padding: 14px 16px;
  border-radius: 8px;
  background: rgba($charcoal, 0.5);
  border: 1.5px solid rgba($cream, 0.12);
  color: $cream;
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.9375rem;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  line-height: 1.5;

  &:hover {
    border-color: rgba($cream, 0.3);
    background: rgba($charcoal, 0.6);
  }

  &:active {
    transform: scale(0.98);
    transition-duration: 100ms;
  }

  &--selected {
    border-color: rgba($terracotta, 0.8);
    background: rgba($terracotta, 0.15);
    box-shadow: 0 0 12px rgba($terracotta, 0.15);
  }
}

.option-label {
  flex: 1;
}

.option-check {
  color: $terracotta;
  flex-shrink: 0;
  margin-left: 8px;
}
</style>
