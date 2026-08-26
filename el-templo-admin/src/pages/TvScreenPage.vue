<template>
  <!--
    Pantalla de sede, fullscreen y AUTENTICADA. Reemplaza al kiosco estático
    `/tv/` (RFC 8628: código de vinculación + dispositivo anónimo, retirado).
    Ruta top-level `/pantalla-tv` (fuera de AdminLayout: sin drawer/header) —
    ver `router/routes.ts` y el guard de `router/index.ts`.

    El esqueleto de abajo (ids/clases) es el contrato de `src/tv/render.ts`
    (plan 164-11 original): `renderState`/`tickClock`/`tickTimer` actualizan
    estos nodos con `textContent`, nunca los recrean. NO hay pantalla de
    vinculación (`pantallaPairing` se borró con el kiosco) ni columna de
    video (se sacó antes de este pase: layout de 2 columnas lista+timer).
  -->
  <div
    id="tvScreenRoot"
    :class="[`tvbg--${bgState}`, { 'tvbg--tapado': fondoTapado, 'tv-sobrio': modoSobrio }]"
    :style="{ '--marble': `url('${MARBLE_BG_BASE64}')`, '--trans-foto': `url('${tvBarsOpen}')` }"
  >
    <!-- Selector de sede: solo la primera vez que se abre esta pantalla en
         este TV (sin `?branchId=` en la URL y sin sede guardada todavía). -->
    <div v-if="!ready" class="tvPicker">
      <img :src="tvLogo" alt="El Templo" class="tvPicker__logo" />
      <div class="tvPicker__title">Elegí la sede de esta pantalla</div>
      <div class="tvPicker__hint">
        Se guarda en este televisor: no hace falta elegirla de nuevo.
      </div>

      <div v-if="pickerLoading" class="tvPicker__status">Cargando sedes…</div>
      <div v-else-if="pickerError" class="tvPicker__status tvPicker__status--error">
        {{ pickerError }}
        <button type="button" class="tvPicker__retry" @click="onRetryPicker">Reintentar</button>
      </div>
      <div v-else class="tvPicker__list">
        <button
          v-for="b in pickerBranches"
          :key="b.id"
          type="button"
          class="tvPicker__btn"
          @click="choosePickerBranch(b.id)"
        >
          {{ b.name }}
          <span v-if="b.id === ownBranchId" class="tvPicker__own">tu sede</span>
        </button>
      </div>
    </div>

    <div v-else class="tvWrap">
      <div id="tv">
        <!-- Fondo vivo: capas detrás de toda la UI — mármol con deriva lenta, luz
             ambiental que recorre la piedra, vetas casi invisibles y polvo en
             suspensión. render.ts no las toca (sin ids). -->
        <div class="tvFondo" aria-hidden="true">
          <div class="tvFondo__marmol"></div>
          <div class="tvFondo__luz tvFondo__luz--calida"></div>
          <div class="tvFondo__luz tvFondo__luz--sombra"></div>
        </div>
        <!-- Barra superior: logo + fecha (sin "EL TEMPLO", el logo ya es la marca). -->
        <!-- Grid de 3 zonas: marca (logo + fecha 2 líneas) izq · BLOQUE n/M centro · reloj der. -->
        <header class="topbar">
          <div class="marca">
            <img :src="tvLogo" alt="El Templo" />
            <div class="fecha" id="fecha"><span id="fechaL1"></span><span id="fechaL2"></span></div>
          </div>
          <div class="bloqueNum">
            <span id="bloqueNum"></span><span class="dots" id="dots"></span>
          </div>
          <div class="reloj" id="reloj">--:--</div>
        </header>

        <!-- Cabecera en 3 zonas: nombre del bloque (izq) · cronómetro (centro) ·
             formato (der), alineados al centro vertical del timer. -->
        <div class="cabecera">
          <h1 class="cabTitulo" id="titulo"></h1>
          <section class="cronometro" id="timerPanel">
            <div class="digitosWrap">
              <div class="digitos" id="digitos">00:00</div>
              <!-- Copia fantasma que hace el envión (sube y se desvanece) al
                   iniciar, dejando el número real fijo en su lugar. render.ts le
                   pone el texto en el arranque; la animación la dispara .arranque. -->
              <div class="digitos-ghost" id="digitosGhost" aria-hidden="true"></div>
            </div>
            <!-- Barra de progreso con estética de columna: una copia tenue de fondo
                 (tiempo consumido) y una copia opaca recortada por el progreso
                 (#progreso, su width lo setea render.ts). -->
            <div class="barra">
              <div class="barraCol barraCol--track" aria-hidden="true">
                <div class="columnaDorica__cap columnaDorica__cap--izq"></div>
                <div class="columnaDorica__fuste"></div>
                <div class="columnaDorica__cap columnaDorica__cap--der"></div>
              </div>
              <i id="progreso" class="barraCol__fill">
                <div class="barraCol barraCol--full">
                  <div class="columnaDorica__cap columnaDorica__cap--izq"></div>
                  <div class="columnaDorica__fuste"></div>
                  <div class="columnaDorica__cap columnaDorica__cap--der"></div>
                </div>
              </i>
            </div>
          </section>
          <div class="cabFormato" id="formato"></div>
        </div>

        <!-- Columnas de nivel (1 o 2, rediseño fase 164): `render.ts` `paintList`
             las arma a mano por cada poll, no vienen fijas acá. -->
        <main class="stage" id="stage"></main>

        <!-- Movilidad: fila al pie de la pantalla, debajo de las columnas. Se
             oculta sola (:empty) cuando el bloque no trae línea de movilidad. -->
        <div class="movBar" id="movilidad"></div>

        <!-- Cartel de fase: destella "VAMOS!" al empezar el trabajo y "DESCANSO"
             al empezar el descanso (bloques con las dos fases: tabata / HIIT /
             intervalos con descanso). Overlay centrado sobre TODO el marco;
             render.ts le pone el texto y reinicia la animación al cambiar de
             fase. Va sobre las columnas pero debajo de las pantallas de
             transición (que en clase están ocultas). -->
        <div class="faseLabel" id="faseLabel" aria-hidden="true"></div>

        <!-- Pantallas de transición: MISMO escenario (la foto del templo),
             distinta luz. PRE-CLASE = diurna: velo crema claro, cápsula de
             técnica a la izquierda (render.ts paintCapsula, escritura por
             letra en clave cálida→tinta), partenón charcoal + reloj + fecha.
             CIERRE = nocturna: velo charcoal, frase que se enciende
             (paintQuote), partenón blanco + "SESIÓN COMPLETA". Diseños en
             .planning/sketches/002 (cierre D) y 003 (pre-clase D). -->
        <div class="pantalla pantalla--dia" id="pantallaReposo">
          <div class="transFoto" aria-hidden="true"></div>
          <div class="transMarco">
            <div class="transFrase" id="capFrase">
              <div class="capKicker">NOTAS TÉCNICAS</div>
              <div class="capEjercicio" id="capEjercicio"></div>
              <div class="quote" id="capCue"></div>
              <div class="capMusculos" id="capMusculos"></div>
            </div>
            <aside class="transIdentidad">
              <img class="transLogo" :src="tvParthenonCharcoal" alt="El Templo" />
              <div class="relojXl" id="reposoReloj">--:--</div>
              <div class="fechaXl" id="reposoFecha"></div>
            </aside>
          </div>
        </div>
        <div class="pantalla" id="pantallaCierre">
          <div class="transFoto" aria-hidden="true"></div>
          <!-- (Las chispas se retiraron por perf en el TV real, 2026-08-26;
               el glow quedó estático por el mismo motivo.) -->
          <div class="transGlow" aria-hidden="true"></div>
          <div class="transMarco">
            <div class="transFrase">
              <div class="quote" id="cierreQuote"></div>
              <div class="autor" id="cierreAutor"></div>
            </div>
            <aside class="transIdentidad">
              <img class="transLogo" :src="tvParthenonBlanco" alt="El Templo" />
              <div class="cierreTitulo" id="cierreTitulo">SESIÓN COMPLETA</div>
              <div class="relojXl" id="cierreReloj">--:--</div>
              <div class="fechaXl" id="cierreFecha"></div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from 'src/stores/useAuthStore';
import { useMembersApi } from 'src/composables/useMembersApi';
import { useTvApi } from 'src/composables/useTvApi';
import { applyServerNow } from 'src/tv/poll';
import {
  renderState,
  resetRender,
  setCapsulas,
  setQuotes,
  tickClock,
  tickTimer,
} from 'src/tv/render';
import { CAPSULAS } from 'src/tv/capsulas';
import { scaleTv } from 'src/tv/scale';
import { QUOTES } from 'src/utils/pdf/quotes';
import { createLogger } from 'src/utils/logger';
import tvLogo from 'src/assets/tv-logo.png';
import tvBarsOpen from 'src/assets/tv-bars-open.webp';
import tvParthenonBlanco from 'src/assets/tv-parthenon-blanco.png';
import tvParthenonCharcoal from 'src/assets/tv-parthenon-charcoal.png';
import {
  MARBLE_BG_BASE64,
  CINZEL_REGULAR_BASE64,
  CINZEL_BOLD_BASE64,
  NUNITO_SANS_REGULAR_BASE64,
  NUNITO_SANS_BOLD_BASE64,
  GREAT_VIBES_REGULAR_BASE64,
} from 'src/utils/pdf/pdf-assets';
import type { BranchOption } from 'src/types/member';

/* Estado del fondo espejado del cronómetro: `render.ts` pinta las clases
   (`corriendo` / `completo`) sobre #timerPanel y acá se leen con un poll barato
   (una lectura de classList cada 500 ms) — sin tocar el contrato de render.ts.
   calmo = reposo/descanso · activo = timer corriendo · completo = bloque cerrado. */
const bgState = ref<'calmo' | 'activo' | 'completo'>('calmo');
/* La pantalla de transición (reposo/cierre) es un overlay opaco: mientras esté
   visible, el fondo vivo de atrás se pausa (animation-play-state) — la transición
   trae sus propias animaciones y no hay por qué pagar las dos a la vez. */
const fondoTapado = ref(false);
let bgStateTimer: number | undefined;
function leerEstadoTimer(): 'calmo' | 'activo' | 'completo' {
  const el = document.getElementById('timerPanel');
  if (!el) return 'calmo';
  if (el.classList.contains('completo')) return 'completo';
  if (el.classList.contains('corriendo')) return 'activo';
  return 'calmo';
}
function leerOverlayVisible(): boolean {
  const reposo = document.getElementById('pantallaReposo');
  const cierre = document.getElementById('pantallaCierre');
  return (
    (reposo !== null && reposo.classList.contains('visible')) ||
    (cierre !== null && cierre.classList.contains('visible'))
  );
}
onMounted(() => {
  bgStateTimer = window.setInterval(() => {
    bgState.value = leerEstadoTimer();
    fondoTapado.value = leerOverlayVisible();
  }, 500);
});
onUnmounted(() => {
  if (bgStateTimer !== undefined) window.clearInterval(bgStateTimer);
});

const log = createLogger('TvScreenPage');
const route = useRoute();
/* `?sobrio=1`: apaga los efectos de la pantalla de transición (encendido de
   letras, glow, chispas) sin redeploy — válvula de escape si un TV tironea. */
const modoSobrio = computed(() => route.query.sobrio !== undefined);
const authStore = useAuthStore();
const membersApi = useMembersApi();
const tvApi = useTvApi();

/** Clave del TV elegido para esta pantalla — un televisor de pared lo hace una vez. */
const BRANCH_STORAGE_KEY = 'tv.screen.branchId';
/** Mismos tiempos que tenía el kiosco estático: poll de estado y tick de relojes. */
// 750ms: la pantalla se entera del arranque del timer casi al instante (antes 2500
// hacía que un EMOM saltara de 01:00 a ~00:58 al iniciar). Carga trivial: una por sede.
const POLL_MS = 750;
const TICK_MS = 250;
/** Clase que oscurece el `body` real mientras la pantalla está montada (ver estilos). */
const BODY_ACTIVE_CLASS = 'tv-screen-active';

/**
 * Fuentes de la pantalla: las MISMAS del PDF de planis (Cinzel para títulos y citas,
 * NunitoSans para ejercicios), embebidas como `@font-face` desde el base64 de
 * `pdf-assets.ts`. El admin normal usa Roboto (Quasar), así que estas no existen en el CSS
 * global; sin este bloque, `--cinzel`/`--nunito` caían a Georgia/system y se veían distintas
 * a la plani. Se inyectan al montar y se sacan al desmontar (nada de CDN — self-contained).
 */
const FONTS_STYLE_ID = 'tv-screen-fonts';
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
    fontFace('NunitoSans', NUNITO_SANS_BOLD_BASE64, 700) +
    fontFace('GreatVibes', GREAT_VIBES_REGULAR_BASE64, 400);
  document.head.appendChild(style);
}
function removeFonts(): void {
  document.getElementById(FONTS_STYLE_ID)?.remove();
}

