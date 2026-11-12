<!-- Editor de avisos de TV (Fase 193, plan 16, D-24).
     Entidad APARTE de "Avisos en la app" (AvisoEditorDialog.vue, plan 11):
     solo título, cuerpo, modo, sedes y activo — sin destino, sin alcance por
     país/segmento, sin vigencia por fechas (D-24: activo/inactivo manual, la
     vigencia por fechas está diferida), sin frecuencia.

     Límites de título/cuerpo (120/400) espejan `TITLE_MAX_LENGTH`/
     `BODY_MAX_LENGTH` de `el-templo-api/src/modules/communications/
     tv-avisos-service.ts` (`assertTitleAndBody`) — la misma validación que el
     server aplica; el 400 del server se muestra igual con `notify` para
     cualquier caso que se escape al cliente (ej. sede ajena, T-193-27).

     Los tres modos (D-25/D-26/D-27/D-28, ver 193-13-SUMMARY.md
     "Next Phase Readiness"):
       - manual: el profe lo dispara desde el botón AVISO del control; sale
         de pantalla completa cuando avanza de bloque, sin timer.
       - flex_inicio: reemplaza la cápsula de la pantalla de flexibilidad
         inicial (aparece solo, sin que el profe haga nada), velo crema.
       - flex_final: reemplaza la frase de la pantalla de cierre, velo
         charcoal.
     Mutuamente excluyentes por diseño: un aviso tiene UN modo.

     Formato (2026-11-12, API migración 0332): "Placa" (título + cuerpo) o
     "Evento" — tarjeta con fecha de calendario, hora, lugar, sello y foto.
     En formato evento el Título es el NOMBRE del evento y el Cuerpo el
     SUBTÍTULO (así un televisor que todavía no recargó muestra una placa
     legible), con límites más cortos: los de `TV_AVISO_EVENTO_LIMITS`,
     espejo del service. La foto se sube a R2 con `useImageUpload` (mismo
     flujo que el logo de las marcas) y el fondo no se elige: la tarjeta es
     siempre clara. -->
