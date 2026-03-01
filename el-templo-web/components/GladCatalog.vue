<script setup lang="ts">
/**
 * GladCatalog -- Product catalog section.
 *
 * Warm Stone background. Fetches products from GET /api/gladius/products.
 * Product cards on Warm Linen background with PlaceholderBox photos,
 * name, description, and "Consultar" ghost CTA.
 *
 * Anchor: #catalogo-gladius (target of hero VER PRODUCTOS CTA).
 * BEM prefix: glad-catalog
 */

import { gladiusConfig } from "~/data/gladius";

interface GladiusProduct {
  id: number;
  name: string;
  slug: string;
  description: string;
  photo: string | null;
  status: string;
  sortOrder: number;
}

const config = useRuntimeConfig();
const apiUrl = config.public.apiUrl;

const {
  data: products,
  status,
  error,
} = useFetch<GladiusProduct[]>(`${apiUrl}/api/gladius/products`, {
  default: () => [],
});

const isLoading = computed(() => status.value === "pending");
const hasProducts = computed(
  () => products.value !== null && products.value.length > 0,
);

const { trackEvent } = useAnalytics();

function handleConsultar(productName: string): void {
  trackEvent("click_cta_gladius_consult");

  const contactSection = document.getElementById("contacto-gladius");
  if (contactSection) {
    contactSection.scrollIntoView({ behavior: "smooth" });

    // Try to pre-fill the product interest field after scroll
    setTimeout(() => {
      const input = document.getElementById(
        "glad-producto",
      ) as HTMLInputElement | null;
      if (input) {
        input.value = productName;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }, 500);
  }
}

const { revealed, elementRef, cleanup } = useScrollReveal({ threshold: 0.1 });

onBeforeUnmount(() => {
  cleanup();
});
</script>

<template>
  <section id="catalogo-gladius" class="glad-catalog">
    <div class="glad-catalog__container">
      <h2 class="glad-catalog__title">NUESTROS PRODUCTOS</h2>

      <p class="glad-catalog__subtitle">
        Equipamiento de calistenia dise&ntilde;ado, probado y aprobado en El
        Templo.
      </p>

      <!-- Loading State -->
      <div v-if="isLoading" class="glad-catalog__loading">
        <div
          v-for="n in 3"
          :key="n"
          class="glad-catalog__card glad-catalog__card--skeleton"
        >
          <div class="glad-catalog__card-image glad-catalog__skeleton-image" />
          <div class="glad-catalog__card-body">
            <div class="glad-catalog__skeleton-title" />
            <div class="glad-catalog__skeleton-text" />
            <div
              class="glad-catalog__skeleton-text glad-catalog__skeleton-text--short"
            />
          </div>
        </div>
      </div>

      <!-- Products Grid -->
      <div
        v-else-if="hasProducts"
        ref="elementRef"
        class="glad-catalog__grid"
        :class="{ 'glad-catalog__grid--revealed': revealed }"
      >
        <div
          v-for="(product, index) in products"
          :key="product.id"
          class="glad-catalog__card"
          :style="{ transitionDelay: `${index * 100}ms` }"
        >
          <div class="glad-catalog__card-image">
            <PlaceholderBox
              v-if="!product.photo"
              aspect-ratio="4/3"
              :label="product.name"
            />
            <img
              v-else
              :src="product.photo"
              :alt="product.name"
              class="glad-catalog__product-img"
              loading="lazy"
            >
          </div>

          <div class="glad-catalog__card-body">
            <h3 class="glad-catalog__product-name">{{ product.name }}</h3>
            <p class="glad-catalog__product-desc">{{ product.description }}</p>

            <button
              class="btn btn--ghost glad-catalog__consult-cta"
              @click="handleConsultar(product.name)"
            >
              Consultar
            </button>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="!error" class="glad-catalog__empty">
        <p class="glad-catalog__empty-text">Pr&oacute;ximamente</p>
        <p class="glad-catalog__empty-subtitle">
          Estamos preparando el cat&aacute;logo. Mientras tanto,
          <a
            :href="gladiusConfig.whatsappUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="glad-catalog__whatsapp-link"
          >
            consult&aacute; por WhatsApp
          </a>
        </p>
      </div>

      <!-- Error State -->
      <div v-else class="glad-catalog__empty">
        <p class="glad-catalog__empty-text">
          No pudimos cargar los productos. Consult&aacute; directamente.
        </p>
        <a
          :href="gladiusConfig.whatsappUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="btn btn--primary glad-catalog__error-cta"
        >
          {{ gladiusConfig.contact.whatsappCta }}
        </a>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   GladCatalog -- Product Catalog Section
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

/* ------------------------------------------------------------------
   Section
   ------------------------------------------------------------------ */
.glad-catalog {
  background: var(--color-warm-stone);
  padding: var(--space-hero) 0;
}

.glad-catalog__container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Title + Subtitle
   ------------------------------------------------------------------ */
.glad-catalog__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 32px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-base) 0;
  text-align: center;
}

