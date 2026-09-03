<!-- "Enviar ahora a un segmento" (Fase 193, Plan B, pedido de Franco
     2026-09-03): antes era una sub-pestaña de PushTab.vue, ahora es un
     diálogo que abre un botón secundario en la cabecera de la categoría
     push — mismo formulario, sin pérdida de funcionalidad. -->
<template>
  <q-dialog v-model="localOpen" persistent>
    <q-card style="min-width: 480px; max-width: 640px; width: 100%">
      <q-card-section>
        <div class="text-h6">Enviar ahora a un segmento</div>
        <div class="text-caption text-grey-7">
          Envío puntual (no queda guardado como plantilla). Elegí a quién llega y con qué texto.
        </div>
      </q-card-section>

      <q-card-section class="q-gutter-md" style="max-height: 65vh; overflow-y: auto">
        <q-input v-model="form.title" label="Título" dense outlined maxlength="200" counter />
        <q-input
          v-model="form.body"
          label="Mensaje"
          type="textarea"
          autogrow
          dense
          outlined
        />

        <q-expansion-item dense label="Variante femenina (opcional)" header-class="text-caption">
          <q-input
            v-model="form.titleFemale"
            label="Título (femenino)"
            class="q-mt-sm"
            dense
            outlined
            maxlength="200"
            counter
          />
          <q-input
            v-model="form.bodyFemale"
            label="Mensaje (femenino)"
            type="textarea"
            autogrow
            class="q-mt-sm"
            dense
            outlined
          />
        </q-expansion-item>

        <DestinoSelector v-model="form.destination" />

        <div>
          <div class="text-subtitle2 q-mb-sm">Segmentos destino</div>
          <div class="row q-gutter-sm">
            <q-checkbox
              v-for="seg in MEMBER_SEGMENT_OPTIONS"
              :key="seg.value"
              v-model="form.segmentIds"
              :val="seg.value"
              :label="seg.label"
            />
          </div>
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancelar" v-close-popup :disable="sending" />
        <q-btn
          color="primary"
          label="Enviar notificación"
          icon="send"
          unelevated
          :loading="sending"
          :disable="!canSend"
          @click="handleSend"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import DestinoSelector from 'src/components/comunicaciones/DestinoSelector.vue';
import { useCommunicationsApi } from 'src/composables/useCommunicationsApi';
import type { MemberSegmentKey } from 'src/composables/useCommunicationsApi';
import { MEMBER_SEGMENT_OPTIONS } from 'src/config/rule-triggers';
import type { Destination } from 'src/config/destinations';

const log = createLogger('SendSegmentDialog');
const $q = useQuasar();
const commsApi = useCommunicationsApi();

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const localOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

function emptyDestination(): Destination {
  return { type: 'app_section', section: 'mi_templo', whatsappText: null };
}

function emptyForm() {
  return {
    title: '',
    body: '',
    titleFemale: '',
    bodyFemale: '',
    destination: emptyDestination(),
    segmentIds: [] as MemberSegmentKey[],
  };
}

const form = reactive(emptyForm());
const sending = ref(false);

const canSend = computed(
  () => form.title.trim().length > 0 && form.body.trim().length > 0 && form.segmentIds.length > 0,
);

async function handleSend() {
  sending.value = true;
  try {
    const payload: {
      title: string;
      body: string;
      segmentIds: MemberSegmentKey[];
      destination: Destination;
      titleFemale?: string;
      bodyFemale?: string;
    } = {
      title: form.title.trim(),
      body: form.body.trim(),
      segmentIds: form.segmentIds,
      destination: form.destination,
    };
    if (form.titleFemale.trim() && form.bodyFemale.trim()) {
      payload.titleFemale = form.titleFemale.trim();
      payload.bodyFemale = form.bodyFemale.trim();
    }

    const data = await commsApi.sendSegment(payload);
    $q.notify({ type: 'positive', message: `${data.queued} notificaciones enviadas` });

    Object.assign(form, emptyForm());
    localOpen.value = false;
  } catch (err: unknown) {
    const message = extractError(err, 'Error enviando notificación');
    log.error('Error sending segment notification', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    sending.value = false;
  }
}
</script>
