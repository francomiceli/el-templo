<!-- Editor de avisos de la pestaña "Avisos en la app" (Fase 193, plan 11).
     D-12: solo texto (título, mensaje, botón, destino) — sin imagen.
     D-13: alcance por sede/país/segmento (vacío = todos).
     D-14: vigencia desde/hasta opcional + estado borrador/activo/pausado.
     D-11: frecuencia una vez / cada N días / cada apertura.
     Homogeneidad sistema/propias (Plan B, pedido de Franco 2026-09-03): el
     `kind: 'system'` de un aviso ya NO restringe qué campos se pueden editar
     — `CommunicationsService.updateAviso` acepta el mismo set completo para
     cualquier `kind` (la vieja restricción por `code`, D-08..D-11, se
     retiró del server). El badge de arriba es solo informativo; el
     dashboard (`ComunicacionCard.vue`) es el que muestra el chip
     Sistema/Propia homogéneo en las 4 categorías.

     Reuso por TarjetasTab.vue (plan 14, D-15): con `placement="tarjeta"` el
     bloque de Frecuencia se oculta entero (D-15b, el carrusel se ve en cada
     apertura — el service fuerza `every_open`/`null` de todos modos) y el
     alta manda `sortOrder` vía `createSortOrder` (calculado por
     TarjetasTab.vue como el siguiente lugar en el carrusel). -->
<template>
  <q-dialog v-model="localOpen" persistent>
    <q-card style="min-width: 480px; max-width: 640px; width: 100%">
      <q-card-section>
        <div class="text-h6">{{ dialogTitle }}</div>
        <q-badge v-if="isSystem" color="grey-7" label="Aviso de sistema" class="q-mt-xs" />
      </q-card-section>

      <q-card-section class="q-gutter-md" style="max-height: 65vh; overflow-y: auto">
        <q-input
          v-model="form.title"
          label="Título"
          dense
          outlined
          maxlength="200"
          counter
          :rules="[requiredRule]"
        />
        <q-input
          v-model="form.body"
          label="Mensaje"
          type="textarea"
          autogrow
          dense
          outlined
          :rules="[requiredRule]"
        />
        <q-input
          v-model="form.buttonText"
          label="Texto del botón"
          dense
          outlined
          maxlength="60"
          counter
          :rules="[requiredRule]"
        />

        <DestinoSelector v-model="form.destination" />

        <AvisoPreview
          :placement="placement"
          :title="form.title"
          :body="form.body"
          :button-text="form.buttonText"
          :destination-label="destinationLabel"
        />

        <q-separator />
        <div class="text-subtitle2">Alcance</div>
        <div class="text-caption text-grey-7 q-mb-xs">
          Vacío en los tres selectores = todos los socios.
        </div>
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
        <q-select
          v-if="isOwner"
          v-model="form.scopeCountries"
          :options="countryOptions"
          label="Países"
          dense
          outlined
          multiple
          emit-value
          map-options
          use-chips
          hint="Vacío = todos los países"
        />
        <q-select
          v-model="form.scopeSegments"
          :options="segmentOptions"
          label="Segmentos"
          dense
          outlined
          multiple
          emit-value
          map-options
          use-chips
          hint="Vacío = todos los segmentos"
        />

        <q-separator />
        <div class="text-subtitle2">Vigencia</div>
        <div class="row q-col-gutter-md">
          <div class="col-6">
            <q-input v-model="form.startsOn" label="Desde" type="date" dense outlined />
          </div>
          <div class="col-6">
            <q-input v-model="form.endsOn" label="Hasta" type="date" dense outlined />
          </div>
        </div>
        <div v-if="datesInvalid" class="text-caption text-negative">
          "Desde" no puede ser posterior a "Hasta".
        </div>
        <q-select
          v-model="form.status"
          :options="statusOptions"
          label="Estado"
          dense
          outlined
          emit-value
          map-options
        />

        <template v-if="placement === 'popup'">
          <q-separator />
          <div class="text-subtitle2">Frecuencia</div>
          <q-select
            v-model="form.frequencyType"
            :options="frequencyOptions"
            label="Frecuencia"
            dense
            outlined
            emit-value
            map-options
          />
          <q-input
            v-if="form.frequencyType === 'every_n_days'"
            v-model.number="form.frequencyDays"
            label="Cada cuántos días"
            type="number"
            min="1"
            dense
            outlined
          />
        </template>
        <div v-else class="text-caption text-grey-7">
          Las tarjetas se ven en cada apertura de Mi Templo: no tienen frecuencia por socio (D-15b).
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
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { useAuthStore } from 'src/stores/useAuthStore';
import { useMembersApi } from 'src/composables/useMembersApi';
import { useCommunicationsApi } from 'src/composables/useCommunicationsApi';
import type {
  AvisoRow,
  AvisoStatus,
  AvisoFrequencyType,
  AvisoPlacement,
  MemberSegmentKey,
  CreateAvisoInput,
  UpdateAvisoInput,
} from 'src/composables/useCommunicationsApi';
import DestinoSelector from 'src/components/comunicaciones/DestinoSelector.vue';
import AvisoPreview from 'src/components/comunicaciones/AvisoPreview.vue';
import { APP_SECTIONS, type Destination } from 'src/config/destinations';
import type { BranchOption } from 'src/types/member';