// =========================================================================
// Resolución de sede: query ?branchId= → localStorage → selector manual.
// =========================================================================

const branchId = ref<number | null>(null);
const ready = computed(() => branchId.value !== null);

const pickerBranches = ref<BranchOption[]>([]);
const pickerLoading = ref(false);
const pickerError = ref<string | null>(null);
const ownBranchId = computed(() => authStore.user?.branchId ?? null);

function readStoredBranchId(): number | null {
  try {
    const raw = window.localStorage.getItem(BRANCH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    // Un TV con storage deshabilitado o lleno vuelve a mostrar el selector en cada carga.
    return null;
  }
}

function writeStoredBranchId(id: number): void {
  try {
    window.localStorage.setItem(BRANCH_STORAGE_KEY, String(id));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.warn('No se pudo guardar la sede de la pantalla en localStorage', { error: message });
  }
}

function parseQueryBranchId(): number | null {
  const raw = route.query.branchId;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function loadPickerBranches(): Promise<void> {
  pickerLoading.value = true;
  pickerError.value = null;
  try {
    const branches = await membersApi.getBranches();
    // Un televisor cuelga de una pared: las sedes virtuales (online) no aplican.
    // La propia sede del usuario logueado queda primera en la lista (D-11, mismo
    // criterio que TvControlPage.vue).
    pickerBranches.value = branches
      .filter((b) => !b.isVirtual)
      .sort((a, b) => {
        const aOwn = a.id === ownBranchId.value ? 0 : 1;
        const bOwn = b.id === ownBranchId.value ? 0 : 1;
        return aOwn - bOwn;
      });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error cargando sedes para el selector de la pantalla TV', { error: message });
    pickerError.value = 'No se pudieron cargar las sedes.';
  } finally {
    pickerLoading.value = false;
  }
}

function onRetryPicker(): void {
  void loadPickerBranches();
}

function choosePickerBranch(id: number): void {
  writeStoredBranchId(id);
  branchId.value = id;
  void startScreen();
}

async function resolveBranch(): Promise<void> {
  const fromQuery = parseQueryBranchId();
  if (fromQuery !== null) {
    // Persistido también: un refresh sin el query string (el TV no guarda bookmarks
    // con parámetros) tiene que seguir apuntando a la misma sede.
    writeStoredBranchId(fromQuery);
    branchId.value = fromQuery;
    return;
  }
  const stored = readStoredBranchId();
  if (stored !== null) {
    branchId.value = stored;
    return;
  }
  await loadPickerBranches();
}

// =========================================================================
// Ciclo de poll + tick. La PÁGINA es dueña del ciclo de vida (CLAUDE.md): los
// dos intervalos se crean acá y se cortan en onUnmounted, nunca en un composable.
// =========================================================================

let pollId: ReturnType<typeof setInterval> | null = null;
let tickId: ReturnType<typeof setInterval> | null = null;

async function pollOnce(): Promise<void> {
  const id = branchId.value;
  if (id === null) return;
  try {
    const payload = await tvApi.getScreen(id);
    applyServerNow(payload.serverNow);
    renderState(payload);
  } catch (err: unknown) {
    // Mismo criterio que tenía el kiosco estático (T-164-49): un poll fallido NO
    // toca el estado en memoria. El timer sigue local con lo último bueno y la
    // pantalla no se vacía ni parpadea.
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.warn('Poll de la pantalla TV fallido, sigue el último estado conocido', {
      error: message,
      branchId: id,
    });
  }
}

async function startScreen(): Promise<void> {
  // El esqueleto (`v-else` de arriba) recién existe en el DOM después de que Vue
  // reacciona a `ready`: sin este await, `ensureNodes()` (dentro de render.ts)
  // buscaría ids que todavía no se pintaron.
  await nextTick();
  // El render cachea nodos y estado a nivel de modulo (venia del kiosco, que no se
  // desmontaba). Como esta pantalla es una ruta que se monta y desmonta, hay que
  // olvidar ese cache antes del primer render o un segundo montaje pinta en blanco.
  resetRender();
  setQuotes(QUOTES);
  setCapsulas(CAPSULAS);
  scaleTv();
  await pollOnce();
  pollId = setInterval(() => {
    void pollOnce();
  }, POLL_MS);
  tickId = setInterval(() => {
    tickClock();
    tickTimer();
  }, TICK_MS);
}

function onResize(): void {
  scaleTv();
}

// =========================================================================
// Montaje / desmontaje
// =========================================================================

onMounted(async () => {
  installFonts();
  document.body.classList.add(BODY_ACTIVE_CLASS);
  window.addEventListener('resize', onResize);
  await resolveBranch();
  if (branchId.value !== null) {
    await startScreen();
  }
});

onUnmounted(() => {
  if (pollId !== null) {
    clearInterval(pollId);
    pollId = null;
  }
  if (tickId !== null) {
    clearInterval(tickId);
    tickId = null;
  }
  window.removeEventListener('resize', onResize);
  removeFonts();
  document.body.classList.remove(BODY_ACTIVE_CLASS);
  // scaleTv() escribe el tamaño de fuente raíz en <html> (rem no puede anclarse a
  // otro nodo): fuera de esta pantalla ese override no puede quedar pegado en el
  // resto del admin.
  document.documentElement.style.fontSize = '';
  tvApi.cleanup();
});
</script>

<!--
  Sin scope A PROPÓSITO: `render.ts` pinta con `document.createElement` sobre ids
  globales (contrato del kiosco original), y `scoped` de Vue no le llega a nodos
  creados por JS. Cada selector de acá abajo está prefijado con `#tvScreenRoot`
  para que nada se filtre al resto del admin al navegar fuera de /pantalla-tv.
-->
<style>
#tvScreenRoot {
  /* Réplica del lenguaje visual del PDF de planis: mármol crema + tinta oscura
     + oro mate + arena (ver session-pdf-builder.ts). La tinta fue navy #24364a
     hasta 2026-08-25: pasó a Deep Charcoal ($accent del admin) para alinear el
     TV con la paleta cálida sin azul de la app. El nombre de la variable se
     conserva para no reescribir sus ~30 usos. */
  --cream: #f2ebe1;
  --navy: #3d3732;
  --gold: #b08d6e;
  --sand: #dbcab4;
  --muted: #c5b9a8;

  /* Paleta propia de la pantalla de transición (reposo/cierre): charcoal del
     login de la app de socios + bronce/ámbar (sketch 002, variante D). */
  --trans-noche: #1a1714;
  --trans-crema: #f2ede5;
  --trans-bronce: #d4b896;
  --trans-ambar: #d4a843;
  --trans-apagado: #a89a87;
  /* Versión diurna (pre-clase, sketch 003): terracotta de la app + apagado
     más oscuro para leerse sobre el velo crema. */
  --trans-terracotta: #96593a;
  --trans-apagado-dia: #6f6455;
  --cinzel: 'Cinzel', Georgia, serif;
  --nunito: 'NunitoSans', 'Segoe UI', system-ui, sans-serif;
  --firma: 'GreatVibes', 'Segoe Script', cursive;
  --glyph: 'Segoe UI', Arial, 'Noto Sans', sans-serif;

  position: fixed;
  inset: 0;
  z-index: 9999;
  margin: 0;
  background: #17140f;
  overflow: hidden;
  font-family: var(--nunito);
  cursor: none;
}
#tvScreenRoot,
#tvScreenRoot * {
  box-sizing: border-box;
}

