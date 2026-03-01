<script setup lang="ts">
/**
 * SectionFaq — Accordion FAQ section eliminating final objections.
 *
 * 9 Q&A pairs with only-one-open-at-a-time accordion behavior.
 * First item open by default. CSS max-height + opacity animation.
 * Icon rotates + to x-like via 45deg transform.
 * ARIA: aria-expanded on buttons, role="region" on answers.
 */

import { faqItems } from "~/data/faq";

const openIndex = ref(0);

function toggle(index: number): void {
  openIndex.value = openIndex.value === index ? -1 : index;
}
</script>

<template>
  <section id="faq" class="faq">
    <div class="faq__container">
      <!-- Section header -->
      <span class="faq__tag">FAQ</span>
      <h2 class="faq__title">LO QUE TODOS PREGUNTAN.</h2>

      <!-- Accordion -->
      <div class="faq__accordion">
        <div
          v-for="(item, index) in faqItems"
          :key="index"
          class="faq__item"
          :class="{ 'faq__item--active': openIndex === index }"
        >
          <button
            class="faq__question"
            :aria-expanded="openIndex === index ? 'true' : 'false'"
            @click="toggle(index)"
          >
            <span>{{ item.question }}</span>
            <span class="faq__icon">+</span>
          </button>
          <div class="faq__answer" role="region" :hidden="openIndex !== index">
            <p>{{ item.answer }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   FAQ Section — Accordion
   BEM naming. Token variables only. Never pure black or white.
   Marble Cream background. Max-width 800px centered.
   ========================================================================== */

.faq {
  background: var(--color-marble-cream);
  padding: 80px 0;
}

.faq__container {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Header
   ------------------------------------------------------------------ */
.faq__tag {
  display: block;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--color-terracotta);
  text-align: center;
  margin-bottom: var(--space-base);
}

.faq__title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 32px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  text-align: center;
  margin: 0 0 var(--space-large) 0;
}

/* ------------------------------------------------------------------
   Accordion Items
   ------------------------------------------------------------------ */
.faq__item {
  border-bottom: 1px solid var(--color-warm-stone);
}

/* ------------------------------------------------------------------
   Question (trigger button)
   ------------------------------------------------------------------ */
.faq__question {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: none;
  border: none;
  padding: 20px 0;
  cursor: pointer;
  font-family: var(--font-authority);
  font-weight: 600;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  text-align: left;
  transition: color var(--transition-base);
}

.faq__question:hover {
  color: var(--color-terracotta);
}

/* ------------------------------------------------------------------
   Icon (+/x toggle via rotation)
   ------------------------------------------------------------------ */
.faq__icon {
  font-family: var(--font-authority);
  font-weight: 300;
  font-size: 24px;
  color: var(--color-terracotta);
  transition: transform 300ms ease;
  flex-shrink: 0;
  margin-left: 16px;
}

.faq__item--active .faq__icon {
  transform: rotate(45deg);
}

/* ------------------------------------------------------------------
   Answer (animated via max-height + opacity)
   ------------------------------------------------------------------ */
.faq__answer {
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  transition:
    max-height 400ms ease,
    opacity 300ms ease;
}

.faq__item--active .faq__answer {
  max-height: 500px;
  opacity: 1;
}

.faq__answer p {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-charcoal-mist);
  line-height: 1.6;
  padding: 0 0 20px 0;
  margin: 0;
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .faq {
    padding: 64px 0;
  }

  .faq__title {
    font-size: 24px;
  }

  .faq__question {
    font-size: 14px;
  }

  .faq__answer p {
    font-size: 14px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion — Disable transition animations
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .faq__icon {
    transition: none;
  }

  .faq__answer {
    transition: none;
  }
}
</style>
