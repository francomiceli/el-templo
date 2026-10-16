<!-- Carrusel de patrocinadores de Mi Templo (Fase 199, D-20/D-21/D-23/D-25).

     - Sin marcas (feed vacío o con error) NO renderiza nada: ni título ni hueco (L50).
     - Sin título de sección (D-23). Cards al 82 % del ancho con la siguiente asomando a
       escala .94; la activa a escala 1. SIN opacidad sobre textos: solo la marca de agua
       decorativa va atenuada (D-15).
     - Auto-avance constante (SPONSOR_ADVANCE_MS), pausa al tocar/arrastrar (retoma a los
       SPONSOR_TOUCH_PAUSE_MS), con la pestaña oculta, fuera de pantalla o con
       prefers-reduced-motion (L47). También se pausa mientras haya foco de teclado dentro
       del carrusel y mientras el mouse esté encima (WCAG 2.2.2). Nunca dos timers.
     - Lista continua (UAT 2026-10-16): al final van copias de las dos primeras; al llegar a
       la copia se salta sin animación a la real. Las copias no se anuncian ni toman foco.
     - Misma card que `SponsorCardPreview.vue` del admin (L49).
     - El beneficio (máx. 12 caracteres) nunca se corta (UAT D6): su tamaño arranca en un
       escalón por largo y se ajusta midiendo el elemento real (`fitBenefitFontPx`).
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
      :class="{ 'sp-track--jump': jumping }"
      aria-live="off"
      @pointerdown="onTrackPointerDown"
      @pointerenter="onPointerEnter"
      @pointerleave="onPointerLeave"
      @focusin="onFocusIn"
      @focusout="onFocusOut"
      @scroll.passive="onTrackScroll"
    >
      <!-- Las copias del final (lista continua) no se anuncian ni reciben foco. -->
      <article
        v-for="({ sponsor: s, key, copy }, i) in slides"
        :key="key"
        class="sp-card"
        :class="{ 'sp-card--on': i === position }"
        :style="{ '--b-bg': s.bgColor, '--b-fg': s.textColor }"
        :role="copy ? undefined : 'button'"
        :tabindex="copy ? -1 : 0"
        :aria-hidden="copy ? 'true' : undefined"
        :aria-label="copy ? undefined : `${s.name}: ${s.benefit} ${s.detail}`"
        @click="onCardClick(s, $event)"
        @keydown.enter.self.prevent="open(s)"
        @keydown.space.self.prevent="open(s)"
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
            <b :ref="(el) => setBenefitEl(key, s.benefit, el)" class="sp-benefit">{{
              s.benefit
            }}</b>
            <span class="sp-detail">{{ s.detail }}</span>
          </div>
          <span class="sp-how">
            <q-icon :name="redeemPill(s).icon" size="14px" />
            {{ redeemPill(s).label }}
          </span>
        </div>
        <!-- Línea de progreso al ras del borde inferior de la card activa, como en
             Novedades. `:key="cycle"` la reinicia cada vez que se rearma el timer; al
             saltar de la copia a la primera real sigue desde donde iba (`progressOffsetMs`).
             Decorativa: cada card ya dice su marca en el aria-label. -->
        <span
          v-if="count > 1 && i === position"
          :key="cycle"
          class="sp-progress"
          :class="{ 'sp-progress--paused': !running }"
          aria-hidden="true"
        >
          <span class="sp-progress__fill" :style="{ animationDelay: `-${progressOffsetMs}ms` }" />
        </span>
      </article>
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
  fitBenefitFontPx,
  isCardTap,
  monogram,
  sponsorBenefitFontPx,
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

// ── Lista continua (UAT 2026-10-16) ───────────────────────────────────────────
// Con 2+ marcas se agregan al final copias de las DOS primeras: estando en la última ya
// asoma la primera, y al llegar a la copia se salta sin animación a la real. Con dos
// copias, mientras se ve la copia de la primera asoma la de la segunda (no un hueco).
const COPIES = 2

