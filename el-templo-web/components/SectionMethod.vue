<script setup lang="ts">
/**
 * SectionMethod — "Nuestro M&eacute;todo" section.
 *
 * Demonstrates the structured training methodology across 4 zones:
 * 1. Intro + Authority (Warm Stone bg)
 * 2. 4 Session Blocks grid (Marble Cream bg)
 * 3. Special Sessions — ROM & SKILLS (Warm Stone bg)
 * 4. CTA closure (Marble Cream bg)
 *
 * Scroll-triggered staggered entrance on block and special cards.
 * Uses useScrollReveal composable (2 instances).
 */

interface SessionBlock {
  number: string;
  nameGreek: string;
  nameSpanish: string;
  description: string;
}

interface SpecialSession {
  name: string;
  subtitle: string;
  description: string;
  iconSvg: string;
}

const sessionBlocks: SessionBlock[] = [
  {
    number: "01",
    nameGreek: "Initium",
    nameSpanish: "Inicio",
    description:
      "Movilidad, activaci\u00F3n y entrada en calor. Preparamos el cuerpo y la mente para lo que viene. Cada sesi\u00F3n empieza con intenci\u00F3n, no con apuro.",
  },
  {
    number: "02",
    nameGreek: "Nucleus",
    nameSpanish: "N\u00FAcleo",
    description:
      "El patr\u00F3n principal de fuerza. El coraz\u00F3n de la sesi\u00F3n. Ac\u00E1 se trabaja el movimiento central del d\u00EDa con progresi\u00F3n real y t\u00E9cnica precisa.",
  },
  {
    number: "03",
    nameGreek: "Deuteros",
    nameSpanish: "Complementario",
    description:
      "T\u00E9cnica, control y trabajo complementario. Refuerza lo que el Nucleus construye. Equilibra el cuerpo y profundiza el dominio del movimiento.",
  },
  {
    number: "04",
    nameGreek: "Athlos",
    nameSpanish: "Desaf\u00EDo",
    description:
      "Retos, juegos de fuerza, trabajo en equipo y cierre. La parte que pone a prueba lo entrenado y construye comunidad. Cada sesi\u00F3n termina con energ\u00EDa, no con agotamiento.",
  },
];

const specialSessions: SpecialSession[] = [
  {
    name: "ROM",
    subtitle: "Range of Motion",
    description:
      "Sesiones dedicadas a la movilidad, flexibilidad y rango de movimiento. Porque la fuerza sin movilidad es fuerza limitada. El cuerpo necesita moverse libre para moverse fuerte.",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="6" r="3" /><path d="M16 12v8" /><path d="M12 16l-4 8" /><path d="M20 16l4 8" /><path d="M10 20c-2-1-4 0-4 2" /><path d="M22 20c2-1 4 0 4 2" /></svg>`,
  },
  {
    name: "SKILLS",
    subtitle: "Trabajo espec\u00EDfico",
    description:
      "Sesiones enfocadas en un skill puntual: handstand, muscle up, front lever, planche. El espacio para obsesionarte con un movimiento hasta dominarlo.",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="12" /><circle cx="16" cy="16" r="7" /><circle cx="16" cy="16" r="2.5" /><line x1="16" y1="1" x2="16" y2="4" /><line x1="16" y1="28" x2="16" y2="31" /><line x1="1" y1="16" x2="4" y2="16" /><line x1="28" y1="16" x2="31" y2="16" /></svg>`,
  },
];

// Scroll-triggered reveal for session blocks grid
const {
  revealed: blocksRevealed,
  elementRef: blocksRef,
  cleanup: cleanupBlocks,
} = useScrollReveal();

// Scroll-triggered reveal for special sessions grid
const {
  revealed: specialsRevealed,
  elementRef: specialsRef,
  cleanup: cleanupSpecials,
} = useScrollReveal();

onBeforeUnmount(() => {
  cleanupBlocks();
  cleanupSpecials();
});
</script>

