<!-- Card "Novedades" de Mi Templo (spec "Novedades en Mi Templo", D-8..D-11 +
     enmienda 2026-10-14). Variante D del sketch 004, SIN íconos de tipo:
     una novedad por vez en DOS líneas de texto, rotación automática, puntos
     tocables, swipe horizontal y barra de progreso visible (UAT D13).
     2026-10-18 (Franco): sin la línea de sede/"NUEVO"/fecha — la sede propia no
     sumaba (las novedades invitan a cosas en otras sedes) y ese renglón ahora es
     texto. El "hace N días" de la novedad actual pasó al encabezado. Lo no visto
     se sigue marcando con el filete, la negrita y el contador.

     - Rotación: 4,5 s, o lo que tarde el texto en subir si no entra en las dos
       líneas (UAT D19, C3). Un solo `dwellMs` gobierna el timer, la barra y el
       desplazamiento (ver `novedades-rotation.ts`). Nunca se corta con "…".
     - 0 novedades: no se renderiza nada. 1: sin puntos, sin barra, sin rotación
       (si desborda, el desplazamiento se repite).
     - `prefers-reduced-motion`: sin desplazamiento ni barra animada; el texto se
       corta a 2 líneas con "…" y la barra queda llena y estática.
     - El texto se interpola con `{{ }}` (Vue escapa): PROHIBIDO inyectar HTML crudo (la directiva de HTML), una
       novedad con HTML nunca debe ejecutarse en la app del socio.
     - Réplica visual de `NovedadPreview.vue` del admin (stage de 62px). -->
<template>
  <section
    v-if="currentItem"
    class="nov-card"
    :class="{ 'nov-card--reduced': reducedMotion }"
    aria-label="Novedades"
  >
    <div class="nov-card__head">
      <span class="nov-card__title">Novedades</span>
      <span
        v-if="newCount > 0"
        class="nov-card__count"
        :aria-label="`${newCount} ${newCount === 1 ? 'novedad nueva' : 'novedades nuevas'}`"
      >
        {{ newCount }}
      </span>
      <span class="nov-card__when">{{ relativeDaysLabel(currentItem.publishedAt, now) }}</span>
      <span v-if="items.length > 1" class="nov-card__dots">
        <button
          v-for="(item, i) in items"
          :key="item.key"
          type="button"
          class="nov-card__dot"
          :class="{ 'nov-card__dot--on': i === current }"
          :aria-label="`Ver novedad ${i + 1} de ${items.length}`"
          :aria-current="i === current"
          @click="goTo(i)"
        />
      </span>
    </div>

    <div
      ref="stageEl"
      class="nov-card__stage"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerEnd"
      @pointerleave="onPointerEnd"
    >
      <Transition :name="transitionName">
        <div
          :key="currentItem.key"
          class="nov-item"
          :class="{
            'nov-item--new': isNew(currentItem),
            'nov-item--tappable': currentItem.destination !== null,
          }"
          :role="currentItem.destination ? 'button' : undefined"
          :tabindex="currentItem.destination ? 0 : undefined"
          @click="onTap(currentItem)"
          @keydown.enter="onTap(currentItem)"
        >
          <div class="nov-item__body">
            <div class="nov-item__text">
              <span class="nov-item__line" :data-key="currentItem.key">{{ currentItem.text }}</span>
            </div>
          </div>
          <q-icon v-if="currentItem.destination" name="chevron_right" class="nov-item__chev" />
        </div>
      </Transition>
    </div>

    <!-- Riel + relleno sólido (UAT D13). La `key` basada en `cycle` reinicia la barra cada vez
         que se arma el timer; dura `dwellMs`, lo mismo que el timer y el
         desplazamiento. En pausa (dedo apoyado / app en background) queda
         congelada y vuelve a arrancar de cero al reanudar, igual que el timer.
         Decorativa: los puntos ya dicen "Ver novedad i de n". -->
    <div
      v-if="items.length > 1"
      :key="cycle"
      class="nov-card__progress"
      :class="{ 'nov-card__progress--paused': !running }"
      aria-hidden="true"
    >
      <span class="nov-card__progress-fill" :style="{ animationDuration: `${dwellMs}ms` }" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNovedadesStore, type Novedad } from 'src/stores/useNovedadesStore'
