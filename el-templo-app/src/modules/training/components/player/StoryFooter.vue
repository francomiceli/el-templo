<template>
  <!-- Fade a negro al pie del video con el ejercicio de AHORA (sketch 026, variante A + cantidad de
       la C). No captura toques: las zonas de tap de la historia siguen avanzando por encima. -->
  <div class="story-footer" :style="badgeStyle" aria-live="polite">
    <div class="story-footer__fade" />
    <div class="story-footer__caption">
      <div class="story-footer__text">
        <div v-if="footer.badge || footer.label" class="story-footer__kicker">
          <span
            v-if="footer.badge"
            class="story-footer__badge"
            :class="`story-footer__badge--${footer.badge.kind}`"
          >
            {{ footer.badge.label }}
          </span>
          <span v-if="footer.label" class="story-footer__label">{{ footer.label }}</span>
        </div>
        <div class="story-footer__name">{{ footer.name }}</div>
      </div>
      <div
        v-if="footer.value"
        class="story-footer__value"
        :class="`story-footer__value--${footer.valueSize}`"
      >
        {{ footer.value }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CONTRACTION_BADGE_WIDTH_PX } from '../../utils/contraction'
import type { PlayerFooter } from '../../utils/playerFooter'

interface Props {
  footer: PlayerFooter
}

defineProps<Props>()

// Ancho fijo de la insignia: sale de la util para que los tres colores midan lo mismo
const badgeStyle = computed(() => ({ '--tempo-badge-w': `${CONTRACTION_BADGE_WIDTH_PX}px` }))
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';
@import 'src/css/premium-card';

// Colores de contracción = los de la TV (#tvScreenRoot): CON carbón, EXC bronce, ISO arena
$tv-ink: #3d3732;
$tv-gold: #b08d6e;
$exc-bronze: #7a5c42;
$tv-sand: #dbcab4;
$tv-cream: #f2ebe1;

.story-footer {
  position: absolute;
  inset: auto 0 0;
  z-index: 3; // debajo de las zonas de tap (z-index 5)
  pointer-events: none;
}

.story-footer__fade {
  position: absolute;
  inset: auto 0 0;
  height: 150px;
  background: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(12, 10, 8, 0.55) 45%,
    rgba(12, 10, 8, 0.92) 100%
  );
}

.story-footer__caption {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 12px;
  padding: 0 16px 14px;
  color: #fff;
}

.story-footer__text {
  flex: 1 1 0;
  min-width: 0;
}

.story-footer__kicker {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.story-footer__badge {
  flex: none;
  box-sizing: border-box;
  min-width: var(--tempo-badge-w, 42px);
  padding: 2px 4px;
  border-radius: 5px;
  text-align: center;
  font-family: 'Montserrat', sans-serif;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.05;

  &--con {
    background: $tv-ink;
    color: $tv-cream;
    // Sobre el fade oscuro el carbón se pierde: un filo claro lo despega
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.25);
  }

  &--exc {
    background: $exc-bronze;
    color: $tv-cream;
  }

  &--iso {
    background: $tv-sand;
    color: $tv-ink;
  }

  &--mov {
    background: transparent;
    color: $tv-cream;
    border: 1.5px solid $tv-gold;
    font-size: 10px;
    padding: 1px 2px;
  }
}

.story-footer__label {
  font-family: 'Montserrat', sans-serif;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: $pd-cream-2;
}

.story-footer__name {
  font-family: 'Montserrat', sans-serif;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.15;
  overflow-wrap: anywhere;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
}

// Cantidad en Cinzel crema, como el contador de la TV. Los valores largos achican el cuerpo
.story-footer__value {
  flex: 0 1 auto;
  max-width: 52%;
  font-family: 'Cinzel', Georgia, serif;
  font-weight: 800;
  line-height: 0.9;
  text-align: right;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
  color: $pd-cream;
  text-shadow: 0 2px 14px rgba(0, 0, 0, 0.55);

  &--xl {
    font-size: 58px;
  }

  &--lg {
    font-size: 40px;
  }

  &--md {
    font-size: 28px;
    line-height: 1;
  }

  &--sm {
    font-size: 20px;
    line-height: 1.1;
  }
}
</style>