const log = createLogger('AvisoEditorDialog');
const $q = useQuasar();
const authStore = useAuthStore();
const membersApi = useMembersApi();
const commsApi = useCommunicationsApi();

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    aviso: AvisoRow | null;
    /** D-15: 'tarjeta' cuando lo reusa TarjetasTab.vue (plan 14). */
    placement?: AvisoPlacement;
    /** Solo aplica a un alta con `placement: 'tarjeta'` (siguiente lugar del carrusel, D-15b). */
    createSortOrder?: number;
  }>(),
  {
    placement: 'popup',
    createSortOrder: 0,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [];
}>();

const localOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});

const dialogTitle = computed(() => {
  if (props.placement === 'tarjeta') {
    return props.aviso ? 'Editar tarjeta' : 'Nueva tarjeta';
  }
  return props.aviso ? 'Editar aviso' : 'Nuevo aviso';
});

const isOwner = computed(() => authStore.user?.role === 'owner');
// Pedido de Franco (2026-09-03, homogeneidad sistema/propias): el server YA
// NO restringe el subset de campos editables por `code` para `kind:
// 'system'` (`CommunicationsService.updateAviso`, comentario "CUALQUIER
// `kind` acepta el mismo set completo de campos") — el chip de arriba es
// SOLO informativo. `isSystem` queda solo para el badge del título.
const isSystem = computed(() => props.aviso?.kind === 'system');

// ── Opciones ────────────────────────────────────────────────────────────

const statusOptions: Array<{ label: string; value: AvisoStatus }> = [
  { label: 'Borrador', value: 'draft' },
  { label: 'Activo', value: 'active' },
  { label: 'Pausado', value: 'paused' },
];

const frequencyOptions: Array<{ label: string; value: AvisoFrequencyType }> = [
  { label: 'Una vez', value: 'once' },
  { label: 'Cada N días', value: 'every_n_days' },
  { label: 'Cada apertura', value: 'every_open' },
];

const segmentOptions: Array<{ label: string; value: MemberSegmentKey }> = [
  { label: 'Óptima', value: 'optima' },
  { label: 'Regular', value: 'regular' },
  { label: 'Alerta', value: 'alerta' },
  { label: 'Ausente', value: 'ausente' },
];

const countryOptions = [
  { label: 'Argentina', value: 'AR' },
  { label: 'España', value: 'ES' },
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

// ── Form state ──────────────────────────────────────────────────────────

function emptyDestination(): Destination {
  return { type: 'app_section', section: 'mi_templo', whatsappText: null };
}

const form = reactive({
  title: '',
  body: '',
  buttonText: '',
  destination: emptyDestination(),
  scopeBranchIds: [] as number[],
  scopeCountries: [] as string[],
  scopeSegments: [] as MemberSegmentKey[],
  startsOn: '',
  endsOn: '',
  status: 'draft' as AvisoStatus,
  frequencyType: 'once' as AvisoFrequencyType,
  frequencyDays: 1 as number | null,
});

// Vista previa (D-16): etiqueta legible del destino elegido.
const destinationLabel = computed(() => {
  if (form.destination.type === 'whatsapp_sales') return 'WhatsApp de ventas';
  const section = APP_SECTIONS.find((s) => s.key === form.destination.section);
  return section?.label ?? 'Mi Templo';
});

function resetForm() {
  const a = props.aviso;
  if (a) {
    form.title = a.title;
    form.body = a.body;
    form.buttonText = a.buttonText;
    form.destination = {
      type: a.destinationType,
      section: a.destinationSection,
      whatsappText: a.whatsappText,
    };
    form.scopeBranchIds = a.scopeBranchIds ?? [];
    form.scopeCountries = a.scopeCountries ?? [];
    form.scopeSegments = (a.scopeSegments as MemberSegmentKey[] | null) ?? [];
    form.startsOn = a.startsOn ?? '';
    form.endsOn = a.endsOn ?? '';
    form.status = a.status;
    form.frequencyType = a.frequencyType;
    form.frequencyDays = a.frequencyDays ?? 1;
  } else {
    form.title = '';
    form.body = '';
    form.buttonText = '';
    form.destination = emptyDestination();
    form.scopeBranchIds = [];
    form.scopeCountries = [];
    form.scopeSegments = [];
    form.startsOn = '';
    form.endsOn = '';
    form.status = 'draft';
    form.frequencyType = 'once';
    form.frequencyDays = 1;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) resetForm();
  },
);

