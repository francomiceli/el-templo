<!--
  Editor de un ejercicio de Conquer (fase 201, D-14, D-20, anexo §1 y §3): el nombre, la marca de
  brazos rectos (decide el texto de fallo que ve el alumno), las TRES tablas de arranque (Toro,
  Novillo y Ternero: en qué peldaño y con qué modo empieza cada escalón: Α E1, Β E2, Γ E3 y Ω Hold
  final) y las zonas musculares que enciende. E1-E3 eligen en la escalera del ejercicio y el hold
  final en su propia escalera (`holdLadder`). Los modos de cada escalón siguen la regla del anexo
  §1 (isométricos y hold final solo hold; dinámicos completa o negativa): el API valida igual.
  "Guardar" manda solo lo que cambió y el API devuelve la vista actualizada (`changed`); si lo
  rechaza (`CONQUER_CATALOGO_INVALIDO`) se muestra su mensaje en español y se conserva lo que se
  estaba editando. Las tablas se aplican a las altas nuevas: los alumnos ya activos conservan
  sus progresiones.
-->
<template>
  <div data-test="conquer-exercise-editor">
    <q-input
      v-model="form.name"
      dense
      outlined
      maxlength="80"
      label="Nombre del ejercicio"
      :disable="saving"
      data-test="conquer-exercise-name"
    />

    <q-toggle
      v-model="form.brazosRectos"
      dense
      color="secondary"
      label="Brazos rectos (fallo técnico)"
      class="q-mt-md"
      :disable="saving"
      data-test="conquer-exercise-straight"
    />
    <div class="text-caption text-grey-8">
      Con brazos rectos el alumno lee "fallo técnico"; si no, "fallo muscular".
    </div>

    <div class="text-subtitle2 q-mt-md">
      Arranque por nivel
      <q-chip dense square outline color="accent" class="q-ml-sm">A validar</q-chip>
    </div>
    <q-btn-toggle
      v-model="level"
      :options="LEVEL_OPTIONS"
      dense
      no-caps
      unelevated
      toggle-color="secondary"
      color="grey-3"
      text-color="accent"
      class="q-mb-sm"
      data-test="conquer-start-level"
    />
    <div v-if="levelTableEmpty" class="text-caption text-grey-8 q-mb-sm">
      {{ LEVEL_LABELS[level] }} todavía no tiene tabla cargada: hasta que la cargues arranca con la
      de Espartano.
    </div>

    <div
      v-for="row in currentRows"
      :key="`${level}-${row.step}`"
      class="row items-center q-col-gutter-sm q-mb-xs"
      data-test="conquer-start-step"
    >
      <div class="col-12 col-sm-3 text-body2 text-weight-medium">
        {{ STEP_LABELS[row.step] }}
      </div>
      <div class="col-7 col-sm-6">
        <q-select
          v-model="row.rung"
          :options="rungOptions(row)"
          emit-value
          map-options
          dense
          outlined
          label="Peldaño"
          :disable="saving"
          :data-test="`conquer-start-rung-${row.step}`"
        />
      </div>
      <div class="col-5 col-sm-3">
        <q-select
          v-model="row.mode"
          :options="modeOptions(row)"
          emit-value
          map-options
          dense
          outlined
          label="Modo"
          :disable="saving || modeOptions(row).length < 2"
          :data-test="`conquer-start-mode-${row.step}`"
        />
      </div>
    </div>

    <div class="text-subtitle2 q-mt-md">
      Zonas musculares
      <q-chip dense square outline color="accent" class="q-ml-sm">A validar</q-chip>
    </div>
    <div class="q-mb-sm" data-test="conquer-muscles">
      <q-chip
        v-for="m in form.muscles"
        :key="`${m.zone}|${m.role}`"
        removable
        dense
        square
        :color="m.role === 'principal' ? 'secondary' : undefined"
        :text-color="m.role === 'principal' ? 'white' : 'accent'"
        :outline="m.role !== 'principal'"
        :disable="saving"
        @remove="removeMuscle(m)"
      >
        {{ zoneLabel(m.zone) }} · {{ m.role }}
      </q-chip>
      <span v-if="form.muscles.length === 0" class="text-grey-8 text-body2">
        Sin zonas: el ejercicio necesita al menos una principal.
      </span>
    </div>

    <div class="row items-start q-col-gutter-sm">
      <div class="col-12 col-sm-5">
        <q-select
          v-model="newZone"
          :options="zoneOptions"
          emit-value
          map-options
          dense
          outlined
          label="Zona"
          :disable="saving"
          data-test="conquer-muscle-zone"
        />
      </div>
      <div class="col-7 col-sm-4">
        <q-select
          v-model="newRole"
          :options="ROLE_OPTIONS"
          emit-value
          map-options
          dense
          outlined
          label="Rol"
          :disable="saving"
          data-test="conquer-muscle-role"
        />
      </div>
      <div class="col-5 col-sm-3">
        <q-btn
          outline
          no-caps
          color="secondary"
          icon="add"
          label="Agregar"
          class="full-width"
          style="min-height: 40px"
          :disable="saving || newZone === null || hasMuscle(newZone, newRole)"
          data-test="conquer-muscle-add"
          @click="addMuscle"
        />
      </div>
    </div>

    <div class="row justify-end q-mt-md">
      <q-btn
        unelevated
        no-caps
        color="secondary"
        label="Guardar"
        :loading="saving"
        :disable="!dirty"
        style="min-height: 44px"
        data-test="conquer-exercise-save"
        @click="save"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import {
  LEVEL_LABELS,
  LEVELS,
  type AdminExercise,
  type AdminLadder,
  type CatalogZone,
  type ExerciseMuscle,
  type Level,
  type Mode,
  type StartStep,
  type StepKey,
  type UpdateExerciseBody,
} from 'src/types/conquer';
import { MODE_LABELS } from 'src/utils/conquer-format';

