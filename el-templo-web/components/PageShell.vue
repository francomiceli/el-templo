<script setup lang="ts">
/**
 * PageShell -- contenedor comun de las paginas de contenido de la fase 195
 * (disciplinas, planes, profes, primera clase gratis).
 *
 * Pone el `<main>`, el titulo h1, la bajada y las clases `cpage__*` que usan
 * los slots (secciones, grillas de tarjetas, CTAs). Estilos SIN scoped a
 * proposito: el contenido del slot los comparte.
 * BEM prefix: cpage
 */
withDefaults(
  defineProps<{
    title: string;
    lead?: string;
    backTo?: string;
    backLabel?: string;
  }>(),
  { lead: undefined, backTo: undefined, backLabel: undefined },
);
</script>

<template>
  <main class="cpage">
    <div class="cpage__container">
      <NuxtLink v-if="backTo" :to="backTo" class="cpage__back">
        &larr; {{ backLabel }}
      </NuxtLink>
      <h1 class="cpage__title">{{ title }}</h1>
      <p v-if="lead" class="cpage__lead">{{ lead }}</p>
      <slot />
    </div>
  </main>
</template>

<style>
.cpage {
  background: var(--color-marble-cream);
  padding: var(--space-section) 0 var(--space-large);
}

.cpage__container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 5%;
}

.cpage__back {
  display: inline-block;
  font-family: var(--font-clarity);
  font-size: 13px;
  color: var(--color-olive-stone);
  text-decoration: none;
  margin-bottom: var(--space-base);
}

.cpage__back:hover {
  color: var(--color-terracotta);
}

.cpage__title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 32px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  line-height: 1.2;
  color: var(--color-deep-charcoal);
  margin: 0 0 var(--space-base) 0;
}

.cpage__lead {
  font-family: var(--font-elegance);
  font-style: italic;
  font-size: 20px;
  line-height: 1.5;
  color: var(--color-charcoal-mist);
  margin: 0;
}

.cpage__section {
  margin-top: var(--space-section);
}

.cpage__heading {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 18px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-deep-charcoal);
  border-bottom: 1px solid var(--color-warm-stone);
  padding-bottom: 8px;
  margin: 0 0 var(--space-base) 0;
}

.cpage__text {
  font-family: var(--font-clarity);
  font-size: 16px;
  line-height: 1.6;
  color: var(--color-deep-charcoal);
  margin: 0 0 var(--space-base) 0;
}

.cpage__muted {
  font-family: var(--font-clarity);
  font-size: 14px;
  color: var(--color-olive-stone);
  margin: 0;
}

.cpage__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-comfortable);
}

.cpage__card {
  background: var(--color-warm-linen);
  border: 1px solid var(--color-warm-stone);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-subtle);
  overflow: hidden;
}

.cpage__card-body {
  display: block;
  padding: 20px;
  text-decoration: none;
}

.cpage__card-title {
  display: block;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  margin: 0;
}

.cpage__card-text {
  display: block;
  font-family: var(--font-clarity);
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-olive-stone);
  margin: 8px 0 0 0;
}

.cpage__card-photo {
  width: 100%;
  aspect-ratio: 3 / 2;
  object-fit: cover;
  display: block;
}

.cpage__links {
  list-style: none;
  margin: 0;
  padding: 0;
  font-family: var(--font-clarity);
  font-size: 16px;
}

.cpage__links li {
  padding: 6px 0;
}

.cpage__links a {
  color: var(--color-terracotta);
  text-decoration: none;
}

.cpage__links a:hover {
  color: var(--color-clay);
}

.cpage__cta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-base);
  margin-top: var(--space-spacious);
}

@media (max-width: 480px) {
  .cpage__title {
    font-size: 24px;
  }
}
</style>
