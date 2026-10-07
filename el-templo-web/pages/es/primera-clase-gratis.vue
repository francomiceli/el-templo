<script setup lang="ts">
/**
 * /es/primera-clase-gratis -- primera clase gratis en Barcelona (fase 195, D-13).
 * Equivalente a `/primera-clase-gratis` (hreflang). Copy en espanol de Espana.
 */
import { brandName } from "~/data/sedes";

const description =
  "Tu primera clase de calistenia en Barcelona es gratis. Elige tu sede y reserva online o por WhatsApp.";

usePageSeo({
  title: `Primera clase gratis de calistenia en Barcelona | ${brandName}`,
  description,
  path: "/es/primera-clase-gratis",
  breadcrumb: [{ name: "Primera clase gratis" }],
});
</script>

<template>
  <PageShell
    title="Primera clase gratis de calistenia en Barcelona"
    lead="Prueba el método en una sesión sin coste."
  >
    <PrimeraClaseGratisContent country="ES" />
  </PageShell>
</template>
