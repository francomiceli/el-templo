<template>
  <div id="tvInauguracionRoot" :style="{ '--trans-foto': `url('${tvBarsOpen}')` }">
    <!-- ============ PLACA 1: BIENVENIDA (crema) ============ -->
    <div
      class="placa placa--dia"
      :class="{ visible: placaActiva === 'bienvenida' }"
      aria-label="Bienvenida"
    >
      <div class="placaFoto" aria-hidden="true"></div>
      <div :key="`bienvenida-${ciclo}`" class="contenido">
        <img class="parten parten--entra" :src="tvParthenonCharcoal" alt="El Templo" />
        <div class="kicker kicker--dia aparece" :style="delay(0.5)">
          INAUGURACIÓN · ALBERTI 2024
        </div>
        <div class="titulo titulo--dia">
          <template v-for="(linea, i) in TITULO_BIENVENIDA" :key="i">
            <span
              v-for="(palabra, j) in linea"
              :key="j"
              class="palabra prendida"
              :style="delayPalabra(i, j)"
              >{{ palabra }}</span
            >
            <br v-if="i !== TITULO_BIENVENIDA.length - 1" />
          </template>
        </div>
        <div class="bajada bajada--dia aparece" :style="delay(3.4)">
          Hoy abrimos las puertas de nuestra nueva sede en
          <span class="acento--terracotta">Mar del Plata</span>.
        </div>
      </div>
    </div>

    <!-- ============ PLACA 2: NUEVA SEDE (charcoal) ============ -->
    <div
      class="placa"
      :class="{ visible: placaActiva === 'encuentro' }"
      aria-label="Nueva sede"
    >
      <div class="placaFoto placaFoto--noche" aria-hidden="true"></div>
      <div class="placaGlow" aria-hidden="true"></div>
      <div :key="`encuentro-${ciclo}`" class="contenido">
        <img class="parten parten--chica parten--entra" :src="tvParthenonBlanco" alt="El Templo" />
        <div class="kicker kicker--noche aparece" :style="delay(0.5)">
          HOY · INAUGURACIÓN EN VIVO
        </div>
        <div class="titulo titulo--noche">
          <span
            v-for="(palabra, j) in TITULO_ENCUENTRO"
            :key="j"
            class="palabra prendida"
            :class="{ oro: palabra.oro }"
            :style="delayPalabra(0, j)"
            >{{ palabra.text }}</span
          >
        </div>
        <div class="bajada bajada--noche aparece" :style="delay(3)">
          El Templo abre en <span class="acento--bronce">Alberti 2024</span>. Ya somos
          <span class="acento--bronce">seis</span> en Mar del Plata.
        </div>
        <div class="fila aparece" :style="delay(3.8)">
          <div class="mapaCol">
            <div class="mapaWrap">
              <img class="mapaImg" :src="tvMapaSedes" alt="Mapa de sedes de Mar del Plata" />
              <!-- Pin de Alberti animado por encima del mapa horneado -->
              <div class="pinNueva" :style="PIN_ALBERTI_POS">
                <div class="pinNueva__label">ALBERTI · NUEVA</div>
                <div class="pinNueva__dot"></div>
              </div>
            </div>
            <div class="mapaCap">MAR DEL PLATA · 6 SEDES</div>
          </div>
          <div class="descarga">
            <div class="descarga__label">Descargá la app<br />y reservá tu clase</div>
            <div class="qrRow">
              <div class="qr">
                <div class="qr__box">
                  <img v-if="qrAndroid" :src="qrAndroid" alt="QR Google Play" />
                </div>
                <div class="qr__cap">Android</div>
              </div>
              <div class="qr">
                <div class="qr__box">
                  <img v-if="qrIos" :src="qrIos" alt="QR App Store" />
                </div>
                <div class="qr__cap">iPhone</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * TvInauguracionPage — placa animada de inauguración de sede para el navegador
 * del TV (fullscreen, ruta top-level '/pantalla-inauguracion', mismos roles que
 * '/pantalla-tv'). Reutiliza la estética de las pantallas de transición del TV
 * (TvScreenPage): variante diurna crema y nocturna charcoal, con el encendido
 * palabra-por-palabra de las planis.
 *
 * Autocontenida (sin CDN): fuentes embebidas desde pdf-assets, mapa de sedes
 * horneado como asset estático (tv-mapa-sedes.webp — tiles OSM oscurecidos,
 * 5 pines urbanos; el pin de Alberti se anima por encima con CSS), QRs de las
 * tiendas generados en runtime con la dep `qrcode`.
 */