import { navigateToAvisoDestination } from 'src/utils/aviso-navigation'
import { relativeDaysLabel } from 'src/utils/relative-days'
import {
  marqueeKeyframes,
  marqueeOverflowPx,
  novedadDwellMs,
} from 'src/modules/progression/utils/novedades-rotation'

/** Máximo de novedades que ve el socio (D-4). El server ya recorta; esto es defensivo. */
const MAX_ITEMS = 3
/** Desplazamiento horizontal mínimo para que cuente como swipe. */
const SWIPE_MIN_PX = 40
/** Desplazamiento a partir del cual el gesto deja de contar como tap. */
const TAP_SLOP_PX = 8

type SlideDirection = 'up' | 'next' | 'prev'

const store = useNovedadesStore()
const router = useRouter()

const items = computed<Novedad[]>(() => store.novedades.slice(0, MAX_ITEMS))
const current = ref(0)
const currentItem = computed<Novedad | undefined>(() => items.value[current.value])

// ── "Hace N días": `now` se refresca al volver de background (cruce de día) ──
const now = ref(new Date())

// Si la lista se achica (recarga, otra sede) no quedamos fuera de rango.
watch(
  () => items.value.length,
  (length) => {
    if (current.value >= length) current.value = 0
  },
)

// ── "NUEVO" (D-5/D-10) ────────────────────────────────────────────────────────
// `markSeen` pone `seen = true` en el store apenas la novedad es el slide activo,
// pero el "NUEVO" tiene que seguir visible MIENTRAS está en pantalla en esa
// primera pasada. Por eso la card no mira `item.seen` directo: guarda acá los
// ids que estaban SIN ver al observarlos (`newIds`, solo se agregan desde ese
// estado) y los saca cuando el slide sale de pantalla. Como el store ya los
// marcó vistos, no vuelven a entrar. La próxima apertura de Mi Templo viene
// con `seen = true` del server y no hay "NUEVO".
const newIds = reactive(new Set<string>())

watch(
  items,
  (list) => {
    for (const item of list) {
      if (!item.seen) newIds.add(item.key)
    }
  },
  { immediate: true },
)

watch(
  () => currentItem.value?.key,
  (_key, prevKey) => {
    if (prevKey === undefined) return
    // Solo si de verdad se reportó como vista (seen local): si la lista se
    // reemplazó sin que esa novedad llegara a estar visible, no la apagamos.
    const prev = items.value.find((n) => n.key === prevKey)
    if (prev?.seen) newIds.delete(prevKey)
  },
)

function isNew(item: Novedad): boolean {
  return newIds.has(item.key)
}

const newCount = computed(() => items.value.filter((n) => newIds.has(n.key)).length)

// ── Visibilidad de la página (app en background) ─────────────────────────────
const pageVisible = ref(!document.hidden)

function onVisibilityChange(): void {
  pageVisible.value = !document.hidden
  if (pageVisible.value) now.value = new Date()
}

// ── Vista (D-10): slide activo + página visible → una vez por sesión ─────────
watch(
  [() => currentItem.value?.key, pageVisible],
  ([key, visible]) => {
    const item = currentItem.value
    if (key !== undefined && visible && item) void store.markSeen(item)
  },
  { immediate: true },
)

// ── Rotación + barra + desplazamiento: UN solo reloj (L47) ───────────────────
const touching = ref(false)
/** Dedo apoyado o página oculta: todo (timer, barra, desplazamiento) se detiene. */
const animating = computed(() => pageVisible.value && !touching.value)
const running = computed(() => items.value.length > 1 && animating.value)
const transitionName = ref<`nov-${SlideDirection}`>('nov-up')

/** Cuántos px de alto sobra el texto de la novedad actual (0 = entra en las dos líneas). */
const overflowPx = ref(0)
/** Cuánto se muestra la novedad actual: timer, barra y desplazamiento comparten este valor. */
const dwellMs = computed(() => novedadDwellMs(overflowPx.value))
/** Se incrementa cada vez que se arma el timer: reinicia la barra (`:key`). */
const cycle = ref(0)