// ── Validación ──────────────────────────────────────────────────────────

function requiredRule(val: string): boolean | string {
  return val.trim().length > 0 || 'Requerido';
}

const datesInvalid = computed(() =>
  Boolean(form.startsOn && form.endsOn && form.startsOn > form.endsOn),
);

const canSave = computed(() => {
  if (!form.title.trim() || !form.body.trim() || !form.buttonText.trim()) return false;
  if (
    props.placement === 'popup' &&
    form.frequencyType === 'every_n_days' &&
    (!form.frequencyDays || form.frequencyDays < 1)
  ) {
    return false;
  }
  if (datesInvalid.value) return false;
  return true;
});

// ── Guardar ─────────────────────────────────────────────────────────────

const saving = ref(false);

async function handleSave() {
  saving.value = true;
  try {
    if (props.aviso) {
      // Homogeneidad sistema/propias (pedido de Franco 2026-09-03): el server
      // acepta el mismo set completo de campos para cualquier `kind` — acá se
      // manda todo el formulario sin gating por `isSystem`.
      const payload: UpdateAvisoInput = {
        title: form.title.trim(),
        body: form.body.trim(),
        buttonText: form.buttonText.trim(),
        destinationType: form.destination.type,
        destinationSection: form.destination.section,
        whatsappText: form.destination.whatsappText,
        status: form.status,
        startsOn: form.startsOn || null,
        endsOn: form.endsOn || null,
        scopeBranchIds: form.scopeBranchIds.length ? form.scopeBranchIds : null,
        scopeCountries: form.scopeCountries.length ? form.scopeCountries : null,
        scopeSegments: form.scopeSegments.length ? form.scopeSegments : null,
      };
      if (props.placement === 'popup') {
        payload.frequencyType = form.frequencyType;
        payload.frequencyDays = form.frequencyType === 'every_n_days' ? form.frequencyDays : null;
      }
      await commsApi.updateAviso(props.aviso.id, payload);
    } else {
      const payload: CreateAvisoInput = {
        placement: props.placement,
        title: form.title.trim(),
        body: form.body.trim(),
        buttonText: form.buttonText.trim(),
        destinationType: form.destination.type,
        destinationSection: form.destination.section,
        whatsappText: form.destination.whatsappText,
        // D-15b: las tarjetas nunca tienen frecuencia por socio — el service
        // fuerza `every_open`/`null` igual, esto solo evita mandar un valor
        // sin sentido (el bloque de Frecuencia está oculto para tarjetas).
        frequencyType: props.placement === 'tarjeta' ? 'every_open' : form.frequencyType,
        frequencyDays:
          props.placement === 'tarjeta'
            ? null
            : form.frequencyType === 'every_n_days'
              ? form.frequencyDays
              : null,
        status: form.status,
        startsOn: form.startsOn || null,
        endsOn: form.endsOn || null,
        scopeBranchIds: form.scopeBranchIds.length ? form.scopeBranchIds : null,
        scopeCountries: form.scopeCountries.length ? form.scopeCountries : null,
        scopeSegments: form.scopeSegments.length ? form.scopeSegments : null,
        sortOrder: props.placement === 'tarjeta' ? props.createSortOrder : undefined,
      };
      await commsApi.createAviso(payload);
    }
    $q.notify({ type: 'positive', message: props.aviso ? 'Aviso actualizado' : 'Aviso creado' });
    emit('saved');
    localOpen.value = false;
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo guardar el aviso');
    log.error('Error saving aviso', { error: message, avisoId: props.aviso?.id ?? null });
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
