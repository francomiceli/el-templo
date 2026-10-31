<template>
  <div
    id="tvCumpleMatiRoot"
    :class="{ 'con-controles': controlesVisibles }"
    @click="onToque"
    @mousemove="mostrarControles"
  >
    <!-- Escenario fijo 1920×1080 escalado al viewport (mismo criterio que la
         placa de inauguración): se ve igual en el TV y en cualquier monitor. -->
    <div class="escenario" :style="{ transform: `translate(-50%, -50%) scale(${escala})` }">
      <div class="fondo" aria-hidden="true"></div>

      <!-- Papel picado: piezas fijas (generadas una vez), solo transform/opacity -->
      <div class="confeti" aria-hidden="true">
        <span
          v-for="pieza in CONFETI"
          :key="pieza.id"
          class="confeti__pieza"
          :class="`confeti__pieza--${pieza.forma}`"
          :style="pieza.estilo"
        ></span>
      </div>

      <Transition name="corte" mode="out-in">
        <!-- ============ PLACA DE TÍTULO ============ -->
        <div v-if="slide.tipo === 'titulo'" :key="claveSlide" class="slide slide--titulo">
          <img class="parten aparece" :src="tvParthenonBlanco" alt="El Templo" />
          <div class="kicker aparece" :style="delay(0.4)">El Templo celebra</div>
          <div class="titulo">
            <span
              v-for="(palabra, i) in ['FELIZ', 'CUMPLE']"
              :key="palabra"
              class="palabra prendida"
              :style="delay(0.9 + i * 0.45)"
              >{{ palabra }}</span
            >
          </div>
          <div class="nombre prendida" :style="delay(2)">MATI</div>
          <div class="bajada aparece" :style="delay(3)">
            Que este año venga con <span class="acento">más fuerza</span>, más marcas y muchos
            festejos.
          </div>
        </div>

        <!-- ============ FOTO / VIDEO VERTICAL: texto a la izquierda ============ -->
        <div
          v-else-if="slide.orientacion === 'vertical'"
          :key="claveSlide"
          class="slide slide--vertical"
        >
          <div class="lateral">
            <div class="kicker aparece">{{ slide.leyenda }}</div>
            <div class="titulo titulo--lateral aparece" :style="delay(0.3)">FELIZ CUMPLE</div>
            <div class="nombre nombre--lateral prendida" :style="delay(0.7)">MATI</div>
            <div class="firma aparece" :style="delay(1.2)">
              <img :src="tvParthenonBlanco" alt="" />
              <span>El Templo · Alberti</span>
            </div>
          </div>
          <div class="marco marco--vertical">
            <img
              v-if="slide.tipo === 'foto'"
              class="medio medio--foto"
              :src="slide.src"
              :style="{ animationDuration: `${slide.duracionMs}ms` }"
              alt=""
            />
            <video
              v-else
              :ref="registrarVideo"
              class="medio"
              :src="slide.src"
              :muted="silenciado"
              playsinline
              preload="auto"
              @loadeddata="reproducir"
              @ended="avanzar"
              @error="onVideoError"
            ></video>
          </div>
        </div>

        <!-- ============ FOTO / VIDEO HORIZONTAL: cinta abajo ============ -->
        <div v-else :key="claveSlide" class="slide slide--horizontal">
          <div class="marco marco--horizontal">
            <img
              v-if="slide.tipo === 'foto'"
              class="medio medio--foto"
              :src="slide.src"
              :style="{ animationDuration: `${slide.duracionMs}ms` }"
              alt=""
            />
            <video
              v-else
              :ref="registrarVideo"
              class="medio"
              :src="slide.src"
              :muted="silenciado"
              playsinline
              preload="auto"
              @loadeddata="reproducir"
              @ended="avanzar"
              @error="onVideoError"
            ></video>
            <div class="cinta aparece" :style="delay(0.4)">
              <span class="cinta__leyenda">{{ slide.leyenda }}</span>
              <span class="cinta__saludo">Feliz cumple, <b>Mati</b></span>
            </div>
          </div>
        </div>
      </Transition>

      <!-- Avance del recorrido -->
      <div class="puntos" aria-hidden="true">
        <span
          v-for="(_, i) in SLIDES"
          :key="i"
          class="puntos__punto"
          :class="{ activo: i === indice }"
        ></span>
      </div>

      <div v-if="silenciado && slide.tipo === 'video'" class="aviso-sonido">
        Tocá la pantalla para activar el sonido
      </div>
    </div>

    <!-- Fuera del escenario (no escala): salida para el que maneja el TV. -->
    <button v-show="controlesVisibles" class="salir" type="button" @click.stop="salir">
      ← Volver al control
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * TvCumpleMatiPage — festejo del cumpleaños de Mati Mamana (31/10/2026) para el
 * TV de la sede Alberti. Ruta top-level '/pantalla-cumple-mati' (mismo patrón
 * y roles que '/pantalla-inauguracion'); se abre desde TV control con el botón
 * "Feliz cumple, Mati" (ver `src/utils/cumple-mati.ts`).
 *
 * Recorrido en loop: placa de título → fotos (con zoom lento) → videos (hasta
 * que terminan). Autocontenida (sin CDN): medios como assets del bundle y
 * fuentes embebidas.
 *
 * Sonido: se intenta reproducir con audio (el tap del botón que trae hasta acá
 * habilita el autoplay). Si el navegador lo bloquea (p. ej. se recargó la
 * página), sigue en silencio y un tap en la pantalla lo activa.
 *
 * Página efímera: retirar pasado el festejo.
 */

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { useRouter } from 'vue-router';
import { createLogger } from 'src/utils/logger';
import { installTvFonts, removeTvFonts } from 'src/utils/tv-fonts';
import tvParthenonBlanco from 'src/assets/tv-parthenon-blanco.png';
import fotoSalchicha from 'src/assets/cumple-mati/foto-salchicha.webp';
import fotoAsado from 'src/assets/cumple-mati/foto-asado.webp';
import videoRayo from 'src/assets/cumple-mati/video-rayo.mp4';
import videoPelea from 'src/assets/cumple-mati/video-pelea.mp4';
import videoJinete from 'src/assets/cumple-mati/video-jinete.mp4';
import videoCientifico from 'src/assets/cumple-mati/video-cientifico.mp4';
import videoMeme from 'src/assets/cumple-mati/video-meme.mp4';

