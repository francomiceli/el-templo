<!-- Editor de Novedades de Mi Templo (alta y edición).
     Una novedad es un texto corto (máx. 120, D-2, era 80) que el socio ve arriba de Mi
     Templo. Campos: texto, sedes (casillas, `NovedadSedesSelector`), destino opcional (mismo
     `DestinoSelector` que avisos/tarjetas), publicación (ahora o fecha y hora)
     y estado. Sin vencimiento (D-3): una novedad deja de verse cuando la
     desplazan 3 más nuevas, se pausa o se borra.

     El límite de 120 espeja `el-templo-api/.../novedades-service.ts`. La app
     muestra DOS líneas (decisión de Franco 2026-10-18) y lo que no entra sube
     despacio: el contador pasa a ámbar desde `NOVEDAD_TEXT_WARN_FROM` y la
     vista previa (mismo ancho que un celular) muestra dónde se corta.
     NO bloquea antes de 120 (el `maxlength` del input corta ahí).

     Semántica del PUT (server): cada key es opcional, y si viene
     `destinationType` (aunque sea null) REEMPLAZA el destino entero. Por eso
     al editar se manda solo lo que cambió, y el destino siempre completo
     (tipo + sección + texto de WhatsApp) cuando cambió. Si no cambió nada no
     se hace el request (un body vacío da 400).

     Hora: los inputs date/time son la hora LOCAL del navegador; al guardar se
     convierte a ISO UTC (`localInputsToIso`).

     Push opcional (mig 0297): el toggle "Enviar también como notificación push"
     (apagado por defecto) agrega un título editable (1-50). El cuerpo es el texto
     de la novedad. La push NO sale al guardar: la encola el cron del server al
     publicarse (ahora o a la hora programada). Una vez encolada (`pushQueuedAt`)
     el toggle y el título quedan deshabilitados y la edición no manda campos de
     push (el server respondería 400). Qué mandar lo decide `pushFieldsForCreate`/
     `pushFieldsForUpdate` (utils/novedades.ts, con tests). -->
