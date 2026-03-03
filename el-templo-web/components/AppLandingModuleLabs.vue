<script setup lang="ts">
/**
 * AppLandingModuleLabs — Labs module detail section.
 *
 * Proximamente module, Azul Noche accent.
 * Reverse split layout: 45% visual / 55% text (visual variety).
 * Content wrapper at opacity 0.6 when !isActive (badge stays full opacity).
 * Dual CTA zone at full opacity: franchisee -> /franquicias, external -> #formulario-labs.
 * Positioning statement inside dimmed wrapper.
 * Data-driven badge rendering based on isActive flag.
 */

import type { AppModule } from "~/data/app-landing";
import { modules } from "~/data/app-landing";

// Safe access with type assertion — modules array is guaranteed to have index 3
const labs = modules[3] as AppModule;

const {
  revealed,
  elementRef: sectionRef,
  cleanup,
} = useScrollReveal({ threshold: 0.1 });

onBeforeUnmount(() => {
  cleanup();
});

function scrollToLabsForm(): void {
  const el = document.getElementById("formulario-labs");
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
</script>

<template>
  <section id="modulo-labs" class="app-landing-module app-landing-module--labs">
    <div
      ref="sectionRef"
      class="app-landing-module__container app-landing-module__container--reverse"
      :class="{ 'is-visible': revealed }"
    >
      <!-- Visual area (placeholder for app screenshot) — first in DOM for reverse layout -->
      <div class="app-landing-module__visual">
        <PlaceholderBox label="Screenshot Labs" aspect-ratio="9/16" />
      </div>

      <!-- Text content -->
      <div class="app-landing-module__text">
        <!-- Dimmed wrapper for proximamente treatment -->
        <div
          class="app-landing-module__content-wrapper"
          :class="{
            'app-landing-module__content-wrapper--dimmed': !labs.isActive,
          }"
        >
          <h2
            class="app-landing-module__title"
            :style="{ color: `var(${labs.accentColor})` }"
          >
            {{ labs.name }}
          </h2>

          <p class="app-landing-module__tagline">
            {{ labs.tagline }}
          </p>

          <p class="app-landing-module__description">
            {{ labs.description }}
          </p>

          <!-- Features -->
          <ul class="app-landing-module__features">
            <li
              v-for="feature in labs.features"
              :key="feature"
              class="app-landing-module__feature"
            >
              <svg
                class="app-landing-module__check"
                :style="{ color: `var(${labs.accentColor})` }"
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="4 9 8 13 14 5" />
              </svg>
              <span>{{ feature }}</span>
            </li>
          </ul>

          <!-- Properties table -->
          <dl class="app-landing-module__properties">
            <div
              v-for="prop in labs.properties"
              :key="prop.label"
              class="app-landing-module__property"
            >
              <dt class="app-landing-module__prop-label">{{ prop.label }}</dt>
              <dd class="app-landing-module__prop-value">
                <template v-if="prop.label === 'Estado'">
                  <span
                    class="app-landing-module__status-badge"
                    :class="labs.badgeClass"
                  >
                    {{ labs.isActive ? "ACTIVO" : labs.badgeText }}
                  </span>
                </template>
                <template v-else>
                  {{ prop.value }}
                </template>
              </dd>
            </div>
          </dl>

          <!-- Positioning statement (inside dimmed wrapper) -->
          <p class="app-landing-module__positioning">
            No compite con enterprise (Mindbody). Naci&oacute; de a&ntilde;os de
            resolver problemas reales: de un garage a una cadena internacional.
          </p>
        </div>

        <!-- Dual CTA zone (outside dimmed wrapper, always full opacity) -->
        <div class="app-landing-module__dual-cta">
          <!-- Franchisee card -->
          <div
            class="app-landing-module__cta-card app-landing-module__cta-card--franchisee"
          >
            <h3 class="app-landing-module__cta-card-title">
              Para Franquiciados
            </h3>
            <p class="app-landing-module__cta-card-text">
              Incluido en tu franquicia
            </p>
            <NuxtLink
              to="/franquicias"
              class="btn btn--ghost app-landing-module__cta-link"
            >
              VER FRANQUICIAS
            </NuxtLink>
          </div>

          <!-- External gym card -->
          <div
            class="app-landing-module__cta-card app-landing-module__cta-card--external"
          >
            <h3 class="app-landing-module__cta-card-title">
              Para Gimnasios Externos
            </h3>
            <p class="app-landing-module__cta-card-text">
              Quiero Labs para mi gimnasio
            </p>
            <button
              type="button"
              class="btn app-landing-module__cta-azul"
              @click="scrollToLabsForm"
            >
              QUIERO LABS PARA MI GIMNASIO
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   AppLandingModuleLabs — Labs Module Detail Section
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

/* ------------------------------------------------------------------
   Labs-specific background
   ------------------------------------------------------------------ */
.app-landing-module--labs {
  background: var(--color-marble-cream);
}

/* ------------------------------------------------------------------
   Section container — shared module base
   ------------------------------------------------------------------ */
.app-landing-module {
  padding: var(--space-hero) 0;
}

.app-landing-module__container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 5%;
  display: grid;
  grid-template-columns: 55% 1fr;
  gap: var(--space-section);
  align-items: center;

  /* Entrance animation */
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 600ms ease,
    transform 600ms ease;
}

/* Reverse layout: 45% visual / 55% text */
.app-landing-module__container--reverse {
  grid-template-columns: 1fr 55%;
}

