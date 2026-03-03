<script setup lang="ts">
/**
 * /academy — Olympic Academy landing page.
 *
 * Composes all 10 academy sections in spec order:
 * Hero -> QueEs -> Programa -> Niveles -> Flywheel -> Modalidades ->
 * QuienEnsena -> Inversion -> Faq -> Form
 * Plus sticky side menu (desktop) and floating WhatsApp button.
 *
 * Uses default layout (AppNav + AppPrefooter + AppFooter shared with home).
 * SEO meta tags for trainer certification keyword targeting.
 */

const { cleanup: cleanupTracking } = useSectionTracking({
  sections: {
    "hero-academy": "viewed_academy_hero",
    "que-es-academy": "viewed_academy_que_es",
    "programa-academy": "viewed_academy_programa",
    "niveles-academy": "viewed_academy_niveles",
    "flywheel-academy": "viewed_academy_flywheel",
    "modalidades-academy": "viewed_academy_modalidades",
    "quien-ensena-academy": "viewed_academy_quien_ensena",
    "inversion-academy": "viewed_academy_inversion",
    "faq-academy": "viewed_academy_faq",
    "formulario-academy": "viewed_academy_form",
  },
});
onUnmounted(() => cleanupTracking());

useHead({
  title:
    "Olympic Academy \u2014 Formaci\u00F3n de Entrenadores | El Templo Calistenia",
  meta: [
    {
      name: "description",
      content:
        "Certificaci\u00F3n profesional en calistenia. 3 niveles: Trainer, Olympic Trainer, Spartan Trainer. Presencial con Ignacio Bordon y online. Intensivo de 1 mes.",
    },
    {
      property: "og:title",
      content:
        "Olympic Academy \u2014 Form\u00E1 Entrenadores. Forj\u00E1 L\u00EDderes.",
    },
    {
      property: "og:description",
      content:
        "La formaci\u00F3n oficial de El Templo Calistenia. 3 niveles de certificaci\u00F3n. Presencial y online.",
    },
    { property: "og:url", content: "https://eltemplo.org/academy" },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "El Templo" },
    {
      property: "og:image",
      content: "https://eltemplo.org/images/og-academy.jpg",
    },
  ],
  link: [{ rel: "canonical", href: "https://eltemplo.org/academy" }],
});

useSchemaOrg([
  defineWebPage({
    "@type": "WebPage",
    name: "Olympic Academy \u2014 Formaci\u00F3n de Entrenadores",
    description:
      "Certificaci\u00F3n profesional en calistenia por El Templo.",
  }),
  {
    "@type": "Course",
    name: "Olympic Academy \u2014 Trainer by El Templo",
    description:
      "Certificaci\u00F3n profesional de entrenador de calistenia. Programa intensivo de 1 mes con 3 niveles progresivos.",
    provider: {
      "@type": "Organization",
      name: "El Templo Calistenia",
      url: "https://eltemplo.org",
    },
    hasCourseInstance: [
      {
        "@type": "CourseInstance",
        courseMode: "Blended",
        name: "Nivel 1 \u2014 Trainer",
        duration: "P1M",
      },
    ],
  },
]);
</script>

<template>
  <main class="academy-page">
    <AcademySideMenu />
    <div class="academy-page__content">
      <AcademyHero />
      <AcademyQueEs />
      <AcademyPrograma />
      <AcademyNiveles />
      <AcademyFlywheel />
      <AcademyModalidades />
      <AcademyQuienEnsena />
      <AcademyInversion />
      <AcademyFaq />
      <AcademyForm />
    </div>
    <AcademyWhatsApp />
  </main>
</template>

<style scoped>
/* ==========================================================================
   Academy Page — Layout container
   ========================================================================== */

.academy-page {
  position: relative;
}

.academy-page__content {
  /* No margin on mobile/tablet — side menu is hidden */
}

/* Desktop: shift content right to accommodate sticky side menu */
@media (min-width: 1200px) {
  .academy-page__content {
    margin-left: 240px;
  }
}
</style>