<template>
  <q-dialog v-model="localOpen" persistent>
    <q-card style="min-width: 480px; max-width: 640px; width: 100%">
      <q-card-section>
        <div class="text-h6">{{ props.aviso ? 'Editar aviso de TV' : 'Nuevo aviso de TV' }}</div>
      </q-card-section>

      <q-card-section class="q-gutter-md" style="max-height: 70vh; overflow-y: auto">
        <div class="row items-center q-gutter-sm">
          <div class="text-body2">Formato</div>
          <q-btn-toggle
            v-model="form.formato"
            :options="formatoOptions"
            no-caps
            unelevated
            toggle-color="primary"
            color="grey-3"
            text-color="grey-9"
          />
        </div>
        <div class="text-caption text-grey-7">{{ formatoHint }}</div>

        <q-input
          v-model="form.title"
          :label="esEvento ? 'Nombre del evento' : 'Título'"
          dense
          outlined
          :maxlength="titleMax"
          counter
          :rules="[requiredRule]"
        />
        <q-input
          v-model="form.body"
          :label="esEvento ? 'Subtítulo' : 'Cuerpo'"
          :type="esEvento ? 'text' : 'textarea'"
          :autogrow="!esEvento"
          dense
          outlined
          :maxlength="bodyMax"
          counter
          :rules="[requiredRule]"
        />

        <template v-if="esEvento">
          <div class="row q-col-gutter-md">
            <div class="col-12 col-sm-6">
              <q-input
                v-model="form.eventoFecha"
                label="Fecha del evento"
                type="date"
                dense
                outlined
                stack-label
                :rules="[fechaRule]"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-input
                v-model="form.eventoHora"
                label="Hora"
                dense
                outlined
                :maxlength="EVENTO_LIMITS.hora"
                placeholder="10:00 h"
                stack-label
                :rules="[requiredRule]"
              />
            </div>
          </div>
          <q-input
            v-model="form.eventoLugar"
            label="Lugar"
            dense
            outlined
            :maxlength="EVENTO_LIMITS.lugar"
            counter
            placeholder="Cousteau · Gral. Roca 1218"
            stack-label
            :rules="[requiredRule]"
          />
          <q-input
            v-model="form.eventoSello"
            label="Sello (opcional)"
            dense
            outlined
            :maxlength="EVENTO_LIMITS.sello"
            counter
            placeholder="Gratis y abierto a todos"
            stack-label
          />

          <div>
            <div class="text-body2 q-mb-xs">Foto (opcional)</div>
            <div class="row items-center q-gutter-sm">
              <img v-if="form.eventoImageUrl" :src="form.eventoImageUrl" alt="" class="foto-thumb" />
              <q-btn
                no-caps
                outline
                color="primary"
                icon="upload"
                :label="form.eventoImageUrl ? 'Cambiar foto' : 'Subir foto'"
                :loading="uploadingImage"
                :disable="saving"
                @click="fileInputRef?.click()"
              />
              <q-btn
                v-if="form.eventoImageUrl"
                no-caps
                flat
                color="negative"
                label="Quitar foto"
                :disable="saving || uploadingImage"
                @click="form.eventoImageUrl = null"
              />
              <input
                ref="fileInputRef"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style="display: none"
                @change="onImageSelected"
              />
            </div>
            <div class="text-caption text-grey-7 q-mt-xs">
              Va a la derecha de la tarjeta, a todo el alto: conviene una foto vertical (JPG, PNG
              o WebP, hasta {{ IMAGE_MAX_MB }} MB).
            </div>
          </div>
        </template>

        <q-select
          v-model="form.mode"
          :options="modeOptions"
          label="Modo"
          dense
          outlined
          emit-value
          map-options
        />
        <div class="text-caption text-grey-7">{{ modeHint }}</div>

        <div v-if="!esEvento" class="row items-center q-gutter-sm">
          <div class="text-body2">Fondo en la TV</div>
          <q-btn-toggle
            v-model="form.tema"
            :options="temaOptions"
            no-caps
            unelevated
            toggle-color="primary"
            color="grey-3"
            text-color="grey-9"
          />
        </div>

        <TvAvisoPreview
          :tema="form.tema"
          :title="form.title"
          :body="form.body"
          :evento="eventoPreview"
        />

        <q-separator />
        <div class="text-subtitle2">Sedes</div>
        <q-select
          v-model="form.scopeBranchIds"
          :options="branchOptions"
          label="Sedes"
          dense
          outlined
          multiple
          emit-value
          map-options
          use-chips
          hint="Vacío = todas las sedes"
        />

        <q-separator />
        <q-toggle v-model="form.isActive" color="primary" label="Activo" />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancelar" v-close-popup :disable="saving" />
        <q-btn
          color="primary"
          label="Guardar"
          unelevated
          :loading="saving"
          :disable="!canSave || uploadingImage"
          @click="handleSave"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { useMembersApi } from 'src/composables/useMembersApi';
import axios from 'axios';
import {
  useCommunicationsApi,
  TV_AVISO_EVENTO_LIMITS as EVENTO_LIMITS,
  TV_AVISO_IMAGE_UPLOAD_ENDPOINT,
} from 'src/composables/useCommunicationsApi';
import type {
  TvAvisoRow,
  TvAvisoMode,
  TvAvisoTema,
  TvAvisoEvento,
  CreateTvAvisoInput,
  UpdateTvAvisoInput,
} from 'src/composables/useCommunicationsApi';
import { useImageUpload } from 'src/composables/useImageUpload';
import { eventoCalendario } from 'src/tv/evento';
import TvAvisoPreview from 'src/components/comunicaciones/TvAvisoPreview.vue';
import type { BranchOption } from 'src/types/member';

const TITLE_MAX_LENGTH = 120;
const BODY_MAX_LENGTH = 400;
/** La foto la descarga cada televisor de la sede: tope de peso en el cliente. */
const IMAGE_MAX_MB = 5;

type TvAvisoFormato = 'placa' | 'evento';