<template>
  <section id="metodo" class="method">
    <!-- ZONE 1: Intro + Authority (Warm Stone bg) -->
    <div class="method__intro">
      <div class="method__intro-container">
        <span class="method__tag">El M&eacute;todo</span>

        <h2 class="method__title">
          Un m&eacute;todo de entrenamiento con peso corporal. Nada es al azar.
        </h2>

        <p class="method__subtitle">
          Un sistema de entrenamiento progresivo dise&ntilde;ado para que cada
          sesi&oacute;n tenga prop&oacute;sito y cada mes tenga
          direcci&oacute;n. Tus resultados no dependen de la suerte. Dependen de
          la estructura.
        </p>

        <!-- Author block -->
        <div class="method__author">
          <div class="method__author-photo-wrap">
            <PlaceholderBox label="Foto Ignacio" aspect-ratio="1/1" />
          </div>
          <div class="method__author-info">
            <p class="method__author-name">
              Dise&ntilde;ado por Ignacio Bord&oacute;n
            </p>
            <div class="method__author-separator" />
            <p class="method__author-bio">
              Ex gimnasta de alto rendimiento. M&aacute;s de 10 a&ntilde;os
              formando atletas y entrenadores. M&aacute;s de 10.000 alumnos. CEO
              y fundador de El Templo.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- ZONE 2: 4 Session Blocks (Marble Cream bg) -->
    <div class="method__blocks">
      <div class="method__blocks-container">
        <span class="method__sub-tag">Estructura de cada sesi&oacute;n</span>

        <p class="method__blocks-intro">
          Cada sesi&oacute;n dura 1 hora y est&aacute; dividida en 4 bloques
          espec&iacute;ficos. Cada bloque tiene un objetivo claro. Entrenamos
          todos los sistemas energ&eacute;ticos de manera t&eacute;cnica y
          progresiva.
        </p>

        <div
          ref="blocksRef"
          class="method__blocks-grid"
          :class="{ 'is-visible': blocksRevealed }"
        >
          <div
            v-for="(block, index) in sessionBlocks"
            :key="block.number"
            class="method__block"
            :style="{
              transitionDelay: blocksRevealed ? index * 100 + 'ms' : '0ms',
            }"
          >
            <span class="method__block-number">{{ block.number }}</span>
            <h3 class="method__block-name">{{ block.nameGreek }}</h3>
            <span class="method__block-translation">{{
              block.nameSpanish
            }}</span>
            <div class="method__block-separator" />
            <p class="method__block-desc">{{ block.description }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ZONE 3: Special Sessions (Warm Stone bg) -->
    <div class="method__specials">
      <div class="method__specials-container">
        <span class="method__sub-tag">Sesiones especiales</span>

        <p class="method__specials-intro">
          Adem&aacute;s de las sesiones diarias del m&eacute;todo,
          profundiz&aacute; en dos ejes clave de la calistenia:
        </p>

        <div
          ref="specialsRef"
          class="method__specials-grid"
          :class="{ 'is-visible': specialsRevealed }"
        >
          <div
            v-for="(session, index) in specialSessions"
            :key="session.name"
            class="method__special-card"
            :style="{
              transitionDelay: specialsRevealed ? index * 150 + 'ms' : '0ms',
            }"
          >
            <!-- eslint-disable-next-line vue/no-v-html -->
            <span class="method__special-icon" v-html="session.iconSvg" />
            <h3 class="method__special-name">{{ session.name }}</h3>
            <span class="method__special-sub">{{ session.subtitle }}</span>
            <p class="method__special-desc">{{ session.description }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- ZONE 4: CTA (Marble Cream bg) -->
    <div class="method__cta-section">
      <a href="#descubri-nivel" class="btn btn--primary method__cta">
        Prob&aacute; el m&eacute;todo
      </a>
      <p class="method__cta-note">
        Tu primera sesi&oacute;n es sin cargo. Ven&iacute; a sentir la
        diferencia.
      </p>
      <NuxtLink to="/blog" class="method__blog-link">
        Aprend&eacute; m&aacute;s sobre entrenamiento en nuestro blog
        <span>&rarr;</span>
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   Method Section — "Nuestro M&eacute;todo"
   BEM naming. Token variables only. Never pure black or white.
   4 zones with alternating Warm Stone / Marble Cream backgrounds.
   ========================================================================== */

/* ------------------------------------------------------------------
   Zone 1: Intro + Authority (Warm Stone)
   ------------------------------------------------------------------ */
.method__intro {
  background: var(--color-warm-stone);
  padding: var(--space-hero) 0;
}

.method__intro-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 5%;
  text-align: center;
}

/* ------------------------------------------------------------------
   Tags
   ------------------------------------------------------------------ */
.method__tag,
.method__sub-tag {
  display: block;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--color-terracotta);
  margin-bottom: var(--space-base);
}

/* ------------------------------------------------------------------
   Title
   ------------------------------------------------------------------ */
.method__title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-comfortable) 0;
}

/* ------------------------------------------------------------------
   Subtitle
   ------------------------------------------------------------------ */
.method__subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 20px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  max-width: 700px;
  margin: 0 auto var(--space-section) auto;
}

/* ------------------------------------------------------------------
   Author Block — 40/60 split
   ------------------------------------------------------------------ */
.method__author {
  display: flex;
  align-items: center;
  gap: var(--space-comfortable);
  max-width: 600px;
  margin: 0 auto;
  text-align: left;
}

.method__author-photo-wrap {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid var(--color-aged-gold);
  flex-shrink: 0;
}

.method__author-name {
  font-family: var(--font-elegance);
  font-weight: 600;
  font-size: 20px;
  color: var(--color-deep-charcoal);
  margin: 0 0 8px 0;
}

.method__author-separator {
  width: 40px;
  height: 2px;
  background: var(--color-aged-gold);
  margin: 12px 0;
}

.method__author-bio {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  margin: 0;
}

/* ------------------------------------------------------------------
   Zone 2: 4 Session Blocks (Marble Cream)
   ------------------------------------------------------------------ */
.method__blocks {
  background: var(--color-marble-cream);
  padding: 80px 0;
}

.method__blocks-container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 5%;
}

.method__blocks-intro {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  max-width: 700px;
  margin: 0 0 var(--space-section) 0;
}

