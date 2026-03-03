<script setup lang="ts">
/**
 * AppLandingEcosystem — 4-module overview with progressive unlock flow.
 *
 * Shows all 4 modules as compact preview cards in a grid.
 * Active modules have full opacity + accent border. Proximamente at 0.6 opacity.
 * Arrow indicators between cards show the unlock progression.
 * Card click scrolls to the corresponding module detail section.
 *
 * id="modulos" — anchor target for hero secondary CTA.
 */

import { ecosystemContent, modules } from "~/data/app-landing";

const {
  revealed,
  elementRef: gridRef,
  cleanup,
} = useScrollReveal({ threshold: 0.1 });

onBeforeUnmount(() => {
  cleanup();
});

function scrollToModule(moduleId: string): void {
  const sectionMap: Record<string, string> = {
    arete: "modulo-arete",
    "el-templo": "modulo-el-templo",
    "olympic-academy": "modulo-academy",
    labs: "modulo-labs",
  };
  const targetId = sectionMap[moduleId];
  if (!targetId) return;

  const el = document.getElementById(targetId);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
</script>

<template>
  <section id="modulos" class="app-landing-ecosystem">
    <div class="app-landing-ecosystem__container">
      <h2 class="app-landing-ecosystem__title">
        {{ ecosystemContent.title }}
      </h2>

      <p class="app-landing-ecosystem__subtitle">
        {{ ecosystemContent.subtitle }}
      </p>

      <!-- Module cards grid -->
      <div
        ref="gridRef"
        class="app-landing-ecosystem__grid"
        :class="{ 'is-visible': revealed }"
      >
        <template v-for="(mod, index) in modules" :key="mod.id">
          <!-- Arrow between cards (not before first) -->
          <div
            v-if="index > 0"
            class="app-landing-ecosystem__arrow"
            :style="{
              transitionDelay: revealed ? index * 120 + 'ms' : '0ms',
            }"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
          </div>

          <!-- Module card -->
          <button
            class="app-landing-ecosystem__card"
            :class="[
              `app-landing-ecosystem__card--${mod.id}`,
              {
                'app-landing-ecosystem__card--active': mod.isActive,
                'app-landing-ecosystem__card--proximamente': !mod.isActive,
              },
            ]"
            :style="{
              transitionDelay: revealed ? index * 150 + 'ms' : '0ms',
              borderLeftColor: `var(${mod.accentColor})`,
            }"
            type="button"
            @click="scrollToModule(mod.id)"
          >
            <!-- Icon -->
            <!-- eslint-disable-next-line vue/no-v-html -->
            <span
              class="app-landing-ecosystem__icon"
              :style="{ color: `var(${mod.accentColor})` }"
              v-html="mod.iconPlaceholder"
            />

            <!-- Info -->
            <div class="app-landing-ecosystem__info">
              <h3 class="app-landing-ecosystem__name">{{ mod.name }}</h3>
              <p class="app-landing-ecosystem__tagline">{{ mod.tagline }}</p>
            </div>

            <!-- Badge -->
            <span class="app-landing-ecosystem__badge" :class="mod.badgeClass">
              {{ mod.badgeText }}
            </span>
          </button>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   AppLandingEcosystem — Module Overview Section
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

.app-landing-ecosystem {
  background: var(--color-marble-cream);
  padding: var(--space-hero) 0;
}

.app-landing-ecosystem__container {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 5%;
  text-align: center;
}

/* ------------------------------------------------------------------
   Header
   ------------------------------------------------------------------ */
.app-landing-ecosystem__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-comfortable) 0;
}

.app-landing-ecosystem__subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 20px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  max-width: 560px;
  margin: 0 auto var(--space-section) auto;
}

/* ------------------------------------------------------------------
   Grid — vertical list with arrows between
   ------------------------------------------------------------------ */
.app-landing-ecosystem__grid {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

/* ------------------------------------------------------------------
   Arrow indicator
   ------------------------------------------------------------------ */
.app-landing-ecosystem__arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  color: var(--color-olive-stone);
  opacity: 0;
  transform: translateY(10px);
  transition:
    opacity 400ms ease,
    transform 400ms ease;
}

.app-landing-ecosystem__grid.is-visible .app-landing-ecosystem__arrow {
  opacity: 0.5;
  transform: translateY(0);
}

/* ------------------------------------------------------------------
   Card
   ------------------------------------------------------------------ */
.app-landing-ecosystem__card {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 600px;
  padding: 20px 24px;
  background: var(--color-marble-cream);
  border: 1px solid var(--color-sandy-beige);
  border-left: 3px solid var(--color-warm-stone);
  border-radius: var(--radius-card);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition:
    opacity 500ms ease,
    transform 500ms ease,
    box-shadow var(--transition-base);

  /* Entrance animation base state */
  opacity: 0;
  transform: translateY(20px);
}

.app-landing-ecosystem__grid.is-visible .app-landing-ecosystem__card {
  opacity: 1;
  transform: translateY(0);
}

/* Active state — full opacity, accent border, hover lift */
.app-landing-ecosystem__card--active {
  box-shadow: var(--shadow-subtle);
}

.app-landing-ecosystem__card--active:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-medium);
}

.app-landing-ecosystem__grid.is-visible
  .app-landing-ecosystem__card--active:hover {
  transform: translateY(-2px);
}

/* Proximamente state — reduced opacity */
.app-landing-ecosystem__card--proximamente {
  opacity: 0;
}

.app-landing-ecosystem__grid.is-visible
  .app-landing-ecosystem__card--proximamente {
  opacity: 0.6;
}

.app-landing-ecosystem__grid.is-visible
  .app-landing-ecosystem__card--proximamente:hover {
  opacity: 0.75;
}

/* ------------------------------------------------------------------
   Card Icon
   ------------------------------------------------------------------ */
.app-landing-ecosystem__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
}

/* ------------------------------------------------------------------
   Card Info
   ------------------------------------------------------------------ */
.app-landing-ecosystem__info {
  flex: 1;
  min-width: 0;
}

.app-landing-ecosystem__name {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  margin: 0 0 4px 0;
}

.app-landing-ecosystem__tagline {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-charcoal-mist);
  line-height: 1.4;
  margin: 0;
}

/* ------------------------------------------------------------------
   Badge
   ------------------------------------------------------------------ */
.app-landing-ecosystem__badge {
  flex-shrink: 0;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 4px 10px;
  border-radius: 3px;
  white-space: nowrap;
}

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
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .app-landing-ecosystem {
    padding: var(--space-large) 0;
  }

  .app-landing-ecosystem__title {
    font-size: 28px;
  }

  .app-landing-ecosystem__subtitle {
    font-size: 17px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .app-landing-ecosystem__title {
    font-size: 24px;
  }

  .app-landing-ecosystem__subtitle {
    font-size: 16px;
  }

  .app-landing-ecosystem__card {
    padding: 16px 18px;
    gap: 12px;
  }

  .app-landing-ecosystem__name {
    font-size: 14px;
  }

  .app-landing-ecosystem__tagline {
    font-size: 13px;
  }

  .app-landing-ecosystem__badge {
    font-size: 9px;
    padding: 3px 8px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .app-landing-ecosystem__card,
  .app-landing-ecosystem__arrow {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .app-landing-ecosystem__card--proximamente {
    opacity: 0.6;
  }

  .app-landing-ecosystem__card:hover {
    transform: none;
  }
}
</style>
