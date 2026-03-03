<script setup lang="ts">
/**
 * SectionConversion — "Descubr&iacute; tu nivel" dual-path conversion section.
 *
 * Two conversion paths:
 * 1. Presencial — Try in person (WhatsApp CTA, Terracotta)
 * 2. App — Try online (/app internal link, Azul Noche)
 *
 * Target of Hero CTA (#descubri-nivel) and SectionLevels ghost CTAs.
 * Scroll-triggered staggered entrance on cards.
 */

interface ConversionPath {
  id: string;
  title: string;
  description: string;
  sentence: string;
  ctaText: string;
  ctaHref: string;
  ctaClass: string;
  iconSvg: string;
}

const paths: ConversionPath[] = [
  {
    id: "presencial",
    title: "Ven\u00ED a sentirlo en persona",
    description:
      "Reserv\u00E1 tu primera sesi\u00F3n sin cargo en cualquiera de nuestras 8 sedes. Un entrenador te eval\u00FAa, te asigna tu nivel y te muestra c\u00F3mo funciona el m\u00E9todo en vivo. No hay mejor forma de conocer El Templo que entrenando.",
    sentence: "Tu cuerpo lo entiende m\u00E1s r\u00E1pido que tu cabeza.",
    ctaText: "Reserv\u00E1 tu sesi\u00F3n",
    ctaHref:
      "https://wa.me/5492235820521?text=Hola%21%20Quiero%20reservar%20mi%20primera%20sesi%C3%B3n%20de%20prueba",
    ctaClass: "btn btn--primary",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M24 6L8 18h32L24 6z" /><line x1="12" y1="18" x2="12" y2="34" /><line x1="20" y1="18" x2="20" y2="34" /><line x1="28" y1="18" x2="28" y2="34" /><line x1="36" y1="18" x2="36" y2="34" /><line x1="6" y1="34" x2="42" y2="34" /><circle cx="17" cy="40" r="2.5" /><circle cx="31" cy="40" r="2.5" /></svg>`,
  },
  {
    id: "app",
    title: "Prob\u00E1 tu nivel desde donde est\u00E9s",
    description:
      "Descarg\u00E1 Templo Online y el sistema te gu\u00EDa. Te propone ejercicios por nivel \u2014 si los super\u00E1s, sube la dificultad. Si te cuestan, ah\u00ED est\u00E1 tu punto de partida. En minutos sab\u00E9s d\u00F3nde est\u00E1s y hacia d\u00F3nde vas.",
    sentence: "No necesit\u00E1s llegar sabiendo. Solo necesit\u00E1s empezar.",
    ctaText: "Prob\u00E1 la app",
    ctaHref: "/app",
    ctaClass: "btn btn--secondary-azul",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="14" y="4" width="20" height="40" rx="3" /><line x1="14" y1="10" x2="34" y2="10" /><line x1="14" y1="38" x2="34" y2="38" /><circle cx="24" cy="42" r="1.5" /><polygon points="21,20 21,30 30,25" /></svg>`,
  },
];

const { revealed, elementRef: gridRef, cleanup } = useScrollReveal();

const { trackEvent } = useAnalytics();

function handleCtaClick(pathId: string): void {
  if (pathId === "presencial") {
    trackEvent("click_cta_trial");
  } else if (pathId === "app") {
    trackEvent("click_cta_app");
  }
}

onBeforeUnmount(() => {
  cleanup();
});
</script>

<template>
  <section id="descubri-nivel" class="discover">
    <div class="discover__container">
      <!-- Section header -->
      <span class="discover__tag">Tu nivel</span>

      <h2 class="discover__title">Descubr&iacute; tu nivel de calistenia.</h2>

      <p class="discover__subtitle">
        Descubr&iacute; tu nivel. Pod&eacute;s probarlo en nuestra app desde
        donde est&eacute;s, o ven&iacute; a una sesi&oacute;n y un entrenador te
        eval&uacute;a en persona.
      </p>

      <!-- Dual-path cards grid -->
      <div
        ref="gridRef"
        class="discover__grid"
        :class="{ 'is-visible': revealed }"
      >
        <div
          v-for="(path, index) in paths"
          :key="path.id"
          class="discover__card"
          :class="`discover__card--${path.id}`"
          :style="{
            transitionDelay: revealed ? index * 150 + 'ms' : '0ms',
          }"
        >
          <!-- eslint-disable-next-line vue/no-v-html -->
          <span class="discover__icon" v-html="path.iconSvg" />

          <h3 class="discover__card-title">{{ path.title }}</h3>

          <p class="discover__card-desc">{{ path.description }}</p>

          <p class="discover__card-sentence">{{ path.sentence }}</p>

          <NuxtLink
            v-if="path.id === 'app'"
            :to="path.ctaHref"
            :class="path.ctaClass + ' discover__cta'"
            @click="handleCtaClick(path.id)"
          >
            {{ path.ctaText }}
          </NuxtLink>
          <a
            v-else
            :href="path.ctaHref"
            :class="path.ctaClass + ' discover__cta'"
            @click="handleCtaClick(path.id)"
          >
            {{ path.ctaText }}
          </a>

          <p v-if="path.id === 'app'" class="discover__app-note">
            Pr&oacute;ximamente tambi&eacute;n en Google Play y App Store.
          </p>
        </div>
      </div>

      <!-- Complementary note -->
      <p class="discover__note">
        Tu primera sesi&oacute;n es sin cargo. La app es gratuita.
      </p>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   Conversion Section — "Descubri tu nivel"
   BEM naming. Token variables only. Never pure black or white.
   Dual-path conversion: Presencial (Terracotta) + App (Azul Noche).
   ========================================================================== */

.discover {
  background: var(--color-warm-stone);
  padding: var(--space-hero) 0;
}

.discover__container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 5%;
  text-align: center;
}

/* ------------------------------------------------------------------
   Header
   ------------------------------------------------------------------ */
.discover__tag {
  display: block;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--color-terracotta);
  margin-bottom: var(--space-base);
}

.discover__title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-comfortable) 0;
}

.discover__subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 20px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  max-width: 600px;
  margin: 0 auto var(--space-section) auto;
}

/* ------------------------------------------------------------------
   Cards Grid
   ------------------------------------------------------------------ */
.discover__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}

/* ------------------------------------------------------------------
   Card
   ------------------------------------------------------------------ */
.discover__card {
  display: flex;
  flex-direction: column;
  background: var(--color-marble-cream);
  border: 1px solid var(--color-sandy-beige);
  border-radius: 8px;
  padding: 40px 32px;
  box-shadow: 0 4px 20px rgba(61, 55, 50, 0.08);
  transition: var(--transition-base);

  /* Entrance animation base state */
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 500ms ease,
    transform 500ms ease,
    box-shadow var(--transition-base);
}

.discover__grid.is-visible .discover__card {
  opacity: 1;
  transform: translateY(0);
}

.discover__card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(61, 55, 50, 0.12);
}

.discover__grid.is-visible .discover__card:hover {
  transform: translateY(-2px);
}

/* ------------------------------------------------------------------
   Icon
   ------------------------------------------------------------------ */
.discover__icon {
  display: block;
  width: 48px;
  height: 48px;
  margin: 0 auto 24px auto;
}

.discover__card--presencial .discover__icon :deep(svg) {
  color: var(--color-terracotta);
}

.discover__card--app .discover__icon :deep(svg) {
  color: var(--color-azul-noche);
}

/* ------------------------------------------------------------------
   Card Title
   ------------------------------------------------------------------ */
.discover__card-title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 20px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  text-align: center;
  margin: 0;
}

/* ------------------------------------------------------------------
   Card Description
   ------------------------------------------------------------------ */
.discover__card-desc {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  margin-top: 20px;
}

/* ------------------------------------------------------------------
   Card Sentence (quote)
   ------------------------------------------------------------------ */
.discover__card-sentence {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-style: italic;
  font-size: 14px;
  color: var(--color-charcoal-mist);
  border-left: 2px solid var(--color-terracotta);
  padding-left: 16px;
  margin-top: 20px;
}

/* ------------------------------------------------------------------
   CTA buttons
   ------------------------------------------------------------------ */
.discover__cta {
  display: block;
  text-align: center;
  margin-top: auto;
  padding-top: 24px;
}

/* ------------------------------------------------------------------
   App "coming soon" note
   ------------------------------------------------------------------ */
.discover__app-note {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-style: italic;
  font-size: 13px;
  color: var(--color-olive-stone);
  text-align: center;
  margin-top: 12px;
}

/* ------------------------------------------------------------------
   Complementary note
   ------------------------------------------------------------------ */
.discover__note {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-style: italic;
  font-size: 14px;
  color: var(--color-olive-stone);
  text-align: center;
  margin-top: 32px;
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .discover {
    padding: var(--space-large) 0;
  }

  .discover__title {
    font-size: 28px;
  }

  .discover__subtitle {
    font-size: 17px;
  }

  .discover__grid {
    gap: 24px;
  }

  .discover__card {
    padding: 32px 24px;
  }

  .discover__card-title {
    font-size: 18px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .discover__title {
    font-size: 24px;
  }

  .discover__subtitle {
    font-size: 16px;
  }

  .discover__grid {
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .discover__cta {
    width: 100%;
    max-width: 300px;
    margin-left: auto;
    margin-right: auto;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion — Disable entrance/hover animations
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .discover__card {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .discover__card:hover {
    transform: none;
    box-shadow: 0 4px 20px rgba(61, 55, 50, 0.08);
  }
}
</style>
