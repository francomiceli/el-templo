<template>
  <button
    v-if="rings !== null"
    class="veteran-seal"
    :class="[`veteran-seal--rings-${rings}`, { 'veteran-seal--pop': popping }]"
    :aria-label="label"
    @click="pop"
    @animationend="popping = false"
  >
    <!-- Fase 215 (#18, boceto 036 variante B): los tres niveles son la misma roseta crema con el
         logo terracota, chico y del mismo tamaño. El nivel lo marca la cantidad de anillos
         terracota: ninguno a los 3 meses, uno a los 6 y dos al año o más. Solo tokens de la
         paleta (el dorado queda para Aura). -->
    <svg class="veteran-seal__rosette" viewBox="0 0 24 24" aria-hidden="true">
      <polygon
        class="veteran-seal__plate"
        points="24,12 21.85,14.64 22.39,18 19.21,19.21 18,22.39 14.64,21.85 12,24 9.36,21.85 6,22.39 4.79,19.21 1.61,18 2.15,14.64 0,12 2.15,9.36 1.61,6 4.79,4.79 6,1.61 9.36,2.15 12,0 14.64,2.15 18,1.61 19.21,4.79 22.39,6 21.85,9.36"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
      <circle v-if="rings === 1" class="veteran-seal__ring" cx="12" cy="12" r="9.2" />
      <template v-if="rings === 2">
        <circle class="veteran-seal__ring" cx="12" cy="12" r="10" />
        <circle class="veteran-seal__ring" cx="12" cy="12" r="8" />
      </template>
    </svg>
    <span class="veteran-seal__logo" aria-hidden="true" />
    <q-tooltip anchor="bottom middle" self="top middle" :offset="[0, 6]">{{ label }}</q-tooltip>
  </button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { monthsSince, sealLabel, sealRings } from 'src/utils/veteran-seal'

const props = defineProps<{
  /**
   * Fecha de alta del socio (ISO). El sello de permanencia se muestra a partir
   * de los 3 meses y suma un anillo terracota por nivel:
   *   3m → sin anillos · 6m → un anillo · 1 año+ → dos anillos.
   * null o < 3 meses → no se renderiza.
   */
  since: string | null
}>()

const months = computed(() => monthsSince(props.since))
const rings = computed(() => sealRings(months.value))
const label = computed(() => sealLabel(props.since, months.value))

const popping = ref(false)

function pop() {
  popping.value = false
  requestAnimationFrame(() => {
    popping.value = true
  })
}
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.veteran-seal {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  margin-left: 7px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  vertical-align: -2px;
  line-height: 0;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
  transition: transform 150ms ease;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    transform: scale(1.12);
  }

  &--pop {
    animation: veteran-seal-pop 450ms cubic-bezier(0.3, 1.6, 0.5, 1);
  }
}

@keyframes veteran-seal-pop {
  0% {
    transform: scale(1);
  }

  40% {
    transform: scale(1.35) rotate(-6deg);
  }

  100% {
    transform: scale(1);
  }
}

.veteran-seal__rosette {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

// Roseta crema con borde Warm Stone y anillos terracota (tokens de quasar.variables y de la marca).
.veteran-seal__plate {
  fill: $cream;
  stroke: $cream-dark;
}

.veteran-seal__ring {
  fill: none;
  stroke: $pd-terra-ink;
  stroke-width: 0.9;
}

// Logo terracota, chico y del MISMO tamaño en los tres niveles (10 de 24 del sello), pintado con
// el mismo archivo como máscara.
.veteran-seal__logo {
  position: relative;
  display: block;
  width: 42%;
  height: 42%;
  background: $pd-terra-ink;
  -webkit-mask: url('/logo.webp') center / contain no-repeat;
  mask: url('/logo.webp') center / contain no-repeat;
}

// Movimiento reducido: sin escala al pasar ni "pop" al tocar (Fase 214, plan 23).
@media (prefers-reduced-motion: reduce) {
  .veteran-seal {
    transition: none;

    &:hover {
      transform: none;
    }

    &--pop {
      animation: none;
    }
  }
}
/* chore(staging): re-trigger de deploy (paths-filter/event.before) — solo staging. */
/* reintento 2 tras incidente de GitHub Actions (2026-08-06). */
/* reintento 3 (2026-08-07): GitHub Actions ya se recuperó, re-disparar CI+deploy de staging. */
</style>
