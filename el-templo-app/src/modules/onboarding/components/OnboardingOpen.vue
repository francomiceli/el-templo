<template>
  <div class="open-screen">
    <h1 class="open-hero">Tu cuerpo<br />es tu templo.</h1>

    <p class="open-tagline">Esto no es un gimnasio: es una escuela de calistenia.</p>

    <p class="open-manifesto">
      Entrenamos con lo esencial.<br />
      Sin máquinas, sin atajos.<br />
      Tu propio cuerpo y un método que transforma.
    </p>

    <p class="open-origin">
      Luego de años de práctica y enseñanza en calistenia,<br />
      nuestra experiencia toma forma digital para acompañarte donde estés.
    </p>

    <div class="open-rule" aria-hidden="true" />

    <p class="open-reciprocity">
      Antes de empezar, tomemos un momento.<br />
      Queremos mostrarte quiénes somos,<br />
      y saber quién sos.
    </p>

    <q-btn label="Empezar el camino" unelevated no-caps class="open-cta" @click="emit('start')" />
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  start: []
}>()
</script>

<style lang="scss" scoped>
@import 'src/css/brand';

$terracotta: $brand-terracotta;
$cream: #f2ede5;

.open-screen {
  width: 100%;
  max-width: 420px;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 24px;
}

.open-hero {
  font-family: 'Montserrat', sans-serif;
  font-weight: 800;
  font-size: 1.75rem;
  line-height: 1.1;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: $cream;
  margin: 0;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
  animation: fade-up 600ms ease both;
}

.open-tagline {
  font-family: 'Geologica', sans-serif;
  font-weight: 300;
  font-style: italic;
  font-size: 0.9375rem;
  line-height: 1.45;
  color: rgba($cream, 0.8);
  margin: 0;
  max-width: 340px;
  animation: fade-up 600ms 150ms ease both;
}

.open-manifesto {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.9375rem;
  line-height: 1.7;
  color: rgba($cream, 0.72);
  margin: 0;
  max-width: 340px;
  animation: fade-up 600ms 300ms ease both;
}

.open-origin {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.9375rem;
  line-height: 1.7;
  color: rgba($cream, 0.72);
  margin: 0;
  max-width: 340px;
  animation: fade-up 600ms 450ms ease both;
}

.open-rule {
  width: 48px;
  height: 1px;
  background: rgba($terracotta, 0.7);
  margin: 4px 0;
  animation: fade-up 600ms 600ms ease both;
}

.open-reciprocity {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 1rem;
  line-height: 1.6;
  color: rgba($cream, 0.88);
  margin: 0;
  max-width: 340px;
  animation: fade-up 600ms 750ms ease both;
}

.open-cta {
  background: linear-gradient(135deg, $terracotta 0%, #ad6540 100%) !important;
  color: $cream !important;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 0.9375rem;
  letter-spacing: 0.18em;
  padding: 14px 32px;
  border-radius: 8px;
  margin-top: 12px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
  animation: fade-up 600ms 950ms ease both;
  transition:
    box-shadow 0.3s ease,
    transform 0.2s ease;

  &:hover {
    box-shadow:
      0 6px 24px rgba($terracotta, 0.55),
      0 0 48px rgba($terracotta, 0.18);
    transform: scale(1.02);
  }

  &:active {
    transform: scale(0.98);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .open-hero,
  .open-tagline,
  .open-manifesto,
  .open-origin,
  .open-rule,
  .open-reciprocity,
  .open-cta {
    animation: none;
  }
}
</style>
