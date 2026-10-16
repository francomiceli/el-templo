<template>
  <section
    ref="root"
    class="daily-quote"
    :class="{ 'daily-quote--on': isVisible }"
    aria-label="Frase del día"
  >
    <p class="daily-quote__text">
      <span class="sr-only">{{ fullText }}</span>
      <span
        v-for="(w, i) in words"
        :key="i"
        class="daily-quote__w"
        :class="{ 'daily-quote__w--gold': w.gold }"
        :style="{ animationDelay: delayFor(i) }"
        aria-hidden="true"
        >{{ w.text }}</span
      >
    </p>
    <p class="daily-quote__author" :style="{ transitionDelay: authorDelay }">
      {{ quote.author }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { quoteOfTheDay } from 'src/modules/training/data/quotes'
import { useUserStore } from 'src/stores/useUserStore'
import { DEFAULT_BRANCH_TZ, todayInTz } from 'src/utils/tz'
import { useInViewport } from 'src/composables/useInViewport'

/** Escalón entre palabras (s) */
const WORD_STEP_S = 0.09

const userStore = useUserStore()
const tz = computed(() => userStore.profile?.branchTimezone ?? DEFAULT_BRANCH_TZ)
/** Frase del día en la zona de la sede (estable todo el día de la sede) */
const quote = computed(() => quoteOfTheDay(todayInTz(tz.value)))

/** Palabras con su espacio final (`split` con lookbehind), marcando los tramos dorados */
const words = computed(() =>
  quote.value.segments.flatMap((s) =>
    s.text
      .split(/(?<=\s)/)
      .filter(Boolean)
      .map((text) => ({ text, gold: s.gold === true })),
  ),
)
const fullText = computed(() => quote.value.segments.map((s) => s.text).join(''))

function delayFor(i: number): string {
  return `${(i * WORD_STEP_S).toFixed(2)}s`
}
/** El autor aparece cuando termina la última palabra */
const authorDelay = computed(() => delayFor(words.value.length))

const root = ref<HTMLElement | null>(null)
const { isVisible, observe, cleanup } = useInViewport({ threshold: 0.4, once: true })

onMounted(() => observe(root.value))
onUnmounted(() => cleanup())
</script>

<style scoped lang="scss">
.daily-quote {
  position: relative;
  margin: 8px 0 0;
  padding: 20px 8px 28px;
  text-align: left;
}

.daily-quote__text {
  margin: 0;
  font:
    700 21px/1.5 'Cinzel',
    Georgia,
    serif;
  text-transform: uppercase;
  color: #3d3732;
}

.daily-quote__w {
  display: inline-block;
  white-space: pre;
  opacity: 0;
  transform: translateY(0.14em);
}

.daily-quote__w--gold {
  color: #96593a;
}

.daily-quote--on .daily-quote__w {
  animation: palabraEntra 0.55s ease forwards;
}

@keyframes palabraEntra {
  to {
    opacity: 1;
    transform: none;
  }
}

.daily-quote__author {
  margin: 18px 0 0;
  font:
    700 11px 'Nunito Sans',
    system-ui;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: #5c5347;
  opacity: 0;
  transition: opacity 0.9s ease;
}

.daily-quote--on .daily-quote__author {
  opacity: 1;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .daily-quote__w {
    opacity: 1;
    transform: none;
    animation: none !important;
  }

  .daily-quote__author {
    opacity: 1;
    transition: none;
  }
}
</style>
