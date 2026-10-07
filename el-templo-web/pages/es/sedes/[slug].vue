<script setup lang="ts">
/**
 * /es/sedes/[slug] -- pagina de una sede de Espana (Barcelona).
 * Declara es-ES (useSedeSeo). Sin hreflang: las sedes no son equivalentes
 * entre paises (D-13).
 */
import { findWebSede } from "~/data/sedes";
import type { WebSede } from "~/data/web-data.types";

const route = useRoute();
const found = findWebSede(String(route.params.slug));

if (!found || found.country !== "ES") {
  throw createError({ statusCode: 404, fatal: true });
}
const sede: WebSede = found;

useSedeSeo(sede);
</script>

<template>
  <main>
    <SedeDetail :sede="sede" />
  </main>
</template>
