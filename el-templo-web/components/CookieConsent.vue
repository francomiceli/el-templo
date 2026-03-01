<script setup lang="ts">
/**
 * EU-only informational cookie banner.
 *
 * - Shows only for visitors whose timezone starts with "Europe/"
 * - Informational only: analytics load regardless of dismissal
 * - Permanent dismissal via localStorage (never shown again once dismissed)
 * - Client-side only logic (no SSR rendering)
 */

const STORAGE_KEY = "cookie_consent_dismissed";

const isVisible = ref(false);

function isEuropeanTimezone(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz.startsWith("Europe/");
  } catch {
    return false;
  }
}

function dismiss(): void {
  isVisible.value = false;
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // localStorage unavailable (private browsing, etc.) — banner stays dismissed for session
  }
}

onMounted(() => {
  try {
    if (localStorage.getItem(STORAGE_KEY) === "1") return;
  } catch {
    // localStorage unavailable — don't show banner
    return;
  }

  if (isEuropeanTimezone()) {
    isVisible.value = true;
  }
});
</script>

<template>
  <Transition name="cookie-consent-slide">
    <div
      v-if="isVisible"
      class="cookie-consent"
      role="status"
      aria-live="polite"
    >
      <div class="cookie-consent__inner">
        <p class="cookie-consent__text">
          Este sitio usa cookies de an&aacute;lisis para mejorar tu experiencia.
        </p>
        <button
          class="cookie-consent__dismiss"
          type="button"
          aria-label="Cerrar aviso de cookies"
          @click="dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cookie-consent {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 900;
  background-color: var(--color-sandy-beige);
  box-shadow: 0 -2px 8px rgba(61, 55, 50, 0.1);
}

.cookie-consent__inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 12px 24px;
}

.cookie-consent__text {
  margin: 0;
  font-family: var(--font-clarity);
  font-size: 14px;
  font-weight: 400;
  color: var(--color-deep-charcoal);
  line-height: 1.4;
}

.cookie-consent__dismiss {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: var(--radius-base);
  background: transparent;
  color: var(--color-deep-charcoal);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.cookie-consent__dismiss:hover {
  background-color: var(--color-warm-stone);
}

/* Slide-up entrance / slide-down exit */
.cookie-consent-slide-enter-active {
  transition: transform var(--transition-base);
}

.cookie-consent-slide-leave-active {
  transition: transform var(--transition-base);
}

.cookie-consent-slide-enter-from {
  transform: translateY(100%);
}

.cookie-consent-slide-leave-to {
  transform: translateY(100%);
}
</style>