const stageEl = ref<HTMLElement | null>(null)
const reducedMotion = ref(false)

let timer: ReturnType<typeof setTimeout> | null = null
let marquee: Animation | null = null
let marqueeEl: HTMLElement | null = null
let resizeObserver: ResizeObserver | null = null
let lastStageWidth = -1
let motionQuery: MediaQueryList | null = null
let disposed = false

function clearTimer(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}

function goTo(index: number, direction?: SlideDirection): void {
  const length = items.value.length
  if (length < 2) return
  const target = ((index % length) + length) % length
  if (target === current.value) return
  transitionName.value = `nov-${direction ?? (target > current.value ? 'next' : 'prev')}`
  current.value = target
}

/** El `.nov-item__line` de la novedad actual (con el <Transition> conviven dos un instante). */
function currentLine(): HTMLElement | null {
  const key = currentItem.value?.key
  const stage = stageEl.value
  if (key === undefined || !stage) return null
  const lines = Array.from(stage.querySelectorAll<HTMLElement>('.nov-item__line'))
  return lines.find((el) => el.dataset.key === key) ?? null
}

/** Mide cuánto desborda el texto actual. Con reduced-motion no se mide (se corta con "…"). */
function measure(): void {
  const line = reducedMotion.value ? null : currentLine()
  const text = line?.parentElement
  overflowPx.value = line && text ? marqueeOverflowPx(line.scrollHeight, text.clientHeight) : 0
}

function cancelMarquee(): void {
  // Si el slide ya salió (se está yendo en el <Transition>) se deja terminar su
  // animación: cancelarla lo haría saltar a la posición inicial mientras se va.
  if (marquee && marqueeEl && marqueeEl === currentLine()) marquee.cancel()
  marquee = null
  marqueeEl = null
}

function startMarquee(): void {
  if (reducedMotion.value || overflowPx.value <= 0) return
  const line = currentLine()
  if (!line || typeof line.animate !== 'function') return
  marquee = line.animate(marqueeKeyframes(overflowPx.value, dwellMs.value), {
    duration: dwellMs.value,
    fill: 'forwards',
    // Con 1 sola novedad no hay timer: el desplazamiento se repite.
    iterations: items.value.length > 1 ? 1 : Infinity,
  })
  marqueeEl = line
  if (!animating.value) marquee.pause()
}

/**
 * Arma de cero el reloj de la novedad actual: mide, reinicia la barra, rearma el
 * timer con `dwellMs` y crea el desplazamiento. Se llama con el DOM ya actualizado.
 */
function restart(): void {
  if (disposed) return
  clearTimer()
  cancelMarquee()
  measure()
  if (items.value.length > 1) cycle.value++
  if (running.value) timer = setTimeout(() => goTo(current.value + 1, 'up'), dwellMs.value)
  startMarquee()
}

/** Cambió el ancho disponible o cargaron las fuentes: si cambia el desborde, se rearma. */
function remeasure(): void {
  if (disposed || reducedMotion.value) return
  const before = overflowPx.value
  measure()
  if (overflowPx.value !== before) restart()
}

// Cualquier cambio de slide (automático o a mano), de largo de la lista o de
// modo de movimiento rearma el reloj. `flush: 'post'`: hace falta el DOM nuevo
// para medir el texto de la novedad que entra.
watch([() => currentItem.value?.key, () => items.value.length, reducedMotion], () => restart(), {
  flush: 'post',
})

// Pausa (dedo apoyado / background): se congela. Al reanudar, todo desde cero.
watch(
  animating,
  (on) => {
    if (on) {
      restart()
      return
    }
    clearTimer()
    marquee?.pause()
  },
  { flush: 'post' },
)

function onMotionChange(e: MediaQueryListEvent): void {
  reducedMotion.value = e.matches
}

/** Observa el ancho del stage (L23: solo cambios de ANCHO, para no generar loops al re-medir). */
function observeStage(): void {
  resizeObserver?.disconnect()
  lastStageWidth = -1
  if (resizeObserver && stageEl.value) resizeObserver.observe(stageEl.value)
}

