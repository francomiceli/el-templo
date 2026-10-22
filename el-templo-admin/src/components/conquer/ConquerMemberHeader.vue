<!--
  Encabezado de la ficha de Conquer (fase 201, §7.2): quién es el alumno, su nivel, sus días, la
  semana de activación y la etapa de recorte, más el formulario para corregir incremento (reps y
  segundos), nivel y días. Los días válidos salen de LEVEL_DAYS; el API vuelve a validar la
  combinación. Al guardar avisa con `saved` y la página relee la ficha entera (cambiar los días
  puede crear escalones nuevos).
-->
<template>
  <q-card flat bordered>
    <q-card-section>
      <div class="text-h5" data-test="conquer-ficha-name">{{ name }}</div>
      <div v-if="member.email" class="text-caption text-grey-8">{{ member.email }}</div>

      <div class="row q-gutter-xs q-mt-sm">
        <q-chip dense square color="secondary" text-color="white" class="q-ma-none q-mr-xs">
          {{ levelText }}
        </q-chip>
        <q-chip dense square outline color="accent" class="q-ma-none q-mr-xs">
          {{ member.daysCount ?? '—' }} días por semana
        </q-chip>
        <q-chip dense square outline color="accent" class="q-ma-none q-mr-xs">
          {{ cutText }}
        </q-chip>
      </div>
      <div class="text-caption text-grey-8 q-mt-xs">{{ activationText }}</div>
    </q-card-section>

    <q-separator />

    <q-card-section>
      <div class="text-subtitle2 q-mb-sm">Corregir plan</div>
      <div class="row q-col-gutter-sm">
        <div class="col-12 col-sm-6 col-md-3">
          <q-select
            v-model="form.level"
            :options="levelOptions"
            emit-value
            map-options
            dense
            outlined
            label="Nivel"
            data-test="conquer-ficha-level"
            @update:model-value="onLevelChange"
          />
        </div>
        <div class="col-12 col-sm-6 col-md-3">
          <q-select
            v-model="form.daysCount"
            :options="dayOptions"
            emit-value
            map-options
            dense
            outlined
            label="Días por semana"
            data-test="conquer-ficha-days"
          />
        </div>
        <div class="col-6 col-md-3">
          <q-select
            v-model="form.incReps"
            :options="REPS_OPTIONS"
            emit-value
            map-options
            dense
            outlined
            label="Incremento (reps)"
            data-test="conquer-ficha-inc-reps"
          />
        </div>
        <div class="col-6 col-md-3">
          <q-select
            v-model="form.incS"
            :options="SECONDS_OPTIONS"
            emit-value
            map-options
            dense
            outlined
            label="Incremento (segundos)"
            data-test="conquer-ficha-inc-s"
          />
        </div>
      </div>

      <div v-if="levelChanged" class="text-caption text-grey-8 q-mt-sm">
        Cambiar el nivel no toca las progresiones que ya tiene: las corregís abajo, escalón por
        escalón.
      </div>

      <div class="row justify-end q-mt-md">
        <q-btn
          unelevated
          no-caps
          color="secondary"
          label="Guardar cambios"
          :loading="saving"
          :disable="!dirty"
          style="min-height: 44px"
          data-test="conquer-ficha-save"
          @click="save"
        />
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import {
  LEVEL_DAYS,
  LEVEL_LABELS,
  LEVELS,
  type FichaMember,
  type Level,
  type UpdateMemberBody,
} from 'src/types/conquer';
import { formatDate } from 'src/utils/format-date';
import { fullName } from 'src/utils/conquer-format';

const props = defineProps<{
  member: FichaMember;
}>();

const emit = defineEmits<{
  /** El alumno se guardó: la página relee la ficha. */
  saved: [];
}>();

const $q = useQuasar();
const conquerApi = useConquerAdminApi();

// Rangos del API (assertIncrementRanges): reps 1-3, segundos 1-6.
const REPS_OPTIONS = [1, 2, 3].map((n) => ({ label: String(n), value: n }));
const SECONDS_OPTIONS = [1, 2, 3, 4, 5, 6].map((n) => ({ label: String(n), value: n }));
const levelOptions = LEVELS.map((l) => ({ label: LEVEL_LABELS[l], value: l }));

interface MemberForm {
  level: Level;
  daysCount: number;
  incReps: number;
  incS: number;
}

function formFromMember(): MemberForm {
  // Un alumno activo siempre tiene nivel y días; el default solo cubre el tipo.
  return {
    level: props.member.level ?? 'ternero',
    daysCount: props.member.daysCount ?? LEVEL_DAYS[props.member.level ?? 'ternero'][0],
    incReps: props.member.incReps,
    incS: props.member.incS,
  };
}

const form = reactive<MemberForm>(formFromMember());
const saving = ref(false);

watch(
  () => props.member,
  () => Object.assign(form, formFromMember())
);

const name = computed(
  () => fullName(props.member.firstName, props.member.lastName) || `Alumno ${props.member.userId}`
);
const levelText = computed(() => (props.member.level ? LEVEL_LABELS[props.member.level] : '—'));
const cutText = computed(() =>
  props.member.cutStage > 0 ? `Recorte: etapa ${props.member.cutStage}` : 'Sin recortes'
);
const activationText = computed(() => {
  const activation = props.member.activationDate;
  return activation ? `Semana de activación: ${formatDate(activation)}` : 'Sin fecha de activación';
});

const dayOptions = computed(() =>
  LEVEL_DAYS[form.level].map((n) => ({ label: `${n} días`, value: n }))
);

const levelChanged = computed(() => form.level !== props.member.level);

// Solo se manda lo que cambió. Nivel y días van juntos: el API valida la combinación.
const patch = computed<UpdateMemberBody>(() => {
  const body: UpdateMemberBody = {};
  if (form.level !== props.member.level || form.daysCount !== props.member.daysCount) {
    body.level = form.level;
    body.daysCount = form.daysCount;
  }
  if (form.incReps !== props.member.incReps) body.incReps = form.incReps;
  if (form.incS !== props.member.incS) body.incS = form.incS;
  return body;
});

const dirty = computed(() => Object.keys(patch.value).length > 0);

// Al cambiar de nivel, los días pasan al primero válido si el actual ya no corresponde.
function onLevelChange(level: Level): void {
  const valid = LEVEL_DAYS[level];
  if (!valid.includes(form.daysCount)) form.daysCount = valid[0];
}

async function save(): Promise<void> {
  if (!dirty.value) return;
  saving.value = true;
  try {
    await conquerApi.updateMember(props.member.userId, patch.value);
    $q.notify({ type: 'positive', message: 'Cambios guardados' });
    emit('saved');
  } catch (err: unknown) {
    $q.notify({
      type: 'negative',
      message: err instanceof Error ? err.message : 'No pudimos guardar los cambios del alumno',
    });
  } finally {
    saving.value = false;
  }
}
</script>
