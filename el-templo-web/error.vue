<script setup lang="ts">
/**
 * Custom error page — branded 404 and generic error handling.
 *
 * Nuxt convention: error.vue at app root catches all errors.
 * Shows branded 404 for status 404, generic message for other errors.
 * BEM prefix: error-page
 */

const error = useError();

const is404 = computed(() => error.value?.statusCode === 404);

useHead({
  title: is404.value
    ? "P\u00E1gina no encontrada \u2014 El Templo"
    : "Error \u2014 El Templo",
});

function handleClearError(): void {
  clearError({ redirect: "/" });
}
</script>

<template>
  <div class="error-page">
    <div class="error-page__container">
      <!-- 404 -->
      <template v-if="is404">
        <h1 class="error-page__code">404</h1>
        <p class="error-page__message">
          La p&aacute;gina que busc&aacute;s no existe.
        </p>
      </template>

      <!-- Other errors -->
      <template v-else>
        <h1 class="error-page__code">{{ error?.statusCode ?? 500 }}</h1>
        <p class="error-page__message">Algo sali&oacute; mal.</p>
      </template>

      <button
        class="error-page__cta btn btn--primary"
        @click="handleClearError"
      >
        VOLVER AL INICIO
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ==========================================================================
   Error Page — Branded 404 and generic error
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

.error-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--color-marble-cream);
  padding: var(--space-large);
}

.error-page__container {
  text-align: center;
  max-width: 480px;
}

.error-page__code {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 120px;
  color: var(--color-charcoal-mist);
  line-height: 1;
  margin: 0 0 var(--space-comfortable) 0;
  letter-spacing: 0.04em;
}

.error-page__message {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 22px;
  color: var(--color-olive-stone);
  line-height: 1.4;
  margin: 0 0 var(--space-spacious) 0;
}

.error-page__cta {
  display: inline-block;
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .error-page__code {
    font-size: 80px;
  }

  .error-page__message {
    font-size: 18px;
  }
}
</style>
