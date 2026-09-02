<!-- Pestaña "Avisos en la app" de Comunicaciones (Fase 193, plan 11).
     Lista los avisos pop-up (placement === 'popup'; los de tarjeta van en la
     pestaña del plan 14) con métricas de socios únicos (D-17) y advierte
     explícitamente el orden de prioridad de los pop-ups (D-06). El editor
     completo vive en AvisoEditorDialog; "ver socios" en VerSociosDialog. -->
<template>
  <div>
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-subtitle1 text-weight-medium">Avisos en la app</div>
        <div class="text-caption text-grey-7">
          Pop-ups que ve el socio al abrir la app. Vigencia, alcance y frecuencia por aviso.
        </div>
      </div>
      <div class="col-auto">
        <q-btn color="primary" icon="add" label="Nuevo aviso" unelevated @click="openCreate" />
      </div>
    </div>

    <!-- D-06: advertencia fija del orden de prioridad, siempre visible. -->
    <q-banner class="bg-orange-1 text-orange-10 q-mb-md" rounded dense>
      <template #avatar>
        <q-icon name="priority_high" color="orange-9" />
      </template>
      Si varios pop-ups coinciden el mismo día, la app muestra uno solo, en este orden:
      vencimiento de plan → aviso vigente → calificación de clase → propuesta de mejora.
    </q-banner>

    <q-table
      :rows="avisos"
      :columns="columns"
      row-key="id"
      flat
      bordered
      :loading="loading"
      :pagination="{ rowsPerPage: 20 }"
    >
      <template #body-cell-kind="props">
        <q-td :props="props">
          <q-badge
            :color="props.row.kind === 'system' ? 'grey-7' : 'primary'"
            :label="props.row.kind === 'system' ? 'Sistema' : 'Propio'"
          />
        </q-td>
      </template>

      <template #body-cell-status="props">
        <q-td :props="props">
          <q-badge
            :color="avisoStatusColor(props.row.status)"
            :label="avisoStatusLabel(props.row.status)"
          />
        </q-td>
      </template>

      <template #body-cell-vigencia="props">
        <q-td :props="props">
          {{ vigenciaLabel(props.row) }}
        </q-td>
      </template>

      <template #body-cell-frecuencia="props">
        <q-td :props="props">
          {{ frecuenciaLabel(props.row) }}
        </q-td>
      </template>

      <template #body-cell-actions="props">
        <q-td :props="props">
          <q-btn flat round dense icon="edit" color="primary" @click="openEdit(props.row)">
            <q-tooltip>Editar</q-tooltip>
          </q-btn>
          <q-btn flat round dense icon="groups" color="primary" @click="openVerSocios(props.row)">
            <q-tooltip>Ver socios</q-tooltip>
          </q-btn>
          <q-btn
            flat
            round
            dense
            icon="delete"
            color="negative"
            :disable="props.row.kind === 'system'"
            @click="confirmDelete(props.row)"
          >
            <q-tooltip>
              {{
                props.row.kind === 'system'
                  ? 'Los avisos de sistema no se borran: pausalos'
                  : 'Borrar'
              }}
            </q-tooltip>
          </q-btn>
        </q-td>
      </template>

      <template #no-data>
        <div class="full-width text-center q-pa-lg text-grey-6">
          No hay avisos todavía. Creá uno con "Nuevo aviso".
        </div>
      </template>
    </q-table>

    <AvisoEditorDialog v-model="editorOpen" :aviso="editingAviso" @saved="onSaved" />

    <VerSociosDialog
      v-model="verSociosOpen"
      :aviso-id="verSociosAvisoId"
      :aviso-title="verSociosAvisoTitle"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import type { QTableColumn } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import AvisoEditorDialog from 'src/components/comunicaciones/AvisoEditorDialog.vue';
import VerSociosDialog from 'src/components/comunicaciones/VerSociosDialog.vue';
import { useCommunicationsApi } from 'src/composables/useCommunicationsApi';
import type { AvisoRow, AvisoFrequencyType } from 'src/composables/useCommunicationsApi';
import { vigenciaLabel, avisoStatusColor, avisoStatusLabel } from 'src/utils/aviso-format';

const log = createLogger('AvisosTab');
const $q = useQuasar();
const commsApi = useCommunicationsApi();

const avisos = ref<AvisoRow[]>([]);
const loading = ref(true);

const editorOpen = ref(false);
const editingAviso = ref<AvisoRow | null>(null);

const verSociosOpen = ref(false);
const verSociosAvisoId = ref<number | null>(null);
const verSociosAvisoTitle = ref('');

const columns: QTableColumn[] = [
  { name: 'title', label: 'Título', field: 'title', align: 'left', sortable: true },
  { name: 'kind', label: 'Tipo', field: 'kind', align: 'left', sortable: true },
  { name: 'status', label: 'Estado', field: 'status', align: 'left', sortable: true },
  { name: 'vigencia', label: 'Vigencia', field: 'startsOn', align: 'left' },
  { name: 'frecuencia', label: 'Frecuencia', field: 'frequencyType', align: 'left' },
  {
    name: 'reachedCount',
    label: 'Alcanzados',
    field: 'reachedCount',
    align: 'center',
    sortable: true,
  },
  {
    name: 'dismissedCount',
    label: 'Cerraron',
    field: 'dismissedCount',
    align: 'center',
    sortable: true,
  },
  {
    name: 'clickedCount',
    label: 'Tocaron el botón',
    field: 'clickedCount',
    align: 'center',
    sortable: true,
  },
  { name: 'actions', label: '', field: 'id', align: 'center' },
];

const FREQUENCY_LABELS: Record<AvisoFrequencyType, string> = {
  once: 'Una vez',
  every_n_days: 'Cada N días',
  every_open: 'Cada apertura',
};

function frecuenciaLabel(row: AvisoRow): string {
  if (row.frequencyType === 'every_n_days' && row.frequencyDays) {
    return `Cada ${row.frequencyDays} días`;
  }
  return FREQUENCY_LABELS[row.frequencyType];
}

async function loadAvisos() {
  loading.value = true;
  try {
    avisos.value = await commsApi.listAvisos('popup');
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando avisos');
    log.error('Error loading avisos', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingAviso.value = null;
  editorOpen.value = true;
}

function openEdit(row: AvisoRow) {
  editingAviso.value = row;
  editorOpen.value = true;
}

function openVerSocios(row: AvisoRow) {
  verSociosAvisoId.value = row.id;
  verSociosAvisoTitle.value = row.title;
  verSociosOpen.value = true;
}

function onSaved() {
  void loadAvisos();
}

function confirmDelete(row: AvisoRow) {
  if (row.kind === 'system') return;
  $q.dialog({
    title: 'Borrar aviso',
    message: `¿Borrar el aviso "${row.title}"? Esta acción no se puede deshacer.`,
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void deleteAviso(row);
  });
}

async function deleteAviso(row: AvisoRow) {
  try {
    await commsApi.deleteAviso(row.id);
    avisos.value = avisos.value.filter((a) => a.id !== row.id);
    $q.notify({ type: 'positive', message: 'Aviso borrado' });
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo borrar el aviso');
    log.error('Error deleting aviso', { error: message, avisoId: row.id });
    $q.notify({ type: 'negative', message });
  }
}

onMounted(loadAvisos);
onUnmounted(() => {
  commsApi.cleanup();
});
</script>