/* ── Selector de sede (primera vez en este TV) ─────────────────────────── */
#tvScreenRoot .tvPicker {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4vh 4vw;
  text-align: center;
  color: var(--cream);
}
#tvScreenRoot .tvPicker__logo {
  height: 6rem;
  margin-bottom: 1.5rem;
}
#tvScreenRoot .tvPicker__title {
  font-family: var(--cinzel);
  font-weight: 700;
  letter-spacing: 0.06em;
  font-size: 1.8rem;
  color: var(--cream);
}
#tvScreenRoot .tvPicker__hint {
  margin-top: 0.5rem;
  font-size: 1rem;
  color: var(--gold);
}
#tvScreenRoot .tvPicker__status {
  margin-top: 2rem;
  font-size: 1.1rem;
  color: var(--muted);
}
#tvScreenRoot .tvPicker__status--error {
  color: #ff9b8c;
}
#tvScreenRoot .tvPicker__retry {
  display: block;
  margin: 1rem auto 0;
  padding: 0.5rem 1.5rem;
  font-size: 1rem;
  font-weight: 700;
  color: var(--navy);
  background: var(--gold);
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
}
#tvScreenRoot .tvPicker__list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 2rem;
  width: min(28rem, 80vw);
}
#tvScreenRoot .tvPicker__btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--navy);
  background: var(--cream);
  border: 0.15rem solid var(--gold);
  border-radius: 0.75rem;
  cursor: pointer;
}
#tvScreenRoot .tvPicker__own {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--gold);
  text-transform: uppercase;
}

/* ── Símbolos de nivel ──────────────────────────────────────────────────── */
#tvScreenRoot .glyph {
  font-family: var(--glyph);
  color: var(--navy);
}
/* Porcentaje de esfuerzo dentro del header de columna (lo envuelve render.ts).
   Mismo color que los dígitos del cronómetro (--navy), no un azul inventado. */
#tvScreenRoot .pct {
  color: var(--navy);
}
#tvScreenRoot .glyph.kairos {
  display: inline-block;
  position: relative;
  width: 0.78em;
  height: 0.78em;
  border: 0.09em solid currentColor;
  border-radius: 50%;
  vertical-align: -0.06em;
}
#tvScreenRoot .glyph.kairos::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0.24em;
  height: 0.24em;
  margin-left: -0.12em;
  margin-top: -0.12em;
  border-radius: 50%;
  background: currentColor;
}

/* ── El marco 16:9 ── El tamaño real lo escribe scale.ts (width/height en px +
   el font-size raíz de <html>). El 100% de acá es el estado previo al primer
   scaleTv(). */
#tvScreenRoot .tvWrap {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 0;
  /* Sin padding: achica ~media pulgada el negro alrededor del marco 16:9. El
     letterbox por diferencia de aspecto (pantalla no 16:9) es inevitable sin
     romper la paridad con el PDF, pero el respiro y la sombra sí se bajan. */
  padding: 0;
}
#tvScreenRoot #tv {
  position: relative;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  /* Crema + textura de mármol (misma del PDF de planis, MARBLE_BG_BASE64 inyectado
     como var en el root): mantiene el lenguaje visual del kiosco original. */
  background: var(--cream) var(--marble, none) center / cover no-repeat;
  color: var(--navy);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* Halo más chico: menos negro alrededor del marco (ver .tvWrap). */
  box-shadow: 0 0 16px rgba(0, 0, 0, 0.4);
}

/* ── Barra superior: logo + sede | hora con segundero ── */
#tvScreenRoot .topbar {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0.55rem 2rem 0.25rem;
}
#tvScreenRoot .topbar .marca {
  display: flex;
  align-items: center;
  min-width: 0;
  justify-self: start;
}
#tvScreenRoot .topbar .marca img {
  height: 5.6rem;
  display: block;
  margin-right: 1.2rem;
}
/* Fecha en DOS líneas ("JUEVES 13" / "AGOSTO 2026"), ocupando el alto del logo. */
#tvScreenRoot .topbar .fecha {
  display: flex;
  flex-direction: column;
  justify-content: center;
  font-weight: 700;
  letter-spacing: 0.1em;
  font-size: 1.5rem;
  line-height: 1.3;
  color: var(--navy);
}
#tvScreenRoot .topbar .bloqueNum {
  justify-self: center;
}
#tvScreenRoot .topbar .reloj {
  justify-self: end;
  font-family: var(--cinzel);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-size: 2.8rem;
  line-height: 1;
  color: var(--navy);
  white-space: nowrap;
}
#tvScreenRoot .topbar .reloj .seg {
  color: var(--gold);
}
/* ── Cabecera: info del bloque (izquierda, alineada a la izquierda) + cronómetro
   (derecha). El cronómetro salió de la zona de ejercicios para darle todo el ancho
   a la lista. ── */
/* 3 zonas: nombre (izq, 1fr) · cronómetro (centro, auto) · formato (der, 1fr),
   centrados verticalmente con el timer. Nombre y formato mismo tamaño/fuente,
   cada uno pegado a su borde (simétricos) y con ellipsis si no entran. */
#tvScreenRoot .cabecera {
  flex: 0 0 auto;
  display: grid;
  /* Centro de ancho FIJO (no auto): así el cronómetro —cuyos dígitos cambian de
     ancho al arrancar— no mueve las zonas laterales y el formato no re-wrapea. */
  grid-template-columns: 1fr 28rem 1fr;
  align-items: center;
  gap: 1.5rem;
  padding: 0.3rem 2rem 0.7rem;
}
#tvScreenRoot .cabecera .cabTitulo,
#tvScreenRoot .cabecera .cabFormato {
  margin: 0;
  min-width: 0;
  /* Sin nowrap ni ellipsis: si el texto no entra, salta a la línea siguiente por
     palabras — nunca corta una palabra al medio (overflow-wrap/word-break normal). */
  white-space: normal;
  overflow-wrap: normal;
  word-break: normal;
  font-family: var(--cinzel);
  font-weight: 700;
  letter-spacing: 0.09em;
  font-size: 3.6rem;
  line-height: 1.1;
}
/* Nombre del bloque: pegado a la izquierda, color de los headers de NIVEL. */
#tvScreenRoot .cabecera .cabTitulo {
  text-align: left;
  color: var(--gold);
}
/* Formato (ej. "AMRAP 10'"): pegado a la derecha, navy. */
#tvScreenRoot .cabecera .cabFormato {
  text-align: right;
  color: var(--navy);
}
/* Movilidad: fila al pie de la pantalla (debajo de las columnas), texto centrado
   en itálica y en el navy de los ejercicios. Se oculta sola si viene vacía. */
#tvScreenRoot .movBar {
  flex: 0 0 auto;
  text-align: center;
  font-style: italic;
  font-weight: 700;
  letter-spacing: 0.06em;
  font-size: 2rem;
  color: var(--navy);
  /* Banda sand como los ejercicios; menos aire arriba (era el hueco del medio). */
  margin: 0.15rem 2rem 0.7rem;
  padding: 0.3rem 1rem;
  border-radius: 0.6rem;
  background: rgba(219, 202, 180, 0.35);
}
#tvScreenRoot .movBar:empty {
  display: none;
}
/* La etiqueta "MOVILIDAD" en oro (como el header de NIVEL); el resto queda navy. */
#tvScreenRoot .movBar .movLabel {
  color: var(--gold);
}
/* BLOQUE n/M vive en la topbar (a la izquierda del reloj); selectores sin
   `.cabInfo` para que funcionen ahí. */
#tvScreenRoot .bloqueNum {
  display: inline-flex;
  /* Puntitos DEBAJO del texto "BLOQUE n / M", no a su derecha. */
  flex-direction: column;
  align-items: center;
  font-weight: 700;
  letter-spacing: 0.2em;
  font-size: 1.3rem;
  color: var(--navy);
}
#tvScreenRoot .bloqueNum .dots {
  display: inline-flex;
  margin-left: 0;
  margin-top: 0.35rem;
}
#tvScreenRoot .bloqueNum .dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background: var(--muted);
  opacity: 0.5;
  margin-right: 0.5rem;
}
#tvScreenRoot .bloqueNum .dot:last-child {
  margin-right: 0;
}
#tvScreenRoot .bloqueNum .dot.activo {
  background: var(--gold);
  opacity: 1;
}
#tvScreenRoot .bloqueNum .dot.hecho {
  background: var(--navy);
  opacity: 0.55;
}

/* ── Zona principal: hasta DOS columnas de nivel lado a lado, 50/50 (rediseño
   fase 164 — el control elige el nivel por PARES). `render.ts` `paintList`
   crea 1, 2 o 4 `.lista-col` acá adentro por cada poll (`data-cols` marca la
   cantidad); con 1-2 columnas (bloque shared, un solo nivel del par presente
   hoy, o técnica/combos) el layout es la fila flex de siempre. ── */
#tvScreenRoot .stage {
  flex: 1 1 auto;
  display: flex;
  gap: 1.3rem;
  padding: 0.6rem 2rem 1.4rem;
  min-height: 0;
}
/* Deuteros regular 2×2 (fase 178): 4 columnas (I+II × par de niveles) en
   grilla, dos filas iguales, en vez de una fila de 4 apretadas. */
#tvScreenRoot .stage[data-cols='4'] {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  /* Dos filas que reparten TODO el alto del stage (sin hueco al final del main);
     el aire dentro de cada celda se reparte entre los ejercicios (ver `.caja`),
     no se acumula al pie. */
  grid-auto-rows: 1fr;
  gap: 0.5rem 1.3rem;
  padding: 0.3rem 1.6rem 0.5rem;
}
#tvScreenRoot .col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
#tvScreenRoot .lista-col {
  flex: 1 1 0;
}
/* Header de la columna: NIVEL a la izquierda, RUTA empujada al final de la row
   (sin el separador "|"). render.ts parte el string en `.cabCol__nivel` +
   `.cabCol__ruta`; si no hay separador, el texto entra directo (queda a la izq). */
#tvScreenRoot .cabCol {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  font-size: 2.1rem;
  color: var(--gold);
  /* Aire arriba: separa el "NIVEL · RUTA" de la cabecera (título + cronómetro +
     formato) que va encima. */
  padding: 1.9rem 0.3rem 0.5rem;
}
#tvScreenRoot .cabCol__nivel {
  white-space: nowrap;
}
/* 2×2 de deuteros (fase 178): 4 headers en vez de 1-2 — bajar tipografía y
   aire para que las cuatro cabeceras entren legibles sin cortarse. */