import { onBeforeUnmount, onMounted, ref } from 'vue';
import QRCode from 'qrcode';
import { createLogger } from 'src/utils/logger';
import tvBarsOpen from 'src/assets/tv-bars-open.webp';
import tvParthenonBlanco from 'src/assets/tv-parthenon-blanco.png';
import tvParthenonCharcoal from 'src/assets/tv-parthenon-charcoal.png';
import tvMapaSedes from 'src/assets/tv-mapa-sedes.webp';
import {
  CINZEL_REGULAR_BASE64,
  CINZEL_BOLD_BASE64,
  NUNITO_SANS_REGULAR_BASE64,
  NUNITO_SANS_BOLD_BASE64,
} from 'src/utils/pdf/pdf-assets';

const logger = createLogger('tv-inauguracion');

// ---------------------------------------------------------------------------
// Contenido
// ---------------------------------------------------------------------------

/** Título de la placa 1, por líneas (para el <br/> y el stagger por palabra). */
const TITULO_BIENVENIDA: string[][] = [
  ['BIENVENIDOS'],
  ['A', 'LA', 'SEXTA'],
];

/** Título de la placa 2; "NUEVA SEDE" va en bronce (mismo esquema segments/gold de quotes.ts). */
const TITULO_ENCUENTRO: { text: string; oro?: boolean }[] = [
  { text: 'SUMÁ' },
  { text: 'UNA' },
  { text: 'NUEVA', oro: true },
  { text: 'SEDE', oro: true },
];

/**
 * Posición del pin de Alberti sobre el mapa horneado, medida al hornear
 * (latLngToContainerPoint sobre el fitBounds real, zoom 14): (307, 170) de 520×460.
 */
const PIN_ALBERTI_POS = { left: '59.0%', top: '37.0%' };

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.eltemplo.app';
const APP_STORE_URL = 'https://apps.apple.com/app/el-templo-calistenia/id6761773726';

/** Duración de cada placa antes de rotar (ms). */
const DURACION_BIENVENIDA_MS = 18_000;
const DURACION_ENCUENTRO_MS = 32_000;

// ---------------------------------------------------------------------------
// Rotación de placas: el :key con `ciclo` fuerza remount del contenido para
// que el encendido palabra-por-palabra se repita en cada pasada.
// ---------------------------------------------------------------------------

const placaActiva = ref<'bienvenida' | 'encuentro'>('bienvenida');
const ciclo = ref(0);
let rotacionTimer: ReturnType<typeof setTimeout> | null = null;

function programarRotacion(): void {
  const esBienvenida = placaActiva.value === 'bienvenida';
  rotacionTimer = setTimeout(
    () => {
      placaActiva.value = esBienvenida ? 'encuentro' : 'bienvenida';
      if (!esBienvenida) ciclo.value += 1;
      programarRotacion();
    },
    esBienvenida ? DURACION_BIENVENIDA_MS : DURACION_ENCUENTRO_MS,
  );
}

// ---------------------------------------------------------------------------
// Stagger de animaciones
// ---------------------------------------------------------------------------

/** Delay simple para bloques que aparecen enteros. */
function delay(segundos: number): { animationDelay: string } {
  return { animationDelay: `${segundos}s` };
}

