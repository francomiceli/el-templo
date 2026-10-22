<template>
  <q-page class="anatomia" :class="{ 'anatomia--hoja': esMovil && hojaAbierta }">
    <div class="anatomia__col" :class="{ 'anatomia__col--ancha': !esMovil }">
      <!-- Con la hoja abierta en el celular el título y el kicker se ocultan (.scr.has-sheet .intro) -->
      <div v-if="!(esMovil && hojaAbierta)" class="anatomia__intro">
        <p class="anatomia__kicker">Anatomía</p>
        <h1 class="anatomia__title">Tocá una zona</h1>
        <p class="anatomia__lead">Ves sus músculos y en qué rutas trabajan.</p>
      </div>

      <div v-if="anatomyStore.loading" class="anatomia__estado" role="status">
        <q-spinner class="anatomia__spinner" size="32px" />
        <span class="anatomia__estado-texto">Cargando Anatomía…</span>
      </div>

      <div v-else-if="anatomyStore.error" class="anatomia__estado" role="alert">
        <p class="anatomia__estado-texto">{{ anatomyStore.error }}</p>
        <button type="button" class="anatomia__retry" @click="reintentar">Reintentar</button>
      </div>

      <div v-else-if="anatomyStore.vista" :class="{ anatomia__grilla: !esMovil }">
        <div class="anatomia__cuerpo" :class="{ 'anatomia__cuerpo--fijo': !esMovil }">
          <div v-if="esMovil" class="anatomia__flip" role="group" aria-label="Vista del cuerpo">
            <button
              v-for="op in OPCIONES_VISTA"
              :key="op.key"
              type="button"
              class="anatomia__flip-btn"
              :class="{ 'anatomia__flip-btn--on': vista === op.key }"
              :aria-pressed="vista === op.key"
              @click="girar(op.key)"
            >
              {{ op.label }}
            </button>
          </div>

          <div ref="figwrap" class="anatomia__figwrap">
            <AnatomyFigure
              :view="esMovil ? vista : 'both'"
              :selected="zonaSel"
              interactive
              :max-height="alturaFigura"
              @select-zone="onSelectZone"
            />
          </div>

          <!-- Equivalente accesible del cuerpo (el SVG es aria-hidden): se ve al enfocarlo con teclado -->
          <nav class="anatomia__zonas" aria-label="Zonas del cuerpo">
            <ul class="anatomia__zonas-lista">
              <li v-for="r in regionesVisibles" :key="r.slug">
                <button
                  type="button"
                  class="anatomia__zona-btn"
                  @click="onSelectZone(r.slug, vistaDeRegion(r.vista))"
                >
                  {{ r.nombre }}
                </button>
              </li>
            </ul>
          </nav>

          <div v-if="!(esMovil && hojaAbierta)" class="anatomia__profundos">
            <p class="anatomia__profundos-kicker">No están en el dibujo</p>
            <div class="anatomia__chips">
              <button
                v-for="m in anatomyStore.profundos"
                :key="m.id"
                type="button"
                class="anatomia__chip"
                :class="{ 'anatomia__chip--on': musculoSel === m.id }"
                :aria-pressed="musculoSel === m.id"
                @click="onSelectMusculo(m.id)"
              >
                {{ m.nombre }}
              </button>
            </div>
          </div>
        </div>

        <!-- Escritorio: el panel de la zona a la derecha, sin hoja (D6) -->
        <aside v-if="!esMovil" class="anatomia__panel">
          <ZonaPanel
            v-if="panelActivo"
            :key="claveContenido"
            :zona="zonaSel"
            :musculo-id="musculoSel"
            @open-ruta="onOpenRuta"
          />
          <p v-else class="anatomia__panel-vacio">
            Tocá una zona del cuerpo o un músculo de los que no se ven.
          </p>
        </aside>
      </div>

      <p v-else-if="intentado" class="anatomia__estado-texto">
        Todavía no hay contenido de Anatomía para mostrar.
      </p>
    </div>

    <!-- Celular: hoja desde abajo (D8) -->
    <AnatomySheet
      v-if="esMovil && anatomyStore.vista"
      v-model="hojaModel"
      v-model:full="hojaEntera"
      :reset-key="claveUltima"
    >
      <!-- Durante la animación de cierre se conserva el último contenido (no queda la hoja vacía) -->
      <ZonaPanel
        v-if="ultima.zona || ultima.musculo"
        :key="claveUltima"
        :zona="ultima.zona"
        :musculo-id="ultima.musculo"
        @open-ruta="onOpenRuta"
      />
    </AnatomySheet>

    <!-- Fase 200 D11: ficha de la ruta (?ruta=<slug>) sobre la hoja. Celular: pantalla completa -->
    <q-dialog
      v-if="esMovil"
      :model-value="fichaAbierta"
      maximized
      transition-show="slide-left"
      transition-hide="slide-right"
      @update:model-value="onFichaModel"
    >
      <q-card class="anatomia__ficha" role="dialog" aria-label="Ficha de la ruta">
        <RutaFicha
          v-if="rutaMostrada"
          :key="rutaMostrada.slug"
          :ruta="rutaMostrada"
          :volver-a="volverA"
          @volver="cerrarFicha"
        />
      </q-card>
    </q-dialog>

    <!-- Escritorio: panel a la derecha (decisión 4 del planner) -->
    <q-dialog
      v-else
      :model-value="fichaAbierta"
      position="right"
      @update:model-value="onFichaModel"
    >
      <q-card
        class="anatomia__ficha anatomia__ficha--lado"
        role="dialog"
        aria-label="Ficha de la ruta"
      >
        <RutaFicha
          v-if="rutaMostrada"
          :key="rutaMostrada.slug"
          :ruta="rutaMostrada"
          :volver-a="volverA"
          @volver="cerrarFicha"
        />
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
/**
 * Fase 200 D6-D11/R1: Admin › Anatomía. El estado vive en la URL (`?zona=&vista=` o `?musculo=`, y
 * `?ruta=` para la ficha), así el back del navegador cierra la hoja y la ficha. Celular: cuerpo en
 * vista única + hoja desde abajo. Escritorio: cuerpo a la izquierda y panel a la derecha, sin hoja.
 * Los parámetros se validan contra el store: un slug o id inexistente no abre nada (T-200-33).
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import type { LocationQuery, LocationQueryValue } from 'vue-router';
import AnatomyFigure from 'components/anatomy/AnatomyFigure.vue';
import AnatomySheet from 'components/anatomy/AnatomySheet.vue';
import RutaFicha from 'components/anatomy/RutaFicha.vue';
import ZonaPanel from 'components/anatomy/ZonaPanel.vue';
import { useAnatomyStore } from 'stores/useAnatomyStore';
import type { RegionVista, RutaProfe, Vista } from 'src/types/anatomy';

type VistaUnica = 'front' | 'back';

const OPCIONES_VISTA: { key: VistaUnica; label: string }[] = [
  { key: 'front', label: 'Frente' },
  { key: 'back', label: 'Espalda' },
];

// Alturas máximas de la figura en el celular: con la hoja abierta el cuerpo se achica (sketch 019).
const ALTO_FIGURA = 520;
const ALTO_FIGURA_CON_HOJA = 300;
const ALTO_FIGURA_ESCRITORIO = 560;

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const anatomyStore = useAnatomyStore();

const vista = ref<VistaUnica>('front');
// Evita el parpadeo de "sin contenido" antes de que arranque la primera carga.
const intentado = ref(false);
const hojaEntera = ref(false);
const figwrap = ref<HTMLElement | null>(null);

const esMovil = computed<boolean>(() => $q.screen.lt.md);

function unico(v: LocationQueryValue | LocationQueryValue[] | undefined): string | null {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === 'string' && x !== '' ? x : null;
}

/** Zona de la URL, solo si existe en el store (slug inexistente = no abre nada). */
const zonaSel = computed<string | null>(() => {
  const slug = unico(route.query.zona);
  if (!slug) return null;
  return anatomyStore.vista?.regiones.some((r) => r.slug === slug) ? slug : null;
});

