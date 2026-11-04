<!--
  Alta y edición de un tema de Oficina (fase 205 D-18, D-20).
  - create: título + detalle + socio vinculado (opcional) + responsable (opcional).
    `presetTarget` viene de la ficha del socio: el vínculo ya está puesto y no se cambia.
  - edit: solo título y detalle (el responsable y el estado se mueven desde el detalle).
-->
<template>
  <q-dialog
    :model-value="modelValue"
    persistent
    @update:model-value="emit('update:modelValue', $event)"
  >
    <q-card class="oficina-dialog">
      <q-card-section class="q-pb-none">
        <div class="text-h6">{{ mode === 'edit' ? 'Editar tema' : 'Nuevo tema' }}</div>
        <div class="text-caption text-grey-7">
          {{
            mode === 'edit'
              ? 'Los cambios quedan registrados en el historial del tema.'
              : 'Algo que la gerencia tiene que atender o decidir.'
          }}
        </div>
      </q-card-section>

      <q-card-section>
        <q-form class="q-gutter-y-md" @submit.prevent="onSubmit">
          <q-input
            v-model="form.title"
            label="Título *"
            outlined
            dense
            autofocus
            counter
            maxlength="160"
            hint="Una frase que se entienda sola en la lista"
            :rules="[(v: string) => (v && v.trim().length > 0) || 'El título es obligatorio']"
            :disable="saving"
          />

          <q-input
            v-model="form.body"
            label="Detalle"
            type="textarea"
            outlined
            dense
            autogrow
            counter
            maxlength="4000"
            hint="Contexto, qué se sabe, qué falta decidir"
            :disable="saving"
          />

          <div v-if="mode === 'create'">
            <div
              v-if="presetTarget"
              class="row items-center no-wrap text-body2 bg-summary-surface q-pa-sm rounded-borders"
            >
              <q-icon name="person" color="primary" class="q-mr-sm" />
              <span class="ellipsis">Vinculado al socio {{ presetTarget.label }}</span>
            </div>
            <ReferrerSelect
              v-else
              ref="memberSelect"
              label="Vincular socio (opcional)"
              hint="Buscá por nombre o DNI si el tema es de un socio puntual"
              :disable="saving"
              @update:model-value="onMemberPick"
            />
          </div>

          <q-select
            v-if="mode === 'create'"
            v-model="form.assigneeIds"
            :options="assigneeOptions"
            option-value="value"
            option-label="label"
            emit-value
            map-options
            multiple
            use-chips
            outlined
            dense
            label="Responsables (opcional)"
            :disable="saving"
          />
        </q-form>
      </q-card-section>

      <q-card-actions align="right" class="q-px-md q-pb-md">
        <q-btn flat no-caps label="Cancelar" color="grey-8" :disable="saving" @click="close" />
        <q-btn
          unelevated
          no-caps
          color="primary"
          :label="mode === 'edit' ? 'Guardar' : 'Crear tema'"
          :loading="saving"
          :disable="!canSubmit"
          @click="onSubmit"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
import {
  useOfficeApi,
  type OfficeStaff,
  type OfficeTopicDetail,
} from 'src/composables/useOfficeApi';
import ReferrerSelect from 'src/components/ReferrerSelect.vue';
import { personName } from 'src/components/oficina/office-labels';

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    mode?: 'create' | 'edit';
    /** Tema a editar (modo edit). */
    topic?: OfficeTopicDetail | null;
    staff: OfficeStaff[];
    /** Alta desde la ficha del socio: el vínculo ya viene resuelto. */
    presetTarget?: { kind: 'socio'; id: number; label: string } | null;
  }>(),
  { mode: 'create', topic: null, presetTarget: null }
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [topic: OfficeTopicDetail];
}>();

const log = createLogger('OficinaTopicDialog');
const $q = useQuasar();
const officeApi = useOfficeApi();

const memberSelect = ref<InstanceType<typeof ReferrerSelect> | null>(null);
const saving = ref(false);
const form = reactive<{
  title: string;
  body: string;
  memberId: number | null;
  assigneeIds: number[];
}>({ title: '', body: '', memberId: null, assigneeIds: [] });

const assigneeOptions = computed(() =>
  props.staff.map((person) => ({
    value: person.id,
    label: personName(person) || `Usuario ${person.id}`,
  }))
);

const canSubmit = computed(() => form.title.trim().length > 0 && !saving.value);

function resetForm(): void {
  form.title = props.mode === 'edit' ? (props.topic?.title ?? '') : '';
  form.body = props.mode === 'edit' ? (props.topic?.body ?? '') : '';
  form.memberId = null;
  form.assigneeIds = [];
  memberSelect.value?.reset();
}

// Cada vez que se abre arranca limpio (o con los datos del tema, en edición).
watch(
  () => props.modelValue,
  (open) => {
    if (open) resetForm();
  },
  { immediate: true }
);

function onMemberPick(memberId: number | null): void {
  form.memberId = memberId;
}

function close(): void {
  emit('update:modelValue', false);
}

async function onSubmit(): Promise<void> {
  if (!canSubmit.value) return;
  saving.value = true;
  try {
    const title = form.title.trim();
    const body = form.body.trim();
    let saved: OfficeTopicDetail;
    if (props.mode === 'edit' && props.topic) {
      saved = await officeApi.patchTopic(props.topic.id, {
        title,
        body: body === '' ? null : body,
      });
      $q.notify({ type: 'positive', message: 'Tema actualizado' });
    } else {
      const memberId = props.presetTarget?.id ?? form.memberId;
      saved = await officeApi.createTopic({
        title,
        body: body === '' ? null : body,
        ...(memberId !== null ? { targetKind: 'socio' as const, targetId: memberId } : {}),
        ...(props.presetTarget ? { targetLabel: props.presetTarget.label } : {}),
        ...(form.assigneeIds.length > 0 ? { assigneeIds: form.assigneeIds } : {}),
      });
      $q.notify({ type: 'positive', message: 'Tema creado' });
    }
    emit('saved', saved);
    close();
  } catch (err: unknown) {
    const context = { error: err instanceof Error ? err.message : 'desconocido' };
    if (isExpectedClientError(err)) log.warn('No se pudo guardar el tema', context);
    else log.error('No se pudo guardar el tema', context);
    $q.notify({ type: 'negative', message: extractError(err, 'No pudimos guardar el tema') });
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped lang="scss">
.oficina-dialog {
  width: 520px;
  max-width: 95vw;
}
</style>
