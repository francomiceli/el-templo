<template>
  <q-page class="guia-page" :class="`guia-page--${currentSlide.theme}`">
    <!-- Anuncio para lectores de pantalla del cambio de slide (misma pieza de
         accesibilidad que tenía EmpezaAcaPage.vue). -->
    <div class="sr-only" aria-live="polite">{{ ariaAnnouncement }}</div>

    <div class="guia-page__scene" :style="sceneStyle" @click="onSceneTap">
      <!-- Header: progreso segmentado. Ya no hay botón "cerrar" — esta
           pantalla es un tab más del nav (el tab bar inferior sigue visible
           y navegable), no un diálogo que haya que cerrar; ver nota en el
           script sobre esta decisión. -->
      <div class="guia-page__header">
        <SegmentedProgressBar
          :total-segments="slides.length"
          :active-index="currentIndex"
          :theme="currentSlide.theme === 'noche' ? 'story-dark' : 'story-light'"
          class="guia-page__progress"
        />
      </div>

      <!-- Contenido: transición corte-y-entra (opacity+translateY). El alto
           se reparte en 3 franjas (kicker+título arriba, cuerpo con aire,
           CTA abajo) — nada centrado con bandas vacías. -->
      <Transition name="story-slide" mode="out-in">
        <div :key="currentSlide.id" class="guia-page__content">
          <div class="guia-page__top">
            <p class="story-slide__kicker">{{ currentSlide.kicker }}</p>
            <h1 class="story-slide__title">
              <template v-for="(line, li) in titleLines" :key="li">
                <br v-if="li > 0" />
                <span
                  v-for="w in line"
                  :key="w.index"
                  class="story-slide__word"
                  :style="{ animationDelay: `${w.index * 40}ms` }"
                  >{{ w.word }}&nbsp;</span
                >
              </template>
            </h1>
          </div>

          <div class="guia-page__body">
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
                  <strong>{{ bullet.bold }}</strong
                  >{{ bullet.rest }}
                </li>
              </ul>
            </template>

            <!-- Tipo C — bloques -->
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

            <!-- Tipo B — niveles -->
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

            <!-- Tipo D — CTA final -->
            <template v-else-if="currentSlide.type === 'cta'">
              <p
                v-for="(paragraph, i) in currentSlide.body"
                :key="i"
                class="story-slide__item story-slide__paragraph"
                :style="itemDelay(i)"
              >
                {{ paragraph }}
              </p>
            </template>

            <p v-if="currentSlide.footnote" class="story-slide__footnote">
              {{ currentSlide.footnote }}
            </p>
          </div>

          <!-- Pista "Tocá para seguir" (primer slide): no es un botón — el
               toque cae en la escena y avanza como cualquier otro. -->
          <div v-if="currentSlide.tapHint" class="guia-page__bottom guia-page__tap-hint">
            <span>{{ currentSlide.tapHint }}</span>
            <q-icon name="chevron_right" size="20px" />
          </div>

          <!-- CTA: fuera de las zonas de tap (botón real, no compite con
               tap-to-advance — mismo criterio que .story-card__block-done). -->
          <div v-if="currentSlide.type === 'cta'" class="guia-page__bottom">
            <q-btn
              unelevated
              no-caps
              class="story-cta"
              :label="currentSlide.cta.label"
              @click="onCtaClick(currentSlide.cta.routeName)"
            />
            <q-btn
              v-if="currentSlide.secondaryCta"
              flat
              no-caps
              class="story-cta-secondary"
              :label="currentSlide.secondaryCta.label"
              @click="onCtaClick(currentSlide.secondaryCta.routeName)"
            />
          </div>
        </div>
      </Transition>

      <!-- Anterior/Siguiente para lectores de pantalla y teclado. El tap
           visual NO pasa por acá: lo resuelve `onSceneTap` sobre toda la
           escena (ver script). `.stop` evita que el click burbujee a la
           escena y avance dos veces. -->
      <button
        type="button"
        class="sr-only"
        aria-label="Anterior"
        :disabled="isFirst"
        @click.stop="goPrev"
      />
      <button
        v-if="currentSlide.type !== 'cta'"
        type="button"
        class="sr-only"
        aria-label="Siguiente"
        @click.stop="goNext"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
