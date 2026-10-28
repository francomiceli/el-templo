<script setup lang="ts">
/**
 * SedeDetail -- pagina de una sede (compartida entre /sedes/<slug> y
 * /es/sedes/<slug>, fase 195, D-12).
 *
 * - Sede con clases: direccion, "Como llegar", horarios reales (grilla de clases
 *   regulares), actividades y CTAs (WhatsApp de ventas + registro online).
 * - Espacio de comunidad (El Templo Park): no es una sede, sin horarios ni CTA.
 * - Sede sin horarios publicados: pagina igual, con "consultá horarios por
 *   WhatsApp".
 * BEM prefix: sede
 */
import { brandName } from "~/data/sedes";
import type { WebSede } from "~/data/web-data.types";
import { buildRegisterUrl } from "~/utils/register-url";
import { DEFAULT_TRIAL_TEXT, salesWhatsappUrl } from "~/utils/whatsapp";

const props = defineProps<{ sede: WebSede }>();

const { trackEvent } = useAnalytics();
const { registerParams, cleanup: cleanupAttribution } = useAttribution();
onBeforeUnmount(() => cleanupAttribution());

const DAY_LABELS: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

const isCommunity = computed(() => props.sede.kind === "community_space");
// Barcelona: espanol de Espana (sin voseo) en los textos de la pagina.
const isEs = computed(() => props.sede.country === "ES");

const address = computed(() =>
  [props.sede.address.street, props.sede.address.locality]
    .filter(Boolean)
    .join(", "),
);

/** Grilla de clases por dia (solo dias con clases), Lunes a Domingo. */
const scheduleByDay = computed(() =>
  Object.keys(DAY_LABELS)
    .map(Number)
    .map((day) => ({
      day,
      label: DAY_LABELS[day],
      slots: props.sede.schedule.filter((s) => s.dayOfWeek === day),
    }))
    .filter((d) => d.slots.length > 0),
);

/** Franjas de apertura por dia (solo dias con apertura). */
const openingByDay = computed(() =>
  Object.keys(DAY_LABELS)
    .map(Number)
    .map((day) => ({
      day,
      label: DAY_LABELS[day],
      ranges: props.sede.openingHours
        .filter((h) => h.dayOfWeek === day)
        .map((h) => `${h.opens} a ${h.closes}`),
    }))
    .filter((d) => d.ranges.length > 0),
);

const whatsappUrl = computed(() =>
  salesWhatsappUrl(props.sede.country, DEFAULT_TRIAL_TEXT),
);
// Con el origen del visitante (first-touch) una vez montada la pagina.
const registerUrl = computed(() =>
  buildRegisterUrl(
    { branchId: props.sede.id, branchName: props.sede.publicName },
    registerParams(),
  ),
);
</script>