<template>
  <q-dialog v-model="localOpen" persistent>
    <q-card style="min-width: 480px; max-width: 640px; width: 100%">
      <q-card-section>
        <div class="text-h6">{{ props.novedad ? 'Editar novedad' : 'Nueva novedad' }}</div>
      </q-card-section>

      <q-card-section class="q-gutter-md" style="max-height: 70vh; overflow-y: auto">
        <div>
          <q-input
            v-model="form.text"
            label="Texto"
            dense
            outlined
            :maxlength="NOVEDAD_TEXT_MAX"
            hide-bottom-space
            autofocus
            placeholder="Ej: Incorporamos clases de yoga"
          />
          <div class="row items-start no-wrap q-mt-xs">
            <div class="col text-caption" :class="warnLong ? 'text-amber-10' : 'text-grey-7'">
              {{
                warnLong
                  ? 'Pasa de dos líneas: en el celular sube despacio para mostrar el resto. Mirá la vista previa.'
                  : 'Una oración corta. Se muestra arriba de Mi Templo.'
              }}
            </div>
            <div
              class="col-auto text-caption text-weight-medium"
              :class="warnLong ? 'text-amber-10' : 'text-grey-7'"
            >
              {{ textLength }}/{{ NOVEDAD_TEXT_MAX }}
            </div>
          </div>
        </div>

        <NovedadPreview :items="[previewItem]" :show-new="true" />

        <q-separator />
        <div class="text-subtitle2">Sedes</div>
        <NovedadSedesSelector
          v-model="form.selectedBranchIds"
          :branches="props.branches"
          :allow-global="isOwner"
        />

        <q-separator />
        <q-toggle v-model="form.hasDestination" color="primary" label="Lleva a algún lado" />
        <div v-if="form.hasDestination">
          <DestinoSelector v-model="form.destination" />
        </div>
        <div v-else class="text-caption text-grey-7">
          Solo informa: al tocarla en la app no pasa nada.
        </div>

        <q-separator />
        <div class="text-subtitle2">Notificación push</div>
        <q-toggle
          v-model="form.push.enabled"
          color="primary"
          label="Enviar también como notificación push"
          :disable="pushLocked"
        />
        <div v-if="pushLocked" class="text-caption text-positive">
          <q-icon name="check_circle" size="16px" class="q-mr-xs" />
          Push enviada el {{ pushSentLabel }}. No se puede editar ni reenviar.
        </div>
        <div v-if="form.push.enabled || pushLocked" class="q-gutter-y-xs">
          <q-input
            v-model="form.push.title"
            label="Título de la notificación"
            dense
            outlined
            :maxlength="NOVEDAD_PUSH_TITLE_MAX"
            counter
            :disable="pushLocked"
            :error="!pushLocked && pushTitleErrorText !== null"
            :error-message="pushTitleErrorText ?? ''"
            hide-bottom-space
            data-testid="novedad-push-title"
          />
          <div class="text-caption text-grey-7">
            El texto de la novedad es el cuerpo de la notificación. Si dejás el título como está, se
            usa el nombre del gimnasio.
          </div>
          <div v-if="!pushLocked" class="text-caption text-grey-7">
            {{ pushHelpText }}
          </div>
        </div>
        <div v-else class="text-caption text-grey-7">
          Solo aparece en el feed de Mi Templo, sin notificación al celular.
        </div>

        <q-separator />
        <div class="text-subtitle2">Publicación</div>
        <q-btn-toggle
          v-model="form.publishMode"
          :options="publishModeOptions"
          no-caps
          unelevated
          toggle-color="primary"
          color="grey-3"
          text-color="grey-9"
          @update:model-value="onPublishModeChange"
        />
        <div v-if="form.publishMode === 'date'">
          <div class="row q-col-gutter-md">
            <div class="col-7">
              <q-input v-model="form.publishDate" label="Fecha" type="date" dense outlined />
            </div>
            <div class="col-5">
              <q-input v-model="form.publishTime" label="Hora" type="time" dense outlined />
            </div>
          </div>
          <div v-if="publishHint" class="text-caption q-mt-xs" :class="publishHint.class">
            {{ publishHint.text }}
          </div>
        </div>
        <div v-else class="text-caption text-grey-7">
          {{
            props.novedad
              ? 'Se republica ahora: pasa a ser la más reciente.'
              : 'Se publica apenas guardás.'
          }}
        </div>

        <q-separator />
        <div class="row items-center q-gutter-sm">
          <div class="text-body2">Estado</div>
          <q-btn-toggle
            v-model="form.status"
            :options="statusOptions"
            no-caps
            unelevated
            toggle-color="primary"
            color="grey-3"
            text-color="grey-9"
          />
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancelar" v-close-popup :disable="saving" />
        <q-btn
          color="primary"
          label="Guardar"
          unelevated
          :loading="saving"
          :disable="!canSave"
          @click="handleSave"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { useCommunicationsApi } from 'src/composables/useCommunicationsApi';
import type {
  AdminNovedad,
  CreateNovedadInput,
  NovedadStatus,
  UpdateNovedadInput,
} from 'src/composables/useCommunicationsApi';
import DestinoSelector from 'src/components/comunicaciones/DestinoSelector.vue';
import NovedadPreview from 'src/components/comunicaciones/NovedadPreview.vue';
import NovedadSedesSelector from 'src/components/comunicaciones/NovedadSedesSelector.vue';
import { useAuthStore } from 'src/stores/useAuthStore';
import type { AppSectionKey, Destination } from 'src/config/destinations';
import type { BranchOption } from 'src/types/member';
import {
  NOVEDAD_PUSH_TITLE_MAX,
  NOVEDAD_TEXT_MAX,
  NOVEDAD_TEXT_WARN_FROM,
  formatPublishAt,
  isoToLocalInputs,
  localInputsToIso,
  pushFieldsForCreate,
  pushFieldsForUpdate,
  pushFormStateFrom,
  pushTitleError,
  relativeDaysLabel,
  scopeFromSelection,
  selectionFromScope,
} from 'src/utils/novedades';
import type { NovedadPreviewItem } from 'src/utils/novedades';

type PublishMode = 'now' | 'date';

const log = createLogger('NovedadEditorDialog');
const $q = useQuasar();
const commsApi = useCommunicationsApi();
const authStore = useAuthStore();
// Solo el owner ve todas las sedes del tenant: solo él puede guardar "todas" (null).
const isOwner = computed(() => authStore.user?.role === 'owner');