/* ------------------------------------------------------------------
   Session Blocks Grid
   ------------------------------------------------------------------ */
.method__blocks-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-spacious);
}

/* ------------------------------------------------------------------
   Single Block Card
   ------------------------------------------------------------------ */
.method__block {
  position: relative;
  padding: var(--space-comfortable);
  transition: var(--transition-base);

  /* Entrance animation base state */
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 500ms ease,
    transform 500ms ease,
    box-shadow var(--transition-base);
}

.method__blocks-grid.is-visible .method__block {
  opacity: 1;
  transform: translateY(0);
}

.method__block:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-medium);
}

.method__blocks-grid.is-visible .method__block:hover {
  transform: translateY(-4px);
}

.method__block-number {
  position: absolute;
  top: 0;
  right: 8px;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 48px;
  color: var(--color-terracotta);
  opacity: 0.15;
  line-height: 1;
  transition: opacity var(--transition-base);
}

.method__block:hover .method__block-number {
  opacity: 0.25;
}

.method__block-name {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-deep-charcoal);
  margin: 0 0 4px 0;
}

.method__block-translation {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-style: italic;
  font-size: 13px;
  color: var(--color-olive-stone);
}

.method__block-separator {
  width: 40px;
  height: 2px;
  background: var(--color-terracotta);
  margin: 12px 0;
}

.method__block-desc {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-deep-charcoal);
  line-height: 1.5;
  margin: 0;
}

/* ------------------------------------------------------------------
   Zone 3: Special Sessions (Warm Stone)
   ------------------------------------------------------------------ */
.method__specials {
  background: var(--color-warm-stone);
  padding: 80px 0;
}

.method__specials-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 5%;
  text-align: center;
}

.method__specials-intro {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  margin: 0 auto var(--space-spacious) auto;
  max-width: 600px;
}

/* ------------------------------------------------------------------
   Specials Grid
   ------------------------------------------------------------------ */
.method__specials-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-spacious);
}

/* ------------------------------------------------------------------
   Special Session Card
   ------------------------------------------------------------------ */
.method__special-card {
  background: var(--color-warm-linen);
  border: 1px solid var(--color-warm-stone);
  border-radius: var(--radius-card);
  padding: var(--space-spacious);
  text-align: left;
  box-shadow: var(--shadow-subtle);

  /* Entrance animation base state */
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 500ms ease,
    transform 500ms ease,
    box-shadow var(--transition-base);
}

.method__specials-grid.is-visible .method__special-card {
  opacity: 1;
  transform: translateY(0);
}

.method__special-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-medium);
}

.method__specials-grid.is-visible .method__special-card:hover {
  transform: translateY(-4px);
}

.method__special-icon {
  display: block;
  color: var(--color-olive-stone);
  margin-bottom: var(--space-base);
}

.method__special-name {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 18px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-deep-charcoal);
  margin: 0 0 4px 0;
}

.method__special-sub {
  display: block;
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 15px;
  color: var(--color-olive-stone);
  margin-bottom: var(--space-base);
}

.method__special-desc {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-deep-charcoal);
  line-height: 1.5;
  margin: 0;
}

/* ------------------------------------------------------------------
   Zone 4: CTA Closure (Marble Cream)
   ------------------------------------------------------------------ */
.method__cta-section {
  background: var(--color-marble-cream);
  padding: var(--space-large) 0;
  text-align: center;
}

.method__cta {
  /* Inherits from .btn.btn--primary */
}

.method__cta-note {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-style: italic;
  font-size: 14px;
  color: var(--color-olive-stone);
  margin-top: var(--space-base);
}

.method__blog-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 13px;
  color: var(--color-olive-stone);
  text-decoration: none;
  margin-top: var(--space-comfortable);
  transition: color var(--transition-base);
}

.method__blog-link:hover {
  color: var(--color-terracotta);
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .method__intro {
    padding: var(--space-large) 0;
  }

  .method__title {
    font-size: 28px;
  }

  .method__subtitle {
    font-size: 17px;
  }

  .method__blocks-grid {
    grid-template-columns: 1fr 1fr;
    gap: var(--space-comfortable);
  }

  .method__blocks,
  .method__specials {
    padding: var(--space-section) 0;
  }

  .method__cta-section {
    padding: var(--space-section) 0;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .method__title {
    font-size: 24px;
  }

  .method__subtitle {
    font-size: 16px;
  }

  .method__blocks-grid {
    grid-template-columns: 1fr;
  }

  .method__specials-grid {
    grid-template-columns: 1fr;
  }

  .method__author {
    flex-direction: column;
    text-align: center;
  }

  .method__author-photo-wrap {
    width: 100px;
    height: 100px;
  }

  .method__author-info {
    text-align: center;
  }

  .method__author-separator {
    margin: 12px auto;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion — Disable all entrance/hover animations
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .method__block,
  .method__special-card {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .method__block:hover,
  .method__special-card:hover {
    transform: none;
    box-shadow: var(--shadow-subtle);
  }

  .method__block-number {
    transition: none;
  }

  .method__block:hover .method__block-number {
    opacity: 0.15;
  }
}
</style>