const log = createLogger('TvAvisoEditorDialog');
const $q = useQuasar();
const membersApi = useMembersApi();
const commsApi = useCommunicationsApi();
const { uploading: uploadingImage, uploadImage } = useImageUpload();

const props = defineProps<{
  modelValue: boolean;
  aviso: TvAvisoRow | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [];
}>();

const localOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const modeOptions: Array<{ label: string; value: TvAvisoMode }> = [
  { label: 'Manual', value: 'manual' },
  { label: 'Reemplaza flexibilidad inicial', value: 'flex_inicio' },
  { label: 'Reemplaza flexibilidad final', value: 'flex_final' },
];

const MODE_HINTS: Record<TvAvisoMode, string> = {
  manual:
    'El profe lo dispara con el botón AVISO en el control, en cualquier momento. Queda en pantalla completa hasta que avanza de bloque, sin timer.',
  flex_inicio:
    'Aparece solo en la pantalla de flexibilidad inicial (antes de que arranque la clase), en el lugar de la cápsula de técnica.',
  flex_final:
    'Aparece solo en la pantalla de cierre (después de terminar la clase), en el lugar de la frase.',
};

const modeHint = computed(() => MODE_HINTS[form.mode]);

const formatoOptions: Array<{ label: string; value: TvAvisoFormato }> = [
  { label: 'Placa', value: 'placa' },
  { label: 'Evento', value: 'evento' },
];

const FORMATO_HINTS: Record<TvAvisoFormato, string> = {
  placa: 'Título y cuerpo en letra grande, a pantalla completa.',
  evento:
    'Tarjeta de evento: la fecha como hoja de calendario, el nombre, la hora, el lugar, un sello y una foto.',
};

// 2026-10-06: el fondo lo elige el admin (antes salía de la pantalla previa).
const temaOptions: Array<{ label: string; value: TvAvisoTema }> = [
  { label: 'Oscuro', value: 'oscuro' },
  { label: 'Claro', value: 'claro' },
];

const branches = ref<BranchOption[]>([]);
const branchOptions = computed(() =>
  branches.value.map((b) => ({ label: b.name, value: b.id })),
);

async function loadBranches() {
  try {
    branches.value = await membersApi.getBranches();
  } catch (err: unknown) {
    log.error('Error loading branches', { error: extractError(err, 'Error cargando sedes') });
  }
}

const form = reactive({
  formato: 'placa' as TvAvisoFormato,
  title: '',
  body: '',
  mode: 'manual' as TvAvisoMode,
  tema: 'oscuro' as TvAvisoTema,
  scopeBranchIds: [] as number[],
  isActive: false,
  eventoFecha: '',
  eventoHora: '',
  eventoLugar: '',
  eventoSello: '',
  eventoImageUrl: null as string | null,
});

const fileInputRef = ref<HTMLInputElement | null>(null);
/** Cambia en cada apertura del diálogo: descarta una subida que termina tarde. */
let formSession = 0;

const esEvento = computed(() => form.formato === 'evento');
const formatoHint = computed(() => FORMATO_HINTS[form.formato]);
const titleMax = computed(() => (esEvento.value ? EVENTO_LIMITS.nombre : TITLE_MAX_LENGTH));
const bodyMax = computed(() => (esEvento.value ? EVENTO_LIMITS.subtitulo : BODY_MAX_LENGTH));

/** El evento tal como se manda al API (y como lo dibuja la vista previa). */
function buildEvento(): TvAvisoEvento {
  return {
    fecha: form.eventoFecha,
    hora: form.eventoHora.trim(),
    lugar: form.eventoLugar.trim(),
    sello: form.eventoSello.trim() || null,
    imageUrl: form.eventoImageUrl,
  };
}

const eventoPreview = computed<TvAvisoEvento | null>(() =>
  esEvento.value ? buildEvento() : null,
);

