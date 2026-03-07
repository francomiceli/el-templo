<script setup lang="ts">
/**
 * SectionIdentity -- "Que es El Templo?" section.
 *
 * Answers the question the hero generates: what IS El Templo and
 * why is it different from a gym. Defines, it does not sell.
 *
 * Split 55/45 text/image layout with scroll-reveal entrance animation.
 * Ghost CTA is dimmed (Olive Stone, span, no hover) because /filosofia
 * does not exist yet.
 */

const sedesCount = 8;
const alumnosCount = "1000";

const { revealed, elementRef, cleanup } = useScrollReveal();

onBeforeUnmount(() => {
  cleanup();
});
</script>

<template>
  <section id="que-es" ref="elementRef" class="identity">
    <div class="identity__container" :class="{ 'is-visible': revealed }">
      <!-- TEXT COLUMN -->
      <div class="identity__text">
        <span class="identity__tag">Filosof&iacute;a</span>

        <h2 class="identity__title">
          Una escuela de calistenia. No un gimnasio.
        </h2>

        <div class="identity__body">
          <p>
            El Templo naci&oacute; con una idea simple: que entrenar con tu
            propio cuerpo es el acto m&aacute;s honesto de disciplina que
            existe. Sin m&aacute;quinas. Sin atajos. Solo vos, tu peso, y un
            m&eacute;todo que te lleva m&aacute;s lejos de lo que cre&iacute;as
            posible.
          </p>
          <p>
            Ac&aacute; la calistenia no es una moda &mdash; es una
            pr&aacute;ctica. Cada sesi&oacute;n tiene estructura, cada nivel
            tiene prop&oacute;sito, y cada persona que entra encuentra su propio
            camino de evoluci&oacute;n f&iacute;sica, mental y real.
          </p>
          <p>
            {{ sedesCount }} sedes en Argentina y Espa&ntilde;a. M&aacute;s de
            {{ alumnosCount }} alumnos entrenando cada semana. Una comunidad que
            crece porque el m&eacute;todo funciona.
          </p>
        </div>

        <span class="identity__cta identity__cta--disabled">
          Conoc&eacute; nuestra filosof&iacute;a
          <span class="identity__cta-arrow">&rarr;</span>
        </span>
      </div>

      <!-- IMAGE COLUMN -->
      <div class="identity__image-wrap">
        <img
          src="/images/photos/sesion-real.webp"
          alt="Sesión real de calistenia en El Templo — coach guiando handstand"
          class="identity__photo"
          loading="lazy"
        >
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   Identity Section -- "Que es El Templo?"
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

/* ------------------------------------------------------------------
   Section Wrapper
   ------------------------------------------------------------------ */
.identity {
  background: var(--color-marble-cream);
  padding: var(--space-hero) 0; /* 96px */
}

/* ------------------------------------------------------------------
   Container -- Split Grid
   ------------------------------------------------------------------ */
.identity__container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 5%;
  display: grid;
  grid-template-columns: 55% 1fr;
  gap: var(--space-large); /* 64px */
  align-items: center;
}

/* ------------------------------------------------------------------
   Tag / Label
   ------------------------------------------------------------------ */
.identity__tag {
  display: block;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--color-terracotta);
  margin-bottom: var(--space-base); /* 16px */
}

/* ------------------------------------------------------------------
   Title (H2)
   ------------------------------------------------------------------ */
.identity__title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-spacious) 0; /* 32px */
}

/* ------------------------------------------------------------------
   Body Text
   ------------------------------------------------------------------ */
.identity__body {
  max-width: 560px;
}

.identity__body p {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  margin: 0 0 20px 0;
}

.identity__body p:last-child {
  margin-bottom: 0;
}

/* ------------------------------------------------------------------
   CTA Ghost -- Dimmed (disabled)
   Rendered as <span> since /filosofia does not exist.
   Olive Stone color, no hover, no pointer cursor.
   ------------------------------------------------------------------ */
.identity__cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-top: var(--space-spacious); /* 32px */
}

.identity__cta--disabled {
  color: var(--color-olive-stone);
  cursor: default;
  text-decoration: none;
  pointer-events: none;
}

.identity__cta-arrow {
  display: inline-block;
}

/* ------------------------------------------------------------------
   Image Column
   ------------------------------------------------------------------ */
.identity__image-wrap {
  width: 100%;
}

.identity__photo {
  width: 100%;
  border-radius: var(--radius-card);
  object-fit: cover;
  aspect-ratio: 4 / 5;
  box-shadow: var(--shadow-prominent);
}

/* ------------------------------------------------------------------
   Scroll-Reveal Animation
   Text slides in from left, image slides in from right.
   ------------------------------------------------------------------ */
.identity__text {
  opacity: 0;
  transform: translateX(-30px);
  transition:
    opacity 600ms ease,
    transform 600ms ease;
}

.identity__image-wrap {
  opacity: 0;
  transform: translateX(30px);
  transition:
    opacity 600ms ease,
    transform 600ms ease 150ms; /* slight delay for stagger */
}

.identity__container.is-visible .identity__text,
.identity__container.is-visible .identity__image-wrap {
  opacity: 1;
  transform: translateX(0);
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .identity {
    padding: var(--space-large) 0; /* 64px */
  }

  .identity__container {
    gap: var(--space-spacious); /* 32px */
  }

  .identity__title {
    font-size: 28px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .identity__container {
    grid-template-columns: 1fr;
    gap: var(--space-spacious); /* 32px */
  }

  /* Image goes first in mobile */
  .identity__image-wrap {
    order: -1;
  }

  .identity__photo {
    aspect-ratio: 16 / 9;
    max-height: 280px;
    box-shadow: 0 4px 20px rgba(61, 55, 50, 0.1);
  }

  .identity__title {
    font-size: 24px;
    letter-spacing: 0.03em;
    line-height: 1.25;
    margin-bottom: 20px;
  }

  .identity__body {
    max-width: 100%;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .identity__text,
  .identity__image-wrap {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
