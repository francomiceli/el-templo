<script setup lang="ts">
/**
 * SectionLocations — "Encontr&aacute; tu Templo" sede cards section.
 *
 * 8 sede cards grouped by city (MDP 7, BCN 1) with:
 * - PlaceholderBox for images (until real photos arrive)
 * - Special badges: AL AIRE LIBRE (outdoor), RETIRO (special), INTERNACIONAL (intl)
 * - Micro-CTAs: Como llegar (Maps) + Reservar sesion (WhatsApp)
 * - International fallback CTA at bottom
 * - Scroll-triggered staggered entrance animation
 */
import { sedesByCity } from "~/data/sedes";

const { revealed, elementRef: sectionRef, cleanup } = useScrollReveal();

onBeforeUnmount(() => {
  cleanup();
});
</script>

<template>
  <section id="sedes" ref="sectionRef" class="locations">
    <div class="locations__container">
      <!-- Section header -->
      <span class="locations__tag">Sedes</span>

      <h2 class="locations__title">Encontr&aacute; tu Templo.</h2>

      <p class="locations__subtitle">
        8 sedes en Mar del Plata y Barcelona. Cada una con el mismo
        m&eacute;todo, el mismo equipamiento Gladius, y la misma
        filosof&iacute;a.
      </p>

      <!-- GROUP: MAR DEL PLATA -->
      <div class="locations__group">
        <div class="locations__group-header">
          <h3 class="locations__city">Mar del Plata</h3>
          <span class="locations__count">7 sedes</span>
        </div>

        <div
          class="locations__grid locations__grid--mdp"
          :class="{ 'is-visible': revealed }"
        >
          <div
            v-for="(sede, index) in sedesByCity.mdp"
            :key="sede.id"
            class="locations__card"
            :style="{
              transitionDelay: revealed ? index * 80 + 'ms' : '0ms',
            }"
          >
            <div class="locations__card-img">
              <PlaceholderBox :label="sede.name" aspect-ratio="3 / 2" />
              <span
                v-if="sede.badge"
                class="locations__badge"
                :class="`locations__badge--${sede.badge.variant}`"
              >
                {{ sede.badge.text }}
              </span>
            </div>
            <div class="locations__card-body">
              <h4 class="locations__name">{{ sede.name }}</h4>
              <p class="locations__address">{{ sede.address }}</p>
              <div class="locations__separator" />
              <div class="locations__actions">
                <a
                  :href="sede.mapsUrl"
                  class="locations__action locations__action--map"
                  target="_blank"
                  rel="noopener"
                >
                  C&oacute;mo llegar
                </a>
                <a
                  :href="sede.whatsappUrl"
                  class="locations__action locations__action--book"
                >
                  Reservar sesi&oacute;n
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- GROUP: BARCELONA -->
      <div class="locations__group">
        <div class="locations__group-header">
          <h3 class="locations__city">Barcelona</h3>
          <span class="locations__count">1 sede</span>
        </div>

        <div
          class="locations__grid locations__grid--bcn"
          :class="{ 'is-visible': revealed }"
        >
          <div
            v-for="sede in sedesByCity.bcn"
            :key="sede.id"
            class="locations__card"
            :style="{
              transitionDelay: revealed ? '560ms' : '0ms',
            }"
          >
            <div class="locations__card-img">
              <PlaceholderBox :label="sede.name" aspect-ratio="3 / 2" />
              <span
                v-if="sede.badge"
                class="locations__badge"
                :class="`locations__badge--${sede.badge.variant}`"
              >
                {{ sede.badge.text }}
              </span>
            </div>
            <div class="locations__card-body">
              <h4 class="locations__name">{{ sede.name }}</h4>
              <p class="locations__address">{{ sede.address }}</p>
              <div class="locations__separator" />
              <div class="locations__actions">
                <a
                  :href="sede.mapsUrl"
                  class="locations__action locations__action--map"
                  target="_blank"
                  rel="noopener"
                >
                  C&oacute;mo llegar
                </a>
                <a
                  :href="sede.whatsappUrl"
                  class="locations__action locations__action--book"
                >
                  Reservar sesi&oacute;n
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- INTERNATIONAL FALLBACK CTA -->
      <div class="locations__intl-cta">
        <p class="locations__intl-question">
          &iquest;No est&aacute;s en Argentina ni en Espa&ntilde;a?
        </p>
        <p class="locations__intl-sub">
          Con Templo Online entren&aacute;s con el m&eacute;todo desde donde
          est&eacute;s.
        </p>
        <a href="/app" class="btn btn--secondary-azul"> Prob&aacute; la app </a>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   Locations Section — "Encontra tu Templo"
   BEM naming. Token variables only. Never pure black or white.
   8 sede cards grouped by city with badges, CTAs, responsive grid.
   ========================================================================== */

.locations {
  background: var(--color-marble-cream);
  padding: var(--space-hero) 0;
}

.locations__container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Header
   ------------------------------------------------------------------ */
.locations__tag {
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

.locations__title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  text-align: center;
  margin: 0 0 var(--space-comfortable) 0;
}