#tvScreenRoot .stage[data-cols='4'] .cabCol {
  font-size: 1.5rem;
  padding: 1rem 0.3rem 0.4rem;
}
#tvScreenRoot .cabCol__ruta {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Separador entre el header NIVEL·RUTA y la lista: la columna tumbada en el
   color de marca (columnas templo 2). Tres piezas flex (render.ts): los capiteles
   guardan su proporción en los extremos y el fuste ocupa SOLO el medio, así las
   líneas del centro no atraviesan los capiteles. Reemplaza la barra dorada y el
   recuadro como divisor. */
#tvScreenRoot .columnaDorica {
  flex: 0 0 auto;
  position: relative;
  height: 1.3rem;
  margin: 0.2rem 0.3rem 0.7rem;
}
/* Las piezas van en un wrapper ESTÁTICO propio y el glow (filter) vive acá, NO
   en .columnaDorica: la banda de brillo animada tiene que quedar FUERA del
   subtree filtrado. Con el filter en el padre, los 3 drop-shadow se
   recalculaban en cada frame del barrido (el resultado de un filtro no se
   cachea si algo adentro cambia) y en el browser del TV eso arrastraba la
   animación. Así las piezas no cambian nunca y el filtro se pinta una vez. */
#tvScreenRoot .columnaDorica__piezas {
  display: flex;
  align-items: stretch;
  height: 100%;
  /* Contorno oro claro (ceñido) + halo suave, y una profundidad navy sutil para
     no oscurecer. Mismo lenguaje que el título tallado del bloque. */
  filter: drop-shadow(0 0.03em 0.05em rgba(20, 32, 46, 0.2))
    drop-shadow(0 0 0.09em rgba(255, 238, 196, 0.95))
    drop-shadow(0 0 0.3em rgba(232, 205, 150, 0.5));
}
#tvScreenRoot .columnaDorica__cap,
#tvScreenRoot .columnaDorica__fuste {
  height: 100%;
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%;
}
/* Capiteles con proporción fija (sin brillo). */
#tvScreenRoot .columnaDorica__cap {
  flex: 0 0 auto;
}
#tvScreenRoot .columnaDorica__cap--izq {
  aspect-ratio: 43 / 69;
  background-image: url('/tv-col-cap-izq.png');
}
#tvScreenRoot .columnaDorica__cap--der {
  aspect-ratio: 45 / 69;
  background-image: url('/tv-col-cap-der.png');
}
/* Fuste: llena el medio; la banda de luz barre por encima (__brillo). */
#tvScreenRoot .columnaDorica__fuste {
  flex: 1 1 auto;
  background-image: url('/tv-col-fuste.png');
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%;
}
/* Banda de brillo: overlay HERMANO de las piezas (fuera del filter, ver
   __piezas), recortado al box de la columna; la franja de luz cruza con
   `transform` (compositado por GPU, SIN repaint por frame) para que sea fluida
   en el TV de la sucursal. El enfoque anterior (background-position + blend +
   mask animados) repintaba cada frame y se arrastraba en el hardware del
   televisor. Ahora la banda cruza la columna completa, capiteles incluidos. */
#tvScreenRoot .columnaDorica__brillo {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
#tvScreenRoot .columnaDorica__brillo::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  /* Ancho = el de la barra; la banda de luz (5rem fijos) va centrada en el
     gradiente y el recorrido es relativo a la barra (translateX -100%→100%), así
     el timing es proporcional a cada barra y dos barras pueden barrer consecutivas. */
  width: 100%;
  background: linear-gradient(
    105deg,
    transparent calc(50% - 2.5rem),
    rgba(255, 248, 232, 0.8) 50%,
    transparent calc(50% + 2.5rem)
  );
  transform: translateX(-100%);
  animation: columnaBrillo 12s linear infinite;
  will-change: transform;
}
/* Con dos columnas lado a lado, la 2da barre desfasada medio ciclo (-5s de 10s)
   para que las barras no brillen al mismo tiempo. */
#tvScreenRoot .lista-col:nth-child(2n) .columnaDorica__brillo::after {
  /* Arranca cuando la 1ra barra termina de cruzar (25% de 12s = 3s): consecutivas. */
  animation-delay: 3s;
}
/* En el 2×2 hay cuatro dóricas: con la regla `2n` de arriba brillarían de a dos
   (1+3 y 2+4). Escalono los delays 0/3/6/9 s (cada barrido cruza en 3 s) para que
   barran DE A UNA, secuenciales, en todo el ciclo de 12 s. */
#tvScreenRoot .stage[data-cols='4'] .lista-col:nth-child(1) .columnaDorica__fuste::after {
  animation-delay: 0s;
}
#tvScreenRoot .stage[data-cols='4'] .lista-col:nth-child(2) .columnaDorica__fuste::after {
  animation-delay: 3s;
}
#tvScreenRoot .stage[data-cols='4'] .lista-col:nth-child(3) .columnaDorica__fuste::after {
  animation-delay: 6s;
}
#tvScreenRoot .stage[data-cols='4'] .lista-col:nth-child(4) .columnaDorica__fuste::after {
  animation-delay: 9s;
}
/* Barrido del brillo: solo la banda de luz (1ra capa) se desplaza; la imagen
   (2da capa) queda fija en center. */
/* La banda cruza rápido en el primer tramo del ciclo y luego queda fuera (a la
   derecha) el resto = cooldown. Con dos barras, la 2da arranca justo cuando la
   1ra sale (animation-delay), y se ven consecutivas. */
@keyframes columnaBrillo {
  0% {
    transform: translateX(-100%);
  }
  25% {
    transform: translateX(100%);
  }
  100% {
    transform: translateX(100%);
  }
}
/* Lista SIN recuadro: respira y usa el espacio; el divisor es la columna dórica. */
#tvScreenRoot .caja {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Lista de ejercicios: cada item apila DOS filas (como la app,
   `CompactExerciseList.vue`) — nombre arriba, badge de contracción + dosis
   abajo — en vez de una sola línea nombre/rx a los extremos. */
#tvScreenRoot .lista-col .caja {
  display: flex;
  flex-direction: column;
  /* Los ítems se reparten en TODA la altura de la caja (el aire crece solo
     cuando hay pocos ejercicios); row-gap garantiza separación visible entre
     los fondos sand aun con listas largas. */
  justify-content: space-evenly;
  row-gap: 0.6rem;
  /* Sin recuadro: menos padding lateral para que cada ejercicio se estire hacia
     los costados y aproveche el ancho que antes comía el borde de la caja. */
  padding: 1rem 0.3rem;
}
#tvScreenRoot .lista-col .item {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  /* Margin (no padding): la banda sand hugea el contenido y el chip de repes llega
     al borde para fundirse; el aire entre ejercicios lo da el margin externo.
     Menos margin lateral = ejercicios más anchos. `padding-left` para que el badge
     de contracción no quede pegado al borde izquierdo de la banda sand. */
  margin: 0.3rem 0.2rem;
  padding-left: 0.8rem;
  border-radius: 0.6rem;
  /* Todos los ejercicios con la banda sand translúcida (no alternados). */
  background: rgba(219, 202, 180, 0.35);
}
/* Marcador ◂ del ejercicio de la ronda actual: inmediatamente a la derecha del
   NOMBRE (inline en `.ej-nombre`, no al final de la fila), en oro y grande,
   apuntando a la izquierda. Solo existe sobre la fila `actual` → no reserva
   espacio en las demás. line-height 0 para no agrandar el alto de la fila. */
#tvScreenRoot .lista-col .item.actual .ej-nombre::after {
  content: '\25C2';
  color: var(--gold);
  font-weight: 700;
  font-size: 4.8rem;
  line-height: 0;
  vertical-align: middle;
  /* Separación del nombre: 0.9rem (en el TV el glyph queda pegado con 0.5). */
  margin-left: 0.9rem;
}
#tvScreenRoot .lista-col .item .ej-nombre {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 700;
  color: var(--navy);
  font-size: 2.35rem;
  line-height: 1.25;
}
/* Badge de contracción: TRES colores distintos (a diferencia de la app, que
   comparte color entre CON/ISO) para que se distingan de un vistazo desde
   lejos. Tokens del marco #tvScreenRoot. */
#tvScreenRoot .lista-col .item .badge {
  font-weight: 700;
  font-size: 1.6rem;
  letter-spacing: 0;
  text-transform: uppercase;
  /* Texto casi pegado al borde vertical: padding mínimo. Ancho fijo (min-width)
     con texto centrado para que CON/EXC/ISO ocupen lo mismo y los nombres de los
     ejercicios arranquen todos en la misma x. */
  padding: 0.02em 0.18em;
  min-width: 4rem;
  box-sizing: border-box;
  text-align: center;
  border-radius: 0.3rem;
  line-height: 1.02;
  white-space: nowrap;
}
#tvScreenRoot .lista-col .item .badge--con {
  background: var(--navy);
  color: var(--cream);
}
#tvScreenRoot .lista-col .item .badge--exc {
  background: var(--gold);
  color: var(--cream);
}
#tvScreenRoot .lista-col .item .badge--iso {
  background: var(--sand);
  color: var(--navy);
}
/* Repes como CHIP: placa navy + número en ivory cálido. Contra el fondo oscuro el
   dato salta. El lado IZQUIERDO de la placa se funde con la banda sand del ítem
   (arranca transparente → navy sólido a la derecha), como si el número emergiera
   de la piedra. Padding izq extra para que los dígitos caigan sobre navy sólido. */
#tvScreenRoot .lista-col .item .dosis {
  flex: 0 0 auto;
  /* Si el nombre salta de línea el ítem crece: la placa se estira a toda su altura
     (align-self) y el número queda centrado dentro (flex), en vez de una placa
     corta centrada con huecos arriba y abajo. */
  align-self: stretch;
  display: flex;
  align-items: center;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 2.4rem;
  /* Ivory cálido: brillo alto pero dentro de la familia crema/sand/gold (no el
     peach #ffe5cd, que se iba de paleta). */
  color: #f7e6cd;
  white-space: nowrap;
  padding: 0.08em 0.6em 0.08em 2em;
  border-radius: 0rem 0.5rem 0.5rem 0rem;
  background: linear-gradient(
    to right,
    #2e2a2600,
    #2e2a260f 6%,
    #2e2a2638 17%,
    #2e2a268c 35%,
    #46403ad1 47%,
    #3d3732
  );
  /* Sin la sombra oscura heredada: sobre placa oscura no aporta y ensucia el número. */
  text-shadow: none;
}
/* El número 15% más grande SIN agrandar la placa: el transform es visual (no
   reflowea), así que el chip conserva su tamaño y el dígito sobresale un poco. */