.app-landing-module__container.is-visible {
  opacity: 1;
  transform: translateY(0);
}

/* ------------------------------------------------------------------
   Content wrapper — dimmed for proximamente modules
   ------------------------------------------------------------------ */
.app-landing-module__content-wrapper--dimmed {
  opacity: 0.6;
}

/* ------------------------------------------------------------------
   Title — Montserrat Bold, colored by module accent
   ------------------------------------------------------------------ */
.app-landing-module__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  line-height: 1.2;
  margin: 0 0 12px 0;
}

/* ------------------------------------------------------------------
   Tagline — Cormorant Garamond italic
   ------------------------------------------------------------------ */
.app-landing-module__tagline {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 20px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  margin: 0 0 var(--space-comfortable) 0;
}

/* ------------------------------------------------------------------
   Description
   ------------------------------------------------------------------ */
.app-landing-module__description {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-deep-charcoal);
  line-height: 1.7;
  margin: 0 0 var(--space-spacious) 0;
}

/* ------------------------------------------------------------------
   Features list
   ------------------------------------------------------------------ */
.app-landing-module__features {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--space-spacious) 0;
}

.app-landing-module__feature {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-deep-charcoal);
  line-height: 1.5;
  padding: 6px 0;
}

.app-landing-module__check {
  flex-shrink: 0;
  margin-top: 2px;
}

/* ------------------------------------------------------------------
   Properties table
   ------------------------------------------------------------------ */
.app-landing-module__properties {
  margin: 0 0 var(--space-comfortable) 0;
  border-top: 1px solid var(--color-sandy-beige);
}

.app-landing-module__property {
  display: flex;
  align-items: baseline;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-sandy-beige);
}

.app-landing-module__prop-label {
  font-family: var(--font-authority);
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-olive-stone);
  flex-shrink: 0;
  width: 100px;
}

.app-landing-module__prop-value {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-deep-charcoal);
  line-height: 1.4;
  margin: 0;
}

/* ------------------------------------------------------------------
   Status badge (inline in properties)
   ------------------------------------------------------------------ */
.app-landing-module__status-badge {
  display: inline-block;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 3px 10px;
  border-radius: 3px;
}

/* Badge color variants (shared with ecosystem) */
.app-landing-badge--terracotta {
  background: var(--color-terracotta);
  color: var(--color-marble-cream);
}

.app-landing-badge--aged-gold {
  background: var(--color-aged-gold);
  color: var(--color-marble-cream);
}

.app-landing-badge--azul-noche {
  background: var(--color-azul-noche);
  color: var(--color-marble-cream);
}

/* ------------------------------------------------------------------
   Positioning statement
   ------------------------------------------------------------------ */
.app-landing-module__positioning {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 15px;
  color: var(--color-olive-stone);
  line-height: 1.6;
  margin: var(--space-comfortable) 0 0 0;
}

/* ------------------------------------------------------------------
   Dual CTA zone (always full opacity)
   ------------------------------------------------------------------ */
.app-landing-module__dual-cta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-comfortable);
  margin-top: var(--space-spacious);
}

.app-landing-module__cta-card {
  display: flex;
  flex-direction: column;
  padding: var(--space-comfortable);
  border-radius: var(--radius-card);
  border: 1px solid var(--color-sandy-beige);
  background: var(--color-warm-linen);
}

.app-landing-module__cta-card-title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-deep-charcoal);
  margin: 0 0 8px 0;
}

.app-landing-module__cta-card-text {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  margin: 0 0 var(--space-comfortable) 0;
  flex: 1;
}

.app-landing-module__cta-link {
  align-self: flex-start;
}

/* Azul Noche CTA for external gyms */
.app-landing-module__cta-azul {
  background: var(--color-azul-noche);
  color: var(--color-marble-cream);
  font-weight: 600;
  font-size: 12px;
  padding: 12px 20px;
  align-self: flex-start;
}

.app-landing-module__cta-azul:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* ------------------------------------------------------------------
   Visual area
   ------------------------------------------------------------------ */
.app-landing-module__visual {
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-landing-module__visual :deep(.placeholder-box) {
  max-width: 280px;
  width: 100%;
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .app-landing-module {
    padding: var(--space-large) 0;
  }

  .app-landing-module__container,
  .app-landing-module__container--reverse {
    grid-template-columns: 1fr;
    gap: var(--space-spacious);
  }

  .app-landing-module__title {
    font-size: 28px;
  }

  .app-landing-module__tagline {
    font-size: 18px;
  }

  /* On mobile, text first, visual second — regardless of reverse */
  .app-landing-module__visual {
    order: 1;
  }

  .app-landing-module__text {
    order: 0;
  }

  .app-landing-module__visual :deep(.placeholder-box) {
    max-width: 220px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .app-landing-module__title {
    font-size: 24px;
  }

  .app-landing-module__tagline {
    font-size: 16px;
  }

  .app-landing-module__description {
    font-size: 14px;
  }

  .app-landing-module__feature {
    font-size: 14px;
  }

  .app-landing-module__prop-label {
    width: 80px;
    font-size: 11px;
  }

  .app-landing-module__prop-value {
    font-size: 13px;
  }

  /* Stack dual CTA cards on mobile */
  .app-landing-module__dual-cta {
    grid-template-columns: 1fr;
  }

  .app-landing-module__cta-azul {
    font-size: 11px;
    padding: 10px 16px;
  }

  .app-landing-module__visual :deep(.placeholder-box) {
    max-width: 180px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .app-landing-module__container {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
