<script setup lang="ts">
import { sedes } from "~/data/sedes";
import { faqItems } from "~/data/faq";

useHead({
  title: "El Templo | Escuela de Movimiento y Calistenia",
  meta: [
    {
      name: "description",
      content:
        "Escuela de calistenia con m\u00E9todo propio y 6 niveles. Entrenamiento con peso corporal en 8 sedes de Mar del Plata y Barcelona. Tu primera sesi\u00F3n es gratis.",
    },
    {
      property: "og:title",
      content: "El Templo | Escuela de Movimiento y Calistenia",
    },
    {
      property: "og:description",
      content:
        "Escuela de calistenia con m\u00E9todo propio. Entrenamiento funcional con peso corporal. 8 sedes, 6 niveles, primera sesi\u00F3n gratis.",
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
