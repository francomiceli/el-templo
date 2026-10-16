<!-- Carrusel de patrocinadores de Mi Templo (Fase 199, D-20/D-21/D-23/D-25).

     - Sin marcas (feed vacío o con error) NO renderiza nada: ni título ni hueco (L50).
     - Sin título de sección (D-23). Cards al 82 % del ancho con la siguiente asomando a
       escala .94; la activa a escala 1. SIN opacidad sobre textos: solo la marca de agua
       decorativa va atenuada (D-15).
     - Auto-avance constante (SPONSOR_ADVANCE_MS), pausa al tocar/arrastrar (retoma a los
       SPONSOR_TOUCH_PAUSE_MS), con la pestaña oculta, fuera de pantalla o con
       prefers-reduced-motion (L47). Nunca dos timers.
     - Misma card que `SponsorCardPreview.vue` del admin (L49).
     - Textos con `{{ }}` (Vue escapa); PROHIBIDO el HTML crudo de Vue (T-199-47).
     - El tap emite `open`; la hoja de detalle y el carnet los conecta el plan 19. -->
<template>
  <section
    v-if="count > 0"
    ref="sectionEl"
    class="sp-section"
    aria-roledescription="carrusel"
    aria-label="Beneficios de marcas"
    :style="{ '--spd': `${SPONSOR_ADVANCE_MS}ms` }"
  >
    <div
      ref="trackEl"
      class="sp-track"
      aria-live="off"
      @pointerdown="onTrackPointerDown"
      @scroll.passive="onTrackScroll"
    >
      <article
        v-for="(s, i) in sponsors"
        :key="s.id"
        class="sp-card"
        :class="{ 'sp-card--on': i === current }"
        :style="{ '--b-bg': s.bgColor, '--b-fg': s.textColor }"
        role="button"
        tabindex="0"
        :aria-label="`${s.name}: ${s.benefit} ${s.detail}`"
        @click="onCardClick(s)"
        @keydown.enter.self.prevent="open(s)"
      >
        <q-icon v-if="s.icon" :name="s.icon" class="sp-wm" aria-hidden="true" />
        <div class="sp-top">
          <span class="sp-logo">
            <img
              v-if="s.logoUrl"
              :src="s.logoUrl"
              alt=""
              class="sp-logo__img"
              referrerpolicy="no-referrer"
            />
            <q-icon v-else-if="s.icon" :name="s.icon" size="24px" />
            <template v-else>{{ monogram(s.name) }}</template>
          </span>
          <div class="sp-heading">
            <div class="sp-name">{{ s.name }}</div>
            <span class="sp-cat">{{ s.category }}</span>
          </div>
        </div>
        <div class="sp-deal">
          <div class="sp-deal__text">
            <b class="sp-benefit">{{ s.benefit }}</b>
            <span class="sp-detail">{{ s.detail }}</span>
          </div>
          <span class="sp-how">
            <q-icon :name="redeemPill(s).icon" size="14px" />
            {{ redeemPill(s).label }}
          </span>
        </div>
      </article>
    </div>

    <div v-if="count > 1" class="sp-dots" :class="{ 'sp-dots--paused': !running }">
      <button
        v-for="(s, i) in sponsors"
        :key="s.id"
        type="button"
        class="sp-dot-btn"
        :aria-label="`Marca ${i + 1} de ${count}`"
        :aria-current="i === current ? 'true' : undefined"
        @click="goTo(i, true)"
      >
        <span class="sp-dot" :class="{ 'sp-dot--on': i === current }">
          <!-- `:key="cycle"` reinicia la barra cada vez que se rearma el timer. -->
          <span v-if="i === current" :key="cycle" class="sp-dot__fill" />
        </span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useSponsorsStore, type Sponsor } from 'src/stores/useSponsorsStore'
import { useInViewport } from 'src/composables/useInViewport'
import {
  SPONSOR_ADVANCE_MS,
  SPONSOR_TOUCH_PAUSE_MS,
  monogram,
  sponsorRedeemPill,
  type SponsorRedeemPill,
} from '../utils/sponsors'

/** Desplazamiento a partir del cual el gesto deja de contar como tap. */
const TAP_SLOP_PX = 8
/** Debe coincidir con `padding-inline` y `scroll-padding-inline` del track y con su `gap`. */
const SIDE_PADDING_PX = 16
const CARD_GAP_PX = 10
/** Mientras dura el scroll programático se ignora el índice que dicta el scroll. */
const SMOOTH_SCROLL_GUARD_MS = 600
const INSTANT_SCROLL_GUARD_MS = 100

const emit = defineEmits<{ open: [sponsor: Sponsor] }>()

const store = useSponsorsStore()
const sponsors = computed(() => store.sponsors)
const count = computed(() => sponsors.value.length)