.glad-catalog__subtitle {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  margin: 0 0 var(--space-spacious) 0;
  text-align: center;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

/* ------------------------------------------------------------------
   Grid -- 3 columns desktop, 2 tablet, 1 mobile
   ------------------------------------------------------------------ */
.glad-catalog__grid,
.glad-catalog__loading {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-comfortable);
}

/* ------------------------------------------------------------------
   Card
   ------------------------------------------------------------------ */
.glad-catalog__card {
  background: var(--color-warm-linen);
  border: 1px solid var(--color-warm-stone);
  border-radius: 8px;
  overflow: hidden;
  transition:
    transform 300ms ease,
    box-shadow 300ms ease;
  opacity: 0;
  transform: translateY(20px);
}

.glad-catalog__grid--revealed .glad-catalog__card {
  opacity: 1;
  transform: translateY(0);
}

.glad-catalog__card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-medium);
}

.glad-catalog__grid--revealed .glad-catalog__card:hover {
  transform: translateY(-3px);
}

/* ------------------------------------------------------------------
   Card Image
   ------------------------------------------------------------------ */
.glad-catalog__card-image {
  width: 100%;
}

.glad-catalog__card-image :deep(.placeholder-box) {
  border-radius: 0;
  border: none;
  border-bottom: 1px solid var(--color-warm-stone);
}

.glad-catalog__product-img {
  width: 100%;
  aspect-ratio: 4/3;
  object-fit: cover;
  display: block;
}

/* ------------------------------------------------------------------
   Card Body
   ------------------------------------------------------------------ */
.glad-catalog__card-body {
  padding: var(--space-comfortable);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.glad-catalog__product-name {
  font-family: var(--font-authority);
  font-weight: 600;
  font-size: 18px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-deep-charcoal);
  margin: 0;
  line-height: 1.3;
}

.glad-catalog__product-desc {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-charcoal-mist);
  line-height: 1.5;
  margin: 0;
}

/* ------------------------------------------------------------------
   Consultar CTA (Aged Gold ghost)
   ------------------------------------------------------------------ */
.glad-catalog__consult-cta {
  margin-top: 8px;
  border: 1px solid var(--color-aged-gold);
  color: var(--color-aged-gold);
  background: transparent;
  font-family: var(--font-clarity);
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 8px 20px;
  border-radius: var(--radius-base);
  cursor: pointer;
  transition:
    background var(--transition-base),
    color var(--transition-base);
  align-self: flex-start;
}

.glad-catalog__consult-cta:hover {
  background: var(--color-aged-gold);
  color: var(--color-marble-cream);
}

/* ------------------------------------------------------------------
   Skeleton Loading
   ------------------------------------------------------------------ */
.glad-catalog__card--skeleton {
  opacity: 1;
  transform: none;
}

.glad-catalog__skeleton-image {
  aspect-ratio: 4/3;
  background: var(--color-deep-charcoal);
  opacity: 0.1;
  animation: glad-catalog-pulse 1.5s ease-in-out infinite;
}

.glad-catalog__skeleton-title {
  height: 20px;
  width: 70%;
  background: var(--color-deep-charcoal);
  opacity: 0.1;
  border-radius: 4px;
  animation: glad-catalog-pulse 1.5s ease-in-out infinite;
}

.glad-catalog__skeleton-text {
  height: 14px;
  width: 100%;
  background: var(--color-deep-charcoal);
  opacity: 0.08;
  border-radius: 4px;
  animation: glad-catalog-pulse 1.5s ease-in-out infinite;
}

.glad-catalog__skeleton-text--short {
  width: 60%;
}

@keyframes glad-catalog-pulse {
  0%,
  100% {
    opacity: 0.08;
  }
  50% {
    opacity: 0.15;
  }
}

/* ------------------------------------------------------------------
   Empty State
   ------------------------------------------------------------------ */
.glad-catalog__empty {
  text-align: center;
  padding: var(--space-large) 0;
}

.glad-catalog__empty-text {
  font-family: var(--font-authority);
  font-weight: 600;
  font-size: 24px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
  margin: 0 0 var(--space-base) 0;
}

.glad-catalog__empty-subtitle {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 16px;
  color: var(--color-charcoal-mist);
  margin: 0;
}

.glad-catalog__whatsapp-link {
  color: var(--color-terracotta);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.glad-catalog__whatsapp-link:hover {
  color: var(--color-clay);
}

.glad-catalog__error-cta {
  margin-top: var(--space-comfortable);
  display: inline-block;
}

/* ------------------------------------------------------------------
   Tablet (max-width: 768px)
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .glad-catalog {
    padding: var(--space-large) 0;
  }

  .glad-catalog__grid,
  .glad-catalog__loading {
    grid-template-columns: repeat(2, 1fr);
  }

  .glad-catalog__title {
    font-size: 26px;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .glad-catalog__grid,
  .glad-catalog__loading {
    grid-template-columns: 1fr;
  }

  .glad-catalog__title {
    font-size: 22px;
  }

  .glad-catalog__product-name {
    font-size: 16px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .glad-catalog__card {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .glad-catalog__skeleton-image,
  .glad-catalog__skeleton-title,
  .glad-catalog__skeleton-text {
    animation: none;
  }
}
</style>
