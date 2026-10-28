<template>
  <details class="rules-note">
    <summary class="rules-note__summary">
      <q-icon name="info" size="20px" class="rules-note__icon" />
      <span>Cómo funcionan las reservas</span>
      <q-icon name="expand_more" size="22px" class="rules-note__chevron" />
    </summary>
    <p class="rules-note__text"><slot /></p>
  </details>
</template>

<style scoped lang="scss">
@import 'src/css/premium-card';

// Nota plegable de Reservas (sketch 013 A): card blanca con borde, cerrada por defecto. <details>
// da el botón accesible (teclado, aria-expanded implícito) sin JS.
.rules-note {
  margin-top: 16px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid $pd-light-line;
}

.rules-note__summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 10px 14px;
  cursor: pointer;
  list-style: none;
  font-family: 'Geologica', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: $pd-ink;

  &::-webkit-details-marker {
    display: none;
  }

  &:focus-visible {
    outline: 2px solid $pd-terra-ink;
    outline-offset: 2px;
    border-radius: 14px;
  }
}

.rules-note__icon {
  color: $pd-terra-ink;
}

.rules-note__chevron {
  margin-left: auto;
  color: $pd-ink-2;
  transition: transform 0.2s ease;
}

.rules-note[open] .rules-note__chevron {
  transform: rotate(180deg);
}

.rules-note__text {
  margin: 0;
  padding: 0 14px 14px 42px;
  font-size: 13.5px;
  line-height: 1.45;
  color: $pd-ink-2;
}

@media (prefers-reduced-motion: reduce) {
  .rules-note__chevron {
    transition: none;
  }
}
</style>
