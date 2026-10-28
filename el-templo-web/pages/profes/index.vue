<script setup lang="ts">
/**
 * /profes -- equipo de El Templo (fase 195, D-12/D-27).
 *
 * La grilla sale de `data/profes.ts` (solo profes publicados).
 */
import { publishedProfes } from "~/data/profes";
import { brandName } from "~/data/sedes";
import { profePath } from "~/utils/schema-graph";

const title = "Profes";
const description = `El equipo de ${brandName}: quiénes enseñan el método y cómo entrenan.`;

usePageSeo({
  title: `${title} | ${brandName}`,
  description,
  path: "/profes",
  breadcrumb: [{ name: title }],
});
</script>

<template>
  <PageShell
    :title="`Profes de ${brandName}`"
    lead="Quiénes enseñan el método."
  >
    <ul class="cpage__grid cpage__section">
      <li v-for="p in publishedProfes" :key="p.slug" class="cpage__card">
        <NuxtLink :to="profePath(p)" class="profes__link">
          <img
            v-if="p.foto"
            :src="p.foto"
            :alt="`${p.nombre}, ${p.rol}`"
            class="cpage__card-photo"
            loading="lazy"
          >
          <span class="cpage__card-body">
            <span class="cpage__card-title">{{ p.nombre }}</span>
            <span class="cpage__card-text">{{ p.rol }}</span>
          </span>
        </NuxtLink>
      </li>
    </ul>
  </PageShell>
</template>

<style scoped>
.profes__link {
  display: block;
  text-decoration: none;
}
</style>