#tvScreenRoot .lista-col .item .dosis .dosis-num {
  display: inline-block;
  transform: scale(1.15);
}
#tvScreenRoot .lista-col .caja.compacta .item .ej-nombre {
  font-size: 1.85rem;
  line-height: 1.2;
}

/* 2×2 de deuteros (fase 178): 4 listas en vez de 1-2, cada una con la mitad
   del ancho y aprox. la mitad del alto (2 filas) — la tipografía baja en
   bloque para que las cuatro entren legibles sin desbordar la grilla. */
#tvScreenRoot .stage[data-cols='4'] .lista-col .item {
  margin: 0.1rem 0.15rem;
  /* Como en las otras pantallas: aire del badge al borde de la banda + gap
     badge↔nombre, para que las filas se vean homogéneas. */
  padding-left: 0.8rem;
  gap: 0.8rem;
  /* No comprimir: así la medición de auto-fit (scrollHeight vs alto de la caja)
     refleja el alto real del contenido. */
  flex-shrink: 0;
}
#tvScreenRoot .stage[data-cols='4'] .lista-col .item.actual .ej-nombre::after {
  font-size: 3rem;
  margin-left: 0.6rem;
}
#tvScreenRoot .stage[data-cols='4'] .lista-col .item .ej-nombre {
  /* Tamaño común a TODAS las listas del 2×2: lo fija render.ts (auto-fit) al
     mayor valor que hace entrar hasta el nombre más largo, sin recortar. */
  font-size: var(--ej-fs, 2.6rem);
  line-height: 1.08;
}
/* La lista llena el alto de su celda y REPARTE los ejercicios (space-evenly)
   en vez de apilarlos arriba con hueco abajo: así el aire queda entre los
   ejercicios y las listas ocupan toda la celda. */
#tvScreenRoot .stage[data-cols='4'] .lista-col .caja {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  /* Los ejercicios reparten toda la altura de la celda (llena). El auto-fit
     (render.ts) mide el alto REAL sumando los ítems —independiente de esta
     distribución— así que space-between ya no distorsiona la medición. */
  justify-content: space-between;
}
#tvScreenRoot .stage[data-cols='4'] .lista-col .caja.compacta .item .ej-nombre {
  font-size: 1.2rem;
  line-height: 1.1;
}
#tvScreenRoot .stage[data-cols='4'] .lista-col .item .badge {
  /* Misma proporción que el badge base (min-width/font ≈ 2.5) para que las tres
     siglas ocupen EXACTAMENTE lo mismo y los nombres arranquen alineados —
     igual que en las otras pantallas. Ancho generoso: ninguna sigla lo excede. */
  font-size: 1.25rem;
  min-width: 3.1rem;
}
#tvScreenRoot .stage[data-cols='4'] .lista-col .item .dosis {
  font-size: 2.1rem;
  padding: 0.08em 0.45em 0.08em 1.3em;
}
/* El número de repes se descentraba: `inline-block` + `scale` amplifica el
   hueco de baseline del inline-block. Como bloque con line-height 1 queda
   centrado por el flex de la placa. */
#tvScreenRoot .stage[data-cols='4'] .lista-col .item .dosis .dosis-num {
  display: block;
  line-height: 1;
}

/* ── 2×2 de deuteros (rediseño): cabecera compacta y PARTIDA por deutero
   (DEUTEROS I izq / DEUTEROS II der), para que las celdas ganen alto y entren
   los 3 ejercicios. El marcador `data-cols` viaja también al root (render.ts)
   porque la cabecera —título · cronómetro · formato— vive fuera de `.stage`. ── */
#tvScreenRoot[data-cols='4'] .cabecera {
  grid-template-columns: 1fr 15rem 1fr;
  gap: 1rem;
  padding: 0.1rem 2rem 0.3rem;
}
/* Cada lado: etiqueta del deutero (grande, oro) arriba y el formato del bloque
   (chico, navy) debajo. Izquierda pegada a la izq, derecha pegada a la der. */
#tvScreenRoot .cabecera .cabTitulo.cabDeu,
#tvScreenRoot .cabecera .cabFormato.cabDeu {
  display: flex;
  flex-direction: column;
  line-height: 1.05;
}
#tvScreenRoot .cabecera .cabFormato.cabDeu {
  align-items: flex-end;
}
#tvScreenRoot .cabecera .cabDeu .cabDeuLabel {
  font-size: 2.3rem;
  color: var(--gold);
  /* Mismo tallado dorado que `.cabTitulo` para AMBOS deuteros: sin esto el II
     (que vive en `.cabFormato`) heredaba el contorno navy y se veía distinto. */
  text-shadow:
    0.018em 0 0.01em rgba(226, 190, 120, 0.58),
    -0.018em 0 0.01em rgba(226, 190, 120, 0.58),
    0 0.018em 0.01em rgba(226, 190, 120, 0.58),
    0 -0.018em 0.01em rgba(226, 190, 120, 0.58),
    0 0 0.5em rgba(232, 205, 150, 0.35),
    0 0.07em 0.18em rgba(20, 32, 46, 0.4);
}
#tvScreenRoot .cabecera .cabDeu .cabDeuFormato {
  font-size: 2.1rem;
  font-weight: 700;
  color: var(--navy);
  /* Contorno navy explícito: del lado de DEUTEROS I el formato heredaba el
     tallado dorado de `.cabTitulo` — se lo forzamos navy en ambos lados. */
  text-shadow:
    0.014em 0 0.01em rgba(20, 32, 46, 0.4),
    -0.014em 0 0.01em rgba(20, 32, 46, 0.4),
    0 0.014em 0.01em rgba(20, 32, 46, 0.4),
    0 -0.014em 0.01em rgba(20, 32, 46, 0.4),
    0 0.07em 0.18em rgba(20, 32, 46, 0.42);
}
/* Cronómetro y su barra, más chicos en el 2×2 (dan aire a las listas). */
#tvScreenRoot[data-cols='4'] .cronometro {
  padding: 0.15rem 0.5rem;
}
#tvScreenRoot[data-cols='4'] .cronometro .digitos {
  font-size: 7rem;
}
/* El clon del envión (arranque del timer) está fijo en 10rem: en el 2×2 lo
   igualamos al número (7rem) para que el efecto no quede sobredimensionado. El
   resto del envión usa `em`, así que escala solo. */
#tvScreenRoot[data-cols='4'] .cronometro .digitos-ghost {
  font-size: 7rem;
}
/* En el 2×2 se saca la columna/barra de debajo del cronómetro: ese alto se lo
   queda el número, que va algo más grande. */
#tvScreenRoot[data-cols='4'] .cronometro .barra {
  display: none;
}
/* Dóricas separadoras más finas: con 4 celdas, la columna tumbada baja de
   tamaño para no comerse el alto de las listas. */
#tvScreenRoot .stage[data-cols='4'] .columnaDorica {
  height: 0.8rem;
  margin: 0.1rem 0.3rem 0.35rem;
}
/* Pie del 2×2: dos movilidades (una por deutero), alineadas izq/der con las
   columnas. Cada una en su banda sand; la de arriba (`.movBar`) aporta la
   itálica y el navy. */
#tvScreenRoot .movBar.movBar--deuteros {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.3rem;
  background: transparent;
  padding: 0;
  margin: 0.1rem 1.6rem 0.45rem;
}
#tvScreenRoot .movBar--deuteros .movBarCol {
  font-size: 1.55rem;
  /* Padding vertical apretado para agrandar el texto sin robar alto al stage. */
  padding: 0.15rem 0.8rem;
  border-radius: 0.5rem;
  background: rgba(219, 202, 180, 0.35);
}
#tvScreenRoot .movBar--deuteros .movBarCol:empty {
  visibility: hidden;
}

/* ── Cronómetro: al centro de la cabecera, sin recuadro. Sin etiqueta de fase: el estado
   se lee por la OPACIDAD de los dígitos (apagados → plenos al arrancar) y el fondo de
   .completo. Compacto para darle aire al título/formato/movilidad. ── */
#tvScreenRoot .cronometro {
  justify-self: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.6rem 1rem;
  /* Sin recuadro: el estado se lee por la opacidad de los dígitos y el fondo de .completo. */
  transition: background-color 0.3s;
}
/* Al terminar el bloque, dígitos a opacidad plena (sin recuadro). */
#tvScreenRoot .cronometro.completo .digitos {
  opacity: 1;
}
#tvScreenRoot .cronometro .digitos {
  font-family: var(--cinzel);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-size: 10rem;
  line-height: 1;
  color: var(--navy);
  /* Apagados mientras no corre; al arrancar pasan a opacidad plena. Esa transición ES
     el aviso de "ya arrancó" para que el profe lo cante e indique. */
  opacity: 0.5;
  transition: opacity 0.25s ease-in;
}
#tvScreenRoot .cronometro.corriendo .digitos {
  opacity: 1;
}
/* Descanso: dígitos un poco más apagados que el trabajo — segundo canal visual
   (además del beep de cambio de fase) para distinguir trabajo de descanso. */
#tvScreenRoot .cronometro.corriendo.descanso .digitos {
  opacity: 0.72;
}
/* Últimos segundos de la fase (clase la pone render.ts: trabajo ≤5", descanso
   ≤3"): dígitos en ORO titilante. En descanso conserva la opacidad más baja. */
