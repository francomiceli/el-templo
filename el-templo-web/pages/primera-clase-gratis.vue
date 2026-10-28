<script setup lang="ts">
/**
 * /primera-clase-gratis -- landing de la primera clase (fase 195, D-12).
 */
import { brandName } from "~/data/sedes";

const description =
  "Tu primera clase de calistenia en Mar del Plata es gratis. Elegí tu sede y reservá online o por WhatsApp.";

usePageSeo({
  title: `Primera clase gratis de calistenia en Mar del Plata | ${brandName}`,
  description,
  path: "/primera-clase-gratis",
  breadcrumb: [{ name: "Primera clase gratis" }],
});
</script>

<template>
  <PageShell
    title="Primera clase gratis de calistenia en Mar del Plata"
    lead="Probá el método en una sesión sin cargo."
  >
    <PrimeraClaseGratisContent country="AR" />
  </PageShell>
</template>
