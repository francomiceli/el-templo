<script setup lang="ts">
const { trackEvent } = useAnalytics();

function handlePrefooterCta(): void {
  trackEvent("click_cta_trial");
}
</script>

<template>
  <section id="sesion-prueba" class="prefooter">
    <div class="prefooter__container">
      <h2 class="prefooter__title">Tu cuerpo es tu templo.</h2>
      <p class="prefooter__sub">
        La primera sesión es sin cargo. Vení a sentir el método.
      </p>
      <a
        href="https://wa.me/54223XXXXXXX"
        class="btn btn--primary prefooter__cta"
        target="_blank"
        rel="noopener"
        @click="handlePrefooterCta"
      >
        Comenzá tu camino
      </a>
    </div>
  </section>
</template>

<style scoped>
.prefooter {
  background: var(--color-deep-charcoal);
  padding: var(--space-large) 0;
  text-align: center;
}

.prefooter__container {
  max-width: 600px;
  margin: 0 auto;
  padding: 0 5%;
}

.prefooter__title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 28px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-marble-cream);
  margin: 0 0 var(--space-base) 0;
}

.prefooter__sub {
  font-family: var(--font-clarity);
  font-style: italic;
  font-size: 16px;
  color: var(--color-olive-stone);
  margin: 0 0 var(--space-comfortable) 0;
}

.prefooter__cta {
  /* Inherits from .btn .btn--primary global styles */
}

@media (max-width: 768px) {
  .prefooter__title {
    font-size: 22px;
  }
}

@media (max-width: 480px) {
  .prefooter__title {
    font-size: 20px;
  }
}
</style>