#tvScreenRoot .cronometro.corriendo.porterminar .digitos {
  color: var(--gold);
  animation: titilarOro 0.5s steps(1, end) infinite;
}
#tvScreenRoot .cronometro.corriendo.descanso.porterminar .digitos {
  animation-name: titilarOroDescanso;
}
@keyframes titilarOro {
  0%,
  50% {
    opacity: 1;
  }
  50.01%,
  100% {
    opacity: 0.35;
  }
}
@keyframes titilarOroDescanso {
  0%,
  50% {
    opacity: 0.72;
  }
  50.01%,
  100% {
    opacity: 0.2;
  }
}
/* ARRANQUE: al dar INICIAR, una COPIA del número hace el envión — oro, pequeña
   vibración y fade-up hasta desaparecer — mientras el número REAL queda fijo en
   su lugar contando. El clon es `.digitos-ghost`, superpuesto por `.digitosWrap`;
   render.ts le pone el texto en el arranque y `.arranque` (~0.85 s) dispara la
   animación. Sin fill-mode: al terminar, el clon queda invisible (opacity 0). */
#tvScreenRoot .cronometro .digitosWrap {
  position: relative;
}
#tvScreenRoot .cronometro .digitos-ghost {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  text-align: center;
  pointer-events: none;
  opacity: 0;
  font-family: var(--cinzel);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-size: 10rem;
  line-height: 1;
  color: var(--gold);
}
#tvScreenRoot .cronometro.arranque .digitos-ghost {
  animation: arranqueEnvion 0.8s ease-out;
}
/* Sin vibración: el clon hace directamente el fade-up (sube y se desvanece)
   desde el arranque, en el momento en que antes ocurría la vibración. */
@keyframes arranqueEnvion {
  0% {
    opacity: 1;
    transform: translate(0, 0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(0, -0.4em) scale(1.05);
  }
}
/* Cartel de fase (VAMOS! / DESCANSO): destella GRANDE y centrado sobre TODO el
   marco al empezar cada tramo de trabajo o descanso, sólo en bloques con las dos
   fases (tabata / HIIT / intervalos con descanso). Letras enormes con relleno
   (oro en trabajo, tinta en descanso) y CONTORNO claro dorado. render.ts le pone
   el texto y dispara la animación reiniciando la clase `.mostrar`. Overlay sobre
   las columnas (z-index 1, debajo de las pantallas de transición). Una sola
   animación por cambio de fase (~cada 20-40 s), opacity + scale (compositor),
   sin fill-mode: al terminar vuelve a opacity 0 y deja ver la clase. */
#tvScreenRoot .faseLabel {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  text-align: center;
  white-space: nowrap;
  opacity: 0;
  font-family: var(--cinzel);
  font-weight: 700;
  letter-spacing: 0.03em;
  /* VAMOS! (base): un poco más grande que DESCANSO. "VAMOS!" (6) entra de sobra;
     "DESCANSO" (8) baja a 15rem abajo para no pasarse del marco de 100rem. */
  font-size: 17rem;
  line-height: 1;
  /* Colores intercambiados con DESCANSO: VAMOS va en la tinta oscura, sin contorno. */
  color: var(--navy);
  text-shadow: none;
}
/* Descanso: toma el look que tenía VAMOS — relleno oro con glow cálido, sin contorno. */
#tvScreenRoot .faseLabel.descanso {
  font-size: 15rem;
  color: var(--gold);
  text-shadow: 0 0 0.18em rgba(255, 238, 196, 0.55);
}
#tvScreenRoot .faseLabel.mostrar {
  animation: flashFase 2.4s ease-out;
}
/* Nube detrás del texto: despega el cartel de las columnas del fondo SIN
   blur — es un gradiente radial que muere en transparente, así no tiene
   borde posible. Se rasteriza una vez y solo anima opacity (compositor);
   fuera del destello queda en opacity 0 y el compositor lo saltea. */
#tvScreenRoot .faseLabel.mostrar::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 110rem;
  height: 40rem;
  background: radial-gradient(
    ellipse closest-side,
    rgba(242, 235, 225, 0.72) 0%,
    rgba(242, 235, 225, 0.55) 38%,
    rgba(242, 235, 225, 0.25) 62%,
    rgba(242, 235, 225, 0) 82%
  );
  opacity: 0;
  animation: flashFasePildora 2.4s ease-out;
  z-index: -1;
}
@keyframes flashFasePildora {
  0% {
    opacity: 0;
  }
  14%,
  70% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@keyframes flashFase {
  0% {
    opacity: 0;
    transform: scale(0.84);
  }
  14% {
    opacity: 1;
    transform: scale(1);
  }
  70% {
    opacity: 1;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1.07);
  }
}
/* Sin movimiento (reduced-motion o ?sobrio=1): el cartel sigue apareciendo —es
   info para el profe, no adorno— pero sólo con opacity, sin escala. */
@media (prefers-reduced-motion: reduce) {
  #tvScreenRoot .faseLabel.mostrar {
    animation-name: flashFaseSobrio;
  }
}
#tvScreenRoot.tv-sobrio .faseLabel.mostrar {
  animation-name: flashFaseSobrio;
}
#tvScreenRoot.tv-sobrio .faseLabel.mostrar::before {
  display: none;
}
@keyframes flashFaseSobrio {
  0%,
  100% {
    opacity: 0;
  }
  16%,
  70% {
    opacity: 1;
  }
}
#tvScreenRoot .cronometro .barra {
  /* Ancho FIJO (no 84% del cronómetro): en EMOM los dígitos pasan de ":60" a ":9"
     y achicaban el ancho auto del cronómetro, haciendo latir la barra cada segundo.
     Fijo la barra la vuelve estable y, al ser el hijo más ancho en esos casos,
     estabiliza también la caja (los dígitos quedan centrados sin saltar).
     Ahora hospeda la columna: track tenue + fill opaco recortado por el progreso. */
  position: relative;
  width: 24rem;
  height: 1.3rem;
  overflow: hidden;
  margin-top: 0.55rem;
  /* Profundidad + glow dorado, igual que el separador de columna — pero con
     box-shadow y NO con filter: drop-shadow. El width del fill (#progreso)
     cambia en cada tick del timer y un filter acá obligaba a recalcular los 3
     drop-shadow por frame durante toda la clase. El box-shadow es del
     border-box (rectangular, no sigue las estrías), se pinta una vez y a
     tamaño TV la diferencia no se distingue. */
  box-shadow:
    0 0.03em 0.05em rgba(20, 32, 46, 0.2),
    0 0 0.09em rgba(255, 238, 196, 0.95),
    0 0 0.3em rgba(232, 205, 150, 0.5);
}
/* Cada capa es una columna completa de ancho FIJO (24rem): así el fill recorta
   sin comprimir la columna. Reusa las piezas .columnaDorica__cap/__fuste. */
#tvScreenRoot .cronometro .barraCol {
  display: flex;
  align-items: stretch;
  width: 24rem;
  height: 100%;
}
#tvScreenRoot .cronometro .barraCol--track {
  opacity: 0.28; /* columna tenue: el tiempo ya consumido */
}
#tvScreenRoot .cronometro .barraCol__fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  overflow: hidden; /* recorta la columna opaca al ancho del progreso */
  display: block;
  transition: width 0.2s linear;
}
/* La barra del cronómetro no lleva el barrido de brillo (el vaciado ya es su
   movimiento): su markup no incluye .columnaDorica__brillo, no hay nada que
   ocultar. */
@media (prefers-reduced-motion: reduce) {
  #tvScreenRoot .lista-col .item {
    transition: none;
  }
  /* Sin envión ni titileo: el oro de los últimos segundos queda fijo. */
  #tvScreenRoot .cronometro.arranque .digitos-ghost,
  #tvScreenRoot .cronometro.corriendo.porterminar .digitos {
    animation: none;
  }
}

/* ── Pantalla de transición (reposo / cierre): overlay oscuro del marco 16:9.
   Un solo diseño para las dos (sketch 002, variante D): foto de templo con velo
   charcoal, frase Cinzel a la izquierda cuyas letras "se encienden" (paintQuote
   arma spans `.palabra`, un nodo por palabra), identidad a la derecha (partenón blanco,
   reloj, fecha; el cierre suma "SESIÓN COMPLETA").

   Presupuesto de perf (incidente del barrido dórico, f655466c): el encendido
   anima text-shadow SOLO ~2 s una vez por minuto, con UNA sombra por letra y
   blur acotado; el glow respira solo con opacity (nada de scale animado, era
   el patrón del fondoDeriva); las chispas son 3 puntos de transform/opacity.
   Sin blend modes, sin filter animado. `?sobrio=1` apaga todo el movimiento. ── */
#tvScreenRoot .pantalla {
  display: none;
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background: var(--trans-noche);
  color: var(--trans-crema);
  overflow: hidden;
}
#tvScreenRoot .pantalla.visible {
  display: block;
  animation: transEntra 0.6s ease;
}
/* Fade de salida (render.ts setVisible): la pantalla sigue en el layout
   mientras su opacity baja, y recién después se oculta — toda transición
   entre pantallas queda fundida, nunca de golpe. */
#tvScreenRoot .pantalla.visible.saliendo {
  animation: none;
  opacity: 0;
  transition: opacity 0.5s ease;
}
/* Congelar TODO el movimiento interno de la pantalla que se va: durante el
   crossfade solo paga el fade del contenedor (UAT TV 2026-08-26). */
#tvScreenRoot .pantalla.saliendo .palabra,
#tvScreenRoot .pantalla.saliendo .quote,
#tvScreenRoot .pantalla.saliendo .autor,
#tvScreenRoot .pantalla.saliendo .cierreTitulo,
#tvScreenRoot .pantalla.saliendo .capMusculos,
#tvScreenRoot .pantalla.saliendo .capChip {
  animation: none !important;
  transition: none !important;
}
@keyframes transEntra {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

/* Foto + velo en un solo background (se pinta una vez): más oscuro detrás del
   texto (izquierda), abierto sobre el relieve (derecha). */
#tvScreenRoot .transFoto {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background:
    linear-gradient(
      100deg,
      rgba(20, 18, 16, 0.87) 0%,
      rgba(20, 18, 16, 0.78) 42%,
      rgba(26, 23, 20, 0.55) 68%,
      rgba(33, 30, 27, 0.4) 100%
    ),
    var(--trans-foto, none) center / cover no-repeat;
}

/* Glow ámbar ESTÁTICO (UAT TV 2026-08-26): el respirado era una animación
   infinita sobre 3/4 de pantalla y las chispas otros tres loops permanentes —
   en el hardware del TV su suma pesaba. El glow quieto conserva la calidez;
   las chispas se retiraron. */
