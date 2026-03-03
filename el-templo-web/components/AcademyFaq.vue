<script setup lang="ts">
/**
 * AcademyFaq — "PREGUNTAS FRECUENTES" section.
 *
 * 8 FAQ items in accordion with single-open behavior,
 * chevron rotation, ARIA attributes.
 * Warm Stone background.
 */

import { academyFaqItems } from "~/data/academy";

const openIndex = ref(0);

function toggle(index: number): void {
  openIndex.value = openIndex.value === index ? -1 : index;
}
</script>

<template>
  <section id="faq-academy" class="academy-faq">
    <div class="academy-faq__container">
      <!-- Title -->
      <h2 class="academy-faq__title">PREGUNTAS FRECUENTES</h2>

      <!-- Accordion -->
      <div class="academy-faq__accordion">
        <div
          v-for="(item, index) in academyFaqItems"
          :key="index"
          class="academy-faq__item"
        >
          <button
            class="academy-faq__trigger"
            :aria-expanded="openIndex === index"
            :aria-controls="`faq-panel-${index}`"
            @click="toggle(index)"
          >
            <span class="academy-faq__trigger-text">{{ item.question }}</span>
            <svg
              class="academy-faq__icon"
              :class="{ 'academy-faq__icon--open': openIndex === index }"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M6 3l5 5-5 5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <div
            :id="`faq-panel-${index}`"
            role="region"
            class="academy-faq__panel"
            :class="{ 'academy-faq__panel--open': openIndex === index }"
            :hidden="openIndex !== index"
          >
            <div class="academy-faq__panel-content">
              <p>{{ item.answer }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   AcademyFaq — FAQ Accordion Section
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

.academy-faq {
  background: var(--color-warm-stone);
  padding: var(--space-hero) 0;
}

.academy-faq__container {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Title
   ------------------------------------------------------------------ */
.academy-faq__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-spacious) 0;
  text-align: center;
}

/* ------------------------------------------------------------------
   Accordion
   ------------------------------------------------------------------ */
.academy-faq__accordion {
  border-top: 1px solid var(--color-sandy-beige);
}

.academy-faq__item {
  border-bottom: 1px solid var(--color-sandy-beige);
}

/* ------------------------------------------------------------------
   Trigger Button
   ------------------------------------------------------------------ */
.academy-faq__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 16px 0;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  min-height: 44px;
}

.academy-faq__trigger-text {
  font-family: var(--font-clarity);
  font-weight: 600;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  line-height: 1.4;
}

/* ------------------------------------------------------------------
   Chevron Icon
   ------------------------------------------------------------------ */
.academy-faq__icon {
  flex-shrink: 0;
  color: var(--color-olive-stone);
  transition: transform 0.3s ease;
  margin-left: 16px;
}

.academy-faq__icon--open {
  transform: rotate(90deg);
}

/* ------------------------------------------------------------------
   Panel (Collapsible Content)
   ------------------------------------------------------------------ */
.academy-faq__panel {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition:
    max-height 0.3s ease,
    opacity 0.3s ease;
}

.academy-faq__panel--open {
  max-height: 300px;
  opacity: 1;
}

.academy-faq__panel-content {
  padding: 0 0 16px 0;
}

.academy-faq__panel-content p {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  margin: 0;
}

/* ------------------------------------------------------------------
   Tablet
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .academy-faq {
    padding: var(--space-large) 0;
  }

  .academy-faq__title {
    font-size: 28px;
  }
}

/* ------------------------------------------------------------------
   Mobile
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .academy-faq__title {
    font-size: 24px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .academy-faq__icon {
    transition: none;
  }

  .academy-faq__panel {
    transition: none;
  }
}
</style>