interface Slide {
  sponsor: Sponsor
  key: string
  copy: boolean
}

const slides = computed((): Slide[] => {
  const list = sponsors.value.map((sponsor) => ({ sponsor, key: `${sponsor.id}`, copy: false }))
  if (list.length < 2) return list
  const copies = sponsors.value
    .slice(0, COPIES)
    .map((sponsor) => ({ sponsor, key: `${sponsor.id}-copia`, copy: true }))
  return [...list, ...copies]
})

/** Card que se ve (0..n-1 reales, n.. copias). */
const position = ref(0)
/** Marca real que se ve: es la que cuenta para vistas, timer y progreso. */
const current = computed(() => (count.value > 0 ? position.value % count.value : 0))
/** Durante el salto de la copia a la real se apagan las transiciones (no se ve el cambio). */
const jumping = ref(false)

// Si la lista se achica (recarga, otro país) no quedamos fuera de rango.
watch(count, (n) => {
  if (position.value >= slides.value.length || (n < 2 && position.value >= n)) position.value = 0
})

function redeemPill(s: Sponsor): SponsorRedeemPill {
  return sponsorRedeemPill(s, store.canRedeem)
}

// ── Tamaño del beneficio: ajuste por medición (UAT D6) ────────────────────────
// Mismo algoritmo, umbrales y piso que `SponsorCardPreview.vue` del admin (L15/L16):
// cambiar los dos juntos. Las cards no activas van a scale(.94): el transform no cambia
// clientWidth/scrollWidth, así que la medición es la del layout real.
/** Por slide (la copia tiene su propio elemento): elemento + texto del beneficio. */
const benefitEls = new Map<string, { el: HTMLElement; benefit: string }>()
let resizeObserver: ResizeObserver | null = null
let observedWidth = -1
let disposed = false

function setBenefitEl(key: string, benefit: string, el: unknown): void {
  if (el instanceof HTMLElement) benefitEls.set(key, { el, benefit })
  else benefitEls.delete(key)
}

function fitAllBenefits(): void {
  for (const { el, benefit } of benefitEls.values()) {
    const px = fitBenefitFontPx(sponsorBenefitFontPx(benefit), (candidate) => {
      el.style.fontSize = `${candidate}px`
      return el.scrollWidth <= el.clientWidth + 1
    })
    el.style.fontSize = `${px}px`
  }
}

// Al cambiar las marcas (o su texto) se re-mide con el DOM ya actualizado.
watch(slides, fitAllBenefits, { flush: 'post' })

// El track existe solo con marcas: el observer sigue su ancho (no su alto, que cambia al
// achicar la letra y no debe disparar otra medición).
watch(trackEl, (el) => {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (!el || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => {
    const width = trackEl.value?.clientWidth ?? 0
    if (width === observedWidth) return
    observedWidth = width
    fitAllBenefits()
  })
  resizeObserver.observe(el)
})

// ── Estado del entorno: pestaña visible, reduced-motion, sección en pantalla ──
const pageVisible = ref(!document.hidden)
const reducedMotion = ref(false)
const paused = ref(false)
/** Foco de teclado dentro del carrusel (el scroll automático se llevaría la card enfocada). */
const focusInside = ref(false)
/** Mouse encima: solo `pointerType === 'mouse'` (un toque no deja "hover" pegado). */
const hovering = ref(false)
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
    !focusInside.value &&
    !hovering.value &&
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

/** Lleva el track a la card `target` (posición visual). */
function scrollToPosition(target: number, smooth: boolean): void {
  const track = trackEl.value
  const card = track?.children[target] as HTMLElement | undefined
  position.value = target
  if (!track || !card) return
  programmaticUntil =
    performance.now() + (smooth ? SMOOTH_SCROLL_GUARD_MS : INSTANT_SCROLL_GUARD_MS)
  track.scrollTo({
    left: card.offsetLeft - SIDE_PADDING_PX,
    behavior: smooth ? 'smooth' : 'auto',
  })
}

