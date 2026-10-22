<!--
  Editor de un ejercicio de Conquer (fase 201, D-14, D-20, §2.1, §8.2): el nombre, la tabla de
  arranque de Toro (en qué peldaño y con qué modo empieza cada escalón: Α E1, Β E2, Γ E3 y Ω Hold
  final) y las zonas musculares que enciende, principales o secundarias. Novillo y Ternero arrancan
  más abajo según Ajustes. "Guardar" manda el ejercicio entero y el API devuelve la vista
  actualizada (`changed`); si lo rechaza (`CONQUER_CATALOGO_INVALIDO`) se muestra su mensaje en
  español y se conserva lo que se estaba editando.
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

    <div class="text-subtitle2 q-mt-md">
      Arranque de Toro
      <q-chip dense square outline color="accent" class="q-ml-sm">A validar</q-chip>
    </div>
    <div class="text-caption text-grey-8 q-mb-sm">
      Novillo arranca 1 peldaño más fácil y Ternero 2 (se cambia en Ajustes).
    </div>

    <div
      v-for="row in form.startSteps"
      :key="row.step"
      class="row items-center q-col-gutter-sm q-mb-xs"
      data-test="conquer-start-step"
    >
      <div class="col-12 col-sm-3 text-body2 text-weight-medium">
        {{ STEP_LABELS[row.step] }}
      </div>
      <div class="col-7 col-sm-6">
        <q-select
          v-model="row.rung"
          :options="rungOptions"
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
          :options="modeOptions(row.step)"
          emit-value
          map-options
          dense
          outlined
          label="Modo"
          :disable="saving || row.step === 'hold'"
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
import type {
  AdminExercise,
  AdminLadder,
  CatalogZone,
  ExerciseMuscle,
  Mode,
  StartStep,
  StepKey,
} from 'src/types/conquer';
import { MODE_LABELS } from 'src/utils/conquer-format';

const props = defineProps<{
  exercise: AdminExercise;
  /** La escalera del ejercicio (sus peldaños son las opciones del arranque). */
  ladder: AdminLadder | null;
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

interface ExerciseForm {
  name: string;
  startSteps: StartStep[];
  muscles: ExerciseMuscle[];
}

function formFrom(exercise: AdminExercise): ExerciseForm {
  const byStep = new Map(exercise.startSteps.map((s) => [s.step, s]));
  return {
    name: exercise.name,
    // Siempre las 4 filas, en orden; un escalón que falte arranca vacío y el API lo rechaza.
    startSteps: STEP_ORDER.map((step) => {
      const found = byStep.get(step);
      return {
        step,
        rung: found?.rung ?? '',
        mode: found?.mode ?? (step === 'hold' ? 'hold' : 'completa'),
      };
    }),
    muscles: exercise.muscles.map((m) => ({ ...m })),
  };
}

const form = reactive<ExerciseForm>(formFrom(props.exercise));
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

const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(formFrom(props.exercise)));

// Peldaños activos del más difícil al más fácil; el actual se conserva aunque esté desactivado
// (el API lo va a rechazar al guardar, pero el select no puede mostrarlo en blanco).
const rungOptions = computed(() => {
  const rungs = [...(props.ladder?.rungs ?? [])].sort((a, b) => a.position - b.position);
  const current = new Set(form.startSteps.map((s) => s.rung));
  return rungs
    .filter((r) => r.isActive || current.has(r.code))
    .map((r) => ({ label: r.isActive ? r.name : `${r.name} (desactivado)`, value: r.code }));
});

const zoneOptions = computed(() => props.zones.map((z) => ({ label: z.label, value: z.slug })));

function zoneLabel(slug: string): string {
  return props.zones.find((z) => z.slug === slug)?.label ?? slug;
}

function modeOptions(step: StepKey): { label: string; value: Mode }[] {
  const modes: Mode[] = step === 'hold' ? ['hold'] : ['completa', 'negativa', 'hold'];
  return modes.map((m) => ({ label: MODE_LABELS[m], value: m }));
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

async function save(): Promise<void> {
  saving.value = true;
  try {
    const updated = await conquerApi.updateExercise(props.exercise.id, {
      name: form.name.trim(),
      startSteps: form.startSteps.map((s) => ({ ...s })),
      muscles: form.muscles.map((m) => ({ ...m })),
    });
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
