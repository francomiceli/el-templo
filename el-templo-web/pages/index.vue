<script setup lang="ts">
import { sedes } from "~/data/sedes";
import { faqItems } from "~/data/faq";

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
        "Escuela de calistenia con m\u00E9todo propio y 6 niveles. Entrenamiento con peso corporal en 8 sedes de Mar del Plata y Barcelona. Tu primera sesi\u00F3n es gratis.",
    },
    {
      property: "og:title",
      content: "El Templo | Calistenia, Movimiento Funcional y Peso Corporal",
    },
    {
      property: "og:description",
      content:
        "Escuela de calistenia y movimiento funcional. Entrenamiento con peso corporal en 8 sedes. M\u00E9todo propio, 6 niveles. Primera sesi\u00F3n gratis.",
    },
    { property: "og:url", content: "https://eltemplo.org" },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "El Templo" },
  ],
  link: [{ rel: "canonical", href: "https://eltemplo.org" }],
});

useSchemaOrg([
  // LocalBusiness per sede
  ...sedes.map((sede) =>
    defineLocalBusiness({
      name: `El Templo ${sede.name}`,
      "@type": "SportsActivityLocation",
      address: {
        "@type": "PostalAddress",
        streetAddress: sede.address,
        addressLocality: sede.city,
        addressCountry: sede.city === "Barcelona" ? "ES" : "AR",
      },
      url: "https://eltemplo.org",
      telephone: "+54-9-223-582-0521",
      ...(sede.lat && sede.lng
        ? {
            geo: {
              "@type": "GeoCoordinates",
              latitude: sede.lat,
              longitude: sede.lng,
            },
          }
        : {}),
    }),
  ),
  // FAQPage schema
  defineWebPage({ "@type": "FAQPage" }),
  ...faqItems.map((item) =>
    defineQuestion({
      name: item.question,
      acceptedAnswer: item.answer,
    }),
  ),
]);
</script>

<template>
  <main>
    <SectionHero />

    <section id="intro" class="seo-intro">
      <p class="seo-intro__text">
        El Templo es la escuela de calistenia con m&eacute;todo propio
        m&aacute;s grande de Argentina. Entrenamiento funcional con peso
        corporal en 8 sedes de Mar del Plata y Barcelona. 6 niveles de
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
