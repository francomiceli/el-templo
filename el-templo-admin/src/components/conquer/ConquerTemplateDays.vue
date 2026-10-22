<!--
  Plantillas de Conquer por días (fase 201, D-14, D-20, §2.1): los días del plan de 4, 3 y 2 días.
  Por día: el nombre, el finisher (texto libre) y los 3 ejercicios. Cada día se guarda por separado
  (`updateTemplateDay`) y el API devuelve el día actualizado (`changed`). Un ejercicio no puede
  repetirse entre los días de una misma plantilla: el API responde `CONQUER_EJERCICIO_REPETIDO` y
  su mensaje en español se muestra tal cual, debajo del día. Los cambios no tocan los escalones de
  los alumnos que ya existen: solo se crean los que falten en su próximo Hoy.
-->
<template>
  <div data-test="conquer-template-days">
    <div v-for="group in groups" :key="group.daysCount" class="q-mb-lg">
      <div class="text-subtitle1 text-weight-medium q-mb-sm">
        Plan de {{ group.daysCount }} días
        <q-chip v-if="group.daysCount < 4" dense square outline color="accent" class="q-ml-sm">
          Propuesta de Nacho: a validar
        </q-chip>
      </div>

      <q-card
        v-for="day in group.days"
        :key="day.id"
        flat
        bordered
        class="q-mb-sm"
        data-test="conquer-template-day"
      >
        <q-card-section v-if="drafts[day.id]">
          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-4">
              <q-input
                v-model="drafts[day.id]!.label"
                dense
                outlined
                maxlength="40"
                label="Nombre del día"
                :disable="savingId !== null"
                data-test="conquer-template-label"
              />
            </div>
            <div class="col-12 col-sm-8">
              <q-input
                v-model="drafts[day.id]!.finisherText"
                dense
                outlined
                maxlength="200"
                label="Finisher"
                :disable="savingId !== null"
                data-test="conquer-template-finisher"
              />
            </div>
          </div>

          <div class="row q-col-gutter-sm q-mt-xs">
            <div v-for="slot in [0, 1, 2]" :key="slot" class="col-12 col-sm-4">
              <q-select
                v-model="drafts[day.id]!.exerciseCodes[slot]"
                :options="exerciseOptions"
                emit-value
                map-options
                dense
                outlined
                :label="`Ejercicio ${slot + 1}`"
                :disable="savingId !== null"
                :data-test="`conquer-template-exercise-${slot}`"
              />
            </div>
          </div>

          <q-banner
            v-if="errors[day.id]"
            dense
            rounded
            class="bg-grey-3 text-negative q-mt-sm"
            data-test="conquer-template-error"
          >
            {{ errors[day.id] }}
          </q-banner>

          <div class="row justify-end q-mt-sm">
            <q-btn
              unelevated
              no-caps
              color="secondary"
              label="Guardar día"
              :loading="savingId === day.id"
              :disable="savingId !== null || !isDirty(day)"
              style="min-height: 44px"
              data-test="conquer-template-save"
              @click="save(day)"
            />
          </div>
        </q-card-section>
      </q-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import type { AdminExercise, AdminTemplateDay } from 'src/types/conquer';

const props = defineProps<{
  templateDays: AdminTemplateDay[];
  exercises: AdminExercise[];
}>();

const emit = defineEmits<{
  /** El API devolvió el día actualizado. */
  changed: [day: AdminTemplateDay];
}>();

const $q = useQuasar();
const conquerApi = useConquerAdminApi();

interface DayDraft {
  label: string;
  finisherText: string;
  exerciseCodes: string[];
}

const drafts = reactive<Record<number, DayDraft>>({});
const errors = reactive<Record<number, string>>({});
const savingId = ref<number | null>(null);

function draftFrom(day: AdminTemplateDay): DayDraft {
  return {
    label: day.label,
    finisherText: day.finisherText,
    exerciseCodes: [...day.exerciseCodes],
  };
}

// Cada vez que llegan los días (carga o respuesta del API) los borradores vuelven a lo guardado.
watch(
  () => props.templateDays,
  (days) => {
    for (const day of days) drafts[day.id] = draftFrom(day);
  },
  { immediate: true }
);

// 4 días, 3 días y 2 días, cada uno con sus días en el orden de la plantilla.
const groups = computed(() => {
  const counts = [...new Set(props.templateDays.map((d) => d.daysCount))].sort((a, b) => b - a);
  return counts.map((daysCount) => ({
    daysCount,
    days: props.templateDays
      .filter((d) => d.daysCount === daysCount)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }));
});

const exerciseOptions = computed(() =>
  props.exercises.filter((e) => e.isActive).map((e) => ({ label: e.name, value: e.code }))
);

function isDirty(day: AdminTemplateDay): boolean {
  const draft = drafts[day.id];
  if (!draft) return false;
  return JSON.stringify(draft) !== JSON.stringify(draftFrom(day));
}

async function save(day: AdminTemplateDay): Promise<void> {
  const draft = drafts[day.id];
  if (!draft) return;
  savingId.value = day.id;
  delete errors[day.id];
  try {
    const updated = await conquerApi.updateTemplateDay(day.id, {
      label: draft.label.trim(),
      finisherText: draft.finisherText.trim(),
      exerciseCodes: [...draft.exerciseCodes],
    });
    emit('changed', updated);
    $q.notify({ type: 'positive', message: 'Día guardado' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'No pudimos guardar el día';
    errors[day.id] = message;
    $q.notify({ type: 'negative', message });
  } finally {
    savingId.value = null;
  }
}
</script>