/** Encendido palabra-por-palabra: base + step, contando palabras de líneas previas. */
const IGNITE_BASE_S = 0.9;
const IGNITE_STEP_S = 0.45;
function delayPalabra(linea: number, palabra: number): { animationDelay: string } {
  const previas = TITULO_BIENVENIDA.slice(0, linea).reduce((n, l) => n + l.length, 0);
  return { animationDelay: `${IGNITE_BASE_S + (previas + palabra) * IGNITE_STEP_S}s` };
}

// ---------------------------------------------------------------------------
// QRs (runtime, sin red)
// ---------------------------------------------------------------------------

const qrAndroid = ref('');
const qrIos = ref('');

async function generarQrs(): Promise<void> {
  try {
    const opts = {
      width: 336,
      margin: 1,
      errorCorrectionLevel: 'M' as const,
      color: { dark: '#1a1714', light: '#f2ede5' },
    };
    qrAndroid.value = await QRCode.toDataURL(PLAY_STORE_URL, opts);
    qrIos.value = await QRCode.toDataURL(APP_STORE_URL, opts);
  } catch (err: unknown) {
    logger.error('No se pudieron generar los QRs', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Fuentes embebidas (mismo patrón que TvScreenPage, id propio para no pisarse)
// ---------------------------------------------------------------------------

const FONTS_STYLE_ID = 'tv-inauguracion-fonts';
function fontFace(family: string, base64: string, weight: number): string {
  return (
    "@font-face{font-family:'" +
    family +
    "';font-weight:" +
    weight +
    ';font-style:normal;font-display:block;' +
    'src:url(data:font/truetype;charset=utf-8;base64,' +
    base64 +
    ") format('truetype');}"
  );
}
function installFonts(): void {
  if (document.getElementById(FONTS_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = FONTS_STYLE_ID;
  style.textContent =
    fontFace('Cinzel', CINZEL_REGULAR_BASE64, 400) +
    fontFace('Cinzel', CINZEL_BOLD_BASE64, 700) +
    fontFace('NunitoSans', NUNITO_SANS_REGULAR_BASE64, 400) +
    fontFace('NunitoSans', NUNITO_SANS_BOLD_BASE64, 700);
  document.head.appendChild(style);
}
function removeFonts(): void {
  document.getElementById(FONTS_STYLE_ID)?.remove();
}

const BODY_ACTIVE_CLASS = 'tv-inauguracion-active';

onMounted(() => {
  installFonts();
  document.body.classList.add(BODY_ACTIVE_CLASS);
  void generarQrs();
  programarRotacion();
});

onBeforeUnmount(() => {
  if (rotacionTimer !== null) clearTimeout(rotacionTimer);
  document.body.classList.remove(BODY_ACTIVE_CLASS);
  removeFonts();
});
</script>

<style>
/* Sin scope a propósito (igual que TvScreenPage): todo cuelga de
   #tvInauguracionRoot así no pisa el CSS del admin. */

body.tv-inauguracion-active {
  overflow: hidden;
}

#tvInauguracionRoot {
  /* Paleta compartida con las pantallas de transición del TV */
  --cream: #f2ebe1;
  --navy: #3d3732;
  --gold: #b08d6e;
  --trans-noche: #1a1714;
  --trans-crema: #f2ede5;
  --trans-bronce: #d4b896;
  --trans-ambar: #d4a843;
  --trans-terracotta: #96593a;
  --cinzel: 'Cinzel', Georgia, serif;
  --nunito: 'NunitoSans', 'Segoe UI', system-ui, sans-serif;
  /* Halos de glow para las letras */
  --halo-crema: 0 0 1.3rem rgba(242, 236, 226, 0.98), 0 0 3.2rem rgba(242, 236, 226, 0.88),
    0 0 5.5rem rgba(176, 141, 110, 0.3);
  --halo-oro: 0 0 1.5rem rgba(212, 168, 67, 0.45), 0 0 3.8rem rgba(212, 168, 67, 0.28),
    0 0.06em 0.5em rgba(0, 0, 0, 0.65);
  --halo-noche: 0 0 1.2rem rgba(26, 23, 20, 0.9), 0 0 2.6rem rgba(212, 184, 150, 0.28);

  position: fixed;
  inset: 0;
  background: #17140f;
  font-family: var(--nunito);
  z-index: 3000;
}

/* ============ Placas (corte seco, como el TV) ============ */

#tvInauguracionRoot .placa {
  display: none;
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--trans-noche);
  color: var(--trans-crema);
}
#tvInauguracionRoot .placa.visible {
  display: block;
}
#tvInauguracionRoot .placa--dia {
  background: var(--cream);
  color: var(--navy);
}