/** Músculo profundo de la URL, solo si existe en el store y no tiene zona en el dibujo. */
const musculoSel = computed<string | null>(() => {
  if (zonaSel.value) return null;
  const id = unico(route.query.musculo);
  if (!id) return null;
  return anatomyStore.profundos.some((m) => m.id === id) ? id : null;
});

/** Ruta de la URL, solo si existe en el store (slug inexistente = no abre nada, T-200-33). */
const rutaSel = computed<RutaProfe | null>(() => {
  const slug = unico(route.query.ruta);
  if (!slug) return null;
  return anatomyStore.rutaPorSlug(slug) ?? null;
});

const fichaAbierta = computed<boolean>(() => rutaSel.value !== null);

// Última ficha mostrada: sigue pintada mientras el diálogo se desliza al cerrar.
const rutaMostrada = ref<RutaProfe | null>(null);
watch(
  rutaSel,
  (r) => {
    if (r) rutaMostrada.value = r;
  },
  { immediate: true }
);

// Texto del "←" de la ficha: la zona (o el músculo profundo) desde donde se abrió.
const volverA = computed<string>(() => {
  if (zonaSel.value) {
    return anatomyStore.vista?.regiones.find((r) => r.slug === zonaSel.value)?.nombre ?? 'Anatomía';
  }
  if (musculoSel.value) return anatomyStore.musculoPorId(musculoSel.value)?.nombre ?? 'Anatomía';
  return 'Anatomía';
});

