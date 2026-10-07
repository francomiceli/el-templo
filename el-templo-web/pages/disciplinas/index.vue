<script setup lang="ts">
/**
 * /disciplinas -- hub de disciplinas (fase 195, D-12).
 */
import { disciplinas } from "~/data/disciplinas";
import { brandName } from "~/data/sedes";

const title = "Disciplinas";
const description = `Calistenia, Actividades con Aura y Yoga en ${brandName}: qué se entrena en cada una y en qué sedes se dicta.`;

usePageSeo({
  title: `${title} | ${brandName}`,
  description,
  path: "/disciplinas",
  breadcrumb: [{ name: title }],
});
</script>

<template>
  <PageShell
    :title="`Disciplinas de ${brandName}`"
    lead="Qué se entrena y en qué sedes se dicta cada una."
  >
    <ul class="cpage__grid cpage__section">
      <li v-for="d in disciplinas" :key="d.slug" class="cpage__card">
        <NuxtLink :to="`/disciplinas/${d.slug}`" class="cpage__card-body">
          <span class="cpage__card-title">{{ d.nombre }}</span>
          <span class="cpage__card-text">{{ d.descripcion }}</span>
        </NuxtLink>
      </li>
    </ul>
  </PageShell>
</template>
