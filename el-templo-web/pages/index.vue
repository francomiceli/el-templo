<script setup lang="ts">
useHead({
  title: "El Templo | Escuela de Movimiento",
});
</script>

<template>
  <main>
    <!-- HERO placeholder (Phase 31) -->
    <section
      id="hero"
      class="section section--deep-charcoal"
      style="
        min-height: 60vh;
        display: flex;
        align-items: center;
        justify-content: center;
      "
    >
      <div class="section__container" style="text-align: center">
        <h1
          style="
            font-family: var(--font-authority);
            font-weight: 800;
            font-size: 48px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--color-marble-cream);
            line-height: 1.2;
            margin-bottom: var(--space-comfortable);
          "
        >
          Tu cuerpo es tu templo.
        </h1>
        <p
          style="
            font-family: var(--font-elegance);
            font-style: italic;
            font-size: 22px;
            color: rgba(242, 237, 229, 0.9);
            max-width: 600px;
            margin: 0 auto var(--space-spacious);
          "
        >
          8 sedes donde la calistenia se practica como lo que es: el arte mas
          antiguo de forjar el cuerpo con su propio peso.
        </p>
        <a
          href="#sesion-prueba"
          class="btn btn--primary"
          style="margin-bottom: var(--space-base)"
        >
          Comenza tu camino
        </a>
        <p
          style="
            font-family: var(--font-clarity);
            font-size: 13px;
            color: rgba(242, 237, 229, 0.7);
            margin-bottom: var(--space-base);
          "
        >
          Tu primera sesion es sin cargo.
        </p>
        <NuxtLink to="/franquicias" class="btn btn--secondary-gold">
          Abri tu Templo
        </NuxtLink>
      </div>
    </section>

    <!-- El Metodo anchor stub (Phase 31) -->
    <section id="metodo" class="section">
      <div class="section__container">
        <span class="section__tag">Metodo</span>
        <h2 class="section__title">Nuestro metodo.</h2>
        <p class="section__subtitle">Seccion en desarrollo — Phase 31</p>
        <PlaceholderBox
          label="Contenido del metodo pendiente"
          aspect-ratio="16/9"
        />
      </div>
    </section>

    <!-- Niveles anchor stub (Phase 32) -->
    <section id="niveles" class="section section--warm-stone">
      <div class="section__container">
        <span class="section__tag">Niveles</span>
        <h2 class="section__title">Sistema de niveles.</h2>
        <p class="section__subtitle">Seccion en desarrollo — Phase 32</p>
        <PlaceholderBox
          label="Contenido de niveles pendiente"
          aspect-ratio="16/9"
        />
      </div>
    </section>

    <!-- Enfoques anchor stub (Phase 32) -->
    <section id="enfoques" class="section">
      <div class="section__container">
        <span class="section__tag">Enfoques</span>
        <h2 class="section__title">Los 5 enfoques.</h2>
        <p class="section__subtitle">Seccion en desarrollo — Phase 32</p>
        <PlaceholderBox
          label="Contenido de enfoques pendiente"
          aspect-ratio="16/9"
        />
      </div>
    </section>

    <!-- Descubri tu Nivel anchor stub (Phase 32) -->
    <section id="descubri-nivel" class="section section--warm-stone">
      <div class="section__container">
        <span class="section__tag">Descubri tu nivel</span>
        <h2 class="section__title">Descubri tu nivel.</h2>
        <p class="section__subtitle">Seccion en desarrollo — Phase 32</p>
        <PlaceholderBox
          label="Contenido de conversion pendiente"
          aspect-ratio="16/9"
        />
      </div>
    </section>

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
