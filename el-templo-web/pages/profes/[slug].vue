<script setup lang="ts">
/**
 * /profes/[slug] -- pagina de un profe publicado (fase 195, D-12/D-27).
 *
 * JSON-LD `Person` (con `worksFor` al Organization y `workLocation` a las
 * sedes del profe). Todo el texto sale de `data/profes.ts` por interpolacion
 * (nunca v-html).
 */
import { findProfe } from "~/data/profes";
import { brandName, webData, webSedes } from "~/data/sedes";
import { personNode, profePath, sedePath } from "~/utils/schema-graph";

const route = useRoute();
const found = findProfe(String(route.params.slug));
if (!found) {
  throw createError({ statusCode: 404, fatal: true });
}
const profe = found;

const sedes = profe.sedes
  .map((slug) => webSedes.find((s) => s.slug === slug && s.kind === "gym"))
  .filter((s): s is NonNullable<typeof s> => s !== undefined);

usePageSeo({
  title: `${profe.nombre} — ${profe.rol} | ${brandName}`,
  description: profe.bio[0] ?? profe.rol,
  path: profePath(profe),
  ogType: "profile",
  extraNodes: [personNode(profe, webData.sedes)],
  breadcrumb: [{ name: "Profes", path: "/profes" }, { name: profe.nombre }],
});
</script>

<template>
  <PageShell
    :title="profe.nombre"
    :lead="profe.rol"
    back-to="/profes"
    back-label="Todos los profes"
  >
    <section class="cpage__section">
      <img
        v-if="profe.foto"
        :src="profe.foto"
        :alt="`${profe.nombre}, ${profe.rol}`"
        class="profe__photo"
        loading="lazy"
      >
      <p v-for="(parrafo, i) in profe.bio" :key="i" class="cpage__text">
        {{ parrafo }}
      </p>
    </section>

    <section v-if="sedes.length" class="cpage__section">
      <h2 class="cpage__heading">Dónde entrena</h2>
      <ul class="cpage__links">
        <li v-for="sede in sedes" :key="sede.slug">
          <NuxtLink :to="sedePath(sede)">{{ sede.publicName }}</NuxtLink>
        </li>
      </ul>
    </section>
  </PageShell>
</template>

<style scoped>
.profe__photo {
  width: 100%;
  max-width: 420px;
  aspect-ratio: 4 / 5;
  object-fit: cover;
  border-radius: var(--radius-card);
  display: block;
  margin-bottom: var(--space-comfortable);
}
</style>