#tvInauguracionRoot .placaFoto {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      ellipse at 50% 46%,
      rgba(242, 236, 226, 0.86) 0%,
      rgba(242, 236, 226, 0.8) 46%,
      rgba(240, 232, 220, 0.66) 74%,
      rgba(238, 229, 214, 0.56) 100%
    ),
    var(--trans-foto, none) center / cover no-repeat;
}
#tvInauguracionRoot .placaFoto--noche {
  background:
    radial-gradient(
      ellipse at 50% 45%,
      rgba(20, 18, 16, 0.9) 0%,
      rgba(20, 18, 16, 0.84) 46%,
      rgba(26, 23, 20, 0.66) 74%,
      rgba(33, 30, 27, 0.55) 100%
    ),
    var(--trans-foto, none) center / cover no-repeat;
}
#tvInauguracionRoot .placaGlow {
  position: absolute;
  left: 50%;
  top: 58%;
  width: 90%;
  height: 80%;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    ellipse at 50% 50%,
    rgba(212, 168, 67, 0.1) 0%,
    rgba(212, 168, 67, 0) 60%
  );
}

#tvInauguracionRoot .contenido {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 3vmin 4vmin;
}

/* ============ Piezas comunes ============ */

#tvInauguracionRoot .parten {
  width: 8.5rem;
  opacity: 0;
  margin-bottom: 2.2rem;
  filter: drop-shadow(0 0 1rem rgba(242, 236, 226, 0.95))
    drop-shadow(0 0 2.6rem rgba(242, 236, 226, 0.85));
}
#tvInauguracionRoot .placa:not(.placa--dia) .parten {
  filter: drop-shadow(0 0 1rem rgba(26, 23, 20, 0.95))
    drop-shadow(0 0 2.6rem rgba(26, 23, 20, 0.85));
}
#tvInauguracionRoot .parten--chica {
  width: 6.4rem;
  margin-bottom: 1.4rem;
}
#tvInauguracionRoot .parten--entra {
  animation: inaugEntra 1s ease 0.15s forwards;
}

#tvInauguracionRoot .kicker {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.42em;
  font-size: 2rem;
  margin-bottom: 1.9rem;
  opacity: 0;
}
#tvInauguracionRoot .kicker--dia {
  color: var(--trans-terracotta);
  text-shadow: var(--halo-crema);
}
#tvInauguracionRoot .kicker--noche {
  font-size: 1.9rem;
  color: var(--trans-bronce);
  text-shadow: var(--halo-noche);
}

#tvInauguracionRoot .titulo {
  font-family: var(--cinzel);
  font-weight: 700;
  line-height: 1.08;
  letter-spacing: 0.05em;
}
#tvInauguracionRoot .titulo--dia {
  font-size: 8.2rem;
  color: var(--navy);
  text-shadow: var(--halo-crema);
  margin-bottom: 2.4rem;
}
#tvInauguracionRoot .titulo--noche {
  font-size: 6.6rem;
  color: var(--trans-crema);
  text-shadow: var(--halo-oro);
  margin-bottom: 1.6rem;
}
#tvInauguracionRoot .titulo .palabra {
  white-space: nowrap;
  opacity: 0;
  display: inline-block;
}
#tvInauguracionRoot .titulo .palabra + .palabra {
  margin-left: 0.28em;
}
#tvInauguracionRoot .titulo .palabra.oro {
  color: var(--trans-bronce);
}
#tvInauguracionRoot .palabra.prendida {
  animation: inaugPalabraEntra 0.55s ease forwards;
}