#tvScreenRoot .transGlow {
  position: absolute;
  left: -12%;
  bottom: -28%;
  width: 75%;
  height: 85%;
  background: radial-gradient(
    ellipse at 28% 82%,
    rgba(212, 168, 67, 0.1) 0%,
    rgba(212, 168, 67, 0) 60%
  );
}

/* Layout: frase (izquierda, ~60%) | identidad (derecha, ~40%), sin divisor. */
#tvScreenRoot .transMarco {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
}
#tvScreenRoot .transFrase {
  flex: 1.45;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 4rem 0 6rem;
  text-align: left;
}
#tvScreenRoot .transIdentidad {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
}
/* La columna de identidad se distribuye en vertical con aire entre elementos
   (pedido 2026-08-25): logo arriba, [título de cierre], reloj y fecha — los
   márgenes generosos hacen que ocupe el alto del marco en vez de apretarse
   en el centro. */
#tvScreenRoot .transLogo {
  width: 9rem;
  opacity: 0.95;
  margin-bottom: 6.5rem;
}

/* Reloj y fecha de la transición (render.ts escribe HH:MM y la fecha larga). */
#tvScreenRoot .pantalla .relojXl {
  font-family: var(--cinzel);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: var(--trans-crema);
  /* El aire antes del reloj lo ponen el logo (reposo) o el título (cierre). */
  margin-top: 0;
}
/* Hora y día más grandes (pedido 2026-08-25; la hora va SIN segundero, como
   todos los relojes de sede — ver clockNodes en render.ts). */
#tvScreenRoot #pantallaReposo .relojXl {
  font-size: 6.6rem;
}
#tvScreenRoot #pantallaCierre .relojXl {
  font-size: 4.6rem;
}
#tvScreenRoot .pantalla .fechaXl {
  font-weight: 700;
  letter-spacing: 0.32em;
  font-size: 1.5rem;
  color: var(--trans-apagado);
  margin-top: 1.7rem;
}

/* "SESIÓN COMPLETA": tracking-in cada vez que aparece la pantalla de cierre. */
#tvScreenRoot .cierreTitulo {
  font-family: var(--cinzel);
  font-weight: 700;
  font-size: 2.4rem;
  line-height: 1.1;
  color: var(--trans-bronce);
  white-space: nowrap;
  margin: 0 0 5rem;
  opacity: 0;
  letter-spacing: 0.5em;
}
#tvScreenRoot .pantalla.visible .cierreTitulo {
  animation: transTitulo 1.5s ease 0.3s forwards;
}
@keyframes transTitulo {
  from {
    opacity: 0;
    letter-spacing: 0.5em;
  }
  to {
    opacity: 1;
    letter-spacing: 0.18em;
  }
}

/* Frase: Cinzel crema, remates `.oro` en bronce. La sombra de legibilidad final
   vive en el keyframe (fill forwards) — el velo es translúcido a la derecha. */
#tvScreenRoot .pantalla .quote {
  font-family: var(--cinzel);
  font-weight: 700;
  /* +20% de tipografía en ambas pantallas (pedido 2026-08-25). */
  font-size: 3.85rem;
  line-height: 1.5;
  color: var(--trans-crema);
  text-shadow: 0 0.06em 0.5em rgba(0, 0, 0, 0.6);
}
/* El encendido va POR PALABRA (un nodo animado por palabra, no por letra):
   decisión de perf del UAT en el TV real, 2026-08-26. */
#tvScreenRoot .pantalla .quote .palabra {
  white-space: nowrap;
  opacity: 0;
}
#tvScreenRoot .pantalla .quote .palabra.prendida {
  animation: transPrende 0.8s ease forwards;
}
#tvScreenRoot .pantalla .quote .palabra.oro.prendida {
  animation-name: transPrendeOro;
}
@keyframes transPrende {
  0% {
    opacity: 0;
    color: #fff3d6;
    text-shadow: 0 0 0 rgba(255, 157, 77, 0);
  }
  18% {
    opacity: 1;
    color: #ffd9a0;
    text-shadow: 0 0 0.22em rgba(255, 157, 77, 0.85);
  }
  100% {
    opacity: 1;
    color: var(--trans-crema);
    text-shadow: 0 0.04em 0.28em rgba(0, 0, 0, 0.55);
  }
}
@keyframes transPrendeOro {
  0% {
    opacity: 0;
    color: #fff3d6;
    text-shadow: 0 0 0 rgba(255, 170, 60, 0);
  }
  18% {
    opacity: 1;
    color: #ffe2ae;
    text-shadow: 0 0 0.24em rgba(255, 170, 60, 0.9);
  }
  100% {
    opacity: 1;
    color: var(--trans-bronce);
    text-shadow: 0 0.04em 0.28em rgba(0, 0, 0, 0.55);
  }
}

/* Autor: entra después de que la frase terminó de encenderse. */
#tvScreenRoot .pantalla .autor {
  font-family: var(--nunito);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3em;
  font-size: 1.4rem;
  color: var(--trans-apagado);
  margin-top: 2.2rem;
  opacity: 0;
  transform: translateY(0.6em);
}
#tvScreenRoot .pantalla .autor.aparece {
  opacity: 1;
  transform: none;
  transition:
    opacity 0.9s ease,
    transform 0.9s ease;
}

/* Salida al rotar: la frase actual se apaga hacia arriba y recién ahí se
   enciende la nueva (paintQuote maneja los tiempos). */
#tvScreenRoot .pantalla .quote.apagada,
#tvScreenRoot .pantalla .autor.apagada {
  opacity: 0;
  transform: translateY(-0.4em);
  transition:
    opacity 0.7s ease,
    transform 0.7s ease;
}

/* Modo sobrio (?sobrio=1): sin encendido, sin glow, sin chispas — la pantalla
   queda estática con los colores finales. */
#tvScreenRoot.tv-sobrio .transGlow,
#tvScreenRoot.tv-sobrio .transChispas {
  display: none;
}
#tvScreenRoot.tv-sobrio .pantalla.visible,
#tvScreenRoot.tv-sobrio .pantalla.visible .cierreTitulo {
  animation: none;
}
#tvScreenRoot.tv-sobrio .pantalla.visible.saliendo {
  transition: none;
}
#tvScreenRoot.tv-sobrio .cierreTitulo {
  opacity: 1;
  letter-spacing: 0.18em;
}
#tvScreenRoot.tv-sobrio .pantalla .quote .palabra {
  animation: none;
  opacity: 1;
  color: var(--trans-crema);
}
#tvScreenRoot.tv-sobrio .pantalla .quote .palabra.oro {
  color: var(--trans-bronce);
}
#tvScreenRoot.tv-sobrio .pantalla .autor {
  opacity: 1;
  transform: none;
}

/* ── Pre-clase diurna (`.pantalla--dia`, sketch 003 variante D): la MISMA foto
   con velo CREMA claro (más denso tras el texto), cápsula de técnica a la
   izquierda con escritura por letra en clave cálida→tinta, y la identidad en
   charcoal (partenón oscuro + reloj + fecha con halo crema, porque la zona del
   león es la más transparente del velo). Sin glow ni chispas: el teatro es del
   cierre. ── */
#tvScreenRoot .pantalla--dia {
  background: var(--cream);
  color: var(--navy);
}
#tvScreenRoot .pantalla--dia .transFoto {
  background:
    linear-gradient(
      100deg,
      rgba(242, 236, 226, 0.9) 0%,
      rgba(242, 236, 226, 0.82) 42%,
      rgba(240, 232, 220, 0.66) 68%,
      rgba(238, 229, 214, 0.55) 100%
    ),
    var(--trans-foto, none) center / cover no-repeat;
}
#tvScreenRoot .capKicker {
  font-weight: 700;
  letter-spacing: 0.34em;
  font-size: 1.45rem;
  color: var(--gold);
  margin-bottom: 1.6rem;
}
/* El TÍTULO es el que se escribe por letra (coreografía 2026-08-26):
   render.ts lo arma con spans `.palabra` (uno por palabra) y los keyframes diurnos. */
#tvScreenRoot .capEjercicio {
  font-family: var(--cinzel);
  font-weight: 700;
  font-size: 4.3rem;
  line-height: 1.2;
  letter-spacing: 0.04em;
  color: var(--navy);
  margin-bottom: 1.8rem;
}
#tvScreenRoot .capEjercicio .palabra {
  white-space: nowrap;
  opacity: 0;
}
#tvScreenRoot .capEjercicio .palabra.prendida {
  animation: escribeClaro 0.8s ease forwards;
}
/* El cue entra como BLOQUE (fade + subida corta) cuando el título terminó de
   escribirse — el gesto que antes tenía el título. Nunito, tinta oscura,
   `.acento` en terracotta. Sin sombra: el velo claro no la necesita. */
#tvScreenRoot .pantalla--dia .quote {
  font-family: var(--nunito);
  font-size: 2.9rem;
  line-height: 1.55;
  color: var(--navy);
  text-shadow: none;
  max-width: 92%;
  opacity: 0;
  transform: translateY(0.3em);
}
#tvScreenRoot .pantalla--dia .quote.aparece {
  opacity: 1;
  transform: none;
  transition:
    opacity 0.6s ease,
    transform 0.6s ease;
}
#tvScreenRoot .pantalla--dia .quote .acento {
  color: var(--trans-terracotta);
}
@keyframes escribeClaro {
  0% {
    opacity: 0;
    color: #c9a26b;
    text-shadow: 0 0 0.3em rgba(212, 168, 67, 0);
  }
  20% {
    opacity: 1;
    color: #a97c4a;
    text-shadow: 0 0 0.2em rgba(212, 168, 67, 0.7);
  }
  100% {
    opacity: 1;
    color: var(--navy);
    text-shadow: none;
  }
}
/* Chips "ACTIVA": render.ts arma `.capActiva` + `.capChip` por cápsula. */
#tvScreenRoot .capMusculos {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 2.6rem;
  opacity: 0;
}
#tvScreenRoot .capMusculos.aparece {
  opacity: 1;
  transition: opacity 0.6s ease;
}
#tvScreenRoot .capActiva {
  font-weight: 700;
  letter-spacing: 0.22em;
  font-size: 1.2rem;
  color: var(--trans-apagado-dia);
  /* En su propia línea: las pills van DEBAJO de la etiqueta, con aire. */
  flex-basis: 100%;
  margin-bottom: 1.7rem;
}
/* Las pills suben desde una línea abajo, escalonadas (render.ts las marca
   con `.sube` una a una). */
