<script setup lang="ts">
/**
 * AcademyPrograma — "QUÉ VAS A APRENDER." section.
 *
 * 7-module accordion with single-open behavior, chevron rotation,
 * max-height + opacity animation, ARIA attributes.
 * Warm Stone background.
 */

import { programModules } from "~/data/academy";

const openIndex = ref(0);

function toggle(index: number): void {
  openIndex.value = openIndex.value === index ? -1 : index;
}
</script>

<template>
  <section id="programa-academy" class="academy-programa">
    <div class="academy-programa__container">
      <!-- Title -->
      <h2 class="academy-programa__title">QU&Eacute; VAS A APRENDER.</h2>

      <!-- Subtitle -->
      <p class="academy-programa__subtitle">
        Un programa intensivo que cubre todo lo que necesit&aacute;s para
        convertirte en entrenador profesional de calistenia.
      </p>

      <!-- Accordion -->
      <div class="academy-programa__accordion">
        <div
          v-for="(mod, index) in programModules"
          :key="mod.id"
          class="academy-programa__item"
        >
          <button
            class="academy-programa__trigger"
            :aria-expanded="openIndex === index"
            :aria-controls="`programa-panel-${mod.id}`"
            @click="toggle(index)"
          >
            <span class="academy-programa__trigger-text">
              {{ mod.number }}. {{ mod.title }}
            </span>
            <svg
              class="academy-programa__icon"
              :class="{ 'academy-programa__icon--open': openIndex === index }"
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
            :id="`programa-panel-${mod.id}`"
            role="region"
            class="academy-programa__panel"
            :class="{ 'academy-programa__panel--open': openIndex === index }"
            :hidden="openIndex !== index"
          >
            <div class="academy-programa__panel-content">
              <p>{{ mod.description }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer note -->
      <p class="academy-programa__note">
        El programa se expande y actualiza con cada edici&oacute;n. Los
        m&oacute;dulos listados representan el n&uacute;cleo formativo del Nivel
        1.
      </p>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   AcademyPrograma — Curriculum Accordion
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

.academy-programa {
  background: var(--color-warm-stone);
  padding: var(--space-hero) 0;
}

.academy-programa__container {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Title + Subtitle
   ------------------------------------------------------------------ */
.academy-programa__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-base) 0;
  text-align: center;
}

.academy-programa__subtitle {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  margin: 0 0 var(--space-spacious) 0;
  text-align: center;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

/* ------------------------------------------------------------------
   Accordion
   ------------------------------------------------------------------ */
.academy-programa__accordion {
  border-top: 1px solid var(--color-sandy-beige);
}

.academy-programa__item {
  border-bottom: 1px solid var(--color-sandy-beige);
}

/* ------------------------------------------------------------------
   Trigger Button
   ------------------------------------------------------------------ */
.academy-programa__trigger {
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

.academy-programa__trigger-text {
  font-family: var(--font-clarity);
  font-weight: 600;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  line-height: 1.4;
}

/* ------------------------------------------------------------------
   Chevron Icon
   ------------------------------------------------------------------ */
.academy-programa__icon {
  flex-shrink: 0;
  color: var(--color-olive-stone);
  transition: transform 0.3s ease;
  margin-left: 16px;
}

.academy-programa__icon--open {
  transform: rotate(90deg);
}

/* ------------------------------------------------------------------
   Panel (Collapsible Content)
   ------------------------------------------------------------------ */
.academy-programa__panel {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition:
    max-height 0.3s ease,
    opacity 0.3s ease;
}

.academy-programa__panel--open {
  max-height: 300px;
  opacity: 1;
}

.academy-programa__panel-content {
  padding: 0 0 16px 0;
}

.academy-programa__panel-content p {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  margin: 0;
}

/* ------------------------------------------------------------------
   Footer Note
   ------------------------------------------------------------------ */
.academy-programa__note {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-olive-stone);
  line-height: 1.5;
  margin: var(--space-spacious) 0 0 0;
  text-align: center;
  font-style: italic;
}

/* ------------------------------------------------------------------
   Tablet
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .academy-programa {
    padding: var(--space-large) 0;
  }

  .academy-programa__title {
    font-size: 28px;
  }
}

/* ------------------------------------------------------------------
   Mobile
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .academy-programa__title {
    font-size: 24px;
  }

  .academy-programa__subtitle {
    font-size: 15px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .academy-programa__icon {
    transition: none;
  }

  .academy-programa__panel {
    transition: none;
  }
}
</style>
