<template>
  <div class="question-screen">
    <div class="glass-card">
      <h3 class="question-text">¿Cuál es tu fecha de nacimiento?</h3>

      <form class="dob-form" @submit.prevent="onSubmit">
        <input
          ref="inputEl"
          v-model="dobInput"
          class="dob-input"
          inputmode="numeric"
          autocomplete="bday"
          placeholder="DD/MM/AAAA"
          maxlength="10"
          :aria-invalid="showError"
          aria-label="Fecha de nacimiento en formato día, mes y año"
          @input="onType"
          @keydown.enter.prevent="onSubmit"
        />

        <p v-if="showError" class="dob-error" role="alert">
          Fecha inválida. Usá el formato DD/MM/AAAA.
        </p>

        <button
          type="submit"
          class="dob-submit"
          :disabled="!isComplete"
          :aria-disabled="!isComplete"
        >
          Continuar
        </button>

        <button type="button" class="dob-skip" @click="onSkip">omitir</button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { parseDmyToAgeRange } from '../types'
import type { AgeRange } from '../types'

const emit = defineEmits<{
  select: [value: AgeRange]
  skip: []
}>()

const dobInput = ref('')
const showError = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)

const isComplete = computed(() => dobInput.value.length === 10)

onMounted(() => {
  void nextTick(() => inputEl.value?.focus())
})

function onType(e: Event) {
  const target = e.target as HTMLInputElement
  const digits = target.value.replace(/\D/g, '').slice(0, 8)
  let formatted = digits
  if (digits.length >= 5) {
    formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
  } else if (digits.length >= 3) {
    formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`
  }
  dobInput.value = formatted
  if (showError.value) showError.value = false
}

function onSubmit() {
  const range = parseDmyToAgeRange(dobInput.value)
  if (!range) {
    showError.value = true
    return
  }
  emit('select', range)
}

function onSkip() {
  emit('skip')
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

.dob-form {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.dob-input {
  width: 100%;
  padding: 14px 16px;
  border-radius: 8px;
  background: rgba($charcoal, 0.5);
  border: 1.5px solid rgba($cream, 0.12);
  color: $cream;
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 1.0625rem;
  letter-spacing: 0.08em;
  text-align: center;
  outline: none;
  transition: all 0.2s ease;

  &::placeholder {
    color: rgba($cream, 0.3);
    letter-spacing: 0.12em;
  }

  &:focus,
  &:focus-visible {
    border-color: rgba($terracotta, 0.8);
    background: rgba($charcoal, 0.6);
    box-shadow: 0 0 12px rgba($terracotta, 0.15);
  }

  &[aria-invalid='true'] {
    border-color: rgba(220, 80, 80, 0.8);
  }
}

.dob-error {
  font-family: 'Geologica', sans-serif;
  font-size: 0.8125rem;
  color: rgba(220, 120, 120, 0.95);
  margin: 0;
  text-align: center;
}

.dob-submit {
  width: 100%;
  min-height: 48px;
  margin-top: 4px;
  padding: 12px 16px;
  border-radius: 8px;
  background: rgba($terracotta, 0.9);
  border: none;
  color: $cream;
  font-family: 'Montserrat', sans-serif;
  font-weight: 600;
  font-size: 0.9375rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover:not(:disabled) {
    background: $terracotta;
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    background: rgba($terracotta, 0.35);
    color: rgba($cream, 0.6);
    cursor: not-allowed;
  }
}

.dob-skip {
  background: transparent;
  border: none;
  color: rgba($cream, 0.45);
  font-family: 'Geologica', sans-serif;
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  text-transform: lowercase;
  text-decoration: underline;
  text-underline-offset: 3px;
  padding: 6px 12px;
  margin-top: 2px;
  cursor: pointer;
  transition: color 0.2s ease;

  &:hover {
    color: rgba($cream, 0.75);
  }
}
</style>
