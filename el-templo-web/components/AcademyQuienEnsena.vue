<script setup lang="ts">
/**
 * AcademyQuienEnsena — "APRENDÉ DEL QUE CREA EL MÉTODO." section.
 *
 * Split layout: photo left (45%) / text right (55%) on desktop.
 * Counter animation for numeric stats using useCountUp.
 * Sandy Beige background.
 */

import { ignacioStats, ignacioCredentials } from "~/data/academy";

// Stats counter
const countUpItems = ignacioStats
  .filter((s) => /^\+?\d+$/.test(s.value.replace("+", "")))
  .map((s) => ({
    value: parseInt(s.value.replace("+", ""), 10),
    prefix: s.value.startsWith("+") ? "+" : "",
  }));

const {
  displayValues,
  trigger: triggerCountUp,
  cleanup: countUpCleanup,
} = useCountUp(countUpItems);

// Scroll reveal for stats trigger
const {
  revealed: statsRevealed,
  elementRef: statsRef,
  cleanup: statsCleanup,
} = useScrollReveal();

// Trigger count-up when stats become visible
watch(statsRevealed, (isRevealed) => {
  if (isRevealed) {
    triggerCountUp();
  }
});

onBeforeUnmount(() => {
  statsCleanup();
  countUpCleanup();
});
</script>

<template>
  <section id="quien-ensena-academy" class="academy-quien-ensena">
    <div class="academy-quien-ensena__container">
      <!-- Image (left) -->
      <div class="academy-quien-ensena__image">
        <PlaceholderBox label="Ignacio Bordon" height="100%" />
      </div>

      <!-- Text (right) -->
      <div class="academy-quien-ensena__text">
        <h2 class="academy-quien-ensena__title">
          APREND&Eacute; DEL QUE CREA EL M&Eacute;TODO.
        </h2>

        <div class="academy-quien-ensena__copy">
          <p>
            Ignacio Bordon. Ex gimnasta de alto rendimiento. M&aacute;s de 20
            a&ntilde;os de experiencia en calistenia y entrenamiento con el peso
            del cuerpo.
          </p>
          <p>
            Cre&oacute; el m&eacute;todo de El Templo, form&oacute; a todos los
            entrenadores de la red, y llev&oacute; el sistema de un garage en
            Mar del Plata a dos continentes.
          </p>
          <p>
            En la modalidad presencial, Ignacio dicta el programa personalmente.
            En la online, cada m&oacute;dulo fue dise&ntilde;ado y producido
            bajo su direcci&oacute;n.
          </p>
        </div>

        <!-- Stats -->
        <div
          ref="statsRef"
          class="academy-quien-ensena__stats"
          :class="{ 'is-visible': statsRevealed }"
        >
          <!-- Numeric stats with counter -->
          <div
            v-for="(stat, index) in ignacioStats"
            :key="`stat-${index}`"
            class="academy-quien-ensena__stat"
          >
            <span class="academy-quien-ensena__stat-value">
              {{ displayValues[index] }}
            </span>
            <span class="academy-quien-ensena__stat-label">
              {{ stat.label }}
            </span>
          </div>
        </div>

        <!-- Credentials (text badges) -->
        <div class="academy-quien-ensena__credentials">
          <span
            v-for="cred in ignacioCredentials"
            :key="cred"
            class="academy-quien-ensena__credential"
          >
            {{ cred }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   AcademyQuienEnsena — Instructor Credibility Section
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

.academy-quien-ensena {
  background: var(--color-sandy-beige);
  padding: var(--space-hero) 0;
}

.academy-quien-ensena__container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 5%;
  display: grid;
  grid-template-columns: 45% 55%;
  gap: var(--space-spacious);
  align-items: center;
}

/* ------------------------------------------------------------------
   Image
   ------------------------------------------------------------------ */
.academy-quien-ensena__image {
  aspect-ratio: 4 / 5;
  border-radius: var(--radius-base);
  overflow: hidden;
}

.academy-quien-ensena__image :deep(.placeholder-box) {
  height: 100%;
  aspect-ratio: unset;
}

/* ------------------------------------------------------------------
   Text
   ------------------------------------------------------------------ */
.academy-quien-ensena__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-comfortable) 0;
}

.academy-quien-ensena__copy p {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-deep-charcoal);
  line-height: 1.7;
  margin: 0 0 var(--space-base) 0;
}

.academy-quien-ensena__copy p:last-child {
  margin-bottom: 0;
}

/* ------------------------------------------------------------------
   Stats
   ------------------------------------------------------------------ */
.academy-quien-ensena__stats {
  display: flex;
  gap: var(--space-spacious);
  margin-top: var(--space-spacious);
  padding-top: var(--space-comfortable);
  border-top: 1px solid rgba(61, 55, 50, 0.1);
}

.academy-quien-ensena__stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.academy-quien-ensena__stat-value {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 32px;
  color: var(--color-deep-charcoal);
  line-height: 1;
}

.academy-quien-ensena__stat-label {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-olive-stone);
}

/* ------------------------------------------------------------------
   Credentials
   ------------------------------------------------------------------ */
.academy-quien-ensena__credentials {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: var(--space-comfortable);
}

.academy-quien-ensena__credential {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 13px;
  color: var(--color-deep-charcoal);
  background: rgba(61, 55, 50, 0.06);
  border: 1px solid rgba(61, 55, 50, 0.1);
  border-radius: 4px;
  padding: 6px 12px;
}

/* ------------------------------------------------------------------
   Tablet
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .academy-quien-ensena {
    padding: var(--space-large) 0;
  }

  .academy-quien-ensena__container {
    grid-template-columns: 1fr;
  }

  .academy-quien-ensena__image {
    max-width: 400px;
    margin: 0 auto;
  }

  .academy-quien-ensena__title {
    font-size: 28px;
    text-align: center;
  }

  .academy-quien-ensena__stats {
    justify-content: center;
  }
}

/* ------------------------------------------------------------------
   Mobile
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .academy-quien-ensena__title {
    font-size: 24px;
  }

  .academy-quien-ensena__stats {
    flex-direction: column;
    align-items: center;
    gap: var(--space-comfortable);
  }

  .academy-quien-ensena__stat {
    align-items: center;
    text-align: center;
  }

  .academy-quien-ensena__stat-value {
    font-size: 28px;
  }

  .academy-quien-ensena__credentials {
    justify-content: center;
  }
}
</style>
