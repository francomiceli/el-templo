<template>
  <div
    class="empeza-aca"
    :class="`empeza-aca--${currentSlide.theme}`"
    role="dialog"
    aria-modal="true"
    aria-label="Empezá acá"
    @touchstart.passive="onTouchStart"
    @touchmove.passive="onTouchMove"
    @touchend="onTouchEnd"
  >
    <!-- Anuncio para lectores de pantalla del cambio de slide (UI-SPEC §7). -->
    <div class="sr-only" aria-live="polite">{{ ariaAnnouncement }}</div>

    <!-- Header: progreso segmentado (reusa SegmentedProgressBar, UI-SPEC §2/§6)
         + cerrar. `position: relative` + z-index gana a las tap-zones de abajo
         (absolutamente posicionadas) — mismo motivo en los 3 lugares de este
         archivo que lo usan. -->
    <div class="empeza-aca__header">
      <SegmentedProgressBar
        :total-segments="slides.length"
        :active-index="currentIndex"
        :theme="currentSlide.theme === 'dark' ? 'story-dark' : 'story-light'"
        class="empeza-aca__progress"
      />
      <q-btn
        flat
        round
        dense
        icon="close"
        class="empeza-aca__close"
        aria-label="Cerrar"
        @click="close"
      />
    </div>

    <!-- Contenido: transición corte-y-entra (opacity+translateY, UI-SPEC §5). -->
    <Transition name="story-slide" mode="out-in">
      <div :key="currentSlide.id" class="empeza-aca__content">
        <p class="story-slide__kicker">{{ currentSlide.kicker }}</p>
        <h1 class="story-slide__title">
          <span
            v-for="(word, i) in titleWords"
            :key="i"
            class="story-slide__word"
            :style="{ animationDelay: `${i * 40}ms` }"
            >{{ word }}&nbsp;</span
          >
        </h1>

        <!-- Tipo A — texto + bullets -->
        <template v-if="currentSlide.type === 'text'">
          <p
            v-for="(paragraph, i) in currentSlide.body"
            :key="i"
            class="story-slide__item story-slide__paragraph"
            :style="itemDelay(i)"
          >
            {{ paragraph }}
          </p>
          <ul v-if="currentSlide.bullets?.length" class="story-bullets">
            <li
              v-for="(bullet, i) in currentSlide.bullets"
              :key="i"
              class="story-slide__item"
              :style="itemDelay(i)"
            >
              <strong>{{ bullet.bold }}</strong>{{ bullet.rest }}
            </li>
          </ul>
        </template>

        <!-- Tipo C — bloques (UI-SPEC §4.3) -->
        <template v-else-if="currentSlide.type === 'blocks'">
          <div class="story-blocks">
            <div
              v-for="(row, i) in currentSlide.blocks"
              :key="row.role"
              class="story-blocks__row story-slide__item"
              :style="{ borderColor: getBlockCSSColor(row.role), ...itemDelay(i) }"
            >
              <div class="story-blocks__label">{{ row.label }}</div>
              <div class="story-blocks__desc">{{ row.description }}</div>
            </div>
          </div>
        </template>

        <!-- Tipo B — niveles (UI-SPEC §4.2) -->
        <template v-else-if="currentSlide.type === 'levels'">
          <div class="story-levels">
            <div
              v-for="(row, i) in currentSlide.levels"
              :key="row.level"
              class="story-levels__row story-slide__item"
              :style="itemDelay(i)"
            >
              <span class="story-levels__glyph">{{ LEVEL_GREEK_MAP[row.level] }}</span>
              <div class="story-levels__info">
                <div class="story-levels__name">{{ LEVEL_DISPLAY_MAP[row.level] }}</div>
                <p class="story-levels__phrase">{{ row.phrase }}</p>
              </div>
            </div>
          </div>
        </template>

        <!-- Tipo D — CTA final (UI-SPEC §4.4) -->
        <template v-else-if="currentSlide.type === 'cta'">
          <p
            v-for="(paragraph, i) in currentSlide.body"
            :key="i"
            class="story-slide__item story-slide__paragraph"
            :style="itemDelay(i)"
          >
            {{ paragraph }}
          </p>
          <q-btn
            unelevated
            no-caps
            class="story-cta story-slide__item"
            :style="itemDelay((currentSlide.body?.length ?? 0))"
            :label="currentSlide.cta.label"
            @click="onCtaClick(currentSlide.cta.routeName)"
          />
          <q-btn
            v-if="currentSlide.secondaryCta"
            flat
            no-caps
            class="story-cta-secondary story-slide__item"
            :style="itemDelay((currentSlide.body?.length ?? 0) + 1)"
            :label="currentSlide.secondaryCta.label"
            @click="onCtaClick(currentSlide.secondaryCta.routeName)"
          />
        </template>

        <p v-if="currentSlide.footnote" class="story-slide__footnote">{{ currentSlide.footnote }}</p>
      </div>
    </Transition>

    <!-- Zonas de avance — botones semánticos invisibles (UI-SPEC §7: "los div
         de tap zone convertidos en <button>", en vez de una capa duplicada).
         No cubren el header (arriba) para no tapar cerrar/progreso. -->
    <button
      type="button"
      class="empeza-aca__tap-zone empeza-aca__tap-zone--left"
      aria-label="Anterior"
      :disabled="isFirst"
      @click="goPrev"
    />
    <button
      type="button"
      class="empeza-aca__tap-zone empeza-aca__tap-zone--right"
      aria-label="Siguiente"
      @click="goNext"
    />

    <!-- Botones visibles ADEMÁS de las tap-zones (SPEC original A: "botones
         visibles además de tap-zones"). -->
    <div class="empeza-aca__nav-buttons">
      <q-btn
        flat
        round
        icon="chevron_left"
        aria-label="Anterior"
        :disable="isFirst"
        class="empeza-aca__nav-btn"
        @click="goPrev"
      />
      <q-btn
        flat
        round
        icon="chevron_right"
        aria-label="Siguiente"
        class="empeza-aca__nav-btn"
        @click="goNext"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from 'src/stores/useUserStore'
import { useStoryNavigation } from '../../training/composables/useStoryNavigation'
import SegmentedProgressBar from '../../training/components/player/SegmentedProgressBar.vue'
import { LEVEL_GREEK_MAP, LEVEL_DISPLAY_MAP } from '../../training/level-display'
import { getBlockCSSColor } from '../../training/utils/blockColors'
import { EMPEZA_ACA_SLIDES } from '../empeza-aca-content'
import { useIntroStoriesApi } from '../composables/useIntroStoriesApi'

const router = useRouter()
const userStore = useUserStore()
const introStoriesApi = useIntroStoriesApi()

const slides = EMPEZA_ACA_SLIDES
const totalSlides = computed(() => slides.length)
const storyNav = useStoryNavigation(totalSlides)
const currentIndex = computed(() => storyNav.currentIndex.value)
const isFirst = computed(() => storyNav.isFirst.value)
const currentSlide = computed(() => slides[storyNav.currentIndex.value]!)

const titleWords = computed(() => currentSlide.value.title.split(' '))

const ariaAnnouncement = computed(
  () => `Paso ${currentIndex.value + 1} de ${slides.length}: ${currentSlide.value.title}`,
)

// Entrada escalonada de bullets/filas: 150ms después del título + 80ms por
// ítem (UI-SPEC §5). `prefers-reduced-motion` anula todo esto vía CSS puro
// (media query en <style>), así que este delay no necesita una rama JS aparte.
function itemDelay(index: number) {
  return { animationDelay: `${150 + index * 80}ms` }
}

// SPEC B: registrar "vista" apenas se abre (no solo al cerrar) — si el
// socio la cierra antes del final igual queda registrado que la abrió. El
// perfil en memoria se actualiza con la respuesta real del servidor para que
// MainLayout no vuelva a abrir las historias solas en esta misma sesión.
onMounted(() => {
  void introStoriesApi.reportSeen(storyNav.currentIndex.value).then((progress) => {
    if (progress) userStore.setIntroStoriesProgress(progress)
  })
})

// ─── Swipe down para cerrar (UI-SPEC §7: opcional, no obligatorio — ya
// estaba construido, se conserva). ───────────────────────────────────────
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
function reportCompletion() {
  void introStoriesApi.reportCompleted(storyNav.currentIndex.value).then((progress) => {
    if (progress) userStore.setIntroStoriesProgress(progress)
  })
}

function goNext() {
  if (storyNav.isLast.value) {
    reportCompletion()
    finish()
    return
  }
  storyNav.next()
}

function goPrev() {
  storyNav.prev()
}

function close() {
  finish()
}

function onCtaClick(routeName: string) {
  if (storyNav.isLast.value) {
    reportCompletion()
  }
  void router.push({ name: routeName })
}

// Vuelve a Mi Templo — ruta segura sin depender del historial (esta pantalla
// puede abrirse sola apenas loguea, sin una entrada de "atrás" significativa).
function finish() {
  void router.replace('/mi-templo')
}

// ─── Teclado (UI-SPEC §7): ArrowLeft/ArrowRight/Escape ─────────────────
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') goNext()
  else if (e.key === 'ArrowLeft') goPrev()
  else if (e.key === 'Escape') close()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  storyNav.cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

// UI-SPEC-historias.md §3 — tokens mobile derivados de la paleta existente,
// SIN tokens nuevos en quasar.variables.scss (scoped acá, como BlockCard.vue).
$story-dark-bg: $accent; // #3d3732
$story-dark-bg-2: #2e2a26; // $dark-page
$story-dark-text: $cream; // #f2ede5
$story-dark-muted: rgba($cream, 0.62);
$story-dark-accent: $bronze-light; // #d4b896

$story-light-bg: $cream; // #f2ede5
$story-light-text: $accent; // #3d3732
$story-light-muted: rgba($accent, 0.55);
$story-light-accent: $primary; // #96593a
$story-light-border: $cream-dark; // #d9cfc1

$story-kicker-size: 11px;
$story-title-size: 26px;
$story-body-size: 16px;
$story-bullet-size: 15px;
$story-glyph-size: 44px;

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.empeza-aca {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  touch-action: pan-y;
  transition:
    background-color 0.25s ease,
    color 0.25s ease;

  &--dark {
    background: linear-gradient(160deg, $story-dark-bg 0%, $story-dark-bg-2 100%);
    color: $story-dark-text;
  }

  &--light {
    background: $story-light-bg;
    color: $story-light-text;
  }
}

.empeza-aca__header {
  position: relative;
  z-index: 5; // gana a las tap-zones (position:absolute más abajo en el DOM)
  display: flex;
  align-items: center;
  padding-top: max(8px, env(safe-area-inset-top));
}

.empeza-aca__progress {
  flex: 1;
}

.empeza-aca__close {
  margin-right: 8px;
  color: inherit;
}

.empeza-aca__content {
  position: relative;
  z-index: 2; // ídem — gana a las tap-zones
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 16px 24px;
  max-width: 480px;
  margin: 0 auto;
  overflow-y: auto;
  pointer-events: none; // los botones/CTA se reactivan explícitamente abajo

  > * {
    pointer-events: auto;
  }
}

.story-slide__kicker {
  font-family: 'Montserrat', sans-serif;
  font-size: $story-kicker-size;
  font-weight: 700;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  margin: 0 0 10px;

  .empeza-aca--dark & {
    color: $story-dark-accent;
  }

  .empeza-aca--light & {
    // $bronze-light sobre $cream no tiene contraste suficiente (ambos
    // clarps) — el kicker en tema claro usa el acento terracotta, mismo
    // criterio que CTAs/bullets activos de §3.
    color: $story-light-accent;
  }
}

.story-slide__title {
  font-family: 'Montserrat', sans-serif;
  font-size: $story-title-size;
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1.25;
  margin: 0 0 18px;
}

.story-slide__word {
  display: inline-block;
  animation: story-word-in 0.35s ease both;
}

.story-slide__item {
  animation: story-item-in 0.3s cubic-bezier(0.2, 0.7, 0.25, 1) both;
}

.story-slide__paragraph {
  font-size: $story-body-size;
  line-height: 1.5;
  margin: 0 0 14px;

  .empeza-aca--dark & {
    color: $story-dark-muted;
  }

  .empeza-aca--light & {
    color: $story-light-muted;
  }
}

.story-slide__footnote {
  font-size: 13px;
  font-style: italic;
  margin-top: 16px;
  opacity: 0.75;
}

.story-bullets {
  text-align: left;
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  font-size: $story-bullet-size;
  line-height: 1.6;
  display: flex;
  flex-direction: column;
  gap: 10px;

  strong {
    .empeza-aca--dark & {
      color: $story-dark-text;
    }

    .empeza-aca--light & {
      color: $story-light-accent;
    }
  }
}

// ─── Tipo C: bloques ────────────────────────────────────────────────────
.story-blocks {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: left;
}

.story-blocks__row {
  border-left: 4px solid;
  padding: 4px 0 4px 12px;
}

.story-blocks__label {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.story-blocks__desc {
  font-size: 14px;
  line-height: 1.4;
  opacity: 0.85;
  margin-top: 2px;
}

// ─── Tipo B: niveles ────────────────────────────────────────────────────
.story-levels {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
}

.story-levels__row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.story-levels__glyph {
  flex-shrink: 0;
  width: $story-glyph-size;
  font-family: 'Segoe UI', Arial, 'Noto Sans', sans-serif;
  font-size: $story-glyph-size;
  line-height: 1;
  text-align: center;
  color: $story-light-accent;
}

.story-levels__name {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.story-levels__phrase {
  font-size: 14px;
  line-height: 1.4;
  opacity: 0.75;
  margin: 2px 0 0;
}

// ─── Tipo D: CTA ────────────────────────────────────────────────────────
.story-cta {
  margin-top: 20px;
  font-weight: 700;
  font-size: 19px;
  border-radius: 26px;
  padding: 12px 32px;
  background: $primary;
  color: $cream;
}

.story-cta-secondary {
  margin-top: 8px;
  font-weight: 600;
  color: inherit;
  opacity: 0.85;
}

// ─── Tap-zones (botones semánticos invisibles, UI-SPEC §7) ─────────────
.empeza-aca__tap-zone {
  position: absolute;
  top: 56px; // debajo del header — no tapa progreso/cerrar
  bottom: 0;
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  cursor: pointer;
  z-index: 1;
  -webkit-tap-highlight-color: transparent;

  &:disabled {
    cursor: default;
  }

  &--left {
    left: 0;
    width: 30%;
  }

  &--right {
    right: 0;
    width: 70%;
  }
}

.empeza-aca__nav-buttons {
  position: relative;
  z-index: 5;
  display: flex;
  justify-content: space-between;
  padding: 0 12px max(12px, env(safe-area-inset-bottom));
  pointer-events: none;

  .empeza-aca__nav-btn {
    pointer-events: auto;
    opacity: 0.7;
    color: inherit;
  }
}

// ─── Transición entre slides (UI-SPEC §5): opacity+translateY, NUNCA blur/
// filter/scale. ──────────────────────────────────────────────────────────
.story-slide-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.story-slide-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.story-slide-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.story-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@keyframes story-word-in {
  from {
    opacity: 0;
    transform: translateY(0.14em);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes story-item-in {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .story-slide__word,
  .story-slide__item {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }

  .story-slide-enter-active,
  .story-slide-leave-active {
    transition: opacity 0.15s ease !important;
  }
  .story-slide-enter-from,
  .story-slide-leave-to {
    transform: none !important;
  }
}
</style>
