<template>
  <div class="rficha">
    <button type="button" class="rficha__back" @click="emit('volver')">← {{ volverA }}</button>

    <div class="rficha__col">
      <header class="rficha__hd">
        <div class="rficha__hd-tit">
          <p class="rficha__kicker">{{ kicker }}</p>
          <h1 class="rficha__h1">{{ ruta.nombre }}</h1>
        </div>
        <div class="rficha__meta">
          <span v-if="mostrarCodigo" class="rficha__chip rficha__chip--code">{{ ruta.code }}</span>
          <span class="rficha__chip">{{ textoEjercicios }}</span>
          <span v-if="ficha" class="rficha__chip">{{ ficha.tipo }}</span>
          <span v-if="ficha && ficha.brazo" class="rficha__chip">{{ ficha.brazo }}</span>
          <span
            class="rficha__chip rficha__chip--draft"
            tabindex="0"
            role="note"
            :aria-label="`Borrador · sin validar. ${TEXTO_BORRADOR}`"
          >
            Borrador · sin validar
            <q-tooltip anchor="bottom middle" self="top middle" max-width="260px">
              {{ TEXTO_BORRADOR }}
            </q-tooltip>
          </span>
        </div>
      </header>

      <template v-if="secciones">
        <p v-if="secciones.resumen.datos" class="rficha__res">
          {{ secciones.resumen.datos.t }}<MarcaEvidencia :marcas="secciones.resumen.datos.c" />
        </p>
        <p v-else-if="secciones.resumen.pend" class="rficha__nota rficha__nota--res">
          {{ textoPendiente(secciones.resumen.pend) }}
        </p>

        <nav class="rficha__secnav" aria-label="Secciones de la ficha">
          <button v-for="s in navSecciones" :key="s.id" type="button" @click="irA(s.id)">
            {{ s.titulo }}
          </button>
        </nav>
      </template>

      <div class="rficha__grid">
        <aside class="rficha__figcol">
          <AnatomyFigure view="both" :roles="rolesFigura" :max-height="alturaFigura" />

          <div class="rficha__legend" aria-label="Leyenda de roles">
            <span v-for="l in LEYENDA" :key="l.rol" class="rficha__leg">
              <i class="rficha__sw" :class="`rficha__sw--${l.rol}`" aria-hidden="true" />{{
                l.texto
              }}
            </span>
          </div>

          <GlosarioRoles />

          <p v-if="ruta.sinDibujo.length > 0" class="rficha__nota">
            No están en el dibujo:
            <template v-for="(s, i) in ruta.sinDibujo" :key="s.m"
              ><template v-if="i > 0">, </template><b>{{ s.nombre }}</b> ({{
                tituloRol(s.rol).toLowerCase()
              }})</template
            >.
          </p>
          <p v-if="grupoNota" class="rficha__nota">
            Cada zona puede agrupar músculos: <b>{{ grupoNota.zona }}</b> =
            {{ grupoNota.musculos }}. El detalle está en la tabla.
          </p>
        </aside>

        <div class="rficha__main">
          <!-- Sin ficha: músculos por rol + "en preparación" -->
          <template v-if="!ficha">
            <section class="rficha__card">
              <h2 class="rficha__h2">Músculos por rol</h2>
              <div v-for="g in rolesConMusculos" :key="g.rol" class="rficha__grp">
                <b>{{ g.titulo }}</b>
                <span v-for="(m, i) in g.musculos" :key="m.m"
                  ><template v-if="i > 0"> · </template>{{ m.nombre }}<MarcaEvidencia :marcas="m.c"
                /></span>
              </div>
              <p v-if="rolesConMusculos.length === 0" class="rficha__muted">
                Sin músculos cargados para esta ruta.
              </p>
            </section>
            <section class="rficha__card rficha__prep">
              <p class="rficha__prep-t">
                <b>Ficha en preparación:</b> fases, articulaciones, progresión, cues y banderas de
                {{ ruta.nombre }}.
              </p>
              <p class="rficha__prep-s">
                La investigación ya tiene el análisis; falta pasarlo al formato de ficha.
              </p>
            </section>
          </template>

          <template v-else-if="secciones">
            <!-- Articulaciones y músculos -->
            <section :ref="(el) => setSec('musculos', el)" class="rficha__card">
              <h2 class="rficha__h2">Articulaciones y músculos</h2>
              <table v-if="secciones.articulaciones.datos" class="rficha__tbl">
                <thead>
                  <tr>
                    <th>Articulación</th>
                    <th>Acción</th>
                    <th>Músculos y rol</th>
                    <th>Contracción</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(fila, i) in secciones.articulaciones.datos" :key="i">
                    <td>{{ fila.articulacion }}</td>
                    <td>{{ fila.accion }}</td>
                    <td>{{ fila.musculos }}<MarcaEvidencia :marcas="fila.c" /></td>
                    <td class="rficha__td-k">{{ fila.contraccion }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-else-if="secciones.articulaciones.pend" class="rficha__nota">
                {{ textoPendiente(secciones.articulaciones.pend) }}
              </p>
              <p class="rficha__muted rficha__muted--chico">
                C concéntrica · E excéntrica · I isométrica. {{ ficha.evidencia.t
                }}<MarcaEvidencia :marcas="ficha.evidencia.c" />
              </p>
            </section>

            <!-- Fases -->
            <section :ref="(el) => setSec('fases', el)" class="rficha__card">
              <h2 class="rficha__h2">Fases</h2>
              <ul v-if="secciones.fases.datos" class="rficha__lista">
                <li v-for="(fase, i) in secciones.fases.datos" :key="i">
                  <b>{{ fase.nombre }}.</b> {{ fase.texto.t
                  }}<MarcaEvidencia :marcas="fase.texto.c" />
                </li>
              </ul>
              <p v-else-if="secciones.fases.pend" class="rficha__nota">
                {{ textoPendiente(secciones.fases.pend) }}
              </p>
            </section>

            <!-- Por qué progresa -->
            <section :ref="(el) => setSec('progresa', el)" class="rficha__card">
              <h2 class="rficha__h2">Por qué progresa</h2>
              <div v-if="secciones.escalones.datos" class="rficha__steps">
                <template v-for="(e, i) in secciones.escalones.datos" :key="i"
                  ><b v-if="i > 0" aria-hidden="true">→</b><span>{{ e }}</span></template
                >
              </div>
              <p v-else-if="secciones.escalones.pend" class="rficha__nota">
                {{ textoPendiente(secciones.escalones.pend) }}
              </p>
              <ul v-if="secciones.progresa.datos" class="rficha__lista">
                <li v-for="(p, i) in secciones.progresa.datos" :key="i">
                  {{ p.t }}<MarcaEvidencia :marcas="p.c" />
                </li>
              </ul>
              <p v-else-if="secciones.progresa.pend" class="rficha__nota">
                {{ textoPendiente(secciones.progresa.pend) }}
              </p>
            </section>

            <!-- Se siente / compensa -->
            <section :ref="(el) => setSec('siente', el)" class="rficha__card">
              <h2 class="rficha__h2">Dónde se siente</h2>
              <p v-if="secciones.siente.datos" class="rficha__p">
                {{ secciones.siente.datos.t }}<MarcaEvidencia :marcas="secciones.siente.datos.c" />
              </p>
              <p v-else-if="secciones.siente.pend" class="rficha__nota">
                {{ textoPendiente(secciones.siente.pend) }}
              </p>
              <h2 class="rficha__h2 rficha__h2--sep">Compensaciones típicas</h2>
              <div v-if="secciones.compensa.datos" class="rficha__comp">
                <div v-for="(c, i) in secciones.compensa.datos" :key="i">
                  <b>{{ c.error }}</b
                  >{{ c.porque.t }}<MarcaEvidencia :marcas="c.porque.c" />
                </div>
              </div>
              <p v-else-if="secciones.compensa.pend" class="rficha__nota">
                {{ textoPendiente(secciones.compensa.pend) }}
              </p>
            </section>

            <!-- Cues -->
            <section :ref="(el) => setSec('cues', el)" class="rficha__card">
              <h2 class="rficha__h2">Cues</h2>
              <template v-if="secciones.cues.datos">
                <div v-for="(q, i) in secciones.cues.datos" :key="i" class="rficha__cue">
                  “{{ q.t }}”<MarcaEvidencia :marcas="q.c" />
                </div>
              </template>
              <p v-else-if="secciones.cues.pend" class="rficha__nota">
                {{ textoPendiente(secciones.cues.pend) }}
              </p>
            </section>

            <!-- Cuándo derivar -->
            <section :ref="(el) => setSec('banderas', el)" class="rficha__card">
              <h2 class="rficha__h2">Cuándo derivar al kinesiólogo</h2>
              <template v-if="secciones.banderasRuta.datos">
                <div
                  v-for="(b, i) in secciones.banderasRuta.datos"
                  :key="`r${i}`"
                  class="rficha__flag"
                  :class="`rficha__flag--${b.nivel}`"
                >
                  {{ b.texto.t }}<MarcaEvidencia :marcas="b.texto.c" />
                </div>
              </template>
              <p v-else-if="secciones.banderasRuta.pend" class="rficha__nota">
                {{ textoPendiente(secciones.banderasRuta.pend) }}
              </p>
              <template v-for="g in banderasPorNivel" :key="g.nivel">
                <h3 class="rficha__h3">{{ g.titulo }}</h3>
                <div
                  v-for="b in g.items"
                  :key="b.id"
                  class="rficha__flag"
                  :class="`rficha__flag--${b.nivel}`"
                >
                  {{ b.senal }} → {{ b.accion }}
                  <small>
                    {{ b.fuente }}<template v-if="b.umbralH"> · umbral a validar (⚑H)</template>
                  </small>
                </div>
              </template>
            </section>

            <!-- Ejercicios -->
            <section :ref="(el) => setSec('gestos', el)" class="rficha__card">
              <h2 class="rficha__h2">Ejercicios</h2>
              <div v-if="ficha.gestos.length > 0" class="rficha__gestos">
                <span v-for="g in ficha.gestos" :key="g" class="rficha__chip">{{ g }}</span>
              </div>
              <ul
                v-if="ruta.ejercicios.length > 0"
                class="rficha__ejs"
                :class="{ 'rficha__ejs--scroll': ruta.ejercicios.length > 20 }"
              >
                <li v-for="(e, i) in ruta.ejercicios" :key="i">{{ e }}</li>
              </ul>
              <p v-else class="rficha__muted">Sin ejercicios en el catálogo.</p>
            </section>

            <!-- Falta validar -->
            <section
              v-if="ficha.pendientes.length > 0"
              :ref="(el) => setSec('pendientes', el)"
              class="rficha__card"
            >
              <h2 class="rficha__h2">Falta validar</h2>
              <p v-for="(p, i) in ficha.pendientes" :key="i" class="rficha__nota">
                {{ textoPendiente(p) }}
              </p>
            </section>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Fase 200 D11: ficha de ruta del admin (sketch 019 B2). Encabezado, resumen, figura pintada por
 * rol, glosario y las secciones de la ficha con su marca de evidencia. Si la ruta no tiene ficha
 * (`fichaProfe === null`) muestra los músculos por rol y "Ficha en preparación". Una sección
 * `Pendiente` dice qué falta y quién lo resuelve. Todo texto va con `{{ }}` (T-200-34): sin HTML.
 */
import { computed } from 'vue';
import { useQuasar } from 'quasar';
import AnatomyFigure from 'components/anatomy/AnatomyFigure.vue';
import GlosarioRoles from 'components/anatomy/GlosarioRoles.vue';
import MarcaEvidencia from 'components/anatomy/MarcaEvidencia.vue';
import { useAnatomyStore } from 'stores/useAnatomyStore';
import { esPendiente } from 'src/types/anatomy';
import type {
  BanderaProfe,
  FichaProfeVista,
  NivelBandera,
  Patron,
  Pendiente,
  QuienResuelve,
  RelacionVista,
  Rol,
  RutaProfe,
  Seccion,
} from 'src/types/anatomy';

const props = defineProps<{
  ruta: RutaProfe;
  /** Texto del back: nombre de la zona o "Anatomía". */
  volverA: string;
}>();

const emit = defineEmits<{ volver: [] }>();

const $q = useQuasar();
const anatomyStore = useAnatomyStore();

const TEXTO_BORRADOR =
  'Revisado por agente kinesiólogo. Falta kinesiólogo humano. No mostrar a alumnos.';

const PATRON_LEGIBLE: Record<Patron, string> = {
  PUSH: 'Push',
  PULL: 'Pull',
  LOWER: 'Lower',
  CORE: 'Core',
  MOVILIDAD: 'Movilidad',
  FLOW: 'Flow',
};

const ORDEN_ROLES: readonly Rol[] = [
  'motor',
  'sinergista',
  'estabilizador',
  'antagonista',
  'estira',
];

const LEYENDA: { rol: Rol; texto: string }[] = [
  { rol: 'motor', texto: 'Motor' },
  { rol: 'sinergista', texto: 'Sinergista' },
  { rol: 'estabilizador', texto: 'Estabilizador' },
  { rol: 'estira', texto: 'Se estira / antagonista' },
];

const QUIEN: Record<QuienResuelve, string> = {
  H: 'kinesiólogo humano (⚑H)',
  N: 'Nacho (⚑N)',
  fuente: 'sin fuente en la investigación',
};

const NIVELES: { nivel: NivelBandera; titulo: string }[] = [
  { nivel: 'urgencia', titulo: 'Urgencia: cortar y derivar el mismo día' },
  { nivel: 'derivar', titulo: 'Derivar' },
  { nivel: 'precaucion', titulo: 'Antes de prescribir' },
];

// Figura chica en el celular (la grilla pasa a una columna), más alta con la columna de 250 px.
const alturaFigura = computed<number>(() => ($q.screen.width < 672 ? 230 : 360));

const ficha = computed<FichaProfeVista | null>(() => props.ruta.fichaProfe);

const kicker = computed<string>(
  () => `${PATRON_LEGIBLE[props.ruta.patron]} · ${props.ruta.categoria}`
);

// El código solo se muestra si difiere del nombre (en mayúsculas).
const mostrarCodigo = computed<boolean>(
  () => props.ruta.code.toUpperCase() !== props.ruta.nombre.toUpperCase()
);

const textoEjercicios = computed<string>(() => {
  const n = props.ruta.nEjercicios;
  return n === 1 ? '1 ejercicio' : `${n} ejercicios`;
});

function tituloRol(rol: Rol): string {
  return anatomyStore.vista?.glosario.roles.find((r) => r.rol === rol)?.titulo ?? rol;
}

function textoPendiente(p: Pendiente): string {
  return `Pendiente: ${p.pendiente} · ${QUIEN[p.quien]}`;
}

interface Resuelta<T> {
  datos: T | null;
  pend: Pendiente | null;
}

/** Separa una sección con contenido de una pendiente (las dos nunca a la vez). */
function resolver<T>(s: Seccion<T>): Resuelta<T> {
  if (esPendiente(s)) return { datos: null, pend: s };
  return { datos: s, pend: null };
}

// `escalones` viaja como `string[] | Pendiente`, igual que una sección.
const secciones = computed(() => {
  const f = ficha.value;
  if (!f) return null;
  return {
    resumen: resolver(f.resumen),
    escalones: resolver(f.escalones),
    fases: resolver(f.fases),
    articulaciones: resolver(f.articulaciones),
    progresa: resolver(f.progresa),
    siente: resolver(f.siente),
    compensa: resolver(f.compensa),
    cues: resolver(f.cues),
    banderasRuta: resolver(f.banderasRuta),
  };
});

// ---- Figura: roles por zona (vista both → clave `slug`; si no, `slug@vista`) ----
const rolesFigura = computed<Record<string, Rol>>(() => {
  const out: Record<string, Rol> = {};
  for (const z of props.ruta.zonasFicha) {
    out[z.vista === 'both' ? z.slug : `${z.slug}@${z.vista}`] = z.rol;
  }
  return out;
});

// Aviso de grupo: la primera zona de la ficha cuya región agrupa más de un músculo.
const grupoNota = computed<{ zona: string; musculos: string } | null>(() => {
  const regiones = anatomyStore.vista?.regiones ?? [];
  for (const z of props.ruta.zonasFicha) {
    const region = regiones.find((r) => r.slug === z.slug);
    if (!region || region.musculos.length <= 1) continue;
    const nombres = region.musculos
      .map((id) => anatomyStore.musculoPorId(id)?.nombre.toLowerCase())
      .filter((n): n is string => typeof n === 'string');
    return { zona: region.nombre, musculos: nombres.join(' + ') };
  }
  return null;
});

// ---- Ruta sin ficha: músculos por rol ----
const rolesConMusculos = computed<{ rol: Rol; titulo: string; musculos: RelacionVista[] }[]>(() =>
  ORDEN_ROLES.filter((r) => props.ruta.relaciones[r].length > 0).map((r) => ({
    rol: r,
    titulo: tituloRol(r),
    musculos: props.ruta.relaciones[r],
  }))
);

// ---- Banderas del catálogo global, agrupadas por nivel ----
const banderasPorNivel = computed<{ nivel: NivelBandera; titulo: string; items: BanderaProfe[] }[]>(
  () => {
    const catalogo = anatomyStore.vista?.banderas ?? [];
    const propias = catalogo.filter((b) => props.ruta.banderaIds.includes(b.id));
    return NIVELES.map((n) => ({
      nivel: n.nivel,
      titulo: n.titulo,
      items: propias.filter((b) => b.nivel === n.nivel),
    })).filter((g) => g.items.length > 0);
  }
);

// ---- Navegación por secciones ----
const navSecciones = computed<{ id: string; titulo: string }[]>(() => {
  const nav = [
    { id: 'musculos', titulo: 'Músculos' },
    { id: 'fases', titulo: 'Fases' },
    { id: 'progresa', titulo: 'Por qué progresa' },
    { id: 'siente', titulo: 'Se siente / compensa' },
    { id: 'cues', titulo: 'Cues' },
    { id: 'banderas', titulo: 'Cuándo derivar' },
    { id: 'gestos', titulo: 'Ejercicios' },
  ];
  if ((ficha.value?.pendientes.length ?? 0) > 0)
    nav.push({ id: 'pendientes', titulo: 'Falta validar' });
  return nav;
});

const secEls = new Map<string, HTMLElement>();

function setSec(id: string, el: unknown): void {
  if (el instanceof HTMLElement) secEls.set(id, el);
  else secEls.delete(id);
}

function irA(id: string): void {
  const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  secEls.get(id)?.scrollIntoView({ behavior: reducido ? 'auto' : 'smooth', block: 'start' });
}
</script>

<style lang="scss" scoped>
@import 'src/css/anatomia';

// Colores propios de la ficha (sketch 019 base.css): borrador, código y banderas
$ficha-neg: #b34a4a;
$ficha-neg-bg: #fbf1f0;
$ficha-warn-bg: #fbf7e6;
$ficha-warn-line: #e3d6a8;
$ficha-code-bg: #fbf4ee;
$ficha-code-line: #e6cbb8;
$ficha-card-line: #f0e8dc;

.rficha {
  height: 100%;
  overflow-y: auto;
  background: $anat-page;
  color: $anat-ink;
  container-type: inline-size;
}

.rficha__col {
  padding: 0 16px 40px;
}

// "← <zona>" pegado arriba (ronda 2, .fp .back)
.rficha__back {
  position: sticky;
  top: 0;
  z-index: 5;
  display: block;
  width: 100%;
  min-height: 44px;
  padding: 0 16px;
  border: 0;
  border-bottom: 1px solid $anat-line;
  background: $anat-page;
  font-size: 14px;
  font-weight: 600;
  text-align: left;
  color: $anat-terra;
  cursor: pointer;
}

.rficha__hd {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: flex-end;
  justify-content: space-between;
  margin: 14px 0 12px;
}

.rficha__hd-tit {
  min-width: 0;
}

.rficha__kicker {
  margin: 0 0 4px;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: $anat-ink-2;
}

.rficha__h1 {
  margin: 0;
  font-size: 22px;
  line-height: 1.15;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.rficha__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.rficha__chip {
  @include anat-chip;
}

.rficha__chip--code {
  font-weight: 700;
  color: $anat-terra;
  border-color: $ficha-code-line;
  background: $ficha-code-bg;
}

.rficha__chip--draft {
  color: $anat-warn;
  border-color: $ficha-warn-line;
  background: $ficha-warn-bg;
  cursor: help;

  &:focus-visible {
    outline: 2px solid $anat-terra;
    outline-offset: 1px;
  }
}

.rficha__res {
  max-width: 70ch;
  margin: 0 0 14px;
  font-size: 15px;
  line-height: 1.5;
}

// Chips de sección: pegados bajo el "← zona"
.rficha__secnav {
  position: sticky;
  top: 44px;
  z-index: 4;
  display: flex;
  gap: 6px;
  margin: 0 -16px 6px;
  padding: 8px 16px;
  overflow-x: auto;
  background: $anat-page;
  scrollbar-width: none;

  button {
    flex: none;
    min-height: 36px;
    padding: 5px 12px;
    border: 1px solid $anat-line;
    border-radius: 999px;
    background: #fff;
    font-size: 13px;
    white-space: nowrap;
    color: $anat-ink;
    cursor: pointer;

    &:hover {
      border-color: $anat-terra;
      color: $anat-terra;
    }
  }
}

.rficha__grid {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  gap: 18px;
  align-items: start;

  > * {
    min-width: 0;
  }
}

.rficha__figcol {
  position: sticky;
  top: 100px;
}

.rficha__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  justify-content: center;
  margin-top: 8px;
  font-size: 12px;
  color: $anat-ink-2;
}

.rficha__sw {
  display: inline-block;
  width: 11px;
  height: 11px;
  margin-right: 5px;
  border-radius: 3px;
  vertical-align: -1px;
}

.rficha__sw--motor {
  background: $anat-r-motor;
}

.rficha__sw--sinergista {
  background: $anat-r-sinergista;
}

.rficha__sw--estabilizador {
  background: $anat-r-estabilizador;
}

.rficha__sw--estira,
.rficha__sw--antagonista {
  border: 1.5px dashed $anat-terra;
  background: $anat-r-estira;
}

.rficha__nota {
  margin: 10px 0 0;
  padding: 8px 10px;
  border: 1px dashed $anat-line;
  border-radius: 8px;
  background: $anat-soft;
  font-size: 12px;
  line-height: 1.4;
  color: $anat-ink-2;
}

.rficha__nota--res {
  margin: 0 0 14px;
}

.rficha__card {
  margin-bottom: 14px;
  padding: 16px;
  border: 1px solid $anat-line;
  border-radius: 12px;
  background: #fff;
  // Con el back (44) y los chips de sección (~52) pegados arriba
  scroll-margin-top: 104px;

  .rficha__nota:first-of-type {
    margin-top: 0;
  }
}

.rficha__h2 {
  margin: 0 0 10px;
  font-size: 17px;
  font-weight: 700;
}

.rficha__h2--sep {
  margin-top: 14px;
}

.rficha__h3 {
  margin: 12px 0 6px;
  font-size: 13px;
  font-weight: 700;
  color: $anat-ink-2;
}

.rficha__p {
  margin: 0 0 4px;
  font-size: 14px;
  line-height: 1.5;
}

.rficha__muted {
  margin: 8px 0 0;
  font-size: 14px;
  color: $anat-ink-2;
}

.rficha__muted--chico {
  font-size: 12px;
}

.rficha__grp {
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.45;

  b {
    display: inline-block;
    min-width: 110px;
    margin-right: 6px;
  }
}

.rficha__prep {
  text-align: center;
  padding: 22px;
  color: $anat-ink-2;
}

.rficha__prep-t {
  margin: 0;
  font-size: 14px;
}

.rficha__prep-s {
  margin: 6px 0 0;
  font-size: 12px;
}

// Tabla articular (escritorio)
.rficha__tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;

  th {
    padding: 6px 8px;
    border-bottom: 1px solid $anat-line;
    font-size: 12px;
    font-weight: 600;
    text-align: left;
    color: $anat-ink-2;
  }

  td {
    padding: 8px;
    border-bottom: 1px solid $ficha-card-line;
    vertical-align: top;
    line-height: 1.4;
  }

  td:first-child {
    font-weight: 600;
  }

  td:nth-child(2) {
    width: 24%;
  }

  td:nth-child(3) {
    width: 50%;
  }
}