// La ficha se abrió con push desde esta página: volver = back (deja el historial como estaba).
let fichaPorPush = false;

const panelActivo = computed<boolean>(() => zonaSel.value !== null || musculoSel.value !== null);
const hojaAbierta = computed<boolean>(() => panelActivo.value);
// Cambia al tocar otra zona u otro músculo: reinicia el scroll de la hoja y las (i) abiertas.
const claveContenido = computed<string | null>(() =>
  zonaSel.value ? `z:${zonaSel.value}` : musculoSel.value ? `m:${musculoSel.value}` : null
);

// Último contenido mostrado: la hoja lo sigue pintando mientras se desliza hacia abajo al cerrar.
const ultima = ref<{ zona: string | null; musculo: string | null }>({ zona: null, musculo: null });
watch(
  [zonaSel, musculoSel],
  ([zona, musculo]) => {
    if (zona || musculo) ultima.value = { zona, musculo };
  },
  { immediate: true }
);
const claveUltima = computed<string | null>(() =>
  ultima.value.zona
    ? `z:${ultima.value.zona}`
    : ultima.value.musculo
      ? `m:${ultima.value.musculo}`
      : null
);

// La hoja no se muestra mientras la ficha está abierta (WR-02): en una carga en frío con
// `?zona=…&ruta=…` las dos aparecían a la vez y la hoja tapaba media ficha. Al cerrarse la
// ficha la hoja vuelve sola, porque la zona sigue en la URL.
const hojaModel = computed<boolean>({
  get: () => hojaAbierta.value && !fichaAbierta.value,
  set: (abierta) => {
    if (!abierta && !fichaAbierta.value) cerrarPanel();
  },
});

const alturaFigura = computed<number>(() => {
  if (!esMovil.value) return ALTO_FIGURA_ESCRITORIO;
  return hojaAbierta.value ? ALTO_FIGURA_CON_HOJA : ALTO_FIGURA;
});

const regionesVisibles = computed<RegionVista[]>(() => {
  const regiones = anatomyStore.vista?.regiones ?? [];
  if (!esMovil.value) return regiones;
  return regiones.filter((r) => r.vista === 'both' || r.vista === vista.value);
});

/** Vista en la que se toca una región desde la lista: la actual si se ve de los dos lados. */
function vistaDeRegion(v: Vista): VistaUnica {
  if (v === 'front' || v === 'back') return v;
  return vista.value;
}

/** La URL manda la vista: si no trae `vista` y la zona vive en un solo lado, se gira a ese. */
function sincronizarVista(): void {
  const qv = unico(route.query.vista);
  if (qv === 'front' || qv === 'back') {
    vista.value = qv;
    return;
  }
  const slug = zonaSel.value;
  if (!slug) return;
  const region = anatomyStore.vista?.regiones.find((r) => r.slug === slug);
  if (region && region.vista !== 'both') vista.value = region.vista;
}

function girar(key: VistaUnica): void {
  vista.value = key;
}

/** La query sin lo que pertenece a la hoja (zona, vista, músculo). Conserva `ruta` y lo demás. */
function sinPanel(q: LocationQuery): LocationQuery {
  const resto: LocationQuery = { ...q };
  delete resto.zona;
  delete resto.vista;
  delete resto.musculo;
  return resto;
}

function onSelectZone(slug: string, v: VistaUnica): void {
  vista.value = v;
  hojaEntera.value = false;
  const base = sinPanel(route.query);
  delete base.ruta;
  void router.push({ query: { ...base, zona: slug, vista: v } });
}

function onSelectMusculo(id: string): void {
  hojaEntera.value = false;
  const base = sinPanel(route.query);
  delete base.ruta;
  void router.push({ query: { ...base, musculo: id } });
}

// Cerrar no apila historial: el back sigue yendo a lo que había antes de abrir.
function cerrarPanel(): void {
  hojaEntera.value = false;
  void router.replace({ query: sinPanel(route.query) });
}

function onOpenRuta(slug: string): void {
  fichaPorPush = true;
  void router.push({ query: { ...route.query, ruta: slug } });
}

function quitarRuta(): void {
  const resto: LocationQuery = { ...route.query };
  delete resto.ruta;
  void router.replace({ query: resto });
}

// Cerrar la ficha: back si la abrimos con push; si llegó por link directo, replace sin `ruta`.
function cerrarFicha(): void {
  if (fichaPorPush) {
    fichaPorPush = false;
    router.back();
    return;
  }
  quitarRuta();
}

function onFichaModel(abierta: boolean): void {
  if (!abierta) cerrarFicha();
}

async function cargar(): Promise<void> {
  await anatomyStore.cargar();
  intentado.value = true;
}

function reintentar(): void {
  void cargar();
}