#tvInauguracionRoot .bajada {
  font-family: var(--nunito);
  line-height: 1.42;
  opacity: 0;
}
#tvInauguracionRoot .bajada--dia {
  font-size: 3.5rem;
  color: var(--navy);
  text-shadow: var(--halo-crema);
  max-width: 46ch;
}
#tvInauguracionRoot .bajada--noche {
  font-size: 2.9rem;
  color: var(--trans-crema);
  text-shadow: var(--halo-noche);
  max-width: 40ch;
  margin-bottom: 2.4rem;
}
#tvInauguracionRoot .acento--terracotta {
  color: var(--trans-terracotta);
  font-weight: 700;
}
#tvInauguracionRoot .acento--bronce {
  color: var(--trans-bronce);
  font-weight: 700;
}

#tvInauguracionRoot .aparece {
  animation: inaugEntra 0.9s ease forwards;
}

/* ============ Placa 2: mapa + QRs ============ */

#tvInauguracionRoot .fila {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3.4rem;
  opacity: 0;
}

#tvInauguracionRoot .mapaCol {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.1rem;
}
#tvInauguracionRoot .mapaWrap {
  position: relative;
  width: 520px;
  height: 460px;
  border-radius: 1rem;
  overflow: hidden;
  border: 1px solid rgba(212, 184, 150, 0.3);
  box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.55);
}
#tvInauguracionRoot .mapaImg {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
#tvInauguracionRoot .mapaCap {
  font-family: var(--cinzel);
  font-weight: 700;
  font-size: 1.7rem;
  letter-spacing: 0.16em;
  color: var(--trans-bronce);
  text-shadow: var(--halo-noche);
}

#tvInauguracionRoot .pinNueva {
  position: absolute;
  transform: translate(-50%, -50%);
}
#tvInauguracionRoot .pinNueva__dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--trans-ambar);
  border: 2px solid #fff;
  box-shadow: 0 0 0 6px rgba(212, 168, 67, 0.4);
  animation: inaugPulso 1.8s ease-out infinite;
}
#tvInauguracionRoot .pinNueva__label {
  position: absolute;
  left: 50%;
  top: -2rem;
  transform: translateX(-50%);
  font-family: var(--nunito);
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: 0.14em;
  white-space: nowrap;
  color: #fff;
  text-transform: uppercase;
  text-shadow: 0 1px 5px rgba(0, 0, 0, 0.95);
}

#tvInauguracionRoot .descarga {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.6rem;
}
#tvInauguracionRoot .descarga__label {
  font-family: var(--nunito);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.24em;
  font-size: 1.55rem;
  color: var(--trans-bronce);
  text-shadow: var(--halo-noche);
}
#tvInauguracionRoot .qrRow {
  display: flex;
  gap: 2.2rem;
}
#tvInauguracionRoot .qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.85rem;
}
#tvInauguracionRoot .qr__box {
  background: #f2ede5;
  padding: 0.7rem;
  border-radius: 0.6rem;
  box-shadow: 0 0.4rem 1.6rem rgba(0, 0, 0, 0.5);
  line-height: 0;
  /* Reserva el espacio mientras el QR se genera */
  width: 182px;
  height: 182px;
}
#tvInauguracionRoot .qr__box img {
  display: block;
  width: 168px;
  height: 168px;
}
#tvInauguracionRoot .qr__cap {
  font-family: var(--nunito);
  font-weight: 700;
  letter-spacing: 0.18em;
  font-size: 1.25rem;
  text-transform: uppercase;
  color: var(--trans-crema);
  text-shadow: var(--halo-noche);
}

/* ============ Keyframes ============ */

@keyframes inaugPalabraEntra {
  from {
    opacity: 0;
    transform: translateY(0.14em);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes inaugEntra {
  from {
    opacity: 0;
    transform: translateY(0.6em);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes inaugPulso {
  0% {
    box-shadow: 0 0 0 0 rgba(212, 168, 67, 0.55);
  }
  100% {
    box-shadow: 0 0 0 24px rgba(212, 168, 67, 0);
  }
}
</style>