// El stage existe solo con novedades: se observa cuando aparece.
watch(stageEl, observeStage, { flush: 'post' })

// ── Gestos: pausa con el dedo apoyado + swipe horizontal ─────────────────────
let startX: number | null = null
let moved = false

function onPointerDown(e: PointerEvent): void {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  touching.value = true
  startX = e.clientX
  moved = false
}

function onPointerMove(e: PointerEvent): void {
  if (startX !== null && Math.abs(e.clientX - startX) > TAP_SLOP_PX) moved = true
}

function onPointerUp(e: PointerEvent): void {
  if (startX !== null) {
    const dx = e.clientX - startX
    if (Math.abs(dx) > SWIPE_MIN_PX)
      goTo(current.value + (dx < 0 ? 1 : -1), dx < 0 ? 'next' : 'prev')
  }
  onPointerEnd()
}

/** Fin del gesto (up/cancel/leave): suelta la pausa. `moved` queda para que el click no navegue. */
function onPointerEnd(): void {
  touching.value = false
  startX = null
}

// ── Tap (D-10): solo si tiene destino ────────────────────────────────────────
function onTap(item: Novedad): void {
  if (moved) {
    // Fue un swipe, no un tap.
    moved = false
    return
  }
  if (!item.destination) return
  void store.markClicked(item)
  navigateToAvisoDestination(router, item.destination)
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (typeof window.matchMedia === 'function') {
    motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.value = motionQuery.matches
    motionQuery.addEventListener('change', onMotionChange)
  }
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width === undefined || width === lastStageWidth) return
      const firstReading = lastStageWidth < 0
      lastStageWidth = width
      // La primera lectura es la inicial: no cambió nada que re-medir.
      if (!firstReading) remeasure()
    })
    observeStage()
  }
  restart()
  // Montserrat/Geologica cargan después del primer render y cambian los anchos.
  void document.fonts?.ready.then(() => remeasure())
})