const props = defineProps<{
  modelValue: boolean;
  novedad: AdminNovedad | null;
  branches: BranchOption[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [];
}>();

const localOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const publishModeOptions: Array<{ label: string; value: PublishMode }> = [
  { label: 'Ahora', value: 'now' },
  { label: 'Fecha y hora', value: 'date' },
];

const statusOptions: Array<{ label: string; value: NovedadStatus }> = [
  { label: 'Activa', value: 'active' },
  { label: 'Pausada', value: 'paused' },
];

// ── Form state ──────────────────────────────────────────────────────────

function emptyDestination(): Destination {
  return { type: 'app_section', section: 'mi_templo', whatsappText: null };
}

const form = reactive({
  text: '',
  selectedBranchIds: [] as number[],
  hasDestination: false,
  destination: emptyDestination(),
  publishMode: 'now' as PublishMode,
  publishDate: '',
  publishTime: '',
  status: 'active' as NovedadStatus,
  push: pushFormStateFrom(null),
});

// Sedes tildadas al abrir: al editar, el alcance se manda solo si cambió la
// selección (un admin que abre una novedad "todas las sedes" del owner ve
// tildadas solo las de su país, y no debe achicarla sin querer).
let initialSelection: number[] = [];

function resetForm(): void {
  const n = props.novedad;
  form.selectedBranchIds = selectionFromScope(n?.scopeBranchIds ?? null, props.branches);
  initialSelection = [...form.selectedBranchIds];
  if (n) {
    form.text = n.text;
    form.hasDestination = n.destinationType !== null;
    form.destination =
      n.destinationType !== null
        ? {
            type: n.destinationType,
            section: n.destinationSection as AppSectionKey | null,
            whatsappText: n.whatsappText,
          }
        : emptyDestination();
    // Al editar, la fecha original queda cargada: si no se toca no se manda.
    const { date, time } = isoToLocalInputs(n.publishAt);
    form.publishMode = 'date';
    form.publishDate = date;
    form.publishTime = time;
    form.status = n.status;
    form.push = pushFormStateFrom(n);
  } else {
    form.text = '';
    form.hasDestination = false;
    form.destination = emptyDestination();
    form.publishMode = 'now';
    form.publishDate = '';
    form.publishTime = '';
    form.status = 'active';
    form.push = pushFormStateFrom(null);
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) resetForm();
  }
);

/** Al pasar a "Fecha y hora" en un alta, arranca en el momento actual. */
function onPublishModeChange(mode: PublishMode): void {
  if (mode === 'date' && (!form.publishDate || !form.publishTime)) {
    const { date, time } = isoToLocalInputs(new Date().toISOString());
    form.publishDate = date;
    form.publishTime = time;
  }
}

// ── Contador y preview ──────────────────────────────────────────────────

// El contador cuenta lo mismo que corta el `maxlength` del input (texto crudo).
const textLength = computed(() => form.text.length);
const warnLong = computed(() => textLength.value >= NOVEDAD_TEXT_WARN_FROM);

const publishIso = computed(() =>
  form.publishMode === 'date' ? localInputsToIso(form.publishDate, form.publishTime) : null
);

const publishHint = computed<{ text: string; class: string } | null>(() => {
  if (form.publishMode !== 'date') return null;
  if (!publishIso.value) return { text: 'Completá fecha y hora.', class: 'text-negative' };
  if (new Date(publishIso.value).getTime() > Date.now()) {
    return {
      text: `Queda programada: se publica el ${formatPublishAt(publishIso.value)}.`,
      class: 'text-grey-7',
    };
  }
  return { text: 'Esa fecha ya pasó: se publica de inmediato.', class: 'text-grey-7' };
});

// ── Push opcional ───────────────────────────────────────────────────────

/** La push ya se encoló: toggle y título quedan congelados. */
const pushLocked = computed(() => props.novedad?.pushQueuedAt != null);
const pushSentLabel = computed(() =>
  props.novedad?.pushQueuedAt ? formatPublishAt(props.novedad.pushQueuedAt) : ''
);
const pushTitleErrorText = computed(() =>
  form.push.enabled ? pushTitleError(form.push.title) : null
);

const pushHelpText = computed(() => {
  const audience =
    'La reciben los socios activos de las sedes elegidas que tengan prendidas las notificaciones de Novedades.';
  const publishesLater =
    publishIso.value !== null && new Date(publishIso.value).getTime() > Date.now();
  const when = publishesLater
    ? `Sale a la hora programada (${formatPublishAt(publishIso.value ?? '')}).`
    : 'Sale al publicarse: en los próximos minutos después de guardar.';
  const paused = form.status === 'paused' ? ' Mientras esté pausada no sale.' : '';
  return `${audience} ${when}${paused} Una vez enviada no se puede editar ni reenviar.`;
});