function resetForm() {
  formSession += 1;
  const a = props.aviso;
  if (a) {
    form.title = a.title;
    form.body = a.body;
    form.mode = a.mode;
    form.tema = a.tema;
    form.scopeBranchIds = a.scopeBranchIds ?? [];
    form.isActive = a.isActive;
  } else {
    form.title = '';
    form.body = '';
    form.mode = 'manual';
    form.tema = 'oscuro';
    form.scopeBranchIds = [];
    form.isActive = false;
  }
  const evento = a?.evento ?? null;
  form.formato = evento ? 'evento' : 'placa';
  form.eventoFecha = evento?.fecha ?? '';
  form.eventoHora = evento?.hora ?? '';
  form.eventoLugar = evento?.lugar ?? '';
  form.eventoSello = evento?.sello ?? '';
  form.eventoImageUrl = evento?.imageUrl ?? null;
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) resetForm();
  },
);

function requiredRule(val: string): boolean | string {
  return val.trim().length > 0 || 'Requerido';
}

function fechaRule(val: string): boolean | string {
  return eventoCalendario(val) !== null || 'Elegí el día del evento';
}

const canSave = computed(() => {
  const title = form.title.trim();
  const body = form.body.trim();
  if (!title || !body) return false;
  if (title.length > titleMax.value || body.length > bodyMax.value) return false;
  if (esEvento.value) {
    if (eventoCalendario(form.eventoFecha) === null) return false;
    if (!form.eventoHora.trim() || !form.eventoLugar.trim()) return false;
  }
  return true;
});

async function onImageSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (file.size > IMAGE_MAX_MB * 1024 * 1024) {
    $q.notify({
      type: 'negative',
      message: `La foto pesa más de ${IMAGE_MAX_MB} MB. Achicala antes de subirla.`,
    });
    return;
  }
  const session = formSession;
  try {
    const url = await uploadImage(file, TV_AVISO_IMAGE_UPLOAD_ENDPOINT);
    if (session !== formSession) {
      // El diálogo se cerró o se reabrió para otro aviso mientras subía: no pisar su foto.
      log.warn('Image upload finished after the editor changed, result discarded');
      return;
    }
    form.eventoImageUrl = url;
  } catch (err: unknown) {
    if (session !== formSession) return;
    // Sin R2 configurado el API responde 503: el resto del editor sigue funcionando.
    const message =
      axios.isAxiosError(err) && err.response?.status === 503
        ? 'El almacenamiento de imágenes no está configurado'
        : extractError(err, 'No se pudo subir la foto');
    log.error('Error uploading tv aviso image', { error: message });
    $q.notify({ type: 'negative', message });
  }
}

const saving = ref(false);

async function handleSave() {
  saving.value = true;
  try {
    if (props.aviso) {
      const payload: UpdateTvAvisoInput = {
        title: form.title.trim(),
        body: form.body.trim(),
        mode: form.mode,
        tema: form.tema,
        isActive: form.isActive,
        scopeBranchIds: form.scopeBranchIds.length ? form.scopeBranchIds : null,
        // Siempre viaja: `null` devuelve a placa un aviso que era evento.
        evento: esEvento.value ? buildEvento() : null,
      };
      await commsApi.updateTvAviso(props.aviso.id, payload);
    } else {
      const payload: CreateTvAvisoInput = {
        title: form.title.trim(),
        body: form.body.trim(),
        mode: form.mode,
        tema: form.tema,
        isActive: form.isActive,
        scopeBranchIds: form.scopeBranchIds.length ? form.scopeBranchIds : null,
        evento: esEvento.value ? buildEvento() : null,
      };
      await commsApi.createTvAviso(payload);
    }
    $q.notify({
      type: 'positive',
      message: props.aviso ? 'Aviso de TV actualizado' : 'Aviso de TV creado',
    });
    emit('saved');
    localOpen.value = false;
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo guardar el aviso de TV');
    log.error('Error saving tv aviso', { error: message, avisoId: props.aviso?.id ?? null });
    $q.notify({ type: 'negative', message });
  } finally {
    saving.value = false;
  }
}

onMounted(loadBranches);
onUnmounted(() => {
  membersApi.cleanup();
  commsApi.cleanup();
});
</script>

<style lang="scss" scoped>
.foto-thumb {
  width: 54px;
  height: 96px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.12);
}
</style>
