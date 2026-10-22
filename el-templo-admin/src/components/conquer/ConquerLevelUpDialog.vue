<!--
  Confirmación del paso de nivel (fase 201, §2.2, A13): el coach elige los días del nivel nuevo y
  confirma con un toque. Las opciones salen de `ficha.levelUp.validDays` (el API ya las filtra por
  el nivel nuevo y vuelve a validar). Las progresiones que el alumno ya tiene no se tocan. Devuelve
  la ficha completa con `done`.
-->
<template>
  <q-dialog :model-value="modelValue" @update:model-value="onDialogModel">
    <q-card style="width: 420px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6">Confirmar {{ nextLevelText }}</div>
        <q-space />
        <q-btn icon="close" flat round dense :disable="submitting" @click="close" />
      </q-card-section>

      <q-card-section class="q-gutter-md">
        <div class="text-body2">
          {{ memberName }} pasa de {{ currentLevelText }} a {{ nextLevelText }}. Sus progresiones
          actuales quedan como están.
        </div>
        <q-select
          v-model="daysCount"
          :options="dayOptions"
          label="Días por semana del nivel nuevo *"
          emit-value
          map-options
          dense
          outlined
          :disable="submitting"
          data-test="conquer-levelup-days"
        />
      </q-card-section>

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat no-caps label="Cancelar" :disable="submitting" @click="close" />
        <q-btn
          unelevated
          no-caps
          color="secondary"
          :label="`Confirmar ${nextLevelText}`"
          :loading="submitting"
          :disable="daysCount === null"
          style="min-height: 44px"
          data-test="conquer-levelup-confirm"
          @click="submit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import { LEVEL_LABELS, type FichaResponse } from 'src/types/conquer';
import { fullName } from 'src/utils/conquer-format';

const props = defineProps<{
  modelValue: boolean;
  ficha: FichaResponse;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  /** El API confirmó el paso de nivel y devolvió la ficha completa. */
  done: [ficha: FichaResponse];
}>();

const $q = useQuasar();
const conquerApi = useConquerAdminApi();

const daysCount = ref<number | null>(null);
const submitting = ref(false);

const memberName = computed(
  () =>
    fullName(props.ficha.member.firstName, props.ficha.member.lastName) ||
    `Alumno ${props.ficha.member.userId}`
);
const currentLevelText = computed(() =>
  props.ficha.member.level ? LEVEL_LABELS[props.ficha.member.level] : '—'
);
const nextLevelText = computed(() =>
  props.ficha.levelUp.to ? LEVEL_LABELS[props.ficha.levelUp.to] : 'nivel nuevo'
);
const dayOptions = computed(() =>
  props.ficha.levelUp.validDays.map((n) => ({ label: `${n} días`, value: n }))
);

// Al abrir: los días actuales si siguen siendo válidos en el nivel nuevo, si no el primero.
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    const valid = props.ficha.levelUp.validDays;
    const current = props.ficha.member.daysCount;
    daysCount.value = current !== null && valid.includes(current) ? current : (valid[0] ?? null);
  }
);

function close(): void {
  if (!submitting.value) emit('update:modelValue', false);
}

function onDialogModel(value: boolean): void {
  if (!value) close();
}

async function submit(): Promise<void> {
  if (daysCount.value === null) return;
  submitting.value = true;
  try {
    const ficha = await conquerApi.levelUp(props.ficha.member.userId, {
      daysCount: daysCount.value,
    });
    $q.notify({ type: 'positive', message: `Pasó a ${nextLevelText.value}` });
    emit('done', ficha);
    emit('update:modelValue', false);
  } catch (err: unknown) {
    $q.notify({
      type: 'negative',
      message: err instanceof Error ? err.message : 'No pudimos confirmar el paso de nivel',
    });
  } finally {
    submitting.value = false;
  }
}
</script>