watch(
  [() => route.query.zona, () => route.query.vista, () => anatomyStore.vista],
  sincronizarVista,
  {
    immediate: true,
  }
);

// `?ruta=` con un slug que no existe: no abre nada y se limpia de la URL (T-200-33).
watch(
  [() => route.query.ruta, () => anatomyStore.vista],
  ([ruta, vistaCargada]) => {
    if (!ruta) {
      fichaPorPush = false;
      return;
    }
    if (vistaCargada && rutaSel.value === null) quitarRuta();
  },
  { immediate: true }
);

// Al abrir la hoja se asegura que el cuerpo (ya achicado) quede a la vista.
watch(hojaAbierta, (abierta) => {
  if (!abierta || !esMovil.value) return;
  void nextTick(() => figwrap.value?.scrollIntoView({ block: 'nearest', behavior: 'auto' }));
});

onMounted(() => {
  void cargar();
});
</script>

<style lang="scss" scoped>
@import 'src/css/anatomia';

.anatomia {
  background: $anat-page;
  color: $anat-ink;
  padding: 12px 16px 24px;
}

// Con la hoja abierta (media pantalla) el cuerpo tiene que poder scrollear por encima de ella.
.anatomia--hoja {
  padding-bottom: 52vh;
}

.anatomia__col {
  max-width: 480px;
  margin: 0 auto;
}

.anatomia__col--ancha {
  max-width: 1100px;
}

.anatomia__kicker {
  margin: 0 0 4px;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: $anat-ink-2;
}

.anatomia__title {
  margin: 0 0 2px;
  font-size: 21px;
  line-height: 1.15;
  font-weight: 700;
}

.anatomia__lead {
  margin: 0 0 10px;
  font-size: 13px;
  color: $anat-ink-2;
}

.anatomia__estado {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 48px 0;
}

.anatomia__estado-texto {
  margin: 0;
  font-size: 14px;
  color: $anat-ink-2;
  text-align: center;
}

.anatomia__spinner {
  color: $anat-terra;
}

.anatomia__retry {
  min-height: 44px;
  padding: 0 20px;
  border: 0;
  border-radius: 999px;
  background: $anat-terra;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

// Escritorio: cuerpo a la izquierda, panel a la derecha (019 ronda 1, B)
.anatomia__grilla {
  display: grid;
  grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;

  > * {
    min-width: 0;
  }
}

.anatomia__cuerpo--fijo {
  position: sticky;
  top: 12px;
}

.anatomia__panel {
  padding: 16px;
  border: 1px solid $anat-line;
  border-radius: 12px;
  background: #fff;
}

.anatomia__panel-vacio {
  margin: 0;
  padding: 24px 0;
  font-size: 14px;
  color: $anat-ink-2;
  text-align: center;
}

// Frente / Espalda (sketch 019 ronda 2, B2)
.anatomia__flip {
  display: flex;
  width: max-content;
  margin: 8px auto 6px;
  padding: 3px;
  border-radius: 999px;
  background: $anat-base;
}

.anatomia__flip-btn {
  min-width: 44px;
  min-height: 44px;
  padding: 0 20px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  font-size: 13.5px;
  color: $anat-ink-2;
  cursor: pointer;
}

.anatomia__flip-btn--on {
  background: #fff;
  color: $anat-ink;
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.anatomia__figwrap {
  width: 100%;
}

// Lista de zonas para teclado y lector de pantalla: invisible hasta que algo recibe el foco
.anatomia__zonas:not(:focus-within) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.anatomia__zonas-lista {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.anatomia__zona-btn,
.anatomia__chip {
  @include anat-chip;

  position: relative;
  max-width: 100%;
  padding: 5px 12px;
  font-size: 13px;
  white-space: normal;
  text-align: left;
  cursor: pointer;

  // Hitbox de 44 px (alto del chip ~29 px)
  &::after {
    content: '';
    position: absolute;
    inset: -8px -2px;
  }

  &:hover {
    border-color: $anat-terra;
    color: $anat-terra;
  }
}

.anatomia__chip--on {
  border-color: $anat-terra;
  background: $anat-terra;
  color: #fff;

  &:hover {
    color: #fff;
  }
}

// Músculos profundos (D10): chips debajo del cuerpo
.anatomia__profundos {
  margin-top: 8px;
}

.anatomia__profundos-kicker {
  margin: 0 0 6px;
  font-size: 12px;
  color: $anat-ink-2;
}

.anatomia__ficha {
  overflow: hidden;
  background: $anat-page;
}

// Escritorio: panel a la derecha de alto completo (pisa los máximos de q-dialog minimizado)
.anatomia__ficha--lado {
  width: min(720px, 70vw);
  max-width: none;
  height: 100vh;
  max-height: 100vh;
  border-radius: 0;
}

.anatomia__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 6px;
}
</style>
