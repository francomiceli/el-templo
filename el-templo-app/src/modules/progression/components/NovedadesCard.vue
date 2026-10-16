<!-- Card "Novedades" de Mi Templo (spec "Novedades en Mi Templo", D-8..D-11 +
     enmienda 2026-10-14). Variante D del sketch 004, SIN íconos de tipo:
     una novedad por vez en UNA sola línea, rotación automática cada 4,5 s,
     puntos tocables, swipe horizontal y barra de progreso de 2px.

     - 0 novedades: no se renderiza nada. 1: sin puntos, sin barra, sin rotación.
     - El texto se interpola con `{{ }}` (Vue escapa): PROHIBIDO `v-html`, una
       novedad con HTML nunca debe ejecutarse en la app del socio.
     - Réplica visual de `NovedadPreview.vue` del admin (stage de 62px). -->
<template>
  <section v-if="currentItem" class="nov-card" aria-label="Novedades">
    <div class="nov-card__head">
      <span class="nov-card__title">Novedades</span>
      <span v-if="newCount > 0" class="nov-card__count">
        {{ newCount }} {{ newCount === 1 ? 'nueva' : 'nuevas' }}
      </span>
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
            <div class="nov-item__text">{{ currentItem.text }}</div>
            <div class="nov-item__meta">
              <span v-if="isNew(currentItem)" class="nov-item__new">NUEVO</span>
              <span v-if="currentItem.branchLabel" class="nov-item__sede">
                <q-icon name="location_on" size="13px" />{{ currentItem.branchLabel }}
              </span>
              <span>{{ relativeDaysLabel(currentItem.publishedAt, now) }}</span>
            </div>
          </div>
          <q-icon v-if="currentItem.destination" name="chevron_right" class="nov-item__chev" />
        </div>
      </Transition>
    </div>

    <!-- `:key="current"` reinicia la animación en cada cambio de slide; en pausa
         (dedo apoyado / app en background) la barra se apaga y vuelve a
         arrancar de cero al reanudar, igual que el timer. -->
    <div
      v-if="items.length > 1"
      :key="current"
      class="nov-card__progress"
      :class="{ 'nov-card__progress--paused': !running }"
      :style="{ animationDuration: `${ROTATE_MS}ms` }"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNovedadesStore, type Novedad } from 'src/stores/useNovedadesStore'
import { navigateToAvisoDestination } from 'src/utils/aviso-navigation'
import { relativeDaysLabel } from 'src/utils/relative-days'

/** Cada cuánto pasa sola a la siguiente (D-8). */
const ROTATE_MS = 4500
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

// Si la lista se achica (recarga, otra sede) no quedamos fuera de rango.
watch(
  () => items.value.length,
  (length) => {
    if (current.value >= length) current.value = 0
  },
)

// ── "Hace N días": `now` se refresca al volver de background (cruce de día) ──
const now = ref(new Date())

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

// ── Rotación ──────────────────────────────────────────────────────────────────
const touching = ref(false)
const running = computed(() => items.value.length > 1 && pageVisible.value && !touching.value)
const transitionName = ref<`nov-${SlideDirection}`>('nov-up')

let timer: ReturnType<typeof setTimeout> | null = null

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

// Cualquier cambio de slide (automático o a mano), de pausa o de largo de la
// lista reinicia el intervalo completo.
watch(
  [running, current, () => items.value.length],
  () => {
    clearTimer()
    if (!running.value) return
    timer = setTimeout(() => goTo(current.value + 1, 'up'), ROTATE_MS)
  },
  { immediate: true },
)

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
})

onUnmounted(() => {
  clearTimer()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

// Valores del sketch 004 sin variable propia en la app.
$border: #e5dbcd;
$dot-idle: #e2d6c6;
$chevron: #c7b9a6;

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
  font-family: 'Montserrat', sans-serif;
  font-weight: 800;
  font-size: 15px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: $primary;
}

.nov-card__count {
  background-color: $primary;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 999px;
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
  // Alto fijo (enmienda D-8): 1 línea de texto (14.5 × 1.38 ≈ 20px) + meta
  // (4 + 16px) + padding 10 + 10. Así el layout no salta al rotar.
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nov-item--new .nov-item__text {
  font-weight: 600;
}

.nov-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 11.5px;
  color: $info;
}

.nov-item__new {
  color: $primary;
  font-weight: 600;
  font-size: 10.5px;
  letter-spacing: 0.05em;
}

.nov-item__sede {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 500;
  color: $secondary;
}

.nov-item__chev {
  flex-shrink: 0;
  color: $chevron;
  font-size: 20px;
}

// ── Barra de progreso (2px, abajo) ───────────────────────────────────────────
.nov-card__progress {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  height: 2px;
  background-color: $primary;
  opacity: 0.55;
  transform-origin: left center;
  animation-name: nov-progress;
  animation-timing-function: linear;
  animation-fill-mode: forwards;

  &--paused {
    animation: none;
    opacity: 0.2;
    transform: scaleX(0);
  }
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

  .nov-card__progress {
    display: none;
  }
}
</style>