const sectionEl = ref<HTMLElement | null>(null)
const trackEl = ref<HTMLElement | null>(null)
const current = ref(0)

// Si la lista se achica (recarga, otro país) no quedamos fuera de rango.
watch(count, (n) => {
  if (current.value >= n) current.value = 0
})

function redeemPill(s: Sponsor): SponsorRedeemPill {
  return sponsorRedeemPill(s, store.canRedeem)
}

// ── Estado del entorno: pestaña visible, reduced-motion, sección en pantalla ──
const pageVisible = ref(!document.hidden)
const reducedMotion = ref(false)
const paused = ref(false)
const {
  isVisible: inViewport,
  observe,
  cleanup: cleanupViewport,
} = useInViewport({ threshold: 0.5, once: false })

let motionQuery: MediaQueryList | null = null

function onVisibilityChange(): void {
  pageVisible.value = !document.hidden
}

function onMotionChange(e: MediaQueryListEvent): void {
  reducedMotion.value = e.matches
}

// La sección existe solo con marcas: se observa cuando aparece.
watch(sectionEl, (el) => observe(el))

// ── Auto-avance (D-23) ────────────────────────────────────────────────────────
const running = computed(
  () =>
    count.value > 1 &&
    pageVisible.value &&
    !paused.value &&
    !reducedMotion.value &&
    inViewport.value,
)
/** Se incrementa cada vez que se rearma el timer: reinicia la barra de progreso. */
const cycle = ref(0)

let timer: ReturnType<typeof setTimeout> | null = null
let pauseTimer: ReturnType<typeof setTimeout> | null = null
let raf: number | null = null
let programmaticUntil = 0

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

function clearPauseTimer(): void {
  if (pauseTimer !== null) {
    clearTimeout(pauseTimer)
    pauseTimer = null
  }
}

/** Pausa el auto-avance y lo retoma solo a los SPONSOR_TOUCH_PAUSE_MS (reinicia si ya estaba). */
function pause(): void {
  paused.value = true
  clearPauseTimer()
  pauseTimer = setTimeout(() => {
    paused.value = false
    pauseTimer = null
  }, SPONSOR_TOUCH_PAUSE_MS)
}

function goTo(index: number, manual: boolean): void {
  const n = count.value
  if (n === 0) return
  const target = ((index % n) + n) % n
  if (manual) pause()
  const track = trackEl.value
  const card = track?.children[target] as HTMLElement | undefined
  if (!track || !card) {
    current.value = target
    return
  }
  // Volver de la última a la primera sin recorrer todas las cards.
  const wrapping = !manual && target === 0 && current.value === n - 1
  const smooth = !reducedMotion.value && !wrapping
  current.value = target
  programmaticUntil =
    performance.now() + (smooth ? SMOOTH_SCROLL_GUARD_MS : INSTANT_SCROLL_GUARD_MS)
  track.scrollTo({
    left: card.offsetLeft - SIDE_PADDING_PX,
    behavior: smooth ? 'smooth' : 'auto',
  })
}

// Cualquier cambio de card (automático o a mano), de pausa o de cantidad reinicia el intervalo.
watch(
  [running, current, count],
  () => {
    clearTimer()
    if (!running.value) return
    cycle.value++
    timer = setTimeout(() => goTo(current.value + 1, false), SPONSOR_ADVANCE_MS)
  },
  { immediate: true },
)

// Sin marcas no queda ningún timer vivo (p. ej. logout con la pantalla montada).
watch(count, (n) => {
  if (n === 0) {
    clearTimer()
    clearPauseTimer()
    paused.value = false
  }
})

// ── Índice según el scroll (swipe del socio) ──────────────────────────────────
function syncCurrentFromScroll(): void {
  if (performance.now() < programmaticUntil) return
  const track = trackEl.value
  const first = track?.children[0] as HTMLElement | undefined
  const n = count.value
  if (!track || !first || n === 0) return
  const step = first.offsetWidth + CARD_GAP_PX
  let index = Math.round(track.scrollLeft / step)
  // La última card puede no llegar a su punto de snap: el fin del scroll la cuenta.
  if (track.scrollLeft >= track.scrollWidth - track.clientWidth - 2) index = n - 1
  index = Math.min(Math.max(index, 0), n - 1)
  if (index !== current.value) current.value = index
}

function onTrackScroll(): void {
  if (raf !== null) cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => {
    raf = null
    syncCurrentFromScroll()
  })
}

// ── Vista (D-25): card activa + sección en pantalla + pestaña visible ─────────
watch(
  [current, inViewport, pageVisible, count],
  () => {
    if (!inViewport.value || !pageVisible.value) return
    const sponsor = sponsors.value[current.value]
    if (sponsor) void store.markSeen(sponsor.id)
  },
  { immediate: true },
)