.rficha__lista {
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
  line-height: 1.55;

  li {
    margin-bottom: 4px;
  }
}

.rficha__steps {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  margin-bottom: 10px;
  font-size: 13px;

  span {
    padding: 3px 8px;
    border: 1px solid $anat-line;
    border-radius: 6px;
    background: $anat-soft;
  }

  b {
    font-weight: 400;
    color: $anat-ink-2;
  }
}

.rficha__comp {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;

  > div {
    padding: 9px 11px;
    border-radius: 8px;
    background: $anat-soft;
    font-size: 14px;
    line-height: 1.4;
  }

  b {
    display: block;
    margin-bottom: 2px;
  }
}

.rficha__cue {
  padding: 6px 0;
  border-bottom: 1px dashed $anat-line;
  font-size: 14px;
  font-style: italic;

  &:last-of-type {
    border: 0;
  }
}

.rficha__flag {
  margin-bottom: 6px;
  padding: 8px 11px;
  border-left: 3px solid $ficha-neg;
  border-radius: 0 8px 8px 0;
  background: $ficha-neg-bg;
  font-size: 14px;
  line-height: 1.4;

  small {
    display: block;
    margin-top: 2px;
    font-size: 12px;
    color: $anat-ink-2;
  }
}

// Las de "Antes de prescribir" no cortan la clase: borde ámbar
.rficha__flag--precaucion {
  border-left-color: $anat-warn;
  background: $ficha-warn-bg;
}

.rficha__gestos {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.rficha__ejs {
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
  line-height: 1.5;
}

.rficha__ejs--scroll {
  max-height: 320px;
  overflow-y: auto;
}

// Angosto (celular): una columna, figura arriba sin sticky, tabla en bloques apilados
@container (max-width: 640px) {
  .rficha__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .rficha__figcol {
    position: static;
  }

  .rficha__tbl thead {
    display: none;
  }

  .rficha__tbl tr {
    display: block;
    padding: 6px 0;
    border-bottom: 1px solid $anat-line;
  }

  .rficha__tbl td {
    display: block;
    width: auto !important;
    padding: 2px 0;
    border: 0;
  }

  .rficha__td-k::before {
    content: 'Contracción: ';
    color: $anat-ink-2;
  }
}
</style>
