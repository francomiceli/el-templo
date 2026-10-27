<!--
  Detalle de una corrección con video de Conquer (fase 202, D-26, D-28, DA-44, DA-45): el video del
  alumno (URL firmada), su comentario y, si ya se respondió, el texto y el video del coach. El coach
  puede borrar el video del alumno con confirmación explícita: la corrección y los textos quedan.
  El diálogo no guarda estado propio de la corrección: la recibe por prop y avisa con `changed` la
  versión nueva que devolvió el API, para que la lista la reemplace.
-->
<template>
  <q-dialog :model-value="modelValue" @update:model-value="onDialogModel">
    <q-card v-if="correction" style="width: 560px; max-width: 95vw">
      <q-card-section class="row items-center q-pb-none">
        <div class="text-h6 col" data-test="conquer-correction-title">
          {{ correction.memberName || 'Alumno' }} · {{ correction.targetLabel }}
        </div>
        <q-btn icon="close" flat round dense :disable="deleting" @click="close" />
      </q-card-section>

      <q-card-section class="q-gutter-y-md">
        <div class="text-caption text-grey-8">{{ metaLine }}</div>

        <div>
          <div class="text-subtitle2 q-mb-xs">Video del alumno</div>
          <ConquerCorrectionVideo
            :key="`alumno-${correction.id}-${correction.videoDeleted}`"
            :correction-id="correction.id"
            who="alumno"
          />
          <div v-if="correction.videoDeleted" class="text-caption text-grey-8 q-mt-xs">
            {{ deletedLine }}
          </div>
        </div>

        <div>
          <div class="text-subtitle2 q-mb-xs">Comentario del alumno</div>
          <div v-if="correction.comment" class="text-body2" style="white-space: pre-wrap">
            {{ correction.comment }}
          </div>
          <div v-else class="text-body2 text-grey-8">Sin comentario</div>
        </div>

        <div v-if="correction.reply" data-test="conquer-correction-reply">
          <q-separator class="q-mb-md" />
          <div class="text-subtitle2 q-mb-xs">{{ replyTitle }}</div>
          <div v-if="correction.reply.text" class="text-body2" style="white-space: pre-wrap">
            {{ correction.reply.text }}
          </div>
          <div v-else class="text-body2 text-grey-8">Respondió solo con video</div>
          <ConquerCorrectionVideo
            v-if="correction.reply.hasVideo"
            :key="`coach-${correction.id}`"
            :correction-id="correction.id"
            who="coach"
            class="q-mt-sm"
          />
        </div>

        <!-- 202-10: respuesta del coach -->
      </q-card-section>

      <q-card-actions align="between" class="q-pa-md">
        <q-btn
          v-if="!correction.videoDeleted"
          flat
          no-caps
          color="negative"
          icon="delete"
          label="Borrar video del alumno"
          style="min-height: 44px"
          :loading="deleting"
          data-test="conquer-correction-delete-video"
          @click="confirmDeleteVideo"
        />
        <q-space />
        <q-btn
          flat
          no-caps
          color="accent"
          label="Cerrar"
          style="min-height: 44px"
          :disable="deleting"
          @click="close"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import ConquerCorrectionVideo from 'src/components/conquer/ConquerCorrectionVideo.vue';
import { useConquerAdminApi } from 'src/composables/useConquerAdminApi';
import type { AdminCorrection } from 'src/types/conquer';
import { agoText, daysSince, durationText } from 'src/utils/conquer-format';

const props = defineProps<{
  modelValue: boolean;
  correction: AdminCorrection | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  changed: [correction: AdminCorrection];
}>();

const $q = useQuasar();
const conquerApi = useConquerAdminApi();

const deleting = ref(false);

function agoOf(iso: string): string {
  const days = daysSince(iso);
  return days === null ? '' : agoText(days);
}

const metaLine = computed(() => {
  const c = props.correction;
  if (!c) return '';
  const parts = [`Enviada ${agoOf(c.createdAt)}`.trim(), durationText(c.durationSec)];
  return parts.join(' · ');
});

const deletedLine = computed(() => {
  const c = props.correction;
  if (!c) return '';
  const when = c.videoDeletedAt ? agoOf(c.videoDeletedAt) : '';
  return when ? `Video borrado ${when}.` : 'Video borrado.';
});

const replyTitle = computed(() => {
  const reply = props.correction?.reply;
  if (!reply) return '';
  const by = props.correction?.repliedByName;
  const when = agoOf(reply.repliedAt);
  return `Respondida${by ? ` por ${by}` : ''}${when ? ` · ${when}` : ''}`;
});

function close(): void {
  if (deleting.value) return;
  emit('update:modelValue', false);
}

function onDialogModel(value: boolean): void {
  if (!value) {
    close();
    return;
  }
  emit('update:modelValue', true);
}

function confirmDeleteVideo(): void {
  const c = props.correction;
  if (!c) return;
  const name = c.memberName || 'este alumno';
  $q.dialog({
    title: 'Borrar video del alumno',
    message: `¿Borrar el video de ${name}? La corrección y los textos quedan.`,
    cancel: { label: 'Cancelar', flat: true, noCaps: true, color: 'accent' },
    ok: { label: 'Borrar video', color: 'negative', unelevated: true, noCaps: true },
    persistent: true,
  }).onOk(() => {
    void deleteVideo(c.id);
  });
}

async function deleteVideo(id: number): Promise<void> {
  deleting.value = true;
  try {
    const updated = await conquerApi.deleteCorrectionVideo(id);
    $q.notify({ type: 'positive', message: 'Video borrado' });
    emit('changed', updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'No pudimos borrar el video';
    $q.notify({ type: 'negative', message });
  } finally {
    deleting.value = false;
  }
}
</script>
