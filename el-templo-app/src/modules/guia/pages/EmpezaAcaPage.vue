<template>
  <div
    class="empeza-aca"
    role="dialog"
    aria-modal="true"
    aria-label="Empezá acá"
    @pointerdown="onHoldStart"
    @pointerup="onHoldEnd"
    @pointercancel="onHoldEnd"
    @pointerleave="onHoldEnd"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend="onTouchEnd"
  >
    <!-- Barra de progreso segmentada -->
    <div class="empeza-aca__progress" role="presentation">
      <div
        v-for="(slide, idx) in slides"
        :key="slide.id"
        class="empeza-aca__segment"
        :class="{
          'empeza-aca__segment--done': idx < currentIndex,
          'empeza-aca__segment--active': idx === currentIndex,
        }"
      >
        <div
          v-if="idx === currentIndex && slide.durationMs"
          class="empeza-aca__segment-fill"
          :style="{ width: `${autoAdvanceProgress}%` }"
        />
      </div>
    </div>

    <q-btn
      flat
      round
      dense
      icon="close"
      color="white"
      class="empeza-aca__close"
      aria-label="Cerrar"
      @click.stop="close"
    />

    <!-- Contenido -->
    <div class="empeza-aca__content">
      <q-icon v-if="currentSlide.icon" :name="currentSlide.icon" size="48px" class="empeza-aca__icon" />
      <p v-if="currentSlide.kicker" class="empeza-aca__kicker">{{ currentSlide.kicker }}</p>
      <h1 class="empeza-aca__title">{{ currentSlide.title }}</h1>
      <p v-for="(paragraph, i) in currentSlide.body" :key="i" class="empeza-aca__paragraph">
        {{ paragraph }}
      </p>
      <ul v-if="currentSlide.bullets?.length" class="empeza-aca__bullets">
        <li v-for="(bullet, i) in currentSlide.bullets" :key="i">{{ bullet }}</li>
      </ul>

      <q-btn
        v-if="currentSlide.cta"
        unelevated
        color="white"
        text-color="primary"
        class="empeza-aca__cta"
        :label="currentSlide.cta.label"
        @click.stop="onCtaClick"
      />
    </div>

    <!-- Tap-zones (invisibles, cubren la mayor parte de la pantalla) -->
    <div class="empeza-aca__tap-zones" aria-hidden="true">
      <div class="empeza-aca__tap-zone empeza-aca__tap-zone--left" @click="onTap('prev')" />
      <div class="empeza-aca__tap-zone empeza-aca__tap-zone--right" @click="onTap('next')" />
    </div>

    <!-- Botones visibles + accesibles (además de los tap-zones) -->
    <div class="empeza-aca__nav-buttons">
      <q-btn
        flat
        round
        icon="chevron_left"
        color="white"
        aria-label="Anterior"
        :disable="currentIndex === 0"
        class="empeza-aca__nav-btn"
        @click="onTap('prev')"
      />
      <q-btn
        flat
        round
        icon="chevron_right"
        color="white"
        aria-label="Siguiente"
        class="empeza-aca__nav-btn"
        @click="onTap('next')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from 'src/stores/useUserStore'
import { EMPEZA_ACA_SLIDES } from '../empeza-aca-content'
import { reduceStoryNav, type StoryAction } from '../story-navigation'
import { useIntroStoriesApi } from '../composables/useIntroStoriesApi'

const router = useRouter()
const userStore = useUserStore()
const introStoriesApi = useIntroStoriesApi()

const slides = EMPEZA_ACA_SLIDES
const currentIndex = ref(0)
const currentSlide = computed(() => slides[currentIndex.value]!)

// SPEC B: registrar "vista" apenas se abre (no solo al cerrar) — si el
// socio la cierra antes del final igual queda registrado que la abrió. El
// perfil en memoria se actualiza con la respuesta real del servidor para que
// MainLayout no vuelva a abrir las historias solas en esta misma sesión.
onMounted(() => {
  void introStoriesApi.reportSeen(currentIndex.value).then((progress) => {
    if (progress) userStore.setIntroStoriesProgress(progress)
  })
})

// ─── Autoavance opcional (ningún slide lo usa hoy — ver docblock del
// archivo de contenido) + mantener-apretado-para-pausar ────────────────────
const autoAdvanceProgress = ref(0)
let autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null
let autoAdvanceDeadline = 0
let autoAdvanceRemaining = 0
let autoAdvancePaused = false

function clearAutoAdvanceTimer() {
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer)
    autoAdvanceTimer = null
  }
}

function startAutoAdvance() {
  clearAutoAdvanceTimer()
  autoAdvanceProgress.value = 0
  const ms = currentSlide.value.durationMs
  if (!ms) return
  autoAdvancePaused = false
  autoAdvanceRemaining = ms
  autoAdvanceDeadline = Date.now() + ms
  autoAdvanceTimer = setTimeout(() => handleAction('next'), ms)
}

function pauseAutoAdvance() {
  if (autoAdvancePaused || !autoAdvanceTimer) return
  autoAdvancePaused = true
  autoAdvanceRemaining = Math.max(0, autoAdvanceDeadline - Date.now())
  clearAutoAdvanceTimer()
}

function resumeAutoAdvance() {
  if (!autoAdvancePaused) return
  autoAdvancePaused = false
  autoAdvanceDeadline = Date.now() + autoAdvanceRemaining
  autoAdvanceTimer = setTimeout(() => handleAction('next'), autoAdvanceRemaining)
}

