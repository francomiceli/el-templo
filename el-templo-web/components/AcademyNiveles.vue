<script setup lang="ts">
/**
 * AcademyNiveles — "TRES NIVELES. UN CAMINO." section.
 *
 * 3 certification level cards: Nivel 1 active (Terracotta border, hover),
 * Niveles 2-3 dimmed with "Próximamente" badges.
 * Marble Cream background.
 */

import { certificationLevels } from "~/data/academy";

const {
  revealed: cardsRevealed,
  elementRef: cardsRef,
  cleanup: cardsCleanup,
} = useScrollReveal();

onBeforeUnmount(() => {
  cardsCleanup();
});
</script>

<template>
  <section id="niveles-academy" class="academy-niveles">
    <div class="academy-niveles__container">
      <!-- Title -->
      <h2 class="academy-niveles__title">TRES NIVELES. UN CAMINO.</h2>

      <!-- Subtitle -->
      <p class="academy-niveles__subtitle">
        La formaci&oacute;n de Olympic Academy est&aacute; dise&ntilde;ada en
        tres niveles progresivos. Cada nivel profundiza el conocimiento,
        ampl&iacute;a tus herramientas y te acerca m&aacute;s al dominio
        completo del m&eacute;todo.
      </p>

      <!-- Cards -->
      <div
        ref="cardsRef"
        class="academy-niveles__cards"
        :class="{ 'is-visible': cardsRevealed }"
      >
        <div
          v-for="(level, index) in certificationLevels"
          :key="level.id"
          class="academy-niveles__card"
          :class="{
            'academy-niveles__card--active': level.active,
            'academy-niveles__card--upcoming': !level.active,
          }"
          :style="{
            transitionDelay: cardsRevealed ? index * 150 + 'ms' : '0ms',
          }"
        >
          <!-- Próximamente badge -->
          <span
            v-if="!level.active"
            class="academy-niveles__badge"
            :style="{
              backgroundColor:
                level.badgeColor?.startsWith('--')
                  ? `var(${level.badgeColor})`
                  : level.badgeColor,
            }"
          >
            Pr&oacute;ximamente
          </span>

          <!-- Card content -->
          <h3 class="academy-niveles__card-name">{{ level.name }}</h3>
          <p class="academy-niveles__card-cert">{{ level.certName }}</p>
          <p class="academy-niveles__card-tagline">{{ level.tagline }}</p>
          <p class="academy-niveles__card-desc">{{ level.description }}</p>

          <!-- Details table -->
          <div class="academy-niveles__details">
            <div
              v-for="(value, key) in level.details"
              :key="key"
              class="academy-niveles__detail"
            >
              <span class="academy-niveles__detail-label">{{ key }}</span>
              <span
                class="academy-niveles__detail-value"
                :class="{
                  'academy-niveles__detail-value--emphasis':
                    !level.active &&
                    String(key)
                      .toLowerCase()
                      .includes('requisitos'),
                }"
              >
                {{ value }}
              </span>
            </div>
          </div>

          <!-- CTA for active level -->
          <a
            v-if="level.active"
            href="#formulario-academy"
            class="academy-niveles__cta"
          >
            QUIERO FORMARME
          </a>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   AcademyNiveles — Certification Level Cards
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

.academy-niveles {
  background: var(--color-marble-cream);
  padding: var(--space-hero) 0;
}

.academy-niveles__container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Title + Subtitle
   ------------------------------------------------------------------ */
.academy-niveles__title {
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

.academy-niveles__subtitle {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  margin: 0 0 var(--space-spacious) 0;
  text-align: center;
  max-width: 700px;
  margin-left: auto;
  margin-right: auto;
}

/* ------------------------------------------------------------------
   Cards Grid
   ------------------------------------------------------------------ */
.academy-niveles__cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-comfortable);
}

/* ------------------------------------------------------------------
   Card Base
   ------------------------------------------------------------------ */
.academy-niveles__card {
  position: relative;
  background: var(--color-marble-cream);
  border-radius: var(--radius-base);
  padding: var(--space-spacious);
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 500ms ease,
    transform 500ms ease;
}

.is-visible .academy-niveles__card {
  opacity: 1;
  transform: translateY(0);
}

/* Active card (Nivel 1) */
.academy-niveles__card--active {
  border: 1px solid var(--color-terracotta);
  transition:
    opacity 500ms ease,
    transform 500ms ease,
    box-shadow 0.2s ease;
}

.academy-niveles__card--active:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-medium);
}

.is-visible .academy-niveles__card--active:hover {
  transform: translateY(-4px);
}

/* Upcoming cards (Niveles 2-3) */
.academy-niveles__card--upcoming {
  border: 1px solid var(--color-warm-stone);
}

.is-visible .academy-niveles__card--upcoming {
  opacity: 0.6;
}

/* ------------------------------------------------------------------
   Badge
   ------------------------------------------------------------------ */
.academy-niveles__badge {
  position: absolute;
  top: 16px;
  right: 16px;
  font-family: var(--font-clarity);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-marble-cream);
  padding: 4px 12px;
  border-radius: 4px;
}

/* ------------------------------------------------------------------
   Card Content
   ------------------------------------------------------------------ */
.academy-niveles__card-name {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 22px;
  color: var(--color-deep-charcoal);
  margin: 0 0 4px 0;
}

.academy-niveles__card-cert {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 14px;
  color: var(--color-olive-stone);
  margin: 0 0 var(--space-tight) 0;
}

.academy-niveles__card-tagline {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  margin: 0 0 var(--space-base) 0;
}

.academy-niveles__card-desc {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  margin: 0 0 var(--space-comfortable) 0;
}

/* ------------------------------------------------------------------
   Details Table
   ------------------------------------------------------------------ */
.academy-niveles__details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: var(--space-comfortable);
}

.academy-niveles__detail {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.academy-niveles__detail-label {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-olive-stone);
}

.academy-niveles__detail-value {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-deep-charcoal);
  line-height: 1.4;
}

.academy-niveles__detail-value--emphasis {
  font-weight: 600;
  color: var(--color-deep-charcoal);
}

/* ------------------------------------------------------------------
   CTA (ghost button)
   ------------------------------------------------------------------ */
.academy-niveles__cta {
  display: inline-block;
  font-family: var(--font-clarity);
  font-weight: 600;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-terracotta);
  border: 1px solid var(--color-terracotta);
  border-radius: var(--radius-base);
  padding: 10px 24px;
  text-decoration: none;
  transition:
    background 0.2s ease,
    color 0.2s ease;
  margin-top: var(--space-tight);
}

.academy-niveles__cta:hover {
  background: var(--color-terracotta);
  color: var(--color-marble-cream);
}

/* ------------------------------------------------------------------
   Tablet
   ------------------------------------------------------------------ */
@media (max-width: 1024px) {
  .academy-niveles__cards {
    grid-template-columns: 1fr;
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
  }
}

@media (max-width: 768px) {
  .academy-niveles {
    padding: var(--space-large) 0;
  }

  .academy-niveles__title {
    font-size: 28px;
  }
}

/* ------------------------------------------------------------------
   Mobile
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .academy-niveles__title {
    font-size: 24px;
  }

  .academy-niveles__card {
    padding: var(--space-comfortable);
  }

  .academy-niveles__card-name {
    font-size: 20px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .academy-niveles__card {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .is-visible .academy-niveles__card--upcoming {
    opacity: 0.6;
  }

  .academy-niveles__card--active:hover {
    transform: none;
  }
}
</style>