.locations__subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 20px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  max-width: 650px;
  margin: 0 auto;
  text-align: center;
}

/* ------------------------------------------------------------------
   City Group
   ------------------------------------------------------------------ */
.locations__group {
  margin-top: var(--space-section);
}

.locations__group:first-of-type {
  margin-top: var(--space-large);
}

.locations__group-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-bottom: 1px solid var(--color-warm-stone);
  padding-bottom: 12px;
  margin-bottom: var(--space-comfortable);
}

.locations__city {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 18px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-deep-charcoal);
  margin: 0;
}

.locations__count {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-olive-stone);
}

/* ------------------------------------------------------------------
   Grid — MDP (4 cols desktop, 3 tablet, scroll mobile)
   ------------------------------------------------------------------ */
.locations__grid--mdp {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-comfortable);
}

/* ------------------------------------------------------------------
   Grid — BCN (single card, flex-start)
   ------------------------------------------------------------------ */
.locations__grid--bcn {
  display: flex;
  justify-content: flex-start;
}

.locations__grid--bcn .locations__card {
  max-width: 280px;
}

/* ------------------------------------------------------------------
   Sede Card
   ------------------------------------------------------------------ */
.locations__card {
  background: var(--color-warm-linen);
  border: 1px solid var(--color-warm-stone);
  border-radius: var(--radius-card);
  overflow: hidden;
  box-shadow: var(--shadow-subtle);
  transition: var(--transition-base);

  /* Entrance animation base state */
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 500ms ease,
    transform 500ms ease,
    box-shadow var(--transition-base);
}

.locations__grid.is-visible .locations__card {
  opacity: 1;
  transform: translateY(0);
}

.locations__card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-medium);
}

.locations__grid.is-visible .locations__card:hover {
  transform: translateY(-2px);
}

/* ------------------------------------------------------------------
   Card Image Area (PlaceholderBox wrapper)
   ------------------------------------------------------------------ */
.locations__card-img {
  position: relative;
  overflow: hidden;
}

.locations__card-img :deep(.placeholder-box) {
  border-radius: 0;
  border: none;
}

/* ------------------------------------------------------------------
   Badge (positioned over image area)
   ------------------------------------------------------------------ */
.locations__badge {
  position: absolute;
  bottom: 12px;
  left: 12px;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-marble-cream);
  padding: 4px 10px;
  border-radius: 4px;
  z-index: 1;
}

.locations__badge--outdoor {
  background: var(--color-olive-stone);
}

.locations__badge--special {
  background: var(--color-aged-gold);
}

.locations__badge--intl {
  background: var(--color-azul-noche);
}

/* ------------------------------------------------------------------
   Card Body
   ------------------------------------------------------------------ */
.locations__card-body {
  padding: 20px;
}

.locations__name {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  margin: 0;
}

.locations__address {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 13px;
  color: var(--color-olive-stone);
  margin: 4px 0 0 0;
}

.locations__separator {
  height: 1px;
  background: var(--color-warm-stone);
  margin: 12px 0;
}

/* ------------------------------------------------------------------
   Card Actions (micro-CTAs)
   ------------------------------------------------------------------ */
.locations__actions {
  display: flex;
  gap: 12px;
}

.locations__action {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-decoration: none;
  transition: color var(--transition-base);
}

.locations__action--map {
  color: var(--color-olive-stone);
}

.locations__action--map:hover {
  color: var(--color-terracotta);
}

.locations__action--book {
  color: var(--color-terracotta);
}

.locations__action--book:hover {
  color: var(--color-clay);
}

/* ------------------------------------------------------------------
   International Fallback CTA
   ------------------------------------------------------------------ */
.locations__intl-cta {
  text-align: center;
  padding-top: var(--space-section);
  margin-top: var(--space-spacious);
  border-top: 1px solid var(--color-warm-stone);
}

.locations__intl-question {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 18px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  margin: 0 0 8px 0;
}

.locations__intl-sub {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-style: italic;
  font-size: 15px;
  color: var(--color-olive-stone);
  margin: 0 0 var(--space-comfortable) 0;
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .locations {
    padding: var(--space-large) 0;
  }

  .locations__title {
    font-size: 28px;
  }

  .locations__subtitle {
    font-size: 17px;
  }

  .locations__grid--mdp {
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .locations__title {
    font-size: 24px;
  }

  .locations__subtitle {
    font-size: 16px;
  }

  .locations__grid--mdp {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    gap: 16px;
    padding-bottom: 12px;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .locations__grid--mdp::-webkit-scrollbar {
    display: none;
  }

  .locations__grid--mdp .locations__card {
    min-width: 240px;
    flex-shrink: 0;
    scroll-snap-align: start;
  }

  .locations__grid--bcn {
    justify-content: center;
  }

  .locations__grid--bcn .locations__card {
    max-width: 100%;
    width: 100%;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion — Disable entrance/hover animations
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .locations__card {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .locations__card:hover {
    transform: none;
    box-shadow: var(--shadow-subtle);
  }
}
</style>
