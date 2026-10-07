<script setup lang="ts">
/**
 * /disciplinas/[slug] -- pagina de una disciplina (fase 195, D-12).
 *
 * Los textos salen de `data/disciplinas.ts` y "Donde se dicta" de las
 * actividades reales de cada sede (`sedesForDisciplina`).
 */
import { findDisciplina, sedesForDisciplina } from "~/data/disciplinas";
import { brandName, webSedes } from "~/data/sedes";
import { buildRegisterUrl } from "~/utils/register-url";
import { sedePath } from "~/utils/schema-graph";
import { DEFAULT_TRIAL_TEXT, salesWhatsappUrl } from "~/utils/whatsapp";

const route = useRoute();
const found = findDisciplina(String(route.params.slug));
if (!found) {
  throw createError({ statusCode: 404, fatal: true });
}
const disciplina = found;

const sedes = sedesForDisciplina(webSedes, disciplina);
const whatsappUrl = salesWhatsappUrl("AR", DEFAULT_TRIAL_TEXT);
const registerUrl = buildRegisterUrl({});
const { trackEvent, trackLead } = useAnalytics();

function onWhatsapp(): void {
  trackEvent("click_cta_trial");
  trackLead();
}

usePageSeo({
  title: `${disciplina.titulo} | ${brandName}`,
  description: disciplina.descripcion,
  path: `/disciplinas/${disciplina.slug}`,
  breadcrumb: [
    { name: "Disciplinas", path: "/disciplinas" },
    { name: disciplina.nombre },
  ],
});
</script>

<template>
  <PageShell
    :title="disciplina.titulo"
    :lead="disciplina.intro"
    back-to="/disciplinas"
    back-label="Todas las disciplinas"
  >
    <section
      v-for="s in disciplina.secciones"
      :key="s.titulo"
      class="cpage__section"
    >
      <h2 class="cpage__heading">{{ s.titulo }}</h2>
      <p class="cpage__text">{{ s.texto }}</p>
    </section>

    <section v-if="disciplina.niveles" class="cpage__section">
      <h2 class="cpage__heading">
        Los {{ disciplina.niveles.length }} niveles
      </h2>
      <ul class="cpage__grid">
        <li v-for="n in disciplina.niveles" :key="n.nombre" class="cpage__card">
          <img
            :src="n.foto"
            :alt="`Nivel ${n.nombre} de ${brandName}`"
            class="cpage__card-photo"
            loading="lazy"
          >
          <div class="cpage__card-body">
            <h3 class="cpage__card-title">{{ n.nombre }}</h3>
            <p class="cpage__card-text">{{ n.descripcion }}</p>
          </div>
        </li>
      </ul>
    </section>

    <section class="cpage__section">
      <h2 class="cpage__heading">Dónde se dicta</h2>
      <ul v-if="sedes.length" class="cpage__links">
        <li v-for="sede in sedes" :key="sede.slug">
          <NuxtLink :to="sedePath(sede)">{{ sede.publicName }}</NuxtLink>
        </li>
      </ul>
      <p v-else class="cpage__muted">Consultá disponibilidad por WhatsApp.</p>
    </section>

    <section class="cpage__cta">
      <a :href="whatsappUrl" class="btn btn--primary" @click="onWhatsapp">
        Reservá tu primera clase gratis
      </a>
      <a
        :href="registerUrl"
        class="btn btn--secondary-azul"
        @click="trackEvent('click_cta_trial')"
      >
        Reservá online
      </a>
    </section>
  </PageShell>
</template>
