<template>
  <section class="mroles">
    <h3 v-if="mostrarNombre" class="mroles__nombre">{{ musculo.nombre }}</h3>
    <div
      v-if="etiquetas.length > 0"
      class="mroles__tags"
      :class="{ 'mroles__tags--solo': !mostrarNombre }"
    >
      <span v-for="e in etiquetas" :key="e" class="mroles__prec">{{ e }}</span>
    </div>

    <template v-for="fila in filas" :key="fila.rol">
      <div class="mroles__fila" :class="`mroles__fila--${fila.rol}`">
        <button
          type="button"
          class="mroles__rol"
          :class="{ 'mroles__rol--on': abierto(fila.rol) }"
          :aria-expanded="abierto(fila.rol)"
          :aria-controls="idDef(fila.rol)"
          @click="alternar(fila.rol)"
        >
          {{ fila.frase }}<span class="mroles__i" aria-hidden="true">i</span>
          <span class="mroles__sr">: qué significa</span>
        </button>
        <div class="mroles__chips">
          <button
            v-for="r in fila.rutas"
            :key="r.slug"
            type="button"
            class="mroles__chip"
            @click="emit('open-ruta', r.slug)"
          >
            {{ r.nombre }}<small v-if="r.mostrarCodigo">{{ r.code }}</small>
          </button>
        </div>
      </div>
      <div
        v-if="abierto(fila.rol)"
        :id="idDef(fila.rol)"
        class="mroles__def"
        :class="`mroles__def--${fila.rol}`"
      >
        <b>{{ fila.titulo }}:</b> {{ fila.definicion }} <i>{{ fila.ejemplo }}</i>
      </div>
    </template>

    <p v-if="filas.length === 0" class="mroles__vacio">
      Todavía no hay rutas cargadas para este músculo.
    </p>

    <p v-if="musculo.nota" class="mroles__nota">
      {{ musculo.nota.t }}<span v-if="marcasNota"> {{ marcasNota }}</span>
    </p>
  </section>
</template>

<script setup lang="ts">
/**
 * Fase 200 D8/D9/R3: un músculo con sus roles como frase ("Es motor en", "Estabiliza en"…) arriba
 * de sus rutas. Cada rol tiene una (i) que despliega su definición con un ejemplo (del glosario
 * del API, no hardcodeado). Las rutas van con nombre completo (getRouteLabel, ya resuelto en el
 * payload) + código chico, salvo que el código sea igual al nombre. Todo texto va con `{{ }}`.
 */
import { computed, ref } from 'vue';
import { useAnatomyStore } from 'stores/useAnatomyStore';
import type { MusculoProfe, Precision, Rol } from 'src/types/anatomy';

const props = defineProps<{
  musculo: MusculoProfe;
  mostrarNombre: boolean;
}>();

const emit = defineEmits<{ 'open-ruta': [slug: string] }>();

// Orden de los roles en pantalla (= prioridad del modelo).
const ORDEN_ROLES: readonly Rol[] = [
  'motor',
  'sinergista',
  'estabilizador',
  'antagonista',
  'estira',
];

const PRECISION_TEXTO: Record<Precision, string> = {
  exacta: 'zona exacta',
  agrupada: 'zona agrupada',
  aproximada: 'zona aproximada',
};

const anatomyStore = useAnatomyStore();

interface RutaChip {
  slug: string;
  code: string;
  nombre: string;
  mostrarCodigo: boolean;
}

interface FilaRol {
  rol: Rol;
  frase: string;
  titulo: string;
  definicion: string;
  ejemplo: string;
  rutas: RutaChip[];
}

const filas = computed<FilaRol[]>(() => {
  const glosario = anatomyStore.vista?.glosario.roles ?? [];
  const filasRol: FilaRol[] = [];
  for (const rol of ORDEN_ROLES) {
    const rutas: RutaChip[] = [];
    for (const code of props.musculo.roles[rol] ?? []) {
      const ruta = anatomyStore.rutaPorCodigo(code);
      // Un código sin ruta en el store no se puede abrir: no se muestra un chip muerto.
      if (!ruta) continue;
      rutas.push({
        slug: ruta.slug,
        code: ruta.code,
        nombre: ruta.nombre,
        // R3: sin repetir el código si es igual al nombre (ej. "Manna" no, "HS" sí).
        mostrarCodigo: ruta.nombre.toUpperCase() !== ruta.code.toUpperCase(),
      });
    }
    // Un rol sin rutas no aparece (estado extremo: músculo sin rutas en ese rol).
    if (rutas.length === 0) continue;
    const def = glosario.find((g) => g.rol === rol);
    filasRol.push({
      rol,
      frase: def?.frase ?? rol,
      titulo: def?.titulo ?? rol,
      definicion: def?.definicion ?? '',
      ejemplo: def?.ejemplo ?? '',
      rutas,
    });
  }
  return filasRol;
});

