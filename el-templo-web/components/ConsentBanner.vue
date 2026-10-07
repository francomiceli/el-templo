<script setup lang="ts">
/**
 * ConsentBanner -- banner de consentimiento RGPD propio, solo en /es
 * (fase 195, D-22). Sin CMP externa (regla no-CDN).
 *
 * - Aparece en /es mientras la persona no eligio ("unknown").
 * - "Aceptar" y "Rechazar" tienen el mismo peso visual.
 * - Despues de elegir queda un enlace discreto "Preferencias de cookies" para
 *   cambiar o retirar la eleccion (retirarla tiene que ser tan facil como darla).
 * - Los plugins de GA4 y Pixel escuchan el estado: nada se carga sin "granted".
 * Se renderiza solo en cliente (`<ClientOnly>` en el layout).
 * BEM prefix: consent
 */
import { isEsPath } from "~/utils/analytics-loader";

const route = useRoute();
const { consentState, accept, reject, reset, cleanup } = useConsent();

const isEs = computed(() => isEsPath(route.path));
const showBanner = computed(
  () => isEs.value && consentState.value === "unknown",
);
const showPreferences = computed(
  () => isEs.value && consentState.value !== "unknown",
);

onBeforeUnmount(() => cleanup());
</script>

<template>
  <div v-if="showBanner" class="consent" role="dialog" aria-label="Cookies">
    <div class="consent__inner">
      <p class="consent__text">
        Usamos Google Analytics y Meta Pixel para medir las visitas y los
        anuncios. Solo se activan si aceptas.
        <NuxtLink to="/privacidad" class="consent__link">
          Política de privacidad
        </NuxtLink>
      </p>
      <div class="consent__actions">
        <button class="consent__btn" type="button" @click="reject">
          Rechazar
        </button>
        <button class="consent__btn" type="button" @click="accept">
          Aceptar
        </button>
      </div>
    </div>
  </div>
  <button
    v-else-if="showPreferences"
    class="consent__prefs"
    type="button"
    @click="reset"
  >
    Preferencias de cookies
  </button>
</template>

<style scoped>
.consent {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 900;
  background-color: var(--color-sandy-beige);
  box-shadow: 0 -2px 8px rgba(61, 55, 50, 0.1);
}

.consent__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 12px 24px;
}

.consent__text {
  margin: 0;
  font-family: var(--font-clarity);
  font-size: 14px;
  color: var(--color-deep-charcoal);
  line-height: 1.4;
}

.consent__link {
  color: var(--color-terracotta);
}

.consent__actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

/* Mismo peso visual para aceptar y rechazar. */
.consent__btn {
  font-family: var(--font-clarity);
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-deep-charcoal);
  background: var(--color-marble-cream);
  border: 1px solid var(--color-deep-charcoal);
  border-radius: var(--radius-base);
  padding: 10px 20px;
  cursor: pointer;
}

.consent__btn:hover {
  background: var(--color-warm-stone);
}

.consent__prefs {
  position: fixed;
  left: 12px;
  bottom: 12px;
  z-index: 800;
  font-family: var(--font-clarity);
  font-size: 12px;
  color: var(--color-olive-stone);
  background: var(--color-marble-cream);
  border: 1px solid var(--color-warm-stone);
  border-radius: var(--radius-base);
  padding: 6px 10px;
  cursor: pointer;
}

.consent__prefs:hover {
  color: var(--color-terracotta);
}

@media (max-width: 640px) {
  .consent__inner {
    flex-direction: column;
    align-items: stretch;
  }

  .consent__actions .consent__btn {
    flex: 1;
  }
}
</style>
