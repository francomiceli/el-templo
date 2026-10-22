<!--
  Catálogo de Conquer (fase 201, D-14, D-20, §8.1): lo que Nacho valida en la prueba sin tocar
  código. Sub-tabs: Escaleras (peldaños, más difícil arriba), Ejercicios (marca de brazos rectos,
  arranque de Toro, Novillo y Ternero, y zonas) y Plantillas (los días de 4, 3 y 2). El catálogo se
  carga una vez y cada mutación del API devuelve la vista actualizada, con la que se reemplaza la
  copia local; si algo falla se relee entero. Los q-tab-panel desmontan el panel inactivo: la
  pestaña carga en onMounted y recarga con `reloadToken`.
-->
<template>
  <div>
    <q-banner
      dense
      rounded
      class="bg-grey-3 text-accent q-mb-md"
      data-test="conquer-catalog-banner"
    >
      <template #avatar><q-icon name="rule" color="secondary" /></template>
      Las escaleras, el arranque de cada nivel, las zonas y las plantillas de 2 y 3 días son la
      propuesta de Nacho: se validan en la prueba.
    </q-banner>

    <div v-if="loading && !catalog" class="row justify-center q-pa-lg">
      <q-spinner color="secondary" size="32px" />
    </div>

    <q-banner v-else-if="loadError && !catalog" rounded class="bg-grey-3 text-accent">
      {{ loadError }}
      <template #action>
        <q-btn flat color="secondary" label="Reintentar" @click="load" />
      </template>
    </q-banner>

    <template v-else-if="catalog">
      <q-tabs
        v-model="subTab"
        dense
        align="left"
        no-caps
        active-color="secondary"
        indicator-color="secondary"
        class="q-mb-md"
      >
        <q-tab name="escaleras" label="Escaleras" />
        <q-tab name="ejercicios" label="Ejercicios" />
        <q-tab name="plantillas" label="Plantillas" />
      </q-tabs>

      <q-tab-panels v-model="subTab" animated>
        <q-tab-panel name="escaleras" class="q-pa-none">
          <q-list bordered separator class="rounded-borders">
            <q-expansion-item
              v-for="ladder in catalog.ladders"
              :key="ladder.id"
              :label="ladder.name"
              :caption="ladderCaption(ladder)"
              header-class="text-weight-medium"
              data-test="conquer-catalog-ladder"
            >
              <div class="q-pa-md">
                <ConquerLadderEditor
                  :ladder="ladder"
                  @changed="replaceLadder"
                  @failed="reloadQuietly"
                />
              </div>
            </q-expansion-item>
          </q-list>
        </q-tab-panel>

        <q-tab-panel name="ejercicios" class="q-pa-none">
          <q-list bordered separator class="rounded-borders">
            <q-expansion-item
              v-for="exercise in catalog.exercises"
              :key="exercise.id"
              :label="exercise.name"
              :caption="exerciseCaption(exercise)"
              header-class="text-weight-medium"
              data-test="conquer-catalog-exercise"
            >
              <div class="q-pa-md">
                <ConquerExerciseEditor
                  :exercise="exercise"
                  :ladder="ladderOf(exercise)"
                  :hold-ladder="holdLadderOf(exercise)"
                  :zones="catalog.zones"
                  @changed="replaceExercise"
                />
              </div>
            </q-expansion-item>
          </q-list>
        </q-tab-panel>

        <q-tab-panel name="plantillas" class="q-pa-none">
          <ConquerTemplateDays
            :template-days="catalog.templateDays"
            :exercises="catalog.exercises"
            @changed="replaceTemplateDay"
          />
        </q-tab-panel>
      </q-tab-panels>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import ConquerExerciseEditor from 'src/components/conquer/ConquerExerciseEditor.vue';
import ConquerLadderEditor from 'src/components/conquer/ConquerLadderEditor.vue';
import ConquerTemplateDays from 'src/components/conquer/ConquerTemplateDays.vue';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import type { AdminCatalog, AdminExercise, AdminLadder, AdminTemplateDay } from 'src/types/conquer';

const props = defineProps<{
  /** Sube cuando la página necesita que se relea el catálogo. */
  reloadToken: number;
}>();

const $q = useQuasar();
const conquerApi = useConquerAdminApi();

type SubTab = 'escaleras' | 'ejercicios' | 'plantillas';

const catalog = ref<AdminCatalog | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const subTab = ref<SubTab>('escaleras');

function ladderCaption(ladder: AdminLadder): string {
  const active = ladder.rungs.filter((r) => r.isActive).length;
  const total = ladder.rungs.length;
  return active === total ? `${total} peldaños` : `${active} activos de ${total} peldaños`;
}

function ladderOf(exercise: AdminExercise): AdminLadder | null {
  return catalog.value?.ladders.find((l) => l.id === exercise.ladderId) ?? null;
}

/** Escalera del hold final: la propia (anexo §2) o, sin ella, la de E1-E3. */
function holdLadderOf(exercise: AdminExercise): AdminLadder | null {
  if (exercise.holdLadderId === null) return ladderOf(exercise);
  return catalog.value?.ladders.find((l) => l.id === exercise.holdLadderId) ?? null;
}

function exerciseCaption(exercise: AdminExercise): string {
  const ladder = ladderOf(exercise);
  return `${ladder?.name ?? exercise.ladderCode} · ${exercise.unit === 's' ? 'segundos' : 'repeticiones'}`;
}

function replaceExercise(updated: AdminExercise): void {
  if (!catalog.value) return;
  catalog.value = {
    ...catalog.value,
    exercises: catalog.value.exercises.map((e) => (e.id === updated.id ? updated : e)),
  };
}

function replaceTemplateDay(updated: AdminTemplateDay): void {
  if (!catalog.value) return;
  catalog.value = {
    ...catalog.value,
    templateDays: catalog.value.templateDays.map((d) => (d.id === updated.id ? updated : d)),
  };
}

function replaceLadder(updated: AdminLadder): void {
  if (!catalog.value) return;
  catalog.value = {
    ...catalog.value,
    ladders: catalog.value.ladders.map((l) => (l.id === updated.id ? updated : l)),
  };
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    catalog.value = await conquerApi.getCatalog();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'No pudimos cargar el catálogo';
    loadError.value = message;
    $q.notify({ type: 'negative', message });
  } finally {
    loading.value = false;
  }
}

// Tras un error de una mutación se relee sin spinner: el editor ya mostró el motivo.
async function reloadQuietly(): Promise<void> {
  try {
    catalog.value = await conquerApi.getCatalog();
  } catch {
    // Si la relectura también falla se conserva lo que había; el error ya se notificó.
  }
}

onMounted(load);
watch(() => props.reloadToken, load);
</script>