// Precisión del dibujo y, solo si la región se ve de los dos lados, de qué lado se ve el músculo.
const etiquetas = computed<string[]>(() => {
  const out: string[] = [];
  if (props.musculo.precision) out.push(PRECISION_TEXTO[props.musculo.precision]);
  const zona = props.musculo.zona;
  if (zona && zona.vista !== 'both') {
    const region = anatomyStore.vista?.regiones.find((r) => r.slug === zona.slug);
    if (region?.vista === 'both') {
      out.push(zona.vista === 'front' ? 'se ve de frente' : 'se ve de espalda');
    }
  }
  return out;
});

// Marcas de evidencia como texto plano, no pegadas al texto: "· L1 · 4".
const marcasNota = computed<string>(() => {
  const c = props.musculo.nota?.c ?? [];
  return c.length > 0 ? `· ${c.join(' · ')}` : '';
});

const abiertos = ref<Rol[]>([]);

function abierto(rol: Rol): boolean {
  return abiertos.value.includes(rol);
}

function alternar(rol: Rol): void {
  abiertos.value = abierto(rol)
    ? abiertos.value.filter((r) => r !== rol)
    : [...abiertos.value, rol];
}

function idDef(rol: Rol): string {
  return `rol-def-${props.musculo.id}-${rol}`;
}
</script>

<style lang="scss" scoped>
@import 'src/css/anatomia';

.mroles {
  padding: 12px 0;
  border-top: 1px solid $anat-line;

  &:first-of-type {
    border-top: 0;
  }
}

.mroles__nombre {
  display: block;
  margin: 0 0 6px;
  font-size: 14.5px;
  line-height: 1.25;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.mroles__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 4px;
}

.mroles__tags--solo {
  margin-top: 0;
}

.mroles__prec {
  padding: 1px 6px;
  border: 1px solid $anat-line;
  border-radius: 6px;
  background: $anat-soft;
  font-size: 11px;
  color: $anat-ink-2;
}

.mroles__fila {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  margin: 8px 0;
  font-size: 13px;
}

.mroles__fila--motor {
  --c: #{$anat-r-motor};
  --b: 0;
}

.mroles__fila--sinergista {
  --c: #{$anat-r-sinergista};
  --b: 0;
}

.mroles__fila--estabilizador {
  --c: #{$anat-r-estabilizador};
  --b: 0;
}

.mroles__fila--antagonista,
.mroles__fila--estira {
  --c: #{$anat-r-estira};
  --b: 1.5px dashed #{$anat-terra};
}

.mroles__def--motor {
  --c: #{$anat-r-motor};
}

.mroles__def--sinergista {
  --c: #{$anat-r-sinergista};
}

.mroles__def--estabilizador {
  --c: #{$anat-r-estabilizador};
}

.mroles__def--antagonista,
.mroles__def--estira {
  --c: #{$anat-terra};
}

.mroles__rol {
  position: relative;
  padding: 2px 0;
  border: 0;
  background: none;
  font-size: 12.5px;
  font-weight: 600;
  color: $anat-ink-2;
  text-align: left;
  cursor: pointer;

  // Hitbox de 44 px sin agrandar el texto
  &::after {
    content: '';
    position: absolute;
    inset: -12px -8px;
  }

  &::before {
    content: '';
    display: inline-block;
    width: 9px;
    height: 9px;
    margin-right: 5px;
    border: var(--b, 0);
    border-radius: 2px;
    background: var(--c);
  }
}

.mroles__rol--on {
  color: $anat-terra;

  .mroles__i {
    background: $anat-terra;
    color: #fff;
  }
}

.mroles__i {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-left: 4px;
  border: 1.3px solid $anat-terra;
  border-radius: 50%;
  font:
    italic 600 10px/1 Georgia,
    serif;
  color: $anat-terra;
  vertical-align: 1px;
}

// Texto solo para lectores de pantalla
.mroles__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.mroles__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 6px;
  align-items: center;
  max-width: 100%;
}

.mroles__chip {
  @include anat-chip;

  position: relative;
  max-width: 100%;
  padding: 5px 11px;
  border-radius: 18px;
  font-size: 13px;
  line-height: 1.25;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
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

  small {
    margin-left: 5px;
    font-size: 10.5px;
    color: $anat-ink-2;
    opacity: 0.8;
  }
}

.mroles__def {
  margin: 0 0 8px;
  padding: 7px 10px;
  border-left: 3px solid var(--c, #{$anat-terra});
  border-radius: 0 8px 8px 0;
  background: $anat-soft;
  font-size: 12.5px;
  line-height: 1.45;

  i {
    color: $anat-ink-2;
  }
}

.mroles__vacio {
  margin: 8px 0 0;
  font-size: 13px;
  color: $anat-ink-2;
}

.mroles__nota {
  margin: 6px 0 0;
  font-size: 12.5px;
  line-height: 1.4;
  color: $anat-ink-2;
}
</style>
