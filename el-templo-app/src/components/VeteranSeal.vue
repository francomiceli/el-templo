<template>
  <button
    v-if="tier"
    class="veteran-seal"
    :class="[`veteran-seal--${tier}`, { 'veteran-seal--pop': popping }]"
    :aria-label="label"
    @click="pop"
    @animationend="popping = false"
  >
    <svg class="veteran-seal__rosette" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <!-- Fase 214 (D-61): el oro del sello pasa a roseta crema, sin dorado (el dorado es de Aura). -->
        <linearGradient id="veteran-seal-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#fbf8f3" />
          <stop offset="1" stop-color="#f2ede5" />
        </linearGradient>
        <linearGradient id="veteran-seal-silver" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f2f3f6" />
          <stop offset="0.55" stop-color="#c8ccd4" />
          <stop offset="1" stop-color="#9aa0ab" />
        </linearGradient>
        <linearGradient id="veteran-seal-bronze" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#e8c9a0" />
          <stop offset="0.55" stop-color="#c98a4e" />
          <stop offset="1" stop-color="#8a5a2b" />
        </linearGradient>
      </defs>
      <polygon
        points="24,12 21.85,14.64 22.39,18 19.21,19.21 18,22.39 14.64,21.85 12,24 9.36,21.85 6,22.39 4.79,19.21 1.61,18 2.15,14.64 0,12 2.15,9.36 1.61,6 4.79,4.79 6,1.61 9.36,2.15 12,0 14.64,2.15 18,1.61 19.21,4.79 22.39,6 21.85,9.36"
        :fill="`url(#veteran-seal-${tier})`"
        :stroke="tier === 'gold' ? '#d9cfc1' : `url(#veteran-seal-${tier})`"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
    </svg>
    <!-- Oro: logo terracota (máscara del mismo archivo). Bronce y plata: logo blanco. -->
    <span
      v-if="tier === 'gold'"
      class="veteran-seal__logo veteran-seal__logo--ink"
      aria-hidden="true"
    />
    <img v-else src="/logo.webp" alt="" class="veteran-seal__logo" />
    <q-tooltip anchor="bottom middle" self="top middle" :offset="[0, 6]">{{ label }}</q-tooltip>
  </button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  /**
   * Fecha de alta del socio (ISO). El sello de permanencia se muestra a partir
   * de los 3 meses y sube de nivel con la antigüedad:
   *   3m → bronce · 6m → plata · 1 año+ → oro (el look histórico del veterano).
   * null o < 3 meses → no se renderiza.
   */
  since: string | null
}>()

type Tier = 'bronze' | 'silver' | 'gold'

/** Meses de calendario completos desde el alta (día-aware, en UTC como el backend). */
const months = computed(() => {
  if (!props.since) return 0
  const s = new Date(props.since)
  if (Number.isNaN(s.getTime())) return 0
  const now = new Date()
  let m = (now.getUTCFullYear() - s.getUTCFullYear()) * 12 + (now.getUTCMonth() - s.getUTCMonth())
  if (now.getUTCDate() < s.getUTCDate()) m -= 1
  return Math.max(0, m)
})

const tier = computed<Tier | null>(() => {
  const m = months.value
  if (m >= 12) return 'gold'
  if (m >= 6) return 'silver'
  if (m >= 3) return 'bronze'
  return null
})

const label = computed(() => {
  if (!props.since || !tier.value) return ''
  if (tier.value === 'bronze') return '3 meses en El Templo'
  if (tier.value === 'silver') return '6 meses en El Templo'
  // Oro: conserva el texto histórico del sello de veterano, con los años.
  const sinceLabel = new Date(props.since).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
  })
  const y = Math.floor(months.value / 12)
  return `Miembro del Templo desde ${sinceLabel} · ${y === 1 ? '1 año' : `${y} años`}`
})

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
  width: 21px;
  height: 21px;
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
  // Bronce y plata un 8% más oscuros para que el logo blanco resalte. El oro (crema) va sin filtro.
  filter: brightness(0.92);

  .veteran-seal--gold & {
    filter: none;
  }
}

.veteran-seal__logo {
  position: relative;
  width: 80%;
  height: 82%;
  object-fit: contain;
  // El logo es bronze sobre transparente — llevarlo a blanco pleno
  filter: brightness(0) invert(1);

  // Oro: logo terracota (4.76:1 sobre la roseta crema), pintado con el mismo archivo como máscara.
  &--ink {
    display: block;
    background: $pd-terra-ink;
    filter: none;
    -webkit-mask: url('/logo.webp') center / contain no-repeat;
    mask: url('/logo.webp') center / contain no-repeat;
  }
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
