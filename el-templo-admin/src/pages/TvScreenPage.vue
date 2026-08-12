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
  <div id="tvScreenRoot" :style="{ '--marble': `url('${MARBLE_BG_BASE64}')` }">
    <!-- Selector de sede: solo la primera vez que se abre esta pantalla en
         este TV (sin `?branchId=` en la URL y sin sede guardada todavía). -->
    <div v-if="!ready" class="tvPicker">
      <img :src="tvLogo" alt="El Templo" class="tvPicker__logo" />
      <div class="tvPicker__title">Elegí la sede de esta pantalla</div>
      <div class="tvPicker__hint">Se guarda en este televisor: no hace falta elegirla de nuevo.</div>

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
        <header class="topbar">
          <div class="marca">
            <img :src="tvLogo" alt="El Templo" />
            <div>
              <div class="sede" id="sede">EL TEMPLO</div>
              <div class="fecha" id="fecha"></div>
            </div>
          </div>
          <div class="reloj" id="reloj">--:--:<span class="seg">--</span></div>
        </header>

        <div class="cabecera">
          <h1 id="titulo"></h1>
          <div class="movilidad" id="movilidad"></div>
          <div class="bloqueNum">
            <span id="bloqueNum"></span><span class="dots" id="dots"></span>
          </div>
        </div>

        <main class="stage" id="stage">
          <section class="col panel listaCol">
            <div class="cabCol" id="cabNivel"></div>
            <div class="caja" id="listaBox"></div>
          </section>
          <section class="col panel timerCaja" id="timerPanel">
            <div class="cabCol" id="timerCab"></div>
            <div class="caja">
              <div class="fase" id="fase">LISTOS</div>
              <div class="digitos" id="digitos">00:00</div>
              <div class="sub" id="sub"></div>
              <div class="barra"><i id="progreso"></i></div>
              <div class="hint" id="hint"></div>
            </div>
          </section>
        </main>

        <div class="pantalla" id="pantallaReposo">
          <div class="contenido">
            <img class="logoGrande" :src="tvLogo" alt="El Templo" />
            <div class="relojXl" id="reposoReloj">--:--:<span class="seg">--</span></div>
            <div class="fechaXl" id="reposoFecha"></div>
            <div class="quote" id="reposoQuote"></div>
            <div class="autor" id="reposoAutor"></div>
          </div>
        </div>
        <div class="pantalla" id="pantallaCierre">
          <div class="contenido">
            <img class="logoGrande" :src="tvLogo" alt="El Templo" />
            <div class="titulo" id="cierreTitulo"></div>
            <div class="relojXl" id="cierreReloj">--:--:<span class="seg">--</span></div>
            <div class="quote" id="cierreQuote"></div>
            <div class="autor" id="cierreAutor"></div>
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
import { renderState, resetRender, setQuotes, tickClock, tickTimer } from 'src/tv/render';
import { scaleTv } from 'src/tv/scale';
import { QUOTES } from 'src/utils/pdf/quotes';
import { createLogger } from 'src/utils/logger';
import tvLogo from 'src/assets/tv-logo.png';
import { MARBLE_BG_BASE64 } from 'src/utils/pdf/pdf-assets';
import type { BranchOption } from 'src/types/member';

const log = createLogger('TvScreenPage');
const route = useRoute();
const authStore = useAuthStore();
const membersApi = useMembersApi();
const tvApi = useTvApi();

/** Clave del TV elegido para esta pantalla — un televisor de pared lo hace una vez. */
const BRANCH_STORAGE_KEY = 'tv.screen.branchId';
/** Mismos tiempos que tenía el kiosco estático: poll de estado y tick de relojes. */
const POLL_MS = 2500;
const TICK_MS = 250;
/** Clase que oscurece el `body` real mientras la pantalla está montada (ver estilos). */
const BODY_ACTIVE_CLASS = 'tv-screen-active';

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
  /* Réplica del lenguaje visual del PDF de planis: mármol crema + navy + oro
     mate + arena (ver session-pdf-builder.ts). */
  --cream: #f2ebe1;
  --navy: #24364a;
  --gold: #b08d6e;
  --sand: #dbcab4;
  --muted: #c5b9a8;
  --cinzel: 'Cinzel', Georgia, serif;
  --nunito: 'NunitoSans', 'Segoe UI', system-ui, sans-serif;
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
  padding: 1vh 1vw;
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
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.55);
}