const logger = createLogger('tv-cumple-mati');
const router = useRouter();

// ---------------------------------------------------------------------------
// Recorrido
// ---------------------------------------------------------------------------

type Orientacion = 'vertical' | 'horizontal';

type Slide =
  | { tipo: 'titulo'; duracionMs: number }
  | { tipo: 'foto'; src: string; orientacion: Orientacion; leyenda: string; duracionMs: number }
  | { tipo: 'video'; src: string; orientacion: Orientacion; leyenda: string };

const DURACION_TITULO_MS = 9_000;
const DURACION_FOTO_MS = 8_000;
/** Red de seguridad: si un video no arranca o no avisa que terminó, se sigue. */
const VIDEO_TOPE_MS = 20_000;

const SLIDES: Slide[] = [
  { tipo: 'titulo', duracionMs: DURACION_TITULO_MS },
  {
    tipo: 'foto',
    src: fotoSalchicha,
    orientacion: 'vertical',
    leyenda: 'El guardián de la noche',
    duracionMs: DURACION_FOTO_MS,
  },
  {
    tipo: 'foto',
    src: fotoAsado,
    orientacion: 'horizontal',
    leyenda: 'El enemigo se acerca',
    duracionMs: DURACION_FOTO_MS,
  },
  { tipo: 'video', src: videoRayo, orientacion: 'vertical', leyenda: 'Empieza la batalla' },
  { tipo: 'video', src: videoPelea, orientacion: 'vertical', leyenda: 'Nada lo detiene' },
  { tipo: 'video', src: videoJinete, orientacion: 'vertical', leyenda: 'La victoria' },
  {
    tipo: 'video',
    src: videoCientifico,
    orientacion: 'horizontal',
    leyenda: 'El genio detrás de todo',
  },
  { tipo: 'video', src: videoMeme, orientacion: 'horizontal', leyenda: 'Mentalidad Mati' },
];

const indice = ref(0);
/** Vueltas completas: entra en la key para que la placa se remonte (y se re-anime). */
const vuelta = ref(0);
// SLIDES nunca está vacío: el índice siempre cae adentro.
const slide = computed<Slide>(() => SLIDES[indice.value] as Slide);
const claveSlide = computed(() => `${vuelta.value}-${indice.value}`);

let slideTimer: ReturnType<typeof setTimeout> | null = null;

function limpiarTimer(): void {
  if (slideTimer !== null) clearTimeout(slideTimer);
  slideTimer = null;
}

function avanzar(): void {
  limpiarTimer();
  if (indice.value === SLIDES.length - 1) {
    indice.value = 0;
    vuelta.value += 1;
  } else {
    indice.value += 1;
  }
}