// ── Gestos: pausa al tocar + tap vs. swipe ────────────────────────────────────
let downScrollLeft = 0

function onTrackPointerDown(): void {
  pause()
  // El socio toma el control: el scroll vuelve a dictar la card activa.
  programmaticUntil = 0
  downScrollLeft = trackEl.value?.scrollLeft ?? 0
}

/** Abre la marca (tap o Enter): registra el toque (D-25) y avisa al padre. */
function open(sponsor: Sponsor): void {
  void store.markTapped(sponsor.id)
  emit('open', sponsor)
}

function onCardClick(sponsor: Sponsor): void {
  const track = trackEl.value
  // Si el track se movió fue un swipe, no un tap.
  if (track && Math.abs(track.scrollLeft - downScrollLeft) > TAP_SLOP_PX) return
  open(sponsor)
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (typeof window.matchMedia === 'function') {
    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.value = motionQuery.matches
    motionQuery.addEventListener('change', onMotionChange)
  }
  if (sectionEl.value) observe(sectionEl.value)
})

onUnmounted(() => {
  clearTimer()
  clearPauseTimer()
  if (raf !== null) cancelAnimationFrame(raf)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  motionQuery?.removeEventListener('change', onMotionChange)
  cleanupViewport()
})
</script>

<style scoped lang="scss">
// Valores del sketch 005 (`.spon`, `.sp`) sin variable propia en la app.
// Margen de la pila de Mi Templo: 16 (no los 28 del mockup de presentación, D-23).
$sp-side: 16px;
$terra: #96593a;
$dot-idle: #d9cfc1;
$dot-on: #e2d6c6;

.sp-section {
  margin: 0 (-$sp-side); // sangra a los bordes de la página; sin título (D-23)
}

.sp-track {
  position: relative; // offsetLeft de las cards relativo al track
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding: 2px $sp-side 8px;
  scroll-padding-inline: $sp-side;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
}

.sp-card {
  flex: 0 0 82%;
  scroll-snap-align: start;
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 156px;
  padding: 16px;
  border-radius: 16px;
  background: var(--b-bg);
  color: var(--b-fg);
  cursor: pointer;
  transition: transform 0.3s ease;
  transform: scale(0.94);

  &--on {
    transform: scale(1);
  }
}

// Marca de agua decorativa: lo único con opacidad, no es texto.
.sp-wm {
  position: absolute;
  right: -18px;
  bottom: -26px;
  font-size: 140px;
  color: var(--b-fg);
  opacity: 0.13;
  pointer-events: none;
}

.sp-top {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
}

// Logo en colores INVERTIDOS respecto de la card.
.sp-logo {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  overflow: hidden;
  border-radius: 12px;
  background: var(--b-fg);
  color: var(--b-bg);
  font:
    800 15px 'Montserrat',
    sans-serif;

  &__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.sp-name {
  font:
    800 17px/1.15 'Montserrat',
    sans-serif;
}

.sp-cat {
  display: block;
  font:
    500 12px/1.3 'Geologica',
    sans-serif;
}

// El beneficio nunca se quiebra: si es largo se corta con elipsis, no feo.
.sp-deal {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
  padding-top: 14px;

  &__text {
    flex: 1 1 auto;
    min-width: 96px;
    max-width: 100%;
  }
}

.sp-benefit {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font:
    800 30px/1 'Montserrat',
    sans-serif;
  letter-spacing: -0.02em;
}

.sp-detail {
  display: block;
  margin-top: 3px;
  font:
    500 12px/1.3 'Geologica',
    sans-serif;
}

// Pastilla de canje sólida, colores invertidos.
.sp-how {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border-radius: 99px;
  background: var(--b-fg);
  color: var(--b-bg);
  font:
    700 11px 'Montserrat',
    sans-serif;
  white-space: nowrap;
}

// ── Puntos con barra de progreso ──────────────────────────────────────────────
.sp-dots {
  display: flex;
  justify-content: center;
  margin-top: 2px;
}

// Área táctil de 44 px de alto alrededor del punto de 7 px.
.sp-dot-btn {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 0 3px;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.sp-dot {
  position: relative;
  overflow: hidden;
  width: 7px;
  height: 7px;
  border-radius: 4px;
  background: $dot-idle;
  transition: width 0.2s;

  &--on {
    width: 24px;
    background: $dot-on;
  }
}

.sp-dot__fill {
  position: absolute;
  inset: 0;
  background: $terra;
  transform-origin: left;
  transform: scaleX(0);
  animation: sp-fill var(--spd, 2s) linear forwards;
}

.sp-dots--paused .sp-dot__fill {
  animation-play-state: paused;
}

@keyframes sp-fill {
  to {
    transform: scaleX(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sp-card {
    transition: none;
  }

  .sp-dot__fill {
    animation: none;
    transform: scaleX(1);
  }
}
</style>