/* ── Barra superior: logo + sede | hora con segundero ── */
#tvScreenRoot .topbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 2rem 0.25rem;
}
#tvScreenRoot .topbar .marca {
  display: flex;
  align-items: center;
  min-width: 0;
  margin-right: 2rem;
}
#tvScreenRoot .topbar .marca img {
  height: 3rem;
  display: block;
  margin-right: 1rem;
}
#tvScreenRoot .topbar .sede {
  font-family: var(--cinzel);
  font-weight: 700;
  letter-spacing: 0.16em;
  font-size: 1.3rem;
  color: var(--navy);
}
#tvScreenRoot .topbar .fecha {
  font-weight: 700;
  letter-spacing: 0.14em;
  font-size: 0.95rem;
  color: var(--gold);
}
#tvScreenRoot .topbar .reloj {
  font-family: var(--cinzel);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-size: 2.3rem;
  line-height: 1;
  color: var(--navy);
  white-space: nowrap;
}
#tvScreenRoot .topbar .reloj .seg {
  color: var(--gold);
}

/* ── Título del bloque ── */
#tvScreenRoot .cabecera {
  flex: 0 0 auto;
  text-align: center;
  padding: 0 2rem;
}
#tvScreenRoot .cabecera h1 {
  margin: 0;
  font-family: var(--cinzel);
  font-weight: 700;
  letter-spacing: 0.09em;
  font-size: 2.7rem;
  line-height: 1.1;
  color: var(--navy);
  text-shadow: 0.05em 0.035em 0 rgba(219, 202, 180, 0.85);
}
#tvScreenRoot .cabecera .movilidad {
  margin-top: 0.2rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  font-size: 1.05rem;
  color: var(--gold);
}
#tvScreenRoot .cabecera .bloqueNum {
  display: inline-flex;
  align-items: center;
  margin-top: 0.25rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  font-size: 0.85rem;
  color: var(--muted);
}
#tvScreenRoot .cabecera .dots {
  display: inline-flex;
  margin-left: 0.5rem;
}
#tvScreenRoot .cabecera .dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--muted);
  opacity: 0.5;
  margin-right: 0.4rem;
}
#tvScreenRoot .cabecera .dot:last-child {
  margin-right: 0;
}
#tvScreenRoot .cabecera .dot.activo {
  background: var(--gold);
  opacity: 1;
}
#tvScreenRoot .cabecera .dot.hecho {
  background: var(--navy);
  opacity: 0.55;
}

/* ── Zona principal: DOS columnas 50/50 — lista de ejercicios a la izquierda,
   timer a la derecha (sin columna de video). */
#tvScreenRoot .stage {
  flex: 1 1 auto;
  display: flex;
  padding: 0.6rem 2rem 1.4rem;
  min-height: 0;
}
#tvScreenRoot .col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
#tvScreenRoot .listaCol {
  flex: 0 0 50%;
  padding-right: 1.2rem;
}
#tvScreenRoot .timerCaja {
  flex: 0 0 50%;
}
#tvScreenRoot .cabCol {
  font-weight: 700;
  letter-spacing: 0.06em;
  font-size: 1.4rem;
  color: var(--gold);
  padding: 0 0.3rem 0.45rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#tvScreenRoot .caja {
  flex: 1;
  border: 0.22rem solid var(--gold);
  border-radius: 1rem;
  min-height: 0;
  overflow: hidden;
}

/* Columna 1: lista de ejercicios. */
#tvScreenRoot .listaCol .caja {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 1rem 1.4rem;
}
#tvScreenRoot .listaCol .item {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-weight: 700;
  color: var(--navy);
  font-size: 1.9rem;
  line-height: 1.45;
  margin-bottom: 0.7rem;
}
#tvScreenRoot .listaCol .item:last-child {
  margin-bottom: 0;
}
#tvScreenRoot .listaCol .item .ej::before {
  content: '•  ';
  color: var(--gold);
}
#tvScreenRoot .listaCol .item .rx {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  margin-left: 1rem;
  color: var(--gold);
}
#tvScreenRoot .listaCol .caja.compacta .item {
  font-size: 1.35rem;
  line-height: 1.45;
  margin-bottom: 0.4rem;
}
#tvScreenRoot .listaCol .caja.compacta .item:last-child {
  margin-bottom: 0;
}

