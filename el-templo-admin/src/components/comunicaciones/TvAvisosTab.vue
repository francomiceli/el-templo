<!-- Pestaña "Avisos en TV" de Comunicaciones (Fase 193, plan 16, D-24/D-29).
     Entidad APARTE de los avisos de la app (plan 11): título+cuerpo, sedes,
     modo (manual | flex_inicio | flex_final) y activo/inactivo manual, SIN
     destino/alcance por país-segmento/vigencia/frecuencia (esos campos no
     existen en `tv_avisos`, D-24). El editor completo (con vista previa de la
     placa) vive en TvAvisoEditorDialog.vue (Task 2 de este plan).

     Gate de módulo (D-23): las 4 rutas `/communications/tv/admin/tv-avisos*`
     están envueltas en `moduleScope(app, 'templo-training', ...)` — un tenant
     con ese módulo apagado recibe 404 EN VEZ de la lista (mismo criterio que
     cualquier otra ruta gateada por módulo, T-176-04: 404 y no 403, para no
     revelar que el feature existe). Como el 404 de "módulo apagado" y un 404
     de "ruta que no existe" son indistinguibles a propósito, tratamos
     CUALQUIER 404 de este GET (que normalmente nunca da 404 — es un listado
     sin id) como "módulo apagado" y mostramos un estado vacío explicativo en
     vez de un error rojo. -->
<template>
  <div>
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-subtitle1 text-weight-medium">Avisos en TV</div>
        <div class="text-caption text-grey-7">
          Placa que se ve en la pantalla del televisor de la sede.
        </div>
      </div>
      <div class="col-auto">
        <q-btn
          v-if="!moduleDisabled"
          color="primary"
          icon="add"
          label="Nuevo aviso de TV"
          unelevated
          @click="openCreate"
        />
      </div>
    </div>

    <div v-if="moduleDisabled" class="text-center q-pa-xl text-grey-7">
      <q-icon name="tv_off" size="48px" color="grey-5" />
      <div class="text-subtitle1 q-mt-md">
        El módulo de TV no está habilitado para este gimnasio
      </div>
      <div class="text-caption">
        Los avisos de TV dependen del módulo de entrenamiento en vivo (control de clase +
        pantalla de sede), que está apagado para este tenant.
      </div>
    </div>

    <template v-else>
      <!-- D-25/D-26: ayuda contextual sobre por qué el profe a veces no ve el
           botón AVISO en el control (lección L4 de la fase). -->
      <q-banner class="bg-orange-1 text-orange-10 q-mb-md" rounded dense>
        <template #avatar>
          <q-icon name="info" color="orange-9" />
        </template>
        En modo <strong>Manual</strong>, el profe ve un botón AVISO en el control y el aviso
        queda en pantalla completa hasta que avanza de bloque. El botón solo aparece cuando hay
        un aviso Manual <strong>activo</strong> para la sede — si el profe no lo ve, revisá que
        el aviso esté activo y que la sede esté en su alcance. En modo reemplazo, el texto ocupa
        el lugar de la cápsula (flexibilidad inicial) o de la frase (cierre), sin que el profe
        tenga que hacer nada.
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
        <template #body-cell-mode="props">
          <q-td :props="props">
            {{ MODE_LABELS[props.row.mode as TvAvisoMode] }}
          </q-td>
        </template>

        <template #body-cell-sedes="props">
          <q-td :props="props">
            {{ sedesLabel(props.row) }}
          </q-td>
        </template>

        <template #body-cell-isActive="props">
          <q-td :props="props">
            <q-toggle
              :model-value="props.row.isActive"
              color="primary"
              :disable="togglingId === props.row.id"
              @update:model-value="(value: boolean) => onToggleActive(props.row, value)"
            />
          </q-td>
        </template>

        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn flat round dense icon="edit" color="primary" @click="openEdit(props.row)">
              <q-tooltip>Editar</q-tooltip>
            </q-btn>
            <q-btn
              flat
              round
              dense
              icon="delete"
              color="negative"
              @click="confirmDelete(props.row)"
            >
              <q-tooltip>Borrar</q-tooltip>
            </q-btn>
          </q-td>
        </template>

        <template #no-data>
          <div class="full-width text-center q-pa-lg text-grey-6">
            No hay avisos de TV todavía. Creá uno con "Nuevo aviso de TV".
          </div>
        </template>
      </q-table>
    </template>

    <TvAvisoEditorDialog v-model="editorOpen" :aviso="editingAviso" @saved="onSaved" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import axios from 'axios';