/** Auto-avance a la card siguiente; de la última pasa a la copia de la primera. */
function goTo(index: number): void {
  if (count.value === 0) return
  const target = Math.min(Math.max(index, 0), slides.value.length - 1)
  scrollToPosition(target, !reducedMotion.value)
}

/**
 * Estando en una copia, salta sin animación a la real equivalente: misma imagen en el mismo
 * lugar, así que no se ve. La línea de progreso sigue desde donde iba.
 */
function jumpFromCopy(): void {
  const n = count.value
  if (n < 2 || position.value < n) return
  progressOffsetMs.value = running.value
    ? Math.min(performance.now() - cycleStartedAt, SPONSOR_ADVANCE_MS)
    : 0
  jumping.value = true
  scrollToPosition(position.value - n, false)
  // Dos frames: el navegador pinta la card real activa sin transición y recién ahí vuelven.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      jumping.value = false
    }),
  )
}

/** Cuándo empezó la vuelta actual del timer (para continuar la línea tras el salto). */
let cycleStartedAt = 0
/** Cuánto llevaba la línea de progreso al saltar de la copia a la real (0 al rearmar). */
const progressOffsetMs = ref(0)

// Cualquier cambio de marca (automático o a mano), de pausa o de cantidad reinicia el
// intervalo. El salto copia → real no cambia `current`, así que no lo reinicia.
watch(
  [running, current, count],
  () => {
    clearTimer()
    if (!running.value) return
    cycle.value++
    cycleStartedAt = performance.now()
    progressOffsetMs.value = 0
    timer = setTimeout(() => goTo(position.value + 1), SPONSOR_ADVANCE_MS)
  },
  { immediate: true },
)

// Sin marcas no queda ningún timer vivo (p. ej. logout con la pantalla montada).
watch(count, (n) => {
  if (n === 0) {
    clearTimer()
    clearPauseTimer()
    clearSettleTimer()
    paused.value = false
    focusInside.value = false
    hovering.value = false
  }
})

// ── Índice según el scroll (swipe del socio) ──────────────────────────────────
function syncPositionFromScroll(): void {
  if (performance.now() < programmaticUntil) return
  const track = trackEl.value
  const first = track?.children[0] as HTMLElement | undefined
  const last = slides.value.length - 1
  if (!track || !first || last < 0) return
  const step = first.offsetWidth + CARD_GAP_PX
  let index = Math.round(track.scrollLeft / step)
  // Por si la última no llega a su punto de snap: el fin del scroll la cuenta.
  if (track.scrollLeft >= track.scrollWidth - track.clientWidth - 2) index = last
  index = Math.min(Math.max(index, 0), last)
  if (index !== position.value) position.value = index
}

/** El scroll se quedó quieto (auto-avance terminado o swipe soltado). */
const SCROLL_SETTLE_MS = 120
let settleTimer: ReturnType<typeof setTimeout> | null = null

function clearSettleTimer(): void {
  if (settleTimer !== null) {
    clearTimeout(settleTimer)
    settleTimer = null
  }
}

function onTrackScroll(): void {
  if (raf !== null) cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => {
    raf = null
    syncPositionFromScroll()
  })
  clearSettleTimer()
  settleTimer = setTimeout(() => {
    settleTimer = null
    syncPositionFromScroll()
    jumpFromCopy()
  }, SCROLL_SETTLE_MS)
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
/** `null` = no hay un pointerdown pendiente (click sintético o ya consumido). */
let downScrollLeft: number | null = null

function onTrackPointerDown(): void {
  pause()
  // El socio toma el control: el scroll vuelve a dictar la card activa.
  programmaticUntil = 0
  downScrollLeft = trackEl.value?.scrollLeft ?? 0
}

// ── Pausa por foco y por mouse encima (WCAG 2.2.2) ────────────────────────────
/**
 * ¿El foco vino del teclado o de un lector? Un toque que enfoca la card no debe dejar el
 * carrusel pausado hasta tocar afuera. Si el navegador no entiende `:focus-visible` (iOS
 * < 15.4) se asume que sí: ahí un toque no enfoca elementos no editables.
 */