/* Timer */
#tvScreenRoot .timerCaja .caja {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  transition:
    border-color 0.3s,
    background-color 0.3s;
}
#tvScreenRoot .timerCaja.descanso .caja {
  border-color: var(--muted);
}
#tvScreenRoot .timerCaja.completo .caja {
  background: rgba(219, 202, 180, 0.35);
}
#tvScreenRoot .timerCaja .fase {
  font-family: var(--cinzel);
  font-weight: 700;
  letter-spacing: 0.28em;
  font-size: 1.9rem;
  color: var(--gold);
  text-align: center;
  margin-bottom: 0.6rem;
}
#tvScreenRoot .timerCaja.descanso .fase {
  color: var(--muted);
}
#tvScreenRoot .timerCaja .digitos {
  font-family: var(--cinzel);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  font-size: 7rem;
  line-height: 1;
  color: var(--navy);
  margin-bottom: 0.6rem;
}
#tvScreenRoot .timerCaja .sub {
  font-weight: 700;
  letter-spacing: 0.14em;
  font-size: 1.3rem;
  color: var(--gold);
  min-height: 1.3em;
  text-align: center;
  margin-bottom: 0.5rem;
}
#tvScreenRoot .timerCaja .barra {
  width: 78%;
  height: 0.45rem;
  background: rgba(197, 185, 168, 0.5);
  border-radius: 99px;
  overflow: hidden;
  margin-top: 0.5rem;
}
#tvScreenRoot .timerCaja .barra i {
  display: block;
  height: 100%;
  width: 0%;
  background: var(--gold);
  border-radius: 99px;
  transition: width 0.2s linear;
}
#tvScreenRoot .timerCaja .hint {
  font-weight: 700;
  font-size: 0.9rem;
  letter-spacing: 0.1em;
  color: var(--muted);
  margin-top: 0.8rem;
  text-align: center;
}
@keyframes tvScreenPulso {
  50% {
    opacity: 0.5;
  }
}
#tvScreenRoot .timerCaja.trabajo .fase {
  animation: tvScreenPulso 1s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  #tvScreenRoot .timerCaja .fase {
    animation: none !important;
  }
  #tvScreenRoot .listaCol .item {
    transition: none;
  }
}

/* ── Las otras pantallas (reposo / cierre): overlays del marco 16:9 ── */
#tvScreenRoot .pantalla {
  display: none;
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  background: var(--cream) var(--marble, none) center / cover no-repeat;
  color: var(--navy);
  text-align: center;
}
#tvScreenRoot .pantalla.visible {
  display: block;
}
#tvScreenRoot .pantalla .contenido {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 3rem 6rem;
}
#tvScreenRoot .pantalla .logoGrande {
  height: 7rem;
  display: block;
  margin-bottom: 2rem;
}
#tvScreenRoot .pantalla .relojXl {
  font-family: var(--cinzel);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  font-size: 13rem;
  color: var(--navy);
  text-shadow: 0.05em 0.035em 0 rgba(219, 202, 180, 0.85);
}
#tvScreenRoot .pantalla .relojXl .seg {
  color: var(--gold);
}
#tvScreenRoot .pantalla .fechaXl {
  font-weight: 700;
  letter-spacing: 0.16em;
  font-size: 1.6rem;
  color: var(--gold);
  margin-top: 1.2rem;
}
#tvScreenRoot .pantalla .quote {
  font-weight: 700;
  font-size: 1.9rem;
  line-height: 1.5;
  max-width: 68%;
  margin-top: 3rem;
  color: var(--navy);
}
#tvScreenRoot .pantalla .quote .oro {
  color: var(--gold);
}
#tvScreenRoot .pantalla .autor {
  font-weight: 700;
  letter-spacing: 0.18em;
  font-size: 1.3rem;
  color: var(--gold);
  margin-top: 1rem;
}
#tvScreenRoot #pantallaCierre .titulo {
  font-family: var(--cinzel);
  font-weight: 700;
  letter-spacing: 0.09em;
  font-size: 4.4rem;
  line-height: 1.1;
  color: var(--navy);
  text-shadow: 0.05em 0.035em 0 rgba(219, 202, 180, 0.85);
  margin-bottom: 1.5rem;
}
#tvScreenRoot #pantallaCierre .relojXl {
  font-size: 6rem;
}
#tvScreenRoot #pantallaReposo .logoGrande {
  height: 8rem;
}
</style>