/**
 * Guía — historias de bienvenida ("Empezá acá")
 *
 * SPEC "La Guía pasa a ser las historias" (2026-09-24): entrar a la Guía
 * (tab del nav, `/training/guia`) muestra DIRECTAMENTE las historias — ya no
 * hay un glosario separado ni una tarjeta "Empezá acá" intermedia (ver
 * ROADMAP/SUMMARY de la fase). Esta página REEMPLAZA a la vieja GuiaPage.vue
 * (glosario de bloques/rutas/formatos/intensidad, eliminado) reusando el
 * viewer que antes vivía en `modules/guia/pages/EmpezaAcaPage.vue` (también
 * eliminado — todo el contenido/lógica que no es específico de esta página
 * sigue viviendo en `modules/guia/` como fuente única: contenido en
 * `empeza-aca-content.ts`, "socio nuevo" en `new-member.ts`, persistencia en
 * `useIntroStoriesApi.ts`).
 *
 * DECISIÓN — sin botón "cerrar" ni `role="dialog"`: la versión anterior era
 * un overlay fullscreen fuera de MainLayout (con su propio X y swipe-down
 * para cerrar) porque se abría sola sobre lo que el socio estuviera haciendo.
 * Ahora es un tab más (`/training/guia`, dentro de MainLayout, con el tab bar
 * inferior siempre visible) — no hay nada que "cerrar": para salir, el socio
 * toca otro tab, igual que en Reservas/Entrenar/Mi Templo. Mantener un X acá
 * sería redundante con el tab bar y, peor, ambiguo (¿a dónde lleva? ¿por qué
 * un tab tiene botón de cierre?). Por el mismo motivo se retira el swipe-down
 * para cerrar y los botones de flecha visibles que tenía el overlay: el
 * patrón "historia" (tap invisible + accesible) ya cubre navegación, y una
 * fila de flechas justo encima del tab bar real duplicaría la navegación.
 * ArrowLeft/ArrowRight de teclado SÍ se mantienen (navegación entre slides,
 * no "cerrar" — Escape se retira porque no hay overlay que cerrar).
 */
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from 'src/stores/useUserStore'
import { useStoryNavigation } from '../composables/useStoryNavigation'
import SegmentedProgressBar from '../components/player/SegmentedProgressBar.vue'
import { LEVEL_GREEK_MAP, LEVEL_DISPLAY_MAP } from '../level-display'
import { getBlockCSSColor } from '../utils/blockColors'
import { EMPEZA_ACA_SLIDES } from '../../guia/empeza-aca-content'
import { useIntroStoriesApi } from '../../guia/composables/useIntroStoriesApi'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const introStoriesApi = useIntroStoriesApi()

const slides = EMPEZA_ACA_SLIDES
const totalSlides = computed(() => slides.length)
const storyNav = useStoryNavigation(totalSlides)
const currentIndex = computed(() => storyNav.currentIndex.value)
const isFirst = computed(() => storyNav.isFirst.value)
const currentSlide = computed(() => slides[storyNav.currentIndex.value]!)

// El título admite `\n` como salto de línea (p. ej. el cierre, en dos
// líneas). Cada palabra lleva un índice global para que la animación
// escalonada siga corriendo de corrido entre líneas.
const titleLines = computed(() => {
  let index = 0
  return currentSlide.value.title
    .split('\n')
    .map((line) => line.split(' ').map((word) => ({ word, index: index++ })))
})

const ariaAnnouncement = computed(
  () =>
    `Paso ${currentIndex.value + 1} de ${slides.length}: ${currentSlide.value.title.replace(/\n/g, ' ')}`,
)

// Fondo: la MISMA foto que ya usa el resto de la app (`.app-bg`/login/
// register, `public/bars-open.webp` — el mismo templo con anillas y relieve
// de Hércules que porta la pantalla de TV de sede como `tv-bars-open.webp`,
// solo que esta ya vive en el app, así que se reusa en vez de duplicar el
// asset — ver reporte final). Velo por tema: mismos colores/opacidades que
// `TvScreenPage.vue` (diurno/nocturno), gradiente adaptado a vertical
// (180deg, más denso arriba detrás de kicker+título) en vez del 100deg de la
// TV (pensado para texto a la izquierda en horizontal).
const DIA_GRADIENT =
  'linear-gradient(180deg, rgba(242,236,226,0.9) 0%, rgba(242,236,226,0.82) 42%, rgba(240,232,220,0.66) 68%, rgba(238,229,214,0.55) 100%)'