function isKeyboardFocus(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  try {
    return target.matches(':focus-visible')
  } catch {
    return true
  }
}

function onFocusIn(event: FocusEvent): void {
  if (isKeyboardFocus(event.target)) focusInside.value = true
}

function onFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget
  // Pasar el foco de una card a otra del mismo carrusel no lo "suelta".
  if (next instanceof Node && sectionEl.value?.contains(next)) return
  focusInside.value = false
}

function onPointerEnter(event: PointerEvent): void {
  if (event.pointerType === 'mouse') hovering.value = true
}

function onPointerLeave(): void {
  hovering.value = false
}

/** Abre la marca (tap o Enter/Espacio): registra el toque (D-25) y avisa al padre. */
function open(sponsor: Sponsor): void {
  void store.markTapped(sponsor.id)
  emit('open', sponsor)
}

function onCardClick(sponsor: Sponsor, event: MouseEvent): void {
  const down = downScrollLeft
  // Se consume: el siguiente click sin pointerdown (AT, teclado) no hereda un valor viejo.
  downScrollLeft = null
  if (!isCardTap(trackEl.value?.scrollLeft ?? 0, down, event.detail, TAP_SLOP_PX)) return
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
  fitAllBenefits()
  // Cuando cargan las fuentes cambian los anchos de los glifos: se vuelve a medir una vez.
  void document.fonts?.ready.then(() => {
    if (!disposed) fitAllBenefits()
  })
})

onUnmounted(() => {
  disposed = true
  resizeObserver?.disconnect()
  resizeObserver = null
  benefitEls.clear()
  clearTimer()
  clearPauseTimer()
  clearSettleTimer()
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

.sp-section {
  margin: 0 (-$sp-side); // sangra a los bordes de la página; sin título (D-23)
}

.sp-track {
  position: relative; // offsetLeft de las cards relativo al track
  display: flex;
  gap: 10px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding: 0 $sp-side; // sin padding vertical: el espacio entre bloques lo da la pila (16)
  scroll-padding-inline: $sp-side;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }

  // Cola vacía: sin ella la última card no puede llegar a su punto de snap (no hay más
  // contenido que scrollear) y queda a ~80px del borde en vez de 16. El ancho es lo que
  // le falta a la última card para quedar como las demás: (100% - 82%) menos el gap.
  &::after {
    content: '';
    flex: 0 0 calc(18% - 10px);
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
  // Escala anclada al borde izquierdo: Chrome calcula el snap con la caja YA
  // transformada, y con el origen al centro la card activa quedaba en 8px en vez
  // de 16 (el 3% que le sacaba el .94). Así el borde izquierdo no se mueve.
  transform-origin: left center;

  &--on {
    transform: scale(1);
  }
}

// Salto de la copia a la real: sin transición de escala (no se tiene que ver).
.sp-track--jump .sp-card {
  transition: none;
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

// ── Línea de progreso (como Novedades) ────────────────────────────────────────
// De lado a lado, al ras del borde inferior; el `overflow: hidden` de la card la
// recorta con el radio. Riel y relleno en el color de texto de la marca (el relleno
// es el mismo color que el texto, que ya pasa contraste sobre `--b-bg`).
.sp-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  overflow: hidden;
  background: color-mix(in srgb, var(--b-fg) 25%, transparent);
  pointer-events: none;
}

.sp-progress__fill {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--b-fg);
  transform-origin: left center;
  transform: scaleX(0);
  animation: sp-fill var(--spd, 2s) linear forwards;
}

.sp-progress--paused .sp-progress__fill {
  animation-play-state: paused;
}

@keyframes sp-fill {
  to {
    transform: scaleX(1);
  }
}

// Sin auto-avance (reduced-motion) la línea no tiene nada que contar: no se muestra.
@media (prefers-reduced-motion: reduce) {
  .sp-card {
    transition: none;
  }

  .sp-progress {
    display: none;
  }
}
</style>