<template>
  <article class="sede">
    <div class="sede__container">
      <NuxtLink to="/sedes" class="sede__back">&larr; Todas las sedes</NuxtLink>

      <h1 v-if="isCommunity" class="sede__title">
        {{ sede.publicName }} &mdash; espacio de comunidad
      </h1>
      <h1 v-else class="sede__title">{{ brandName }} &mdash; {{ sede.publicName }}</h1>

      <p class="sede__address">{{ address }}</p>

      <div class="sede__media">
        <img
          v-if="sede.photoUrl"
          :src="sede.photoUrl"
          :alt="`${brandName} — ${sede.publicName}`"
          class="sede__photo"
          loading="lazy"
        >
        <PlaceholderBox v-else :label="sede.publicName" aspect-ratio="3 / 2" />
      </div>

      <a
        :href="sede.mapsUrl"
        class="sede__maps"
        target="_blank"
        rel="noopener"
      >
        C&oacute;mo llegar
      </a>

      <!-- Espacio de comunidad: no es una sede -->
      <p v-if="isCommunity" class="sede__community-text">
        Espacio abierto de la comunidad de {{ brandName }} en el Parque
        Primavesi. No es una sede: para entrenar con el m&eacute;todo, eleg&iacute;
        una sede.
      </p>

      <template v-else>
        <section class="sede__section">
          <h2 class="sede__heading">Horarios de clases</h2>
          <table v-if="scheduleByDay.length" class="sede__table">
            <tbody>
              <tr v-for="d in scheduleByDay" :key="d.day">
                <th scope="row">{{ d.label }}</th>
                <td>
                  <span v-for="slot in d.slots" :key="`${slot.startTime}-${slot.activity}`" class="sede__slot">
                    {{ slot.startTime }}&ndash;{{ slot.endTime }}
                    {{ slot.activity }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else class="sede__empty">
            {{
              isEs
                ? "Consulta los horarios por WhatsApp."
                : "Consultá los horarios por WhatsApp."
            }}
          </p>

          <p v-if="openingByDay.length" class="sede__opening">
            <strong>Horario de apertura:</strong>
            <span v-for="d in openingByDay" :key="d.day" class="sede__opening-day">
              {{ d.label }} {{ d.ranges.join(" y ") }}
            </span>
          </p>
        </section>

        <section v-if="sede.activities.length" class="sede__section">
          <h2 class="sede__heading">Actividades</h2>
          <ul class="sede__activities">
            <li v-for="a in sede.activities" :key="a.slug">
              {{ a.name }}
              <span v-if="a.isSpecial" class="sede__tag">Actividad especial</span>
            </li>
          </ul>
        </section>

        <section class="sede__cta">
          <a
            :href="whatsappUrl"
            class="btn btn--primary"
            @click="trackEvent('click_whatsapp_sede')"
          >
            {{
              isEs
                ? "Reserva tu primera clase gratis"
                : "Reservá tu primera clase gratis"
            }}
          </a>
          <a
            :href="registerUrl"
            class="btn btn--secondary-azul"
            @click="trackEvent('click_cta_trial')"
          >
            {{ isEs ? "Reserva online" : "Reservá online" }}
          </a>
        </section>
      </template>
    </div>
  </article>
</template>

<style scoped>
.sede {
  background: var(--color-marble-cream);
  padding: var(--space-section) 0 var(--space-large);
}

.sede__container {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 5%;
}

.sede__back {
  display: inline-block;
  font-family: var(--font-clarity);
  font-size: 13px;
  color: var(--color-olive-stone);
  text-decoration: none;
  margin-bottom: var(--space-base);
}

.sede__back:hover {
  color: var(--color-terracotta);
}

.sede__title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 32px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  line-height: 1.2;
  color: var(--color-deep-charcoal);
  margin: 0 0 8px 0;
}

.sede__address {
  font-family: var(--font-clarity);
  font-size: 16px;
  color: var(--color-olive-stone);
  margin: 0 0 var(--space-comfortable) 0;
}

.sede__media {
  margin-bottom: var(--space-base);
}

.sede__photo {
  width: 100%;
  aspect-ratio: 3 / 2;
  object-fit: cover;
  border-radius: var(--radius-card);
  display: block;
}

.sede__maps {
  display: inline-block;
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-terracotta);
  text-decoration: none;
  margin-bottom: var(--space-comfortable);
}

.sede__maps:hover {
  color: var(--color-clay);
}

.sede__community-text {
  font-family: var(--font-clarity);
  font-size: 16px;
  line-height: 1.6;
  color: var(--color-deep-charcoal);
  margin: 0;
}

.sede__section {
  margin-top: var(--space-spacious);
}

.sede__heading {
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

.sede__table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-clarity);
  font-size: 14px;
  color: var(--color-deep-charcoal);
}

.sede__table th,
.sede__table td {
  text-align: left;
  vertical-align: top;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-warm-stone);
}

.sede__table th {
  width: 120px;
  font-weight: 700;
}

.sede__slot {
  display: block;
}

.sede__empty,
.sede__opening {
  font-family: var(--font-clarity);
  font-size: 14px;
  color: var(--color-olive-stone);
  margin: var(--space-base) 0 0 0;
}

.sede__opening-day {
  display: block;
}

.sede__activities {
  list-style: none;
  margin: 0;
  padding: 0;
  font-family: var(--font-clarity);
  font-size: 15px;
  color: var(--color-deep-charcoal);
}

.sede__activities li {
  padding: 6px 0;
}

.sede__tag {
  display: inline-block;
  margin-left: 8px;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-terracotta);
}

.sede__cta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-base);
  margin-top: var(--space-spacious);
}

@media (max-width: 480px) {
  .sede__title {
    font-size: 24px;
  }

  .sede__table th {
    width: 90px;
  }
}
</style>
