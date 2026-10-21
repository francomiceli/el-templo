<template>
  <q-page class="anatomia">
    <div class="anatomia__col">
      <p class="anatomia__kicker">Anatomía · borrador</p>
      <h1 class="anatomia__title">Tocá una zona</h1>

      <div v-if="anatomyStore.loading" class="anatomia__estado" role="status">
        <q-spinner class="anatomia__spinner" size="32px" />
        <span class="anatomia__estado-texto">Cargando Anatomía…</span>
      </div>

      <div v-else-if="anatomyStore.error" class="anatomia__estado" role="alert">
        <p class="anatomia__estado-texto">{{ anatomyStore.error }}</p>
        <button type="button" class="anatomia__retry" @click="reintentar">Reintentar</button>
      </div>

      <template v-else-if="anatomyStore.vista">
        <div class="anatomia__flip" role="group" aria-label="Vista del cuerpo">
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

        <div class="anatomia__figwrap">
          <AnatomyFigure
            :view="vista"
            :selected="zonaSel"
            interactive
            :max-height="520"
            @select-zone="onSelectZone"
          />
        </div>
      </template>

      <p v-else-if="intentado" class="anatomia__estado-texto">
        Todavía no hay contenido de Anatomía para mostrar.
      </p>
    </div>
  </q-page>
</template>

<script setup lang="ts">
/**
 * Fase 200 D6/D7/R1: Admin › Anatomía. Base de la página: el cuerpo grande con el giro
 * Frente/Espalda y la zona tocada en la URL (`?zona=&vista=`), así el back del navegador vuelve.
 */
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { LocationQueryValue } from 'vue-router';
import AnatomyFigure from 'components/anatomy/AnatomyFigure.vue';
import { useAnatomyStore } from 'stores/useAnatomyStore';

type VistaUnica = 'front' | 'back';

const OPCIONES_VISTA: { key: VistaUnica; label: string }[] = [
  { key: 'front', label: 'Frente' },
  { key: 'back', label: 'Espalda' },
];

const route = useRoute();
const router = useRouter();
const anatomyStore = useAnatomyStore();

const vista = ref<VistaUnica>('front');
const zonaSel = ref<string | null>(null);
// Evita el parpadeo de "sin contenido" antes de que arranque la primera carga.
const intentado = ref(false);

function unico(v: LocationQueryValue | LocationQueryValue[] | undefined): string | null {
  const x = Array.isArray(v) ? v[0] : v;
  return typeof x === 'string' && x !== '' ? x : null;
}

/** La URL manda: zona y vista salen de la query (back/forward y deep links). */
function sincronizar(): void {
  zonaSel.value = unico(route.query.zona);
  const qv = unico(route.query.vista);
  if (qv === 'front' || qv === 'back') {
    vista.value = qv;
    return;
  }
  // Sin vista en la URL: si la zona vive en una sola vista, se gira a esa.
  const slug = zonaSel.value;
  if (!slug) return;
  const region = anatomyStore.vista?.regiones.find((r) => r.slug === slug);
  if (region && region.vista !== 'both') vista.value = region.vista;
}

function girar(key: VistaUnica): void {
  vista.value = key;
}

function onSelectZone(slug: string, v: VistaUnica): void {
  vista.value = v;
  // Fase 200 D8: la hoja se monta en el plan 200-12 (por ahora solo queda la zona en la URL).
  void router.push({ query: { ...route.query, zona: slug, vista: v } });
}

async function cargar(): Promise<void> {
  await anatomyStore.cargar();
  intentado.value = true;
}

function reintentar(): void {
  void cargar();
}

watch([() => route.query.zona, () => route.query.vista, () => anatomyStore.vista], sincronizar, {
  immediate: true,
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

.anatomia__col {
  max-width: 480px;
  margin: 0 auto;
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
</style>
