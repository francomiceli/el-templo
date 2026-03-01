<script setup lang="ts">
useHead({
  title: "El Templo | Escuela de Movimiento",
});
</script>

<template>
  <main>
    <!-- Section: Design System Validation -->
    <section class="section">
      <div class="section__container">
        <span class="section__tag">Sistema de Diseno</span>
        <h2 class="section__title">Validacion visual del design system.</h2>
        <p class="section__subtitle">
          Esta pagina valida que todos los tokens, tipografias y componentes del
          design system estan cargados correctamente.
        </p>
      </div>
    </section>

    <!-- Section: Typography -->
    <section class="section section--warm-stone">
      <div class="section__container">
        <span class="section__tag">Tipografia</span>
        <h2 class="section__title">Montserrat ExtraBold — Titulos.</h2>
        <p
          :style="{
            fontFamily: 'var(--font-elegance)',
            fontStyle: 'italic',
            fontSize: '20px',
            color: 'var(--color-charcoal-mist)',
            marginBottom: 'var(--space-spacious)',
          }"
        >
          Cormorant Garamond Italic — Subtitulos y frases destacadas.
        </p>
        <p
          :style="{
            fontFamily: 'var(--font-clarity)',
            fontSize: '16px',
            color: 'var(--color-deep-charcoal)',
            lineHeight: '1.6',
          }"
        >
          Geologica Regular — Texto de cuerpo, botones y texto funcional. Esta
          fuente se usa para la mayoria del contenido de la pagina.
        </p>
      </div>
    </section>

    <!-- Section: Buttons -->
    <section class="section">
      <div class="section__container">
        <span class="section__tag">Botones</span>
        <h2 class="section__title">Variantes de botones.</h2>
        <div
          :style="{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-comfortable)',
            alignItems: 'center',
            marginTop: 'var(--space-spacious)',
          }"
        >
          <a href="#" class="btn btn--primary">Primario Terracotta</a>
          <a href="#" class="btn btn--ghost">Ghost Terracotta &rarr;</a>
          <a href="#" class="btn btn--secondary-gold">Secundario Gold</a>
          <a href="#" class="btn btn--secondary-azul">Secundario Azul</a>
        </div>
      </div>
    </section>

    <!-- Section: Placeholder -->
    <section class="section section--warm-stone">
      <div class="section__container">
        <span class="section__tag">Placeholders</span>
        <h2 class="section__title">Componente placeholder.</h2>
        <div
          :style="{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 'var(--space-spacious)',
            marginTop: 'var(--space-spacious)',
          }"
        >
          <PlaceholderBox label="Video pendiente" aspect-ratio="16/9" />
          <PlaceholderBox label="Imagen pendiente" aspect-ratio="4/5" />
          <PlaceholderBox label="Logo pendiente" height="80px" />
        </div>
      </div>
    </section>
  </main>
</template>
