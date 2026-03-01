<script setup lang="ts">
/**
 * SectionApproaches — "Los 5 Enfoques" section.
 *
 * 5 training approach cards showing how El Templo classifies movement:
 * Kallos, Sthenos, Motus, Pyros, Dynamis.
 *
 * Informational/brand section — no CTAs.
 * Responsive: 5-col desktop, 3+2 tablet, horizontal scroll mobile.
 * Scroll-triggered staggered entrance animation on cards.
 */

interface Approach {
  id: string;
  name: string;
  translation: string;
  description: string;
  sentence: string;
  iconSvg: string;
}

const approaches: Approach[] = [
  {
    id: "kallos",
    name: "Kall\u00F3s",
    translation: "El centro",
    description:
      "Todo movimiento empieza en el centro. Kall\u00F3s es estabilidad, control y dominio del core. La base invisible que sostiene cada skill, cada fuerza, cada movimiento. Sin centro, no hay construcci\u00F3n posible.",
    sentence: "La fuerza nace del centro.",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="20" y1="6" x2="20" y2="34" /><line x1="8" y1="20" x2="32" y2="20" /><circle cx="20" cy="20" r="3" /><circle cx="20" cy="20" r="10" /></svg>`,
  },
  {
    id: "sthenos",
    name: "Sthenos",
    translation: "La fuerza",
    description:
      "Empujar, traccionar, sostener. Sthenos es la fuerza en su expresi\u00F3n m\u00E1s pura: carga progresiva con el peso de tu propio cuerpo. No se trata de cu\u00E1nto levant\u00E1s \u2014 se trata de cu\u00E1nto control\u00E1s.",
    sentence: "Fuerza real es control absoluto.",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 8c-1-2-3-3-5-3s-4 2-4 4c0 3 4 5 9 10c5-5 9-7 9-10c0-2-2-4-4-4s-4 1-5 3z" /><path d="M14 22v10" /><path d="M26 22v10" /><path d="M10 26h6" /><path d="M24 26h6" /></svg>`,
  },
  {
    id: "motus",
    name: "Motus",
    translation: "El movimiento",
    description:
      "El cuerpo fue dise\u00F1ado para moverse libre. Motus es coordinaci\u00F3n, fluidez y movimiento natural. Patrones que conectan fuerza con gracia, potencia con precisi\u00F3n. Mov\u00E9te como el cuerpo pide.",
    sentence: "Mover bien es vivir mejor.",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 24c4-8 8-12 14-12s10 4 14 12" /><path d="M6 20c4-6 8-8 14-8s10 2 14 8" /></svg>`,
  },
  {
    id: "pyros",
    name: "Pyros",
    translation: "El fuego",
    description:
      "Intensidad, resistencia, coraz\u00F3n. Pyros es el trabajo cardiovascular y metab\u00F3lico que forja la resistencia real. No es correr sin sentido \u2014 es entrenar la capacidad del cuerpo de sostener el esfuerzo y recuperarse.",
    sentence: "El fuego se entrena, no se improvisa.",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4c0 6-8 10-8 18a8 8 0 0 0 16 0c0-8-8-12-8-18z" /><path d="M20 16c0 3-4 5-4 10a4 4 0 0 0 8 0c0-5-4-7-4-10z" /></svg>`,
  },
  {
    id: "dynamis",
    name: "Dynamis",
    translation: "El dominio",
    description:
      "Handstand, muscle up, front lever, planche. Dynamis es la dimensi\u00F3n t\u00E9cnica: los skills que definen a la calistenia avanzada. Cada skill es una conquista \u2014 meses de pr\u00E1ctica concentrados en segundos de dominio.",
    sentence: "Dominar un movimiento es dominar la paciencia.",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="20" cy="8" r="3" /><line x1="20" y1="11" x2="20" y2="22" /><path d="M14 22l-4-8" /><path d="M26 22l4-8" /><line x1="15" y1="28" x2="20" y2="22" /><line x1="25" y1="28" x2="20" y2="22" /></svg>`,
  },
];

// Scroll-triggered reveal for the grid
const { revealed, elementRef: gridRef, cleanup } = useScrollReveal();

onBeforeUnmount(() => {
  cleanup();
});
</script>

<template>
  <section id="enfoques" class="approaches">
    <div class="approaches__container">
      <span class="approaches__tag">Los 5 enfoques</span>

      <h2 class="approaches__title">Cinco formas de entender el cuerpo.</h2>

      <p class="approaches__subtitle">
        En El Templo no entrenamos m&uacute;sculos. Entrenamos capacidades. Cada
        enfoque es una dimensi&oacute;n del movimiento humano &mdash; y las
        cinco trabajan juntas.
      </p>

      <div
        ref="gridRef"
        class="approaches__grid"
        :class="{ 'is-visible': revealed }"
      >
        <div
          v-for="(approach, index) in approaches"
          :key="approach.id"
          class="approaches__card"
          :style="{
            transitionDelay: revealed ? index * 100 + 'ms' : '0ms',
          }"
        >
          <!-- eslint-disable-next-line vue/no-v-html -->
          <span class="approaches__icon" v-html="approach.iconSvg" />
          <h3 class="approaches__name">{{ approach.name }}</h3>
          <span class="approaches__translation">{{
            approach.translation
          }}</span>
          <div class="approaches__separator" />
          <p class="approaches__desc">{{ approach.description }}</p>
          <p class="approaches__sentence">{{ approach.sentence }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   Approaches Section — "Los 5 Enfoques"
   BEM naming. Token variables only. Never pure black or white.
   Marble Cream background. 5 approach cards with hover + scroll-reveal.
   ========================================================================== */

.approaches {
  background: var(--color-marble-cream);
  padding: var(--space-hero) 0;
}

.approaches__container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 5%;
  text-align: center;
}

/* ------------------------------------------------------------------
   Header
   ------------------------------------------------------------------ */
.approaches__tag {
  display: block;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--color-terracotta);
  margin-bottom: var(--space-base);
}

.approaches__title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-comfortable) 0;
}

.approaches__subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 20px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  max-width: 650px;
  margin: 0 auto var(--space-section) auto;
}

/* ------------------------------------------------------------------
   Grid — 3 + 2 centered layout (6-col trick)
   ------------------------------------------------------------------ */
.approaches__grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 24px;
}

/* ------------------------------------------------------------------
   Card
   ------------------------------------------------------------------ */
.approaches__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  background: var(--color-warm-linen);
  border: 1px solid var(--color-warm-stone);
  border-radius: 8px;
  padding: 32px 24px;
  min-height: 320px;
  box-shadow: var(--shadow-subtle);
  grid-column: span 2;

  /* Entrance animation base state */
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 500ms ease,
    transform 500ms ease,
    box-shadow var(--transition-base);
}

/* Center the last row (2 cards) */
.approaches__card:nth-child(4) {
  grid-column: 2 / span 2;
}

.approaches__grid.is-visible .approaches__card {
  opacity: 1;
  transform: translateY(0);
}

.approaches__card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-medium);
}

.approaches__grid.is-visible .approaches__card:hover {
  transform: translateY(-3px);
}

/* ------------------------------------------------------------------
   Icon
   ------------------------------------------------------------------ */
.approaches__icon {
  display: block;
  width: 40px;
  height: 40px;
  margin-bottom: var(--space-base);
  color: var(--color-terracotta);
}

/* ------------------------------------------------------------------
   Name
   ------------------------------------------------------------------ */
.approaches__name {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-deep-charcoal);
  margin: 0 0 4px 0;
}

/* ------------------------------------------------------------------
   Translation
   ------------------------------------------------------------------ */
.approaches__translation {
  display: block;
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 14px;
  color: var(--color-olive-stone);
  margin-bottom: 12px;
}

/* ------------------------------------------------------------------
   Separator
   ------------------------------------------------------------------ */
.approaches__separator {
  width: 30px;
  height: 2px;
  background: var(--color-terracotta);
  margin: 0 auto 12px auto;
}

/* ------------------------------------------------------------------
   Description
   ------------------------------------------------------------------ */
.approaches__desc {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-deep-charcoal);
  line-height: 1.55;
  text-align: center;
  margin: 0;
}

/* ------------------------------------------------------------------
   Sentence — pushed to bottom via margin-top: auto
   ------------------------------------------------------------------ */
.approaches__sentence {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-style: italic;
  font-size: 13px;
  color: var(--color-charcoal-mist);
  margin-top: auto;
  padding-top: 16px;
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px) — 3 + 2 layout
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .approaches {
    padding: var(--space-large) 0;
  }

  .approaches__title {
    font-size: 28px;
  }

  .approaches__subtitle {
    font-size: 17px;
  }

  .approaches__grid {
    gap: 20px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px) — horizontal scroll with snap
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .approaches__title {
    font-size: 24px;
  }

  .approaches__subtitle {
    font-size: 16px;
  }

  .approaches__grid {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    gap: 16px;
    padding-bottom: 16px;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .approaches__grid::-webkit-scrollbar {
    display: none;
  }

  .approaches__card {
    min-width: 260px;
    max-width: 280px;
    flex-shrink: 0;
    scroll-snap-align: start;
    grid-column: auto;
  }

  .approaches__card:nth-child(4) {
    grid-column: auto;
  }

  .approaches__desc {
    overflow-wrap: break-word;
    word-break: break-word;
  }

  /* Gradient fade indicator for scroll hint */
  .approaches__grid::after {
    content: "";
    position: sticky;
    right: 0;
    min-width: 40px;
    flex-shrink: 0;
    background: linear-gradient(
      to left,
      var(--color-marble-cream) 0%,
      rgba(242, 237, 229, 0) 100%
    );
    pointer-events: none;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion — Disable all entrance/hover animations
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .approaches__card {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .approaches__card:hover {
    transform: none;
    box-shadow: var(--shadow-subtle);
  }
}
</style>
