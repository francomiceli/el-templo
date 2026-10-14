<!-- Categoría "Novedades" del dashboard de Comunicaciones: las oraciones cortas
     que el socio ve arriba de Mi Templo. El listado (`novedades`, incluye
     pausadas y programadas, con vistas y clics) y las sedes los resuelve
     `ComunicacionesPage.vue` al montar; acá solo se pide `reload` tras
     crear/editar/borrar/toggle (mismo contrato que `TvAvisosTab.vue`).

     Arriba: vista previa de la card de la app tal como la vería un socio de la
     sede elegida (regla D-4 aplicada en el cliente, `visibleNovedadesForBranch`).
     Debajo: todas las novedades como `ComunicacionCard`, ordenadas como las
     devuelve el server (`publishAt DESC`). -->
<template>
  <div>
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-subtitle1 text-weight-medium">Novedades de Mi Templo</div>
        <div class="text-caption text-grey-7">
          Oraciones cortas que el socio ve arriba de Mi Templo. Ve hasta las 3 más recientes de su
          sede.
        </div>
      </div>
      <div class="col-auto">
        <q-btn color="primary" icon="add" label="Nueva novedad" unelevated @click="openCreate" />
      </div>
    </div>

    <div class="nov-tab__preview q-mb-lg">
      <div class="row items-center q-col-gutter-md q-mb-sm">
        <div class="col-12 col-sm-auto">
          <div class="nov-tab__preview-label">Vista previa en la app</div>
        </div>
        <div v-if="branches.length" class="col-12 col-sm">
          <q-select
            v-model="viewBranchId"
            :options="branchOptions"
            label="Ver como socio de"
            dense
            outlined
            emit-value
            map-options
            style="max-width: 280px"
          />
        </div>
      </div>
      <NovedadPreview :items="previewItems" />
    </div>

    <div v-if="!novedades.length" class="text-center q-pa-lg text-grey-6">
      <q-icon name="campaign" size="40px" color="grey-5" />
      <div class="q-mt-sm">
        Todavía no hay novedades. Contale algo a tus socios con "Nueva novedad": una oración alcanza.
      </div>
    </div>

    <div v-else class="row q-col-gutter-md">
      <div v-for="row in novedades" :key="row.id" class="col-12 col-sm-6 col-lg-4">
        <ComunicacionCard
          :title="row.text"
          origin="custom"
          :audience="audienceOfNovedad(row, branches)"
          :enabled="row.status === 'active'"
          :meta="cardMeta(row)"
          :metrics="[
            { label: 'Vistas', value: row.views, hint: 'Socios que la tuvieron en pantalla' },
            { label: 'Clics', value: row.clicks, hint: 'Socios que la tocaron (si lleva a algún lado)' },
          ]"
          @update:enabled="(val) => toggleActive(row, val)"
          @edit="openEdit(row)"
          @delete="handleDelete(row)"
        >
          <template #extra-actions>
            <q-badge
              v-if="isScheduled(row, now)"
              color="amber-9"
              text-color="white"
              label="Programada"
              class="q-mr-xs"
            />
          </template>
        </ComunicacionCard>
      </div>
    </div>

    <NovedadEditorDialog
      v-model="editorOpen"
      :novedad="editingNovedad"
      :branches="branches"
      @saved="emit('reload')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import NovedadEditorDialog from 'src/components/comunicaciones/NovedadEditorDialog.vue';
import NovedadPreview from 'src/components/comunicaciones/NovedadPreview.vue';
import ComunicacionCard from 'src/components/comunicaciones/ComunicacionCard.vue';
import { useCommunicationsApi } from 'src/composables/useCommunicationsApi';
import type { AdminNovedad } from 'src/composables/useCommunicationsApi';
import type { BranchOption } from 'src/types/member';
import { confirmDeleteComunicacion } from 'src/utils/confirm-delete-comunicacion';
import { audienceOfNovedad } from 'src/utils/comunicaciones-audience';
import {
  formatPublishAt,
  isScheduled,
  novedadDestinationLabel,
  relativeDaysLabel,
  visibleNovedadesForBranch,
} from 'src/utils/novedades';
import type { NovedadPreviewItem } from 'src/utils/novedades';

