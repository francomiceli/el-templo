<script setup lang="ts">
/**
 * /es/planes -- modalidades de entrenamiento sin precios (fase 195, D-13).
 * Equivalente a `/planes` (hreflang). Los precios se consultan por el WhatsApp
 * de ventas de Espana.
 */
import { brandName } from "~/data/sedes";

const title = "Planes";
const description = `Planes de entrenamiento de ${brandName} en Barcelona. Consulta los precios por WhatsApp.`;

usePageSeo({
  title: `${title} de calistenia en Barcelona | ${brandName}`,
  description,
  path: "/es/planes",
  breadcrumb: [{ name: title }],
});
</script>

<template>
  <PageShell
    :title="`Planes de ${brandName}`"
    lead="Elige cómo entrenar. Los precios se consultan por WhatsApp."
  >
    <PlanesContent country="ES" />
  </PageShell>
</template>
