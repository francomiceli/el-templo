<template>
  <button
    v-if="tier"
    class="veteran-seal"
    :class="{ 'veteran-seal--pop': popping }"
    :aria-label="label"
    @click="pop"
    @animationend="popping = false"
  >
    <!-- El polvillo dorado se reserva para el sello de oro (1 año+): es el hito
         más grande y así los tres niveles se distinguen de un vistazo. -->
    <span v-if="tier === 'gold'" class="veteran-seal__dust" aria-hidden="true">
      <span v-for="n in 7" :key="n" :class="`veteran-seal__mote veteran-seal__mote--${n}`" />
    </span>
    <svg class="veteran-seal__rosette" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="veteran-seal-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f5dd7e" />
          <stop offset="0.55" stop-color="#e0b93f" />
          <stop offset="1" stop-color="#b28a24" />
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
        :stroke="`url(#veteran-seal-${tier})`"
        stroke-width="1.2"
        stroke-linejoin="round"
      />
    </svg>
    <img src="/logo.webp" alt="" class="veteran-seal__logo" />
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
  let m =
    (now.getUTCFullYear() - s.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - s.getUTCMonth())
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
$seal-gold-light: #f5dd7e;

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
  // Oro un 15% menos claro que el gradiente base para que el logo blanco resalte
  filter: brightness(0.92);
}

.veteran-seal__logo {
  position: relative;
  width: 80%;
  height: 82%;
  object-fit: contain;
  // El logo es bronze sobre transparente — llevarlo a blanco pleno
  filter: brightness(0) invert(1);
}

// Partículas doradas concentradas alrededor del sello — mismo espíritu que el
// dust-field del login, pero en un radio de ~20px alrededor del badge.
// Las motas nacen a la altura del borde inferior del badge (bottom: 0 del
// contenedor = bottom del sello), no debajo de él — así no invaden la línea
// de la fecha.
.veteran-seal__dust {
  position: absolute;
  inset: -12px -12px 0;
  pointer-events: none;
}

.veteran-seal__mote {
  position: absolute;
  bottom: 2px;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: rgba($seal-gold-light, 0.85);
  animation: veteran-mote-float linear infinite;
}

@keyframes veteran-mote-float {
  0% {
    opacity: 0;
    transform: translateY(0) translateX(0);
  }

  15% {
    opacity: 1;
  }

  75% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translateY(-26px) translateX(var(--drift));
  }
}

.veteran-seal__mote--1 {
  left: 12%;
  --drift: 5px;
  animation-duration: 3.2s;
  animation-delay: 0s;
}

.veteran-seal__mote--2 {
  left: 32%;
  --drift: -4px;
  animation-duration: 4.1s;
  animation-delay: 1.2s;
}

.veteran-seal__mote--3 {
  left: 50%;
  --drift: 6px;
  animation-duration: 3.6s;
  animation-delay: 0.6s;
  width: 3px;
  height: 3px;
  background: rgba(white, 0.8);
}

.veteran-seal__mote--4 {
  left: 68%;
  --drift: -5px;
  animation-duration: 4.5s;
  animation-delay: 2s;
}

.veteran-seal__mote--5 {
  left: 84%;
  --drift: 4px;
  animation-duration: 3.4s;
  animation-delay: 0.3s;
}

.veteran-seal__mote--6 {
  left: 22%;
  --drift: 7px;
  animation-duration: 4.8s;
  animation-delay: 2.8s;
  width: 3px;
  height: 3px;
}

.veteran-seal__mote--7 {
  left: 76%;
  --drift: -6px;
  animation-duration: 3.9s;
  animation-delay: 1.6s;
  background: rgba(white, 0.7);
}
/* chore(staging): re-trigger de deploy (paths-filter/event.before) — solo staging. */
</style>