function programarSlide(): void {
  limpiarTimer();
  const actual = slide.value;
  slideTimer = setTimeout(avanzar, actual.tipo === 'video' ? VIDEO_TOPE_MS : actual.duracionMs);
}

watch(claveSlide, programarSlide);

// ---------------------------------------------------------------------------
// Video y sonido
// ---------------------------------------------------------------------------

const silenciado = ref(false);
let videoActual: HTMLVideoElement | null = null;

function registrarVideo(el: Element | ComponentPublicInstance | null): void {
  videoActual = el instanceof HTMLVideoElement ? el : null;
}

function reproducir(): void {
  const el = videoActual;
  if (!el) return;
  el.muted = silenciado.value;
  el.play().catch(() => {
    // Autoplay con audio bloqueado: seguimos en silencio (el tap lo activa).
    silenciado.value = true;
    el.muted = true;
    el.play().catch((err: unknown) => {
      logger.warn('No se pudo reproducir el video', {
        error: err instanceof Error ? err.message : String(err),
      });
      avanzar();
    });
  });
}

function onVideoError(): void {
  logger.warn('Error cargando un video del festejo', { indice: indice.value });
  avanzar();
}

/** Calienta la caché HTTP con los videos para que cada corte sea inmediato. */
function precargarVideos(): void {
  for (const s of SLIDES) {
    if (s.tipo === 'video') void fetch(s.src).catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Controles (tap / mouse / teclado del TV)
// ---------------------------------------------------------------------------

const CONTROLES_MS = 4_000;
const controlesVisibles = ref(false);
let controlesTimer: ReturnType<typeof setTimeout> | null = null;

function mostrarControles(): void {
  controlesVisibles.value = true;
  if (controlesTimer !== null) clearTimeout(controlesTimer);
  controlesTimer = setTimeout(() => {
    controlesVisibles.value = false;
  }, CONTROLES_MS);
}

function onToque(): void {
  mostrarControles();
  if (silenciado.value) {
    silenciado.value = false;
    if (videoActual) videoActual.muted = false;
  }
}

function salir(): void {
  void router.push('/tv/control');
}

function onTecla(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    salir();
    return;
  }
  onToque();
}

// ---------------------------------------------------------------------------
// Escala del escenario (1920×1080 fijos, min de ambos ejes)
// ---------------------------------------------------------------------------

const ESCENARIO_ANCHO = 1920;
const ESCENARIO_ALTO = 1080;
const escala = ref(1);

function recalcularEscala(): void {
  escala.value = Math.min(window.innerWidth / ESCENARIO_ANCHO, window.innerHeight / ESCENARIO_ALTO);
}

// ---------------------------------------------------------------------------
// Animaciones
// ---------------------------------------------------------------------------

function delay(segundos: number): { animationDelay: string } {
  return { animationDelay: `${segundos}s` };
}

interface PiezaConfeti {
  id: number;
  forma: 'tira' | 'cuadro' | 'punto';
  estilo: Record<string, string>;
}

const COLORES_CONFETI = ['#d4a843', '#96593a', '#c07a56', '#f2ede5', '#b89b5e', '#8a8472'];
const FORMAS_CONFETI: PiezaConfeti['forma'][] = ['tira', 'cuadro', 'punto'];

/** Pseudoaleatorio determinístico: el confeti se ve igual en cada carga. */
function aleatorio(semilla: number): number {
  const x = Math.sin(semilla * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

const CONFETI: PiezaConfeti[] = Array.from({ length: 42 }, (_, id) => ({
  id,
  forma: FORMAS_CONFETI[id % FORMAS_CONFETI.length] ?? 'cuadro',
  estilo: {
    left: `${(aleatorio(id + 1) * 100).toFixed(2)}%`,
    background: COLORES_CONFETI[id % COLORES_CONFETI.length] ?? '#d4a843',
    animationDuration: `${(9 + aleatorio(id + 101) * 9).toFixed(2)}s`,
    animationDelay: `-${(aleatorio(id + 201) * 18).toFixed(2)}s`,
    '--deriva': `${Math.round((aleatorio(id + 301) - 0.5) * 240)}px`,
    '--giro': `${Math.round(360 + aleatorio(id + 401) * 720)}deg`,
  },
}));

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------

const FONTS_STYLE_ID = 'tv-cumple-mati-fonts';
const BODY_ACTIVE_CLASS = 'tv-cumple-mati-active';

onMounted(() => {
  installTvFonts(FONTS_STYLE_ID);
  document.body.classList.add(BODY_ACTIVE_CLASS);
  recalcularEscala();
  window.addEventListener('resize', recalcularEscala);
  window.addEventListener('keydown', onTecla);
  precargarVideos();
  programarSlide();
});

onBeforeUnmount(() => {
  limpiarTimer();
  if (controlesTimer !== null) clearTimeout(controlesTimer);
  videoActual?.pause();
  window.removeEventListener('resize', recalcularEscala);
  window.removeEventListener('keydown', onTecla);
  document.body.classList.remove(BODY_ACTIVE_CLASS);
  removeTvFonts(FONTS_STYLE_ID);
});
</script>

<style>
/* Sin scope a propósito (igual que las otras pantallas del TV): todo cuelga de
   #tvCumpleMatiRoot así no pisa el CSS del admin. */

body.tv-cumple-mati-active {
  overflow: hidden;
}

#tvCumpleMatiRoot {
  --noche: #17140f;
  --crema: #f2ede5;
  --bronce: #d4b896;
  --ambar: #d4a843;
  --terracotta: #c07a56;
  --cinzel: 'Cinzel', Georgia, serif;
  --nunito: 'NunitoSans', 'Segoe UI', system-ui, sans-serif;
  --halo-oro: 0 0 1.5rem rgba(212, 168, 67, 0.55), 0 0 4rem rgba(212, 168, 67, 0.35),
    0 0.06em 0.5em rgba(0, 0, 0, 0.65);
  --halo-noche: 0 0 1.2rem rgba(26, 23, 20, 0.9), 0 0 2.6rem rgba(212, 184, 150, 0.28);

  position: fixed;
  inset: 0;
  background: #0f0d0a;
  font-family: var(--nunito);
  color: var(--crema);
  z-index: 3000;
  cursor: none;
}

#tvCumpleMatiRoot.con-controles {
  cursor: default;
}

#tvCumpleMatiRoot .escenario {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 1920px;
  height: 1080px;
  transform-origin: center center;
  overflow: hidden;
}

