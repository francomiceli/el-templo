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
     Mutuamente excluyentes por diseño: un aviso tiene UN modo. -->
<template>
  <q-dialog v-model="localOpen" persistent>
    <q-card style="min-width: 480px; max-width: 640px; width: 100%">
      <q-card-section>
        <div class="text-h6">{{ props.aviso ? 'Editar aviso de TV' : 'Nuevo aviso de TV' }}</div>
      </q-card-section>

      <q-card-section class="q-gutter-md" style="max-height: 70vh; overflow-y: auto">
        <q-input
          v-model="form.title"
          label="Título"
          dense
          outlined
          maxlength="120"
          counter
          :rules="[requiredRule]"
        />
        <q-input
          v-model="form.body"
          label="Cuerpo"
          type="textarea"
          autogrow
          dense
          outlined
          maxlength="400"
          counter
          :rules="[requiredRule]"
        />

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

        <TvAvisoPreview :mode="form.mode" :title="form.title" :body="form.body" />

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
          :disable="!canSave"
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
import { useCommunicationsApi } from 'src/composables/useCommunicationsApi';
import type {
  TvAvisoRow,
  TvAvisoMode,
  CreateTvAvisoInput,
  UpdateTvAvisoInput,
} from 'src/composables/useCommunicationsApi';
import TvAvisoPreview from 'src/components/comunicaciones/TvAvisoPreview.vue';
import type { BranchOption } from 'src/types/member';

const TITLE_MAX_LENGTH = 120;
const BODY_MAX_LENGTH = 400;

const log = createLogger('TvAvisoEditorDialog');
const $q = useQuasar();
const membersApi = useMembersApi();
const commsApi = useCommunicationsApi();

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
  title: '',
  body: '',
  mode: 'manual' as TvAvisoMode,
  scopeBranchIds: [] as number[],
  isActive: false,
});

function resetForm() {
  const a = props.aviso;
  if (a) {
    form.title = a.title;
    form.body = a.body;
    form.mode = a.mode;
    form.scopeBranchIds = a.scopeBranchIds ?? [];
    form.isActive = a.isActive;
  } else {
    form.title = '';
    form.body = '';
    form.mode = 'manual';
    form.scopeBranchIds = [];
    form.isActive = false;
  }
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

const canSave = computed(() => {
  const title = form.title.trim();
  const body = form.body.trim();
  if (!title || !body) return false;
  if (title.length > TITLE_MAX_LENGTH || body.length > BODY_MAX_LENGTH) return false;
  return true;
});

const saving = ref(false);

async function handleSave() {
  saving.value = true;
  try {
    if (props.aviso) {
      const payload: UpdateTvAvisoInput = {
        title: form.title.trim(),
        body: form.body.trim(),
        mode: form.mode,
        isActive: form.isActive,
        scopeBranchIds: form.scopeBranchIds.length ? form.scopeBranchIds : null,
      };
      await commsApi.updateTvAviso(props.aviso.id, payload);
    } else {
      const payload: CreateTvAvisoInput = {
        title: form.title.trim(),
        body: form.body.trim(),
        mode: form.mode,
        isActive: form.isActive,
        scopeBranchIds: form.scopeBranchIds.length ? form.scopeBranchIds : null,
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
