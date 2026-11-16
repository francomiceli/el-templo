<template>
  <!-- Insignia de contracción (CON / EXC / ISO, o MOV para la movilidad) con los colores de la TV.
       La comparten el pie del player, la lista de ejercicios de Semana y el resumen de sesión, así
       el mismo ejercicio se ve igual en las tres pantallas. -->
  <span
    class="contraction-badge"
    :class="[`contraction-badge--${badge.kind}`, `contraction-badge--on-${surface}`]"
    :style="widthStyle"
  >
    {{ badge.label }}
  </span>
</template>

<script setup lang="ts">
import { CONTRACTION_BADGE_WIDTH_PX } from '../utils/contraction'
import type { FooterBadge } from '../utils/playerFooter'

interface Props {
  badge: FooterBadge
  /**
   * Fondo sobre el que va: `dark` (el fade negro del video) suma un filo claro al CON para que el
   * carbón no se pierda; `light` (cards crema de Semana y del resumen) no lo necesita.
   */
  surface?: 'dark' | 'light'
}

withDefaults(defineProps<Props>(), { surface: 'light' })

// Ancho fijo: las tres insignias miden lo mismo y los nombres quedan alineados
const widthStyle = { minWidth: `${CONTRACTION_BADGE_WIDTH_PX}px` }
</script>

<style scoped lang="scss">
// Colores de contracción = los de la TV (#tvScreenRoot): CON carbón, EXC bronce, ISO arena
$tv-ink: #3d3732;
$tv-gold: #b08d6e;
$exc-bronze: #7a5c42;
$tv-sand: #dbcab4;
$tv-cream: #f2ebe1;

.contraction-badge {
  flex: none;
  box-sizing: border-box;
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
  }

  // Sobre el fade oscuro el carbón se pierde: un filo claro lo despega
  &--con.contraction-badge--on-dark {
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
    border: 1.5px solid $tv-gold;
    font-size: 10px;
    padding: 1px 2px;
  }

  &--mov.contraction-badge--on-dark {
    color: $tv-cream;
  }

  &--mov.contraction-badge--on-light {
    color: $tv-ink;
  }
}
</style>
