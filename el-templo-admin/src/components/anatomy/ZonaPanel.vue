<template>
  <div class="zpanel">
    <template v-if="modo === 'musculo'">
      <template v-if="musculoProfundo">
        <p class="zpanel__kicker">No está en el dibujo</p>
        <h2 class="zpanel__titulo">{{ musculoProfundo.nombre }}</h2>
        <p class="zpanel__aviso">
          Es un músculo profundo: el dibujo no lo puede mostrar. Se nombra en las fichas de cada
          ruta.
        </p>
        <MusculoRoles
          :musculo="musculoProfundo"
          :mostrar-nombre="false"
          @open-ruta="(slug) => emit('open-ruta', slug)"
        />
      </template>
      <p v-else class="zpanel__vacio">Sin músculos cargados para esta zona.</p>
    </template>

    <template v-else>
      <p class="zpanel__kicker">Zona del dibujo</p>
      <h2 class="zpanel__titulo">{{ nombreZona }}</h2>
      <p v-if="esGrupo" class="zpanel__aviso">
        <strong>Esta zona es un grupo</strong>: el dibujo pinta igual a {{ nombresEnLinea }}. Abajo,
        cada uno por separado.
      </p>
      <MusculoRoles
        v-for="m in musculosZona"
        :key="m.id"
        :musculo="m"
        :mostrar-nombre="mostrarNombre"
        @open-ruta="(slug) => emit('open-ruta', slug)"
      />
      <p v-if="musculosZona.length === 0" class="zpanel__vacio">
        Sin músculos cargados para esta zona.
      </p>
    </template>

    <p class="zpanel__pie">
      Tocá una ruta para abrir su ficha. Tocá la (i) para ver qué significa cada rol.
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * Fase 200 D8/D10: contenido de la hoja (celular) y de la card (escritorio). Dos modos: una zona
 * del dibujo con los músculos que agrupa, o un músculo profundo que el dibujo no muestra.
 * Lee todo del store; la página decide cuál de los dos pasar (y valida contra el store, T-200-33).
 */
import { computed } from 'vue';
import MusculoRoles from 'components/anatomy/MusculoRoles.vue';
import { useAnatomyStore } from 'stores/useAnatomyStore';
import type { MusculoProfe } from 'src/types/anatomy';

const props = defineProps<{
  zona: string | null;
  musculoId: string | null;
}>();

const emit = defineEmits<{ 'open-ruta': [slug: string] }>();

const anatomyStore = useAnatomyStore();

const modo = computed<'zona' | 'musculo'>(() => (props.musculoId ? 'musculo' : 'zona'));

const musculoProfundo = computed<MusculoProfe | null>(() => {
  if (!props.musculoId) return null;
  return anatomyStore.musculoPorId(props.musculoId) ?? null;
});

const region = computed(() => {
  const slug = props.zona;
  if (!slug) return null;
  return anatomyStore.vista?.regiones.find((r) => r.slug === slug) ?? null;
});

const nombreZona = computed<string>(() => region.value?.nombre ?? 'Zona');

const musculosZona = computed<MusculoProfe[]>(() =>
  props.zona ? anatomyStore.musculosDeZona(props.zona) : []
);

// D4: más de un músculo en la zona = "esta zona es un grupo".
const esGrupo = computed<boolean>(() => musculosZona.value.length > 1);

const nombresEnLinea = computed<string>(() =>
  musculosZona.value.map((m) => m.nombre.toLowerCase()).join(', ')
);

function normalizar(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// Zona con un solo músculo que se llama igual que la zona: el título ya lo dice, no se repite.
const mostrarNombre = computed<boolean>(() => {
  if (esGrupo.value) return true;
  const unico = musculosZona.value[0];
  if (!unico) return false;
  return normalizar(unico.nombre) !== normalizar(nombreZona.value);
});
</script>

<style lang="scss" scoped>
@import 'src/css/anatomia';

.zpanel {
  min-width: 0;
}

.zpanel__kicker {
  margin: 0 0 4px;
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: $anat-ink-2;
}

.zpanel__titulo {
  margin: 0 0 8px;
  font-size: 22px;
  line-height: 1.15;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.zpanel__aviso {
  margin: 0 0 6px;
  padding: 8px 10px;
  border: 1px dashed $anat-line;
  border-radius: 8px;
  background: $anat-soft;
  font-size: 12.5px;
  line-height: 1.4;
  color: $anat-ink-2;
}

.zpanel__vacio {
  margin: 12px 0;
  font-size: 14px;
  color: $anat-ink-2;
}

.zpanel__pie {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: $anat-ink-2;
}
</style>
