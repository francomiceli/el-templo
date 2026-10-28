<script setup lang="ts">
/**
 * /planes -- modalidades de entrenamiento sin precios (fase 195, D-12).
 * Los precios se consultan por el WhatsApp de ventas.
 */
import { brandName } from "~/data/sedes";

const title = "Planes";
const description = `Planes de entrenamiento de ${brandName}: Flex, Foundation, Performance, clase única y actividades especiales. Consultá precios por WhatsApp.`;

usePageSeo({
  title: `${title} de calistenia | ${brandName}`,
  description,
  path: "/planes",
  breadcrumb: [{ name: title }],
});
</script>

<template>
  <PageShell
    :title="`Planes de ${brandName}`"
    lead="Elegí cómo entrenar. Los precios los consultás por WhatsApp."
  >
    <PlanesContent country="AR" />
  </PageShell>
</template>
