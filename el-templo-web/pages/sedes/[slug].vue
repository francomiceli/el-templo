<script setup lang="ts">
/**
 * /sedes/[slug] -- pagina de una sede de Argentina (o del espacio de
 * comunidad El Templo Park). Barcelona vive en /es/sedes/barcelona.
 */
import { findWebSede } from "~/data/sedes";
import type { WebSede } from "~/data/web-data.types";

const route = useRoute();
const found = findWebSede(String(route.params.slug));

if (!found || found.country !== "AR") {
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