#tvCumpleMatiRoot .fondo {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 22% 30%, rgba(192, 122, 86, 0.28) 0%, rgba(192, 122, 86, 0) 55%),
    radial-gradient(ellipse at 80% 75%, rgba(212, 168, 67, 0.22) 0%, rgba(212, 168, 67, 0) 55%),
    var(--noche);
}

/* ============ Confeti ============ */

#tvCumpleMatiRoot .confeti {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

#tvCumpleMatiRoot .confeti__pieza {
  position: absolute;
  top: -40px;
  opacity: 0.85;
  animation-name: cumpleCae;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}

#tvCumpleMatiRoot .confeti__pieza--tira {
  width: 10px;
  height: 26px;
  border-radius: 3px;
}

#tvCumpleMatiRoot .confeti__pieza--cuadro {
  width: 16px;
  height: 16px;
  border-radius: 2px;
}

#tvCumpleMatiRoot .confeti__pieza--punto {
  width: 14px;
  height: 14px;
  border-radius: 50%;
}

/* ============ Slides ============ */

#tvCumpleMatiRoot .slide {
  position: absolute;
  inset: 0;
}

#tvCumpleMatiRoot .corte-enter-active,
#tvCumpleMatiRoot .corte-leave-active {
  transition: opacity 0.5s ease;
}

#tvCumpleMatiRoot .corte-enter-from,
#tvCumpleMatiRoot .corte-leave-to {
  opacity: 0;
}

#tvCumpleMatiRoot .slide--titulo {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

#tvCumpleMatiRoot .parten {
  width: 10rem;
  margin-bottom: 1.6rem;
  filter: drop-shadow(0 0 1rem rgba(26, 23, 20, 0.95));
}

#tvCumpleMatiRoot .kicker {
  font-family: var(--nunito);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.32em;
  font-size: 2rem;
  color: var(--bronce);
  text-shadow: var(--halo-noche);
  margin-bottom: 1.2rem;
}

#tvCumpleMatiRoot .titulo {
  font-family: var(--cinzel);
  font-weight: 700;
  letter-spacing: 0.06em;
  font-size: 7.5rem;
  line-height: 1.05;
  color: var(--crema);
  text-shadow: var(--halo-oro);
}

#tvCumpleMatiRoot .titulo .palabra {
  display: inline-block;
}

#tvCumpleMatiRoot .titulo .palabra + .palabra {
  margin-left: 0.3em;
}

#tvCumpleMatiRoot .nombre {
  font-family: var(--cinzel);
  font-weight: 700;
  font-size: 15rem;
  line-height: 1;
  letter-spacing: 0.08em;
  color: var(--ambar);
  text-shadow: var(--halo-oro);
}

