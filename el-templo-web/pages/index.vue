<script setup lang="ts">
useHead({
  title: "El Templo | Escuela de Movimiento",
});
</script>

<template>
  <main>
    <SectionHero />
    <SectionIdentity />
    <SectionMethod />

    <SectionLevels />
    <SectionApproaches />
    <SectionConversion />

    <!-- Sedes anchor stub (Phase 33) -->
    <section id="sedes" class="section">
      <div class="section__container">
        <span class="section__tag">Sedes</span>
        <h2 class="section__title">Nuestras sedes.</h2>
        <p class="section__subtitle">Seccion en desarrollo — Phase 33</p>
        <PlaceholderBox
          label="Contenido de sedes pendiente"
          aspect-ratio="16/9"
        />
      </div>
    </section>
  </main>
</template>