onUnmounted(() => {
  disposed = true
  clearTimer()
  marquee?.cancel()
  marquee = null
  marqueeEl = null
  resizeObserver?.disconnect()
  resizeObserver = null
  motionQuery?.removeEventListener('change', onMotionChange)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';
@import 'src/css/brand';

// Valores del sketch 004 sin variable propia en la app.
$border: #e5dbcd;
$dot-idle: #e2d6c6;
$chevron: #6b6459; // 5.8:1 sobre blanco (era #c7b9a6 = 1.9:1, fallaba el umbral 3:1 de íconos, 199-21)

.nov-card {
  position: relative;
  overflow: hidden;
  background-color: #fff;
  border: 1px solid $border;
  border-radius: 16px;
  box-shadow: 0 6px 18px rgba($primary, 0.1);
}

.nov-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 2px;
}

.nov-card__title {
  @include mt-block-title;
}

.nov-card__count {
  background-color: $primary;
  color: #fff;
  // 2026-10-18: más chica (era 11px, 20px de mínimo, padding 3/7): competía con el título.
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  min-width: 16px;
  padding: 0 5px;
  border-radius: 999px;
  text-align: center;
}

.nov-card__when {
  font-size: 11.5px;
  color: $info;
}

.nov-card__dots {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 5px;
}

// Botones (no <i>) para que se puedan tocar; el área táctil se agranda con un
// pseudo-elemento transparente sin mover el punto.
.nov-card__dot {
  position: relative;
  width: 6px;
  height: 6px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background-color: $dot-idle;
  cursor: pointer;
  transition: all 0.25s ease;

  &::after {
    content: '';
    position: absolute;
    inset: -10px -4px;
  }

  &--on {
    width: 18px;
    background-color: $primary;
  }

  &:focus-visible {
    outline: 2px solid $primary;
    outline-offset: 3px;
  }
}

.nov-card__stage {
  position: relative;
  // Alto fijo (enmienda D-8): 2 líneas de texto (2 × 14.5 × 1.38 ≈ 40px) +
  // padding 10 + 10 + 2 de aire. Así el layout no salta al rotar.
  height: 62px;
  overflow: hidden;
  // Deja pasar el scroll vertical de la página; el swipe horizontal es nuestro.
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
}

.nov-item {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;

  &--tappable {
    cursor: pointer;
  }

  // Filete izquierdo de 3px: novedad no vista.
  &--new::before {
    content: '';
    position: absolute;
    left: 0;
    top: 12px;
    bottom: 12px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background-color: $primary;
  }
}

.nov-item__body {
  flex: 1;
  min-width: 0;
}

.nov-item__text {
  font-size: 14.5px;
  line-height: 1.38;
  font-weight: 500;
  color: $accent;
  // Ventana de hasta 2 líneas (una novedad corta queda centrada en el stage): lo que
  // sobra queda abajo y sube (UAT D19).
  max-height: 2 * 1.38em;
  overflow: hidden;
  overflow-wrap: anywhere;
}

// Bloque interno que se desplaza hacia arriba (Web Animations) cuando el texto no entra.
.nov-item__line {
  display: block;
}

.nov-item--new .nov-item__text {
  font-weight: 600;
}

.nov-item__chev {
  flex-shrink: 0;
  color: $chevron;
  font-size: 20px;
}

// ── Barra de progreso (UAT D13) ──────────────────────────────────────────────
// Riel `$border` de 3px + relleno `$primary` sólido (contraste de componente
// ≥ 3:1) que va de 0 a 100% durante `dwellMs`. Sin opacity: antes era de 2px al
// 55% y Franco no la percibió. Va al ras del borde inferior, de lado a lado; el
// `overflow: hidden` de la card la recorta con el radio de las esquinas.
.nov-card__progress {
  height: 3px;
  margin: 0;
  background-color: $border;
  overflow: hidden;
}

.nov-card__progress-fill {
  display: block;
  width: 100%;
  height: 100%;
  background-color: $primary;
  transform-origin: left center;
  animation-name: nov-progress;
  animation-timing-function: linear;
  animation-fill-mode: forwards;
}

// En pausa la barra queda congelada donde estaba (no se apaga ni vuelve a 0).
.nov-card__progress--paused .nov-card__progress-fill {
  animation-play-state: paused;
}

@keyframes nov-progress {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

// ── Transiciones entre slides ────────────────────────────────────────────────
// `up`: rotación automática (sale hacia arriba, entra desde abajo).
// `next`/`prev`: swipe o puntos (desplazamiento lateral suave).
.nov-up-enter-active,
.nov-up-leave-active,
.nov-next-enter-active,
.nov-next-leave-active,
.nov-prev-enter-active,
.nov-prev-leave-active {
  transition:
    transform 0.45s ease,
    opacity 0.45s ease;
}

.nov-up-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
.nov-up-enter-from {
  transform: translateY(100%);
  opacity: 0;
}
.nov-next-leave-to {
  transform: translateX(-30%);
  opacity: 0;
}
.nov-next-enter-from {
  transform: translateX(30%);
  opacity: 0;
}
.nov-prev-leave-to {
  transform: translateX(30%);
  opacity: 0;
}
.nov-prev-enter-from {
  transform: translateX(-30%);
  opacity: 0;
}

// El slide que se va no recibe toques mientras sale.
.nov-up-leave-active,
.nov-next-leave-active,
.nov-prev-leave-active {
  pointer-events: none;
}

// D-11: sin animación de transición; sigue rotando con cambio instantáneo.
@media (prefers-reduced-motion: reduce) {
  .nov-up-enter-active,
  .nov-up-leave-active,
  .nov-next-enter-active,
  .nov-next-leave-active,
  .nov-prev-enter-active,
  .nov-prev-leave-active,
  .nov-card__dot {
    transition: none;
  }
}

// Reduced motion (UAT D13/D19): sin desplazamiento ni barra animada. El texto se
// corta a 2 líneas (mismo alto de stage) y la barra queda llena. Una novedad que no
// entra en 2 líneas (el API admite 120 caracteres, unas 3 líneas) cae al clamp con "…".
.nov-card--reduced .nov-item__text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

.nov-card--reduced .nov-item__line {
  display: inline;
}

.nov-card--reduced .nov-card__progress-fill {
  animation: none;
  transform: scaleX(1);
}
</style>
