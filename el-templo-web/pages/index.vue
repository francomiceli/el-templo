<script setup lang="ts">
import { sedesCount, webData } from "~/data/sedes";
import { jsonLdScript, organizationNode } from "~/utils/schema-graph";

const { cleanup: cleanupTracking } = useSectionTracking({
  sections: {
    hero: "viewed_hero",
    "que-es": "viewed_identity",
    metodo: "viewed_method",
    niveles: "viewed_levels",
    enfoques: "viewed_approaches",
    "descubri-nivel": "viewed_conversion",
    sedes: "viewed_locations",
    comunidad: "viewed_community",
    ecosistema: "viewed_ecosystem",
    faq: "viewed_faq",
  },
});
onUnmounted(() => cleanupTracking());

useHead({
  title: "El Templo | Calistenia, Movimiento Funcional y Peso Corporal",
  meta: [
    {
      name: "description",
      content:
        `Escuela de calistenia con m\u00E9todo propio y 6 niveles. Entrenamiento con peso corporal en ${sedesCount.total} sedes de Mar del Plata y Barcelona. Tu primera sesi\u00F3n es gratis.`,
    },
    {
      property: "og:title",
      content: "El Templo | Calistenia, Movimiento Funcional y Peso Corporal",
    },
    {
      property: "og:description",
      content:
        `Escuela de calistenia y movimiento funcional. Entrenamiento con peso corporal en ${sedesCount.total} sedes. M\u00E9todo propio, 6 niveles. Primera sesi\u00F3n gratis.`,
    },
    { property: "og:url", content: "https://eltemplo.org" },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "El Templo" },
  ],
  link: [{ rel: "canonical", href: "https://eltemplo.org" }],
});

// Solo el Organization: las sedes tienen su ExerciseGym en /sedes/<slug>.
useHead({ script: [jsonLdScript([organizationNode(webData)])] });
</script>

<template>
  <main>
    <SectionHero />

    <section id="intro" class="seo-intro">
      <p class="seo-intro__text">
        El Templo es una escuela de calistenia con m&eacute;todo propio con
        sedes en Argentina y Espa&ntilde;a. Entrenamiento funcional con peso
        corporal en {{ sedesCount.total }} sedes de Mar del Plata y Barcelona. 6 niveles de
        progresi&oacute;n, sesiones ROM y SKILLS, y una comunidad de m&aacute;s
        de 1000 alumnos.
      </p>
    </section>

    <SectionIdentity />
    <SectionMethod />

    <SectionLevels />
    <SectionApproaches />
    <SectionConversion />

    <SectionLocations />
    <SectionCommunity />
    <SectionEcosystem />
    <SectionFaq />
    <FranWhatsApp />
  </main>
</template>

<style scoped>
.seo-intro {
  padding: var(--space-base) 5%;
  background: var(--color-warm-stone);
  text-align: center;
}

.seo-intro__text {
  font-family: var(--font-clarity);
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-olive-stone);
  max-width: 720px;
  margin: 0 auto;
}
</style>