const NOCHE_GRADIENT =
  'linear-gradient(180deg, rgba(20,18,16,0.87) 0%, rgba(20,18,16,0.78) 42%, rgba(26,23,20,0.55) 68%, rgba(33,30,27,0.4) 100%)'

const sceneStyle = computed(() => ({
  backgroundImage: `${currentSlide.value.theme === 'noche' ? NOCHE_GRADIENT : DIA_GRADIENT}, url(/bars-open.webp)`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
}))

// Entrada escalonada de bullets/filas: 150ms después del título + 80ms por
// ítem. `prefers-reduced-motion` anula todo esto vía CSS puro (media query
// en <style>), así que este delay no necesita una rama JS aparte.
function itemDelay(index: number) {
  return { animationDelay: `${150 + index * 80}ms` }
}

// ─── Slide inicial: por query (?slide=<id>, deep-link "¿Qué es X?" desde
// Entrenar) o slide 1 si no hay query — nunca retoma dónde quedó la vez
// anterior (SPEC: "al volver a entrar a la Guía, arrancar en el slide 1").
// `watch` con `immediate` cubre tanto el mount inicial como una navegación
// posterior con otro `?slide=` mientras el componente sigue montado (mismo
// patrón que la vieja GuiaPage.vue con `seccion`/`item`).
function resolveSlideIndexFromQuery(): number {
  const { slide } = route.query
  if (typeof slide === 'string') {
    const idx = slides.findIndex((s) => s.id === slide)
    if (idx >= 0) return idx
  }
  return 0
}
watch(
  () => route.query.slide,
  () => storyNav.goTo(resolveSlideIndexFromQuery()),
  { immediate: true },
)

// Registrar "vista" apenas se abre (no solo al cerrar) — si el socio cambia
// de tab antes del final igual queda registrado que la abrió. El perfil en
// memoria se actualiza con la respuesta real del servidor para que
// MainLayout no vuelva a abrir las historias solas en esta misma sesión y
// para apagar el "1" rojo del nav.
onMounted(() => {
  void introStoriesApi.reportSeen(storyNav.currentIndex.value).then((progress) => {
    if (progress) userStore.setIntroStoriesProgress(progress)
  })
})

// ─── Navegación ─────────────────────────────────────────────────────────
function reportCompletion() {
  void introStoriesApi.reportCompleted(storyNav.currentIndex.value).then((progress) => {
    if (progress) userStore.setIntroStoriesProgress(progress)
  })
}

function goNext() {
  if (storyNav.isLast.value) {
    reportCompletion()
    return
  }
  storyNav.next()
}

function goPrev() {
  storyNav.prev()
}

// ─── Tap en cualquier parte de la pantalla: 30% izquierdo = anterior, 70%
// derecho = siguiente (mismo reparto que las tap-zones del DayPlayer,
// `StoryExerciseCard.vue`). Antes eran dos <button> absolutos DEBAJO del
// contenido (z-index 1 vs 2) y el contenido, con `pointer-events: auto` en
// sus franjas de alto completo, se comía todos los toques → no se podía
// pasar de historia tocando. Se resuelve con un solo handler en la escena
// en vez de subir las zonas encima del contenido: así el cuerpo sigue
// pudiendo scrollear en pantallas chicas (un swipe de scroll no dispara
// click) y los botones reales (CTA) no quedan tapados.
function onSceneTap(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  if (target?.closest('button, a')) return
  const scene = e.currentTarget as HTMLElement
  const rect = scene.getBoundingClientRect()
  if (e.clientX - rect.left < rect.width * 0.3) {
    goPrev()
  } else if (currentSlide.value.type !== 'cta') {
    goNext()
  }
}