const props = defineProps<{
  exercise: AdminExercise;
  /** La escalera de E1-E3 (sus peldaños son las opciones de Α, Β y Γ). */
  ladder: AdminLadder | null;
  /** La escalera del hold final (la de E1-E3 si el ejercicio no tiene una propia). */
  holdLadder: AdminLadder | null;
  zones: CatalogZone[];
}>();

const emit = defineEmits<{
  /** El API devolvió el ejercicio actualizado. */
  changed: [exercise: AdminExercise];
}>();

const $q = useQuasar();
const conquerApi = useConquerAdminApi();

const STEP_LABELS: Record<StepKey, string> = {
  e1: 'Α · E1',
  e2: 'Β · E2',
  e3: 'Γ · E3',
  hold: 'Ω · Hold final',
};
const STEP_ORDER: StepKey[] = ['e1', 'e2', 'e3', 'hold'];

const ROLE_OPTIONS: { label: string; value: ExerciseMuscle['role'] }[] = [
  { label: 'Principal', value: 'principal' },
  { label: 'Secundario', value: 'secundario' },
];

// Toro es la base; Novillo y Ternero tienen su propia tabla (anexo §3).
const LEVEL_OPTIONS = [...LEVELS].reverse().map((value) => ({ label: LEVEL_LABELS[value], value }));

/** Campo del ejercicio y del body que guarda la tabla de cada nivel. */
const TABLE_FIELD = {
  toro: 'startSteps',
  novillo: 'startStepsNovillo',
  ternero: 'startStepsTernero',
} as const satisfies Record<Level, keyof UpdateExerciseBody & keyof AdminExercise>;

type Tables = Record<Level, StartStep[]>;

interface ExerciseForm {
  name: string;
  brazosRectos: boolean;
  tables: Tables;
  muscles: ExerciseMuscle[];
}

/** Siempre las 4 filas en orden; un escalón que falte arranca vacío y el API lo rechaza. */
function rowsFrom(saved: StartStep[]): StartStep[] {
  const byStep = new Map(saved.map((s) => [s.step, s]));
  return STEP_ORDER.map((step) => {
    const found = byStep.get(step);
    return {
      step,
      rung: found?.rung ?? '',
      mode: found?.mode ?? (step === 'hold' ? 'hold' : 'completa'),
    };
  });
}

function formFrom(exercise: AdminExercise): ExerciseForm {
  return {
    name: exercise.name,
    brazosRectos: exercise.brazosRectos,
    tables: {
      toro: rowsFrom(exercise.startSteps),
      novillo: rowsFrom(exercise.startStepsNovillo),
      ternero: rowsFrom(exercise.startStepsTernero),
    },
    muscles: exercise.muscles.map((m) => ({ ...m })),
  };
}

