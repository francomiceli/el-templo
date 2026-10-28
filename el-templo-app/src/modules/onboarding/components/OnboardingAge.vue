<template>
  <div class="question-screen">
    <PremiumGlassCard>
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

      <button
        type="button"
        class="pd-cta dob-submit"
        :disabled="dob.length !== 10"
        @click="onContinue"
      >
        Continuar
      </button>

      <button type="button" class="dob-skip" @click="$emit('skip')">omitir</button>
    </PremiumGlassCard>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { parseDmyToAgeRange } from '../types'
import type { AgeRange } from '../types'
import PremiumGlassCard from 'src/components/PremiumGlassCard.vue'

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
@import 'src/css/premium-card';

.question-screen {
  width: 100%;
  max-width: 380px;
  padding: 0 20px;
}

// Marco, superficie translúcida, línea luminosa y botón `pd-cta`: PremiumGlassCard.
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

// Campo nativo con el look de los q-input del login (mixin `pd-field-native` del partial).
.dob-input {
  @include pd-field-native(1.0625rem);
  letter-spacing: 0.08em;
  text-align: center;
}

.dob-error {
  font-family: 'Geologica', sans-serif;
  font-size: 0.8125rem;
  color: $pd-neg-on-dark;
  margin: 8px 0 0;
  text-align: center;
}

.dob-submit {
  display: block;
  margin-top: 14px;
}

.dob-skip {
  display: block;
  margin: 10px auto 0;
  background: transparent;
  border: none;
  color: $pd-cream-3;
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