const formScope = computed(() =>
  scopeFromSelection(form.selectedBranchIds, props.branches, isOwner.value)
);

const previewItem = computed<NovedadPreviewItem>(() => {
  const whenLabel =
    publishIso.value && new Date(publishIso.value).getTime() <= Date.now()
      ? relativeDaysLabel(publishIso.value, new Date())
      : 'hoy';
  return {
    key: 'editor',
    text: form.text.trim() || 'Escribí la novedad…',
    whenLabel,
    hasDestination: form.hasDestination,
  };
});

// ── Validación ──────────────────────────────────────────────────────────

const canSave = computed(() => {
  const len = form.text.trim().length;
  if (len < 1 || len > NOVEDAD_TEXT_MAX) return false;
  if (form.selectedBranchIds.length === 0) return false;
  if (form.publishMode === 'date' && !publishIso.value) return false;
  if (!pushLocked.value && pushTitleErrorText.value !== null) return false;
  return true;
});

// ── Guardar ─────────────────────────────────────────────────────────────

const saving = ref(false);

interface DestinationFields {
  destinationType: 'app_section' | 'whatsapp_sales' | null;
  destinationSection: string | null;
  whatsappText: string | null;
}

/** Destino del formulario normalizado: `app_section` no lleva texto, WhatsApp no lleva sección. */
function formDestination(): DestinationFields {
  if (!form.hasDestination) {
    return { destinationType: null, destinationSection: null, whatsappText: null };
  }
  if (form.destination.type === 'whatsapp_sales') {
    return {
      destinationType: 'whatsapp_sales',
      destinationSection: null,
      whatsappText: form.destination.whatsappText,
    };
  }
  return {
    destinationType: 'app_section',
    destinationSection: form.destination.section,
    whatsappText: null,
  };
}

function sameIds(a: number[], b: number[]): boolean {
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.length === right.length && left.every((id, i) => id === right[i]);
}

function buildCreatePayload(): CreateNovedadInput {
  const payload: CreateNovedadInput = {
    text: form.text.trim(),
    scopeBranchIds: formScope.value,
    ...formDestination(),
    status: form.status,
    ...pushFieldsForCreate(form.push),
  };
  // "Ahora" = sin publishAt (el server pone la hora actual).
  if (form.publishMode === 'date' && publishIso.value) payload.publishAt = publishIso.value;
  return payload;
}

/** Solo los campos que cambiaron. El destino, siempre completo (el server lo reemplaza entero). */
function buildUpdatePayload(original: AdminNovedad): UpdateNovedadInput {
  const payload: UpdateNovedadInput = {};
  const text = form.text.trim();
  if (text !== original.text) payload.text = text;
  if (!sameIds(initialSelection, form.selectedBranchIds)) {
    payload.scopeBranchIds = formScope.value;
  }

  const dest = formDestination();
  if (
    dest.destinationType !== original.destinationType ||
    dest.destinationSection !== original.destinationSection ||
    dest.whatsappText !== original.whatsappText
  ) {
    Object.assign(payload, dest);
  }

  if (form.publishMode === 'now') {
    payload.publishAt = new Date().toISOString();
  } else if (publishIso.value) {
    const originalInputs = isoToLocalInputs(original.publishAt);
    if (form.publishDate !== originalInputs.date || form.publishTime !== originalInputs.time) {
      payload.publishAt = publishIso.value;
    }
  }

  if (form.status !== original.status) payload.status = form.status;
  Object.assign(payload, pushFieldsForUpdate(original, form.push));
  return payload;
}

async function handleSave(): Promise<void> {
  saving.value = true;
  try {
    if (props.novedad) {
      const payload = buildUpdatePayload(props.novedad);
      if (Object.keys(payload).length === 0) {
        // Nada cambió: el server respondería 400 por body vacío.
        localOpen.value = false;
        return;
      }
      await commsApi.updateNovedad(props.novedad.id, payload);
    } else {
      await commsApi.createNovedad(buildCreatePayload());
    }
    $q.notify({
      type: 'positive',
      message: props.novedad ? 'Novedad actualizada' : 'Novedad creada',
    });
    emit('saved');
    localOpen.value = false;
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo guardar la novedad');
    log.error('Error saving novedad', { error: message, novedadId: props.novedad?.id ?? null });
    $q.notify({ type: 'negative', message });
  } finally {
    saving.value = false;
  }
}

onUnmounted(() => {
  commsApi.cleanup();
});
</script>