// El secondaryCta del cierre ("Ver la Guía") apuntaba a la ruta `guia` de
// cuando era un glosario SEPARADO de las historias — con la fusión (SPEC "La
// Guía pasa a ser las historias") esa ruta es la que ya estamos viendo:
// `router.push` a la misma ruta es un no-op silencioso de vue-router. Sin
// tocar el texto aprobado del botón, se reinterpreta como "reiniciar la
// historia desde el slide 1" cuando el destino es la ruta actual — mismo
// espíritu ("volver a ver la Guía") sin un click que no hace nada.
function onCtaClick(routeName: string) {
  if (storyNav.isLast.value) {
    reportCompletion()
  }
  if (routeName === route.name) {
    storyNav.goTo(0)
    return
  }
  void router.push({ name: routeName })
}

// ─── Teclado: ArrowLeft/ArrowRight navegan entre slides (sin Escape — no hay
// overlay que cerrar, ver docblock de arriba). ──────────────────────────
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') goNext()
  else if (e.key === 'ArrowLeft') goPrev()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  storyNav.cleanup()
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

// ─── Fuentes de la TV, SOLO para esta página (SPEC punto 4) — extraídas de
// los base64 de `el-templo-admin/src/utils/pdf/pdf-assets.ts` a archivos
// locales (sin import cruzado entre apps). `@font-face` se registra a nivel
// de documento aunque el bloque sea `scoped` (Vue no scopea at-rules), pero
// el USO (`font-family` en selectores de abajo) queda acotado a esta página
// — el resto de la app sigue con Montserrat/Geologica. ──────────────────
@font-face {
  font-family: 'Cinzel';
  src: url('../../../assets/fonts/Cinzel-Regular.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Cinzel';
  src: url('../../../assets/fonts/Cinzel-Bold.ttf') format('truetype');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Nunito Sans';
  src: url('../../../assets/fonts/NunitoSans-Regular.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Nunito Sans';
  src: url('../../../assets/fonts/NunitoSans-Bold.ttf') format('truetype');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}

// Tokens de color por tema (mismos valores de marca que ya usaba el viewer
// anterior — sin token nuevo en quasar.variables.scss).
$story-dark-text: $cream; // #f2ede5
$story-dark-muted: rgba($cream, 0.9);
$story-dark-accent: $bronze-light; // #d4b896

$story-light-text: $accent; // #3d3732
$story-light-muted: rgba($accent, 0.88);
$story-light-accent: $primary; // #96593a

// Escala tipográfica (TV → mobile, ver SPEC punto 4): título domina, kicker
// chico con tracking amplio, cuerpo legible sin achicarse en pantallas
// grandes (clamp por ancho de viewport).
$story-kicker-size: clamp(11px, 2.6vw, 13px);
$story-title-size: clamp(26px, 7.5vw, 38px);
$story-body-size: clamp(16px, 4vw, 18px);
$story-bullet-size: clamp(15px, 3.8vw, 17px);
$story-glyph-size: 56px;

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

// El propio q-page ya reserva el alto correcto entre header y footer (Quasar
// calcula el min-height a partir de q-header/q-footer) — así "ocupar todo el
// alto disponible dentro del layout" es automático, sin recalcular safe-area
// acá (header/footer ya la manejan, ver MainLayout.vue).
.guia-page {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.guia-page--dia {
  color: $story-light-text;
}

.guia-page--noche {
  color: $story-dark-text;
}

.guia-page__scene {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  transition: background-image 0.25s ease;
}

.guia-page__header {
  position: relative;
  padding-top: 8px;
}

.guia-page__progress {
  width: 100%;
}

.guia-page__content {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 24px 20px;
  max-width: 480px;
  width: 100%;
  margin: 0 auto;
  overflow-y: auto; // 360x640: scroll interno antes que recortar texto
}

// Franja superior: kicker + título, pegados arriba del todo (no centrado).
.guia-page__top {
  flex-shrink: 0;
  text-align: left;
}

// Franja media: cuerpo/bullets/bloques/niveles — ocupa el espacio restante
// con aire (justify-content: center SOLO dentro de esta franja, nunca en
// toda la pantalla, así no vuelve el problema de "contenido apretado al
// medio con bandas vacías arriba/abajo").
.guia-page__body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: left;
  gap: 4px;
}

// Franja inferior: CTA — pegada abajo, nunca flotando en el medio.
.guia-page__bottom {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding-top: 16px;
}

.story-slide__kicker {
  font-family: 'Nunito Sans', sans-serif;
  font-size: $story-kicker-size;
  font-weight: 700;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  margin: 0 0 10px;

  .guia-page--noche & {
    color: $story-dark-accent;
  }

  .guia-page--dia & {
    // $bronze-light sobre el velo claro no tiene contraste suficiente (ambos
    // clarps) — el kicker en tema día usa el acento terracotta.
    color: $story-light-accent;
  }
}

.story-slide__title {
  font-family: 'Cinzel', serif;
  font-size: $story-title-size;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.2;
  margin: 0 0 18px;

  // Sombreado mínimo de fondo para despegar el título de la foto. En noche,
  // el mismo halo que `TvScreenPage.vue`; en día, uno claro y corto (una
  // sombra oscura ensuciaría la tipografía sobre el velo claro).
  .guia-page--dia & {
    text-shadow:
      0 1px 2px rgba(255, 255, 255, 0.7),
      0 0 0.8rem rgba(242, 236, 226, 0.9);
  }

  .guia-page--noche & {
    text-shadow:
      0 0 0.6rem rgba(20, 18, 16, 0.7),
      0 0 1.4rem rgba(20, 18, 16, 0.5);
  }
}

.story-slide__word {
  display: inline-block;
  animation: story-word-in 0.35s ease both;
}

.story-slide__item {
  animation: story-item-in 0.3s cubic-bezier(0.2, 0.7, 0.25, 1) both;
}

.story-slide__paragraph {
  font-family: 'Nunito Sans', sans-serif;
  font-size: $story-body-size;
  line-height: 1.5;
  margin: 0 0 14px;

  .guia-page--noche & {
    color: $story-dark-muted;
  }

  .guia-page--dia & {
    color: $story-light-muted;
  }
}

.story-slide__footnote {
  font-family: 'Nunito Sans', sans-serif;
  font-size: 13px;
  font-style: italic;
  margin-top: 16px;
  opacity: 0.9;
}

.story-bullets {
  text-align: left;
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  font-family: 'Nunito Sans', sans-serif;
  font-size: $story-bullet-size;
  font-weight: 500;
  line-height: 1.6;
  display: flex;
  flex-direction: column;
  gap: 10px;

  strong {
    .guia-page--noche & {
      color: $story-dark-text;
    }

    .guia-page--dia & {
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
}

.story-blocks__row {
  border-left: 4px solid;
  padding: 4px 0 4px 12px;
}

.story-blocks__label {
  font-family: 'Cinzel', serif;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.story-blocks__desc {
  font-family: 'Nunito Sans', sans-serif;
  font-size: 14px;
  line-height: 1.4;
  opacity: 0.95;
  margin-top: 2px;
}

// ─── Tipo B: niveles ────────────────────────────────────────────────────
.story-levels {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  font-family: 'Cinzel', serif;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.story-levels__phrase {
  font-family: 'Nunito Sans', sans-serif;
  font-size: 14px;
  line-height: 1.4;
  opacity: 0.95;
  margin: 2px 0 0;
}

// ─── Pista "Tocá para seguir" ───────────────────────────────────────────
.guia-page__tap-hint {
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  font-family: 'Nunito Sans', sans-serif;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  animation: story-tap-hint 1.8s ease-in-out infinite;

  .guia-page--noche & {
    color: $story-dark-accent;
  }

  .guia-page--dia & {
    color: $story-light-accent;
  }
}

@keyframes story-tap-hint {
  0%,
  100% {
    opacity: 0.55;
    transform: translateX(0);
  }
  50% {
    opacity: 1;
    transform: translateX(4px);
  }
}

// ─── Tipo D: CTA ────────────────────────────────────────────────────────
.story-cta {
  font-family: 'Nunito Sans', sans-serif;
  font-weight: 700;
  font-size: 19px;
  border-radius: 26px;
  padding: 12px 32px;
  background: $primary;
  color: $cream;
}

.story-cta-secondary {
  font-family: 'Nunito Sans', sans-serif;
  font-weight: 600;
  color: inherit;
  opacity: 0.85;
}

// ─── Transición entre slides: opacity+translateY, NUNCA blur/filter/scale.
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
  .story-slide__item,
  .guia-page__tap-hint {
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
