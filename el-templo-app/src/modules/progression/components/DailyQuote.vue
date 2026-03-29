<template>
  <div class="daily-quote">
    <div class="daily-quote__line"></div>
    <div class="daily-quote__body">
      <p class="daily-quote__text">{{ quoteText }}</p>
      <span class="daily-quote__author">— {{ quote.author }}</span>
    </div>
    <div class="daily-quote__line"></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { QUOTES } from 'src/modules/training/data/quotes'

/** Pick a quote deterministically based on the day of the year */
const quote = computed(() => {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000)
  return QUOTES[dayOfYear % QUOTES.length]
})

/** Clean up the quote text — remove curly quotes and combine text+goldText */
const quoteText = computed(() => {
  const full = (quote.value.text + quote.value.goldText).replace(/[\u201C\u201D]/g, '').trim()
  return `\u201C${full}\u201D`
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.daily-quote {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 16px 24px;
  gap: 12px;
}

.daily-quote__line {
  width: 40px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba($secondary, 0.4), transparent);
}

.daily-quote__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
}

.daily-quote__text {
  font-family: 'Cormorant Garamond', serif;
  font-size: 16px;
  font-style: italic;
  font-weight: 600;
  color: $primary;
  line-height: 1.6;
  margin: 0;
  max-width: 320px;
}

.daily-quote__author {
  font-family: 'Montserrat', sans-serif;
  font-size: 11px;
  font-weight: 700;
  color: rgba($secondary, 0.6);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
</style>
