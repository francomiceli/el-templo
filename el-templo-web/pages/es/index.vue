<script setup lang="ts">
/**
 * /es -- home de El Templo en Barcelona (fase 195, D-13).
 *
 * Pagina equivalente a `/` (hreflang es-AR / es-ES / x-default). Copy en
 * espanol de Espana (sin voseo). Solo emite el `Organization`: la sede tiene su
 * `ExerciseGym` en `/es/sedes/<slug>`.
 */
import { brandName, webData, webSedes } from "~/data/sedes";
import { hreflangLinks } from "~/utils/hreflang";
import { jsonLdScript, organizationNode, SITE_URL } from "~/utils/schema-graph";
import { buildRegisterUrl } from "~/utils/register-url";
import { DEFAULT_TRIAL_TEXT, salesWhatsappUrl } from "~/utils/whatsapp";

const found = webSedes.find((s) => s.country === "ES" && s.kind === "gym");
if (!found) {
  throw createError({ statusCode: 404, fatal: true });
}
const sede = found;

const title = `${brandName} en ${sede.publicName} | Calistenia en Barcelona`;
const description = `Escuela de calistenia con método propio y 6 niveles en ${sede.publicName}. Entrenamiento con peso corporal. Tu primera clase es gratis.`;
const url = `${SITE_URL}/es`;

useHead({
  htmlAttrs: { lang: "es-ES" },
  title,
  meta: [
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: url },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: brandName },
  ],
  link: [{ rel: "canonical", href: url }, ...hreflangLinks("/es")],
  script: [jsonLdScript([organizationNode(webData)])],
});

const whatsappUrl = salesWhatsappUrl("ES", DEFAULT_TRIAL_TEXT);
const { registerParams, cleanup: cleanupAttribution } = useAttribution();
onBeforeUnmount(() => cleanupAttribution());
// Con el origen del visitante (first-touch) una vez montada la pagina.
const registerUrl = computed(() =>
  buildRegisterUrl(
    { branchId: sede.id, branchName: sede.publicName },
    registerParams(),
  ),
);

const { trackEvent, trackLead } = useAnalytics();

function onWhatsapp(): void {
  trackEvent("click_cta_trial");
  trackLead();
}

const blocks = [
  {
    name: "Initium",
    text: "Movilidad, activación y entrada en calor. Cada sesión empieza con intención, no con prisa.",
  },
  {
    name: "Nucleus",
    text: "El patrón principal de fuerza. Aquí se trabaja el movimiento central del día con progresión real y técnica precisa.",
  },
  {
    name: "Deuteros",
    text: "Técnica, control y trabajo complementario para equilibrar el cuerpo y profundizar en el dominio del movimiento.",
  },
  {
    name: "Athlos",
    text: "Retos, juegos de fuerza y cierre. La parte que pone a prueba lo entrenado y construye comunidad.",
  },
];

const levels = [
  { name: "Alfa", text: "Donde todo empieza." },
  { name: "Delta", text: "El cambio se siente." },
  { name: "Sigma", text: "La fuerza se vuelve lenguaje." },
  { name: "Omega", text: "Donde los límites se reescriben." },
  { name: "Spartan", text: "Tu ejemplo es tu enseñanza." },
  { name: "Olympic", text: "El máximo nivel del método." },
];
</script>

<template>
  <PageShell
    :title="`${brandName} en ${sede.publicName}`"
    lead="Calistenia con método propio, en Barcelona. Tu primera clase es gratis."
  >
    <section class="cpage__section">
      <h2 class="cpage__heading">El método</h2>
      <p class="cpage__text">
        Un sistema de entrenamiento con peso corporal pensado para que cada
        sesión tenga propósito y cada mes tenga dirección. Cada sesión dura una
        hora y se divide en cuatro bloques.
      </p>
      <ul class="cpage__grid">
        <li v-for="block in blocks" :key="block.name" class="cpage__card">
          <div class="cpage__card-body">
            <h3 class="cpage__card-title">{{ block.name }}</h3>
            <p class="cpage__card-text">{{ block.text }}</p>
          </div>
        </li>
      </ul>
    </section>

    <section class="cpage__section">
      <h2 class="cpage__heading">Seis niveles de progresión</h2>
      <p class="cpage__text">
        Del primer día a los movimientos más avanzados, siempre sabrás en qué
        nivel estás y cuál es el siguiente paso.
      </p>
      <ul class="cpage__grid">
        <li v-for="level in levels" :key="level.name" class="cpage__card">
          <div class="cpage__card-body">
            <h3 class="cpage__card-title">{{ level.name }}</h3>
            <p class="cpage__card-text">{{ level.text }}</p>
          </div>
        </li>
      </ul>
    </section>

    <section class="cpage__section">
      <h2 class="cpage__heading">Nuestra sede</h2>
      <ul class="cpage__grid">
        <li class="cpage__card">
          <div class="cpage__card-body">
            <h3 class="cpage__card-title">{{ sede.publicName }}</h3>
            <p v-if="sede.address.street" class="cpage__card-text">
              {{ sede.address.street }}
            </p>
            <NuxtLink :to="`/es/sedes/${sede.slug}`" class="es-home__more">
              Ver la sede
            </NuxtLink>
          </div>
        </li>
      </ul>
    </section>

    <section class="cpage__cta">
      <a :href="whatsappUrl" class="btn btn--primary" @click="onWhatsapp">
        Reserva por WhatsApp
      </a>
      <a
        :href="registerUrl"
        class="btn btn--secondary-azul"
        @click="trackEvent('click_cta_trial')"
      >
        Reserva online
      </a>
    </section>
  </PageShell>
</template>

<style scoped>
.es-home__more {
  display: block;
  margin-top: 12px;
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-terracotta);
  text-decoration: none;
}

.es-home__more:hover {
  color: var(--color-clay);
}
</style>