function onHoldStart() {
  if (currentSlide.value.durationMs) pauseAutoAdvance()
}
function onHoldEnd() {
  if (currentSlide.value.durationMs) resumeAutoAdvance()
}

// ─── Swipe down para cerrar ─────────────────────────────────────────────
const SWIPE_CLOSE_THRESHOLD_PX = 80
let touchStartY = 0
let touchDeltaY = 0

function onTouchStart(e: TouchEvent) {
  touchStartY = e.touches[0]?.clientY ?? 0
  touchDeltaY = 0
}
function onTouchMove(e: TouchEvent) {
  const y = e.touches[0]?.clientY ?? touchStartY
  touchDeltaY = y - touchStartY
}
function onTouchEnd() {
  if (touchDeltaY > SWIPE_CLOSE_THRESHOLD_PX) {
    close()
  }
  touchDeltaY = 0
}

// ─── Navegación ─────────────────────────────────────────────────────────
function handleAction(action: StoryAction) {
  const result = reduceStoryNav(currentIndex.value, slides.length, action)
  currentIndex.value = result.index

  if (result.completed) {
    void introStoriesApi.reportCompleted(result.index).then((progress) => {
      if (progress) userStore.setIntroStoriesProgress(progress)
    })
  }
  if (result.closed) {
    finish()
    return
  }
  startAutoAdvance()
}

function onTap(action: StoryAction) {
  handleAction(action)
}

function close() {
  handleAction('close')
}

function onCtaClick() {
  const cta = currentSlide.value.cta
  if (!cta) return
  const wasLast = currentIndex.value === slides.length - 1
  if (wasLast) {
    void introStoriesApi.reportCompleted(currentIndex.value).then((progress) => {
      if (progress) userStore.setIntroStoriesProgress(progress)
    })
  }
  clearAutoAdvanceTimer()
  void router.push({ name: cta.routeName })
}

// Vuelve a Mi Templo — ruta segura sin depender del historial (esta pantalla
// puede abrirse sola apenas loguea, sin una entrada de "atrás" significativa).
function finish() {
  clearAutoAdvanceTimer()
  void router.replace('/mi-templo')
}

onMounted(startAutoAdvance)
onUnmounted(clearAutoAdvanceTimer)
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.empeza-aca {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, $primary 0%, #3d3732 100%);
  color: white;
  overflow: hidden;
  touch-action: pan-y;
}

.empeza-aca__progress {
  display: flex;
  gap: 4px;
  padding: 12px 12px 0;
  padding-top: max(12px, env(safe-area-inset-top));
}

.empeza-aca__segment {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.25);
  overflow: hidden;

  &--done {
    background: rgba(255, 255, 255, 0.9);
  }

  &--active {
    background: rgba(255, 255, 255, 0.55);
  }
}

.empeza-aca__segment-fill {
  height: 100%;
  background: white;
  transition: width 0.1s linear;
}

.empeza-aca__close {
  position: absolute;
  top: max(8px, env(safe-area-inset-top));
  right: 8px;
  z-index: 10;
}

.empeza-aca__content {
  // `position: relative` es lo que hace que `z-index` tenga efecto acá — sin
  // esto, las tap-zones (absolutamente posicionadas) pintan ARRIBA de este
  // contenido pese al z-index declarado, porque z-index se ignora en
  // elementos no posicionados. Con esto, el CTA/bullets quedan clickeables
  // por encima de las tap-zones que los cubren.
  position: relative;
  z-index: 2;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 32px 28px;
  max-width: 480px;
  margin: 0 auto;
  pointer-events: none; // el CTA se reactiva explícitamente abajo

  > * {
    pointer-events: auto;
  }
}

.empeza-aca__icon {
  margin-bottom: 16px;
  opacity: 0.9;
}

.empeza-aca__kicker {
  font-family: 'Montserrat', sans-serif;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  opacity: 0.7;
  margin: 0 0 8px;
}

.empeza-aca__title {
  font-family: 'Montserrat', sans-serif;
  font-size: 26px;
  font-weight: 800;
  margin: 0 0 20px;
}

.empeza-aca__paragraph {
  font-size: 16px;
  line-height: 1.6;
  margin: 0 0 14px;
  opacity: 0.95;
}

.empeza-aca__bullets {
  text-align: left;
  margin: 8px 0 0;
  padding-left: 20px;
  font-size: 15px;
  line-height: 1.8;
  opacity: 0.95;
}

.empeza-aca__cta {
  margin-top: 24px;
  font-weight: 700;
  border-radius: 24px;
  padding: 10px 28px;
}

.empeza-aca__tap-zones {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
}

.empeza-aca__tap-zone {
  flex: 1;
  height: 100%;

  &--left {
    // Deja espacio libre para el contenido central sin tapar el CTA
    flex: 0 0 30%;
  }

  &--right {
    flex: 1;
  }
}

.empeza-aca__nav-buttons {
  // Mismo motivo que `.empeza-aca__content` de arriba: `position: relative`
  // es necesario para que `z-index` gane a las tap-zones.
  position: relative;
  z-index: 3;
  display: flex;
  justify-content: space-between;
  padding: 0 12px max(16px, env(safe-area-inset-bottom));
  pointer-events: none;

  .empeza-aca__nav-btn {
    pointer-events: auto;
    opacity: 0.85;
  }
}
</style>
