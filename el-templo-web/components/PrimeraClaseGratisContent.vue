<script setup lang="ts">
/**
 * PrimeraClaseGratisContent -- contenido de la landing "primera clase gratis"
 * (fase 195, D-12). Parametrizado por pais: lista las sedes con clases de ese
 * pais, cada una con "Reservá online", y el CTA general va al WhatsApp de
 * ventas del pais. Lo reusa `/es/primera-clase-gratis` (195-06).
 *
 * El copy sale de lo ya publicado (SectionConversion, SectionMethod).
 * BEM prefix: cpage (PageShell) + trial
 */
import { webSedes } from "~/data/sedes";
import type { WebCountry } from "~/data/web-data.types";
import { buildRegisterUrl } from "~/utils/register-url";
import { sedePath } from "~/utils/schema-graph";
import { DEFAULT_TRIAL_TEXT, salesWhatsappUrl } from "~/utils/whatsapp";

const props = defineProps<{ country: WebCountry }>();

// Barcelona: espanol de Espana (sin voseo).
const isEs = computed(() => props.country === "ES");

const sedes = computed(() =>
  webSedes.filter((s) => s.kind === "gym" && s.country === props.country),
);
const whatsappUrl = computed(() =>
  salesWhatsappUrl(props.country, DEFAULT_TRIAL_TEXT),
);

const { trackEvent, trackLead } = useAnalytics();

function onWhatsapp(): void {
  trackEvent("click_cta_trial");
  trackLead();
}

function onRegister(): void {
  trackEvent("click_cta_trial");
}
</script>

<template>
  <div class="trial">
    <section class="cpage__section">
      <h2 class="cpage__heading">Qué es la primera clase</h2>
      <p class="cpage__text">
        {{
          isEs
            ? "Reserva tu primera sesión sin coste. Un entrenador te evalúa, te asigna tu nivel y te muestra cómo funciona el método en vivo. No hay mejor forma de conocer El Templo que entrenando."
            : "Reservá tu primera sesión sin cargo. Un entrenador te evalúa, te asigna tu nivel y te muestra cómo funciona el método en vivo. No hay mejor forma de conocer El Templo que entrenando."
        }}
      </p>
    </section>

    <section class="cpage__section">
      <h2 class="cpage__heading">Cómo es la sesión</h2>
      <p class="cpage__text">
        Cada sesión dura 1 hora y está dividida en 4 bloques específicos:
        Initium (movilidad, activación y entrada en calor), Nucleus (el patrón
        principal de fuerza), Deuteros (técnica, control y trabajo
        complementario) y Athlos (retos, juegos de fuerza y cierre). Cada bloque
        tiene un objetivo claro.
      </p>
    </section>

    <section class="cpage__section">
      <h2 class="cpage__heading">{{ isEs ? "Elige tu sede" : "Elegí tu sede" }}</h2>
      <ul class="cpage__grid">
        <li v-for="sede in sedes" :key="sede.slug" class="cpage__card">
          <div class="cpage__card-body">
            <h3 class="cpage__card-title">{{ sede.publicName }}</h3>
            <p class="cpage__card-text">{{ sede.address.street }}</p>
            <NuxtLink :to="sedePath(sede)" class="trial__more">
              Ver la sede
            </NuxtLink>
            <a
              :href="
                buildRegisterUrl({
                  branchId: sede.id,
                  branchName: sede.publicName,
                })
              "
              class="btn btn--secondary-azul trial__register"
              @click="onRegister"
            >
              {{ isEs ? "Reserva online" : "Reservá online" }}
            </a>
          </div>
        </li>
      </ul>
    </section>

    <section class="cpage__cta">
      <a :href="whatsappUrl" class="btn btn--primary" @click="onWhatsapp">
        {{ isEs ? "Reserva por WhatsApp" : "Reservá por WhatsApp" }}
      </a>
    </section>
  </div>
</template>

<style scoped>
.trial__more {
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

.trial__more:hover {
  color: var(--color-clay);
}

.trial__register {
  margin-top: 12px;
}
</style>
