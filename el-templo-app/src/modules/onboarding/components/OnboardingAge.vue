<template>
  <div class="question-screen">
    <div class="glass-card">
      <h3 class="question-text">¿Cuál es tu fecha de nacimiento?</h3>

      <input
        v-model="dob"
        type="text"
        class="dob-input"
        placeholder="DD/MM/AAAA"
        maxlength="10"
        :aria-invalid="hasError"
        @input="onInput"
        @keydown.enter="onContinue"
      />

      <p v-if="hasError" class="dob-error">Fecha inválida.</p>

      <button type="button" class="dob-submit" :disabled="dob.length !== 10" @click="onContinue">
        Continuar
      </button>

      <button type="button" class="dob-skip" @click="$emit('skip')">omitir</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { parseDmyToAgeRange } from '../types'
import type { AgeRange } from '../types'

const emit = defineEmits<{
  select: [value: AgeRange]
  skip: []
}>()

const dob = ref('')
const hasError = ref(false)

function onInput(e: Event) {
  const digits = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 8)
  if (digits.length >= 5)
    dob.value = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
  else if (digits.length >= 3) dob.value = `${digits.slice(0, 2)}/${digits.slice(2)}`
  else dob.value = digits
  if (hasError.value) hasError.value = false
}

function onContinue() {
  const range = parseDmyToAgeRange(dob.value)
  if (!range) {
    hasError.value = true
    return
  }
  emit('select', range)
}
</script>

<style lang="scss" scoped>
$terracotta: #96593a;
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

.question-text {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.125rem;
  letter-spacing: 0.06em;
  color: $cream;
  margin: 0 0 20px 0;
  text-align: center;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5);
  line-height: 1.3;
}

.dob-input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  padding: 14px 16px;
  border-radius: 8px;
  background: rgba($charcoal, 0.5);
  border: 1.5px solid rgba($cream, 0.12);
  color: $cream;
  font-family: 'Geologica', sans-serif;
  font-size: 1.0625rem;
  letter-spacing: 0.08em;
  text-align: center;
  outline: none;

  &::placeholder {
    color: rgba($cream, 0.3);
  }

  &:focus {
    border-color: rgba($terracotta, 0.8);
  }

  &[aria-invalid='true'] {
    border-color: rgba(220, 80, 80, 0.8);
  }
}

.dob-error {
  font-family: 'Geologica', sans-serif;
  font-size: 0.8125rem;
  color: rgba(220, 120, 120, 0.95);
  margin: 8px 0 0;
  text-align: center;
}

.dob-submit {
  display: block;
  width: 100%;
  box-sizing: border-box;
  min-height: 48px;
  margin-top: 14px;
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

  &:disabled {
    background: rgba($terracotta, 0.35);
    color: rgba($cream, 0.6);
    cursor: not-allowed;
  }
}

.dob-skip {
  display: block;
  margin: 10px auto 0;
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
  cursor: pointer;
}
</style>