const log = createLogger('NovedadesTab');
const $q = useQuasar();
const commsApi = useCommunicationsApi();

const props = defineProps<{
  novedades: AdminNovedad[];
  branches: BranchOption[];
}>();
const emit = defineEmits<{ reload: [] }>();

// "Ahora" de la pantalla: se refresca cada vez que cambia la lista (alcanza
// para decidir programada vs. publicada, sin timers).
const now = ref(new Date());
watch(
  () => props.novedades,
  () => {
    now.value = new Date();
  },
);

// ── Vista previa "Ver como socio de" ─────────────────────────────────────

const viewBranchId = ref<number | null>(null);
const branchOptions = computed(() => props.branches.map((b) => ({ label: b.name, value: b.id })));

// Arranca en la primera sede apenas llegan (o si la elegida desapareció).
watch(
  () => props.branches,
  (branches) => {
    if (branches.length === 0) {
      viewBranchId.value = null;
    } else if (!branches.some((b) => b.id === viewBranchId.value)) {
      viewBranchId.value = branches[0]!.id;
    }
  },
  { immediate: true },
);

const previewItems = computed<NovedadPreviewItem[]>(() => {
  const branchName = props.branches.find((b) => b.id === viewBranchId.value)?.name ?? null;
  return visibleNovedadesForBranch(props.novedades, viewBranchId.value, now.value).map((n) => ({
    key: n.id,
    text: n.text,
    // D-6: global = sin etiqueta de sede; con scope = sede del socio.
    branchLabel: n.scopeBranchIds && n.scopeBranchIds.length > 0 ? branchName : null,
    whenLabel: relativeDaysLabel(n.publishAt, now.value),
    hasDestination: n.destinationType !== null,
  }));
});

// ── Cards ────────────────────────────────────────────────────────────────

function cardMeta(row: AdminNovedad): Array<{ icon: string; text: string }> {
  const scheduled = isScheduled(row, now.value);
  const meta = [
    {
      icon: scheduled ? 'schedule' : 'event',
      text: `${scheduled ? 'Se publica' : 'Publicada'} ${formatPublishAt(row.publishAt)}`,
    },
  ];
  const destination = novedadDestinationLabel(row);
  if (destination) meta.push({ icon: 'ads_click', text: `Lleva a: ${destination}` });
  return meta;
}

// ── Acciones ─────────────────────────────────────────────────────────────

const editorOpen = ref(false);
const editingNovedad = ref<AdminNovedad | null>(null);

function openCreate(): void {
  editingNovedad.value = null;
  editorOpen.value = true;
}

function openEdit(row: AdminNovedad): void {
  editingNovedad.value = row;
  editorOpen.value = true;
}

async function toggleActive(row: AdminNovedad, value: boolean): Promise<void> {
  try {
    await commsApi.updateNovedad(row.id, { status: value ? 'active' : 'paused' });
    emit('reload');
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo actualizar la novedad');
    log.error('Error toggling novedad', { error: message, novedadId: row.id });
    $q.notify({ type: 'negative', message });
    // El toggle de la card es controlado: recargar vuelve al estado real.
    emit('reload');
  }
}

async function handleDelete(row: AdminNovedad): Promise<void> {
  const ok = await confirmDeleteComunicacion($q, {
    title: 'Borrar novedad',
    itemLabel: row.text,
    isSystem: false,
  });
  if (!ok) return;

  try {
    await commsApi.deleteNovedad(row.id);
    $q.notify({ type: 'positive', message: 'Novedad borrada' });
    emit('reload');
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo borrar la novedad');
    log.error('Error deleting novedad', { error: message, novedadId: row.id });
    $q.notify({ type: 'negative', message });
  }
}
</script>

<style lang="scss" scoped>
.nov-tab__preview-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6b6459;
}
</style>
