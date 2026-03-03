<script setup lang="ts">
/**
 * AppLandingModuleArete — Arete module detail section.
 *
 * Freemium module, active state, Terracotta accent.
 * Split layout: 55% text / 45% visual placeholder.
 * NO download CTA here per spec (reserved for hero, El Templo, download only).
 * Data-driven badge rendering based on isActive flag.
 */

import type { AppModule } from "~/data/app-landing";
import { modules } from "~/data/app-landing";

// Safe access with fallback — modules array is guaranteed to have index 0
const arete = modules[0] as AppModule;

const {
  revealed,
  elementRef: sectionRef,
  cleanup,
} = useScrollReveal({ threshold: 0.1 });

onBeforeUnmount(() => {
  cleanup();
});
</script>

<template>
  <section
    id="modulo-arete"
    class="app-landing-module app-landing-module--arete"
  >
    <div
      ref="sectionRef"
      class="app-landing-module__container"
      :class="{ 'is-visible': revealed }"
    >
      <!-- Text content -->
      <div class="app-landing-module__text">
        <h2
          class="app-landing-module__title"
          :style="{ color: `var(${arete.accentColor})` }"
        >
          {{ arete.name }}
        </h2>

        <p class="app-landing-module__tagline">
          {{ arete.tagline }}
        </p>

        <p class="app-landing-module__description">
          {{ arete.description }}
        </p>

        <!-- Features -->
        <ul class="app-landing-module__features">
          <li
            v-for="feature in arete.features"
            :key="feature"
            class="app-landing-module__feature"
          >
            <svg
              class="app-landing-module__check"
              :style="{ color: `var(${arete.accentColor})` }"
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
            v-for="prop in arete.properties"
            :key="prop.label"
            class="app-landing-module__property"
          >
            <dt class="app-landing-module__prop-label">{{ prop.label }}</dt>
            <dd class="app-landing-module__prop-value">
              <template v-if="prop.label === 'Estado'">
                <span
                  class="app-landing-module__status-badge"
                  :class="arete.badgeClass"
                >
                  {{ arete.isActive ? "ACTIVO" : arete.badgeText }}
                </span>
              </template>
              <template v-else>
                {{ prop.value }}
              </template>
            </dd>
          </div>
        </dl>
      </div>

      <!-- Visual area (placeholder for app screenshot) -->
      <div class="app-landing-module__visual">
        <PlaceholderBox label="Screenshot Aret&#x113;" aspect-ratio="9/16" />
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   AppLandingModule — Module Detail Section (shared base styles)
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

/* ------------------------------------------------------------------
   Arete-specific background
   ------------------------------------------------------------------ */
.app-landing-module--arete {
  background: var(--color-warm-linen);
}

/* ------------------------------------------------------------------
   Section container — split layout
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

.app-landing-module__container.is-visible {
  opacity: 1;
  transform: translateY(0);
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
  margin: 0;
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

/* ------------------------------------------------------------------
   Visual area
   ------------------------------------------------------------------ */
.app-landing-module__visual {
  display: flex;
  align-items: center;
  justify-content: flex-end;
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

  .app-landing-module__container {
    grid-template-columns: 1fr;
    gap: var(--space-spacious);
  }

  .app-landing-module__title {
    font-size: 28px;
  }

  .app-landing-module__tagline {
    font-size: 18px;
  }

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