#tvCumpleMatiRoot .bajada {
  font-size: 2.6rem;
  line-height: 1.4;
  max-width: 40ch;
  margin-top: 1.8rem;
  text-shadow: var(--halo-noche);
}

#tvCumpleMatiRoot .acento {
  color: var(--bronce);
  font-weight: 700;
}

/* Vertical: texto a la izquierda, medio 9:16 a la derecha */

#tvCumpleMatiRoot .slide--vertical {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 120px;
}

#tvCumpleMatiRoot .lateral {
  width: 820px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

#tvCumpleMatiRoot .titulo--lateral {
  font-size: 6.2rem;
}

#tvCumpleMatiRoot .nombre--lateral {
  font-size: 13rem;
}

#tvCumpleMatiRoot .firma {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 2.2rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.24em;
  font-size: 1.4rem;
  color: var(--bronce);
}

#tvCumpleMatiRoot .firma img {
  width: 3.4rem;
}

#tvCumpleMatiRoot .marco {
  position: relative;
  overflow: hidden;
  border-radius: 28px;
  background: #000;
  border: 4px solid rgba(212, 168, 67, 0.75);
  box-shadow:
    0 0 0 10px rgba(212, 168, 67, 0.12),
    0 0 60px rgba(212, 168, 67, 0.35),
    0 30px 80px rgba(0, 0, 0, 0.6);
}

#tvCumpleMatiRoot .marco--vertical {
  width: 552px;
  height: 982px;
}

#tvCumpleMatiRoot .marco--horizontal {
  position: absolute;
  left: 50%;
  top: 48px;
  transform: translateX(-50%);
  width: 1600px;
  height: 900px;
}

#tvCumpleMatiRoot .medio {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

#tvCumpleMatiRoot .medio--foto {
  animation-name: cumpleZoom;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
}

/* Horizontal: cinta con el saludo sobre el borde inferior del medio */

#tvCumpleMatiRoot .cinta {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 90px 56px 34px;
  background: linear-gradient(to top, rgba(15, 13, 10, 0.92) 0%, rgba(15, 13, 10, 0) 100%);
}

#tvCumpleMatiRoot .cinta__leyenda {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3em;
  font-size: 1.8rem;
  color: var(--bronce);
}

#tvCumpleMatiRoot .cinta__saludo {
  font-family: var(--cinzel);
  font-weight: 700;
  font-size: 4.6rem;
  letter-spacing: 0.05em;
  text-shadow: var(--halo-oro);
}

#tvCumpleMatiRoot .cinta__saludo b {
  color: var(--ambar);
}

/* ============ Avance y avisos ============ */

#tvCumpleMatiRoot .puntos {
  position: absolute;
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%);
  display: flex;
  gap: 14px;
}

#tvCumpleMatiRoot .puntos__punto {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgba(242, 237, 229, 0.25);
  transition:
    background 0.4s ease,
    transform 0.4s ease;
}

#tvCumpleMatiRoot .puntos__punto.activo {
  background: var(--ambar);
  transform: scale(1.35);
}

#tvCumpleMatiRoot .aviso-sonido {
  position: absolute;
  right: 40px;
  top: 32px;
  padding: 14px 26px;
  border-radius: 999px;
  background: rgba(15, 13, 10, 0.8);
  border: 2px solid rgba(212, 184, 150, 0.6);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--bronce);
}

#tvCumpleMatiRoot .salir {
  position: absolute;
  left: 24px;
  top: 24px;
  z-index: 1;
  padding: 14px 24px;
  border: none;
  border-radius: 12px;
  background: rgba(242, 237, 229, 0.92);
  color: #3d3732;
  font-family: var(--nunito);
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
}

/* ============ Animaciones ============ */

#tvCumpleMatiRoot .aparece {
  opacity: 0;
  animation: cumpleEntra 0.9s ease forwards;
}

#tvCumpleMatiRoot .prendida {
  opacity: 0;
  animation: cumplePrende 0.7s ease forwards;
}

@keyframes cumpleEntra {
  from {
    opacity: 0;
    transform: translateY(0.6em);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes cumplePrende {
  from {
    opacity: 0;
    transform: scale(0.85);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes cumpleZoom {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.1);
  }
}

@keyframes cumpleCae {
  from {
    transform: translate3d(0, 0, 0) rotate(0deg);
  }
  to {
    transform: translate3d(var(--deriva), 1160px, 0) rotate(var(--giro));
  }
}
</style>
