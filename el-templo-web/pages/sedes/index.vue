<script setup lang="ts">
/**
 * /sedes -- hub de sedes (fase 195, D-12).
 *
 * Enlaza todas las sedes con clases (Mar del Plata y Barcelona) y el espacio de
 * comunidad. Todo sale de `web-data.json`; los conteos se derivan.
 */
import { brandName, sedesCount, webData, webSedes } from "~/data/sedes";
import type { WebSede } from "~/data/web-data.types";
import {
  SITE_URL,
  breadcrumbNode,
  jsonLdScript,
  organizationNode,
  sedeListNode,
  sedePath,
} from "~/utils/schema-graph";

const DAY_SHORT: Record<number, string> = {
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
  7: "Dom",
};

const gyms = webSedes.filter((s) => s.kind === "gym");
const gymsMdp = gyms.filter((s) => s.country === "AR");
const gymsBcn = gyms.filter((s) => s.country === "ES");
const communitySpaces = webSedes.filter((s) => s.kind === "community_space");

/** Dias con clases de la sede ("Lun, Mar, ..."), vacio si no hay horarios. */
function classDays(sede: WebSede): string {
  const days = [...new Set(sede.schedule.map((s) => s.dayOfWeek))].sort(
    (a, b) => a - b,
  );
  return days.map((d) => DAY_SHORT[d]).join(", ");
}

const title = `Sedes de ${brandName} en Mar del Plata y Barcelona`;
const description = `${sedesCount.total} sedes de calistenia: ${sedesCount.mdp} en Mar del Plata y ${sedesCount.bcn} en Barcelona. Direcciones, horarios y primera clase gratis.`;

useHead({
  title: `${title} | ${brandName}`,
  meta: [
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: `${SITE_URL}/sedes` },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: brandName },
  ],
  link: [{ rel: "canonical", href: `${SITE_URL}/sedes` }],
  script: [
    jsonLdScript([
      organizationNode(webData),
      sedeListNode(gyms),
      breadcrumbNode([
        { name: "Inicio", url: `${SITE_URL}/` },
        { name: "Sedes" },
      ]),
    ]),
  ],
});
</script>

<template>
  <main class="sedes-hub">
    <div class="sedes-hub__container">
      <h1 class="sedes-hub__title">{{ title }}</h1>
      <p class="sedes-hub__lead">
        {{ sedesCount.total }} sedes con el mismo m&eacute;todo, el mismo
        equipamiento y la misma filosof&iacute;a. Eleg&iacute; la tuya.
      </p>

      <section class="sedes-hub__group">
        <h2 class="sedes-hub__city">
          Mar del Plata
          <span class="sedes-hub__count">{{ sedesCount.mdp }} sedes</span>
        </h2>
        <ul class="sedes-hub__grid">
          <li v-for="sede in gymsMdp" :key="sede.slug" class="sedes-hub__card">
            <NuxtLink :to="sedePath(sede)" class="sedes-hub__link">
              <span class="sedes-hub__name">{{ sede.publicName }}</span>
              <span class="sedes-hub__address">{{ sede.address.street }}</span>
              <span v-if="classDays(sede)" class="sedes-hub__days">
                Clases: {{ classDays(sede) }}
              </span>
              <span v-else class="sedes-hub__days">
                Horarios por WhatsApp
              </span>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <section class="sedes-hub__group">
        <h2 class="sedes-hub__city">
          Barcelona
          <span class="sedes-hub__count">{{ sedesCount.bcn }} sede</span>
        </h2>
        <ul class="sedes-hub__grid">
          <li v-for="sede in gymsBcn" :key="sede.slug" class="sedes-hub__card">
            <NuxtLink :to="sedePath(sede)" class="sedes-hub__link">
              <span class="sedes-hub__name">{{ sede.publicName }}</span>
              <span class="sedes-hub__address">{{ sede.address.street }}</span>
              <span v-if="classDays(sede)" class="sedes-hub__days">
                Clases: {{ classDays(sede) }}
              </span>
              <span v-else class="sedes-hub__days">
                Horarios por WhatsApp
              </span>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <section v-if="communitySpaces.length" class="sedes-hub__group">
        <h2 class="sedes-hub__city">Espacio de comunidad</h2>
        <ul class="sedes-hub__grid">
          <li
            v-for="space in communitySpaces"
            :key="space.slug"
            class="sedes-hub__card sedes-hub__card--community"
          >
            <NuxtLink :to="sedePath(space)" class="sedes-hub__link">
              <span class="sedes-hub__name">{{ space.publicName }}</span>
              <span class="sedes-hub__address">{{ space.address.street }}</span>
              <span class="sedes-hub__days">
                Espacio abierto en el Parque Primavesi (no es una sede)
              </span>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>

<style scoped>
.sedes-hub {
  background: var(--color-marble-cream);
  padding: var(--space-section) 0 var(--space-large);
}

.sedes-hub__container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 5%;
}

.sedes-hub__title {
  font-family: var(--font-authority);
  font-weight: 800;
  font-size: 32px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  line-height: 1.2;
  color: var(--color-deep-charcoal);
  margin: 0 0 var(--space-base) 0;
}

.sedes-hub__lead {
  font-family: var(--font-elegance);
  font-style: italic;
  font-size: 20px;
  color: var(--color-charcoal-mist);
  margin: 0;
}

.sedes-hub__group {
  margin-top: var(--space-section);
}

.sedes-hub__city {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 18px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-deep-charcoal);
  border-bottom: 1px solid var(--color-warm-stone);
  padding-bottom: 12px;
  margin: 0 0 var(--space-comfortable) 0;
}

.sedes-hub__count {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  text-transform: none;
  letter-spacing: 0;
  color: var(--color-olive-stone);
}

.sedes-hub__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-comfortable);
}

.sedes-hub__card {
  background: var(--color-warm-linen);
  border: 1px solid var(--color-warm-stone);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-subtle);
  transition: box-shadow var(--transition-base);
}

.sedes-hub__card--community {
  border-style: dashed;
}

.sedes-hub__card:hover {
  box-shadow: var(--shadow-medium);
}

.sedes-hub__link {
  display: block;
  padding: 20px;
  text-decoration: none;
}

.sedes-hub__name {
  display: block;
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-deep-charcoal);
}

.sedes-hub__address,
.sedes-hub__days {
  display: block;
  font-family: var(--font-clarity);
  font-size: 13px;
  color: var(--color-olive-stone);
  margin-top: 4px;
}

.sedes-hub__days {
  color: var(--color-terracotta);
}

@media (max-width: 480px) {
  .sedes-hub__title {
    font-size: 24px;
  }
}
</style>