import { useQuasar } from 'quasar';
import type { QTableColumn } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import TvAvisoEditorDialog from 'src/components/comunicaciones/TvAvisoEditorDialog.vue';
import { useCommunicationsApi } from 'src/composables/useCommunicationsApi';
import type { TvAvisoRow, TvAvisoMode } from 'src/composables/useCommunicationsApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import type { BranchOption } from 'src/types/member';

const log = createLogger('TvAvisosTab');
const $q = useQuasar();
const commsApi = useCommunicationsApi();
const membersApi = useMembersApi();

const avisos = ref<TvAvisoRow[]>([]);
const branches = ref<BranchOption[]>([]);
const loading = ref(true);
const moduleDisabled = ref(false);
const togglingId = ref<number | null>(null);

const editorOpen = ref(false);
const editingAviso = ref<TvAvisoRow | null>(null);

const MODE_LABELS: Record<TvAvisoMode, string> = {
  manual: 'Manual',
  flex_inicio: 'Reemplaza flexibilidad inicial',
  flex_final: 'Reemplaza flexibilidad final',
};

const columns: QTableColumn[] = [
  { name: 'title', label: 'Título', field: 'title', align: 'left', sortable: true },
  { name: 'mode', label: 'Modo', field: 'mode', align: 'left', sortable: true },
  { name: 'sedes', label: 'Sedes', field: 'scopeBranchIds', align: 'left' },
  { name: 'isActive', label: 'Activo', field: 'isActive', align: 'center' },
  { name: 'actions', label: '', field: 'id', align: 'center' },
];

function sedesLabel(row: TvAvisoRow): string {
  if (!row.scopeBranchIds || row.scopeBranchIds.length === 0) return 'Todas';
  const names = row.scopeBranchIds.map((id) => {
    const branch = branches.value.find((b) => b.id === id);
    return branch?.name ?? `#${id}`;
  });
  return names.join(', ');
}

/** 404 en este GET sin id normalmente es imposible: lo tratamos como el guard
 * de módulo apagado (D-23), no como un error real. */
function isModuleGateResponse(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404;
}

async function loadBranches() {
  try {
    branches.value = await membersApi.getBranches();
  } catch (err: unknown) {
    log.error('Error loading branches', { error: extractError(err, 'Error cargando sedes') });
  }
}

async function loadAvisos() {
  loading.value = true;
  try {
    avisos.value = await commsApi.listTvAvisos();
    moduleDisabled.value = false;
  } catch (err: unknown) {
    if (isModuleGateResponse(err)) {
      moduleDisabled.value = true;
      avisos.value = [];
    } else {
      const message = extractError(err, 'Error cargando avisos de TV');
      log.error('Error loading tv avisos', { error: message });
      $q.notify({ type: 'negative', message });
    }
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingAviso.value = null;
  editorOpen.value = true;
}

function openEdit(row: TvAvisoRow) {
  editingAviso.value = row;
  editorOpen.value = true;
}

function onSaved() {
  void loadAvisos();
}

async function onToggleActive(row: TvAvisoRow, value: boolean) {
  togglingId.value = row.id;
  try {
    const updated = await commsApi.updateTvAviso(row.id, { isActive: value });
    const idx = avisos.value.findIndex((a) => a.id === row.id);
    if (idx !== -1) avisos.value[idx] = updated;
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo actualizar el aviso de TV');
    log.error('Error toggling tv aviso', { error: message, avisoId: row.id });
    $q.notify({ type: 'negative', message });
  } finally {
    togglingId.value = null;
  }
}

function confirmDelete(row: TvAvisoRow) {
  $q.dialog({
    title: 'Borrar aviso de TV',
    message: `¿Borrar el aviso "${row.title}"? Esta acción no se puede deshacer.`,
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void deleteAviso(row);
  });
}

async function deleteAviso(row: TvAvisoRow) {
  try {
    await commsApi.deleteTvAviso(row.id);
    avisos.value = avisos.value.filter((a) => a.id !== row.id);
    $q.notify({ type: 'positive', message: 'Aviso de TV borrado' });
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo borrar el aviso de TV');
    log.error('Error deleting tv aviso', { error: message, avisoId: row.id });
    $q.notify({ type: 'negative', message });
  }
}

onMounted(() => {
  void loadBranches();
  void loadAvisos();
});
onUnmounted(() => {
  commsApi.cleanup();
  membersApi.cleanup();
});
</script>