const form = reactive<ExerciseForm>(formFrom(props.exercise));
const level = ref<Level>('toro');
const saving = ref(false);
const newZone = ref<string | null>(null);
const newRole = ref<ExerciseMuscle['role']>('principal');

// Llega el ejercicio guardado (o el catálogo releído): el formulario vuelve a ser lo guardado.
watch(
  () => props.exercise,
  (exercise) => {
    Object.assign(form, formFrom(exercise));
  }
);

const saved = computed(() => formFrom(props.exercise));
const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(saved.value));

const currentRows = computed(() => form.tables[level.value]);

/** Un nivel sin tabla cargada (`[]` en el API) todavía usa la de Toro. */
const levelTableEmpty = computed(() => {
  if (level.value === 'toro') return false;
  return props.exercise[TABLE_FIELD[level.value]].length === 0;
});

// Peldaños activos del más difícil al más fácil, de la escalera de SU escalón; el actual se
// conserva aunque esté desactivado (el API lo va a rechazar al guardar, pero el select no puede
// mostrarlo en blanco).
function rungOptions(row: StartStep): { label: string; value: string }[] {
  const source = row.step === 'hold' ? props.holdLadder : props.ladder;
  const rungs = [...(source?.rungs ?? [])].sort((a, b) => a.position - b.position);
  return rungs
    .filter((r) => r.isActive || r.code === row.rung)
    .map((r) => ({ label: r.isActive ? r.name : `${r.name} (desactivado)`, value: r.code }));
}

/**
 * Modos de un escalón (anexo §1, igual que `allowedModes` del API): isométricos (segundos) y hold
 * final solo hold; dinámicos completa o negativa. El modo actual se conserva si es un dato viejo
 * fuera de la regla (el API lo va a rechazar al guardar).
 */
function modeOptions(row: StartStep): { label: string; value: Mode }[] {
  const modes: Mode[] =
    row.step === 'hold' || props.exercise.unit === 's' ? ['hold'] : ['completa', 'negativa'];
  if (!modes.includes(row.mode)) modes.push(row.mode);
  return modes.map((m) => ({ label: MODE_LABELS[m], value: m }));
}

const zoneOptions = computed(() => props.zones.map((z) => ({ label: z.label, value: z.slug })));

function zoneLabel(slug: string): string {
  return props.zones.find((z) => z.slug === slug)?.label ?? slug;
}

function hasMuscle(zone: string | null, role: ExerciseMuscle['role']): boolean {
  return zone !== null && form.muscles.some((m) => m.zone === zone && m.role === role);
}

function addMuscle(): void {
  if (newZone.value === null || hasMuscle(newZone.value, newRole.value)) return;
  form.muscles.push({ zone: newZone.value, role: newRole.value });
  newZone.value = null;
}

function removeMuscle(muscle: ExerciseMuscle): void {
  form.muscles = form.muscles.filter((m) => !(m.zone === muscle.zone && m.role === muscle.role));
}

/** Solo lo que cambió respecto de lo guardado (las tablas sin tocar no se mandan). */
function changesBody(): UpdateExerciseBody {
  const body: UpdateExerciseBody = {};
  const before = saved.value;
  if (form.name !== before.name) body.name = form.name.trim();
  if (form.brazosRectos !== before.brazosRectos) body.brazosRectos = form.brazosRectos;
  for (const lv of LEVELS) {
    if (JSON.stringify(form.tables[lv]) !== JSON.stringify(before.tables[lv])) {
      body[TABLE_FIELD[lv]] = form.tables[lv].map((s) => ({ ...s }));
    }
  }
  if (JSON.stringify(form.muscles) !== JSON.stringify(before.muscles)) {
    body.muscles = form.muscles.map((m) => ({ ...m }));
  }
  return body;
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    const updated = await conquerApi.updateExercise(props.exercise.id, changesBody());
    emit('changed', updated);
    $q.notify({ type: 'positive', message: 'Ejercicio guardado' });
  } catch (err: unknown) {
    $q.notify({
      type: 'negative',
      message: err instanceof Error ? err.message : 'No pudimos guardar el ejercicio',
    });
  } finally {
    saving.value = false;
  }
}
</script>
