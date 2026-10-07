<script setup lang="ts">
/**
 * PlanesContent -- contenido de la pagina de planes, SIN precios (fase 195,
 * D-12). Parametrizado por pais: el CTA va al WhatsApp de ventas del pais.
 * Lo reusa `/es/planes` (195-06).
 * BEM prefix: cpage (PageShell) + planes
 */
import { planGrupos } from "~/data/planes";
import type { WebCountry } from "~/data/web-data.types";
import { salesWhatsappUrl } from "~/utils/whatsapp";

const props = defineProps<{ country: WebCountry }>();

const PLANES_TEXT = "Hola! Quiero info de planes";
const whatsappUrl = computed(() =>
  salesWhatsappUrl(props.country, PLANES_TEXT),
);
const { trackEvent } = useAnalytics();

// Barcelona: espanol de Espana (sin voseo) en los CTAs.
const ctaLabel = computed(() =>
  props.country === "ES"
    ? "Consulta precios por WhatsApp"
    : "Consultá precios por WhatsApp",
);
</script>

<template>
  <div class="planes">
    <section v-for="grupo in planGrupos" :key="grupo.id" class="cpage__section">
      <h2 class="cpage__heading">{{ grupo.titulo }}</h2>
      <p class="cpage__text">{{ grupo.intro }}</p>
      <ul class="cpage__grid">
        <li v-for="plan in grupo.planes" :key="plan.nombre" class="cpage__card">
          <div class="cpage__card-body">
            <h3 class="cpage__card-title">{{ plan.nombre }}</h3>
            <p class="cpage__card-text">{{ plan.descripcion }}</p>
            <a
              :href="whatsappUrl"
              class="planes__link"
              @click="trackEvent('click_whatsapp_planes')"
            >
              {{ ctaLabel }}
            </a>
          </div>
        </li>
      </ul>
    </section>

    <section class="cpage__cta">
      <a
        :href="whatsappUrl"
        class="btn btn--primary"
        @click="trackEvent('click_whatsapp_planes')"
      >
        {{ ctaLabel }}
      </a>
    </section>
  </div>
</template>

<style scoped>
.planes__link {
  display: inline-block;
  margin-top: 12px;
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-terracotta);
  text-decoration: none;
}

.planes__link:hover {
  color: var(--color-clay);
}
</style>