#tvScreenRoot .capChip {
  font-weight: 700;
  letter-spacing: 0.12em;
  font-size: 1.2rem;
  color: var(--navy);
  border: 1px solid var(--muted);
  background: rgba(176, 141, 110, 0.1);
  border-radius: 999rem;
  padding: 0.42rem 1rem;
  margin-right: 0.75rem;
  margin-bottom: 0.55rem;
  opacity: 0;
  transform: translateY(1.5em);
}
#tvScreenRoot .capChip.sube {
  opacity: 1;
  transform: none;
  transition:
    opacity 0.5s ease,
    transform 0.55s cubic-bezier(0.2, 0.7, 0.25, 1);
}
/* Identidad diurna: tinta y halo crema (apoyo local sobre la foto). */
#tvScreenRoot .pantalla--dia .relojXl {
  color: var(--navy);
  text-shadow:
    0 0 0.9rem rgba(242, 236, 226, 0.95),
    0 0 2.2rem rgba(242, 236, 226, 0.8);
}
#tvScreenRoot .pantalla--dia .fechaXl {
  color: var(--trans-apagado-dia);
  text-shadow:
    0 0 0.9rem rgba(242, 236, 226, 0.95),
    0 0 2.2rem rgba(242, 236, 226, 0.8);
}
/* Salida de la cápsula al rotar: se apaga el CONTENEDOR entero (kicker +
   título + cue + pills a la vez) — el fade en el padre no pierde contra los
   estados `aparece`/`sube` de los hijos. */
#tvScreenRoot .transFrase.apagada {
  opacity: 0;
  transform: translateY(-0.6rem);
  transition:
    opacity 0.7s ease,
    transform 0.7s ease;
}
/* Modo sobrio: la cápsula queda estática con los colores finales. */
#tvScreenRoot.tv-sobrio .capEjercicio .palabra {
  animation: none;
  opacity: 1;
}
#tvScreenRoot.tv-sobrio .pantalla--dia .quote,
#tvScreenRoot.tv-sobrio .capMusculos,
#tvScreenRoot.tv-sobrio .capChip {
  opacity: 1;
  transform: none;
}

/* Mientras la transición (overlay opaco) tapa la clase, el fondo vivo de atrás
   se pausa: no pagamos dos juegos de animaciones a la vez. */
#tvScreenRoot.tvbg--tapado .tvFondo__marmol,
#tvScreenRoot.tvbg--tapado .tvFondo__luz {
  animation-play-state: paused;
}

/* ══════════════════════════════════════════════════════════════════════════════
   Fondo vivo: "un templo antiguo iluminado por luz que se mueve". Capas detrás de
   toda la UI, paleta intacta, solo transform/opacity (compositor de GPU, apto para
   horas de pantalla encendida).

   Capas (z-index 0, contenido en 1):
     __marmol  · la MISMA textura, sobredimensionada, deriva de 46s
     __luz     · manchas radiales gigantes (calida en overlay + sombra que cubre
                 toda la franja inferior en multiply) recorriendo la piedra
   (Vetas y polvo se sacaron por performance: eran filter:blur() animado, el mayor
   costo en una TV encendida por horas.)

   Reactividad: `--fondoActividad` modula la opacidad de luz y polvo según el
   estado espejado del cronómetro (tvbg--calmo/activo/completo en el root).
   El reposo entre clases ya es "casi estático" gratis: las pantallas de
   reposo/cierre son overlays opacos con su propio mármol quieto.
   ══════════════════════════════════════════════════════════════════════════════ */

/* Intensidad global del fondo. Calmo apagado, corriendo pleno, cierre con un
   respiro breve (la transición de las capas hace el fade, no hay keyframe extra). */
#tvScreenRoot {
  --fondoActividad: 1;
}
#tvScreenRoot.tvbg--activo {
  --fondoActividad: 1.3;
}
#tvScreenRoot.tvbg--completo {
  --fondoActividad: 1.6;
}

/* Sombra en TODAS las letras para reforzar su presencia sobre el fondo vivo:
   dos capas — una ceñida que marca el borde + una suave que da profundidad
   (text-shadow hereda: quien ya define la suya —relojes/títulos con sombra sand—
   la conserva). Valores en em: escalan con cada tamaño de fuente. */
#tvScreenRoot {
  text-shadow:
    0 0.02em 0.04em rgba(20, 32, 46, 0.42),
    0 0.05em 0.13em rgba(20, 32, 46, 0.22);
}

/* Énfasis en la row del cronómetro (nombre de bloque + formato): contorno navy
   —hecho con 4 sombras tight, sin -webkit-text-stroke que engrosa el serif— más
   una capa de profundidad. Los despega de la piedra como una inscripción tallada.
   Sobrescribe la sombra global heredada para estos dos. */
#tvScreenRoot .cabecera .cabTitulo {
  text-shadow:
    0.018em 0 0.01em rgba(226, 190, 120, 0.58),
    -0.018em 0 0.01em rgba(226, 190, 120, 0.58),
    0 0.018em 0.01em rgba(226, 190, 120, 0.58),
    0 -0.018em 0.01em rgba(226, 190, 120, 0.58),
    0 0 0.5em rgba(232, 205, 150, 0.35),
    0 0.07em 0.18em rgba(20, 32, 46, 0.4);
}
#tvScreenRoot .cabecera .cabFormato {
  text-shadow:
    0.014em 0 0.01em rgba(20, 32, 46, 0.4),
    -0.014em 0 0.01em rgba(20, 32, 46, 0.4),
    0 0.014em 0.01em rgba(20, 32, 46, 0.4),
    0 -0.014em 0.01em rgba(20, 32, 46, 0.4),
    0 0.07em 0.18em rgba(20, 32, 46, 0.42);
}

/* El mármol deja de ser background fijo de #tv (pasa a la capa móvil). */
#tvScreenRoot #tv {
  background: var(--cream);
}
/* Contenido siempre por encima del fondo. `.pantalla` ya es absolute: solo z. */
#tvScreenRoot #tv > .topbar,
#tvScreenRoot #tv > .cabecera,
#tvScreenRoot #tv > .stage,
#tvScreenRoot #tv > .movBar {
  position: relative;
  z-index: 1;
}
#tvScreenRoot #tv > .pantalla {
  z-index: 1;
}

#tvScreenRoot .tvFondo {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

/* ── Mármol con deriva: sobredimensionado 3rem por lado para que el paseo nunca
   descubra un borde. 90s ida y vuelta: piedra viva, no animación evidente. ── */
#tvScreenRoot .tvFondo__marmol {
  position: absolute;
  inset: -5rem;
  background: var(--marble, none) center / cover no-repeat;
  animation: fondoDeriva 46s ease-in-out infinite alternate;
}
/* Escala CONSTANTE (antes 1.04→1.13): animar scale obliga a re-muestrear la
   textura full-screen en cada frame en el compositor del TV; el translate solo
   es mucho más barato. 1.08 fijo + inset -5rem siguen cubriendo el recorrido
   (5rem, 3rem) sin descubrir bordes. */
@keyframes fondoDeriva {
  from {
    transform: translate3d(0, 0, 0) scale(1.08);
  }
  to {
    transform: translate3d(5rem, 3rem, 0) scale(1.08);
  }
}

/* ── Luz ambiental: dos manchas radiales gigantes que recorren la superficie.
   La cálida ilumina (oro/arena), la sombra navy desaturada en multiply apaga
   levemente el sector opuesto — juntas leen como luz natural moviéndose. ── */
#tvScreenRoot .tvFondo__luz {
  position: absolute;
  width: 110rem;
  height: 70rem;
  border-radius: 50%;
  will-change: transform;
  transition: opacity 2.5s ease;
}
/* Sobre mármol claro la "luz" se percibe por CONTRASTE: la mancha cálida dora el
   sector iluminado y la sombra ámbar/navy apaga el opuesto. Alphas altas a
   propósito en esta ronda de calibración. */
#tvScreenRoot .tvFondo__luz--calida {
  top: -24rem;
  left: -32rem;
  /* SIN mix-blend-mode (antes overlay): un blend mode sobre una capa gigante
     animada obliga al compositor del TV a una pasada extra de mezcla de toda
     la pantalla POR FRAME — era el mayor costo fijo de la página. Sobre un
     mármol claro y conocido, el dodge cálido se aproxima con un gradiente
     rgba en blending normal (tonos más blancos y alphas más bajos). */
  background: radial-gradient(
    closest-side,
    rgba(255, 241, 205, 0.5) 0%,
    rgba(235, 202, 150, 0.24) 44%,
    transparent 74%
  );
  opacity: calc(0.8 * var(--fondoActividad));
  animation: luzPaseo 30s ease-in-out infinite alternate;
}
/* Sombra suave que cubre TODA la franja inferior (elipse anclada abajo-centro),
   no una mancha en una esquina. Deriva lateral leve para que respire. */
#tvScreenRoot .tvFondo__luz--sombra {
  left: -12rem;
  right: -12rem;
  bottom: -16rem;
  width: auto;
  height: 46rem;
  border-radius: 0;
  /* SIN mix-blend-mode (antes multiply), por el mismo costo por frame que la
     mancha cálida: un multiply oscuro se aproxima con el mismo gradiente en
     blending normal, apenas más tenue. */
  background: radial-gradient(
    120% 100% at 50% 100%,
    rgba(44, 38, 31, 0.28) 0%,
    rgba(33, 49, 67, 0.11) 46%,
    transparent 72%
  );
  opacity: calc(0.85 * var(--fondoActividad));
  animation: sombraPaseo 52s ease-in-out infinite alternate;
}
@keyframes sombraPaseo {
  from {
    transform: translate3d(-4rem, 0, 0);
  }
  to {
    transform: translate3d(4rem, 0, 0);
  }
}
@keyframes luzPaseo {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(64rem, 16rem, 0) scale(1.18);
  }
}

/* Accesibilidad y ahorro: sin movimiento, piedra quieta. */
@media (prefers-reduced-motion: reduce) {
  #tvScreenRoot .tvFondo__marmol,
  #tvScreenRoot .tvFondo__luz,
  #tvScreenRoot .columnaDorica__brillo::after {
    animation: none;
  }
}
</style>
