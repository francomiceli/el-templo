<!-- Pestaña "Tarjetas de Mi Templo" de Comunicaciones (Fase 193, plan 14).
     Lista los avisos `placement === 'tarjeta'` (D-15): las 4 fijas
     (`card_improvement`/`card_referral`/`card_upsell`/`card_program`,
     `kind: 'system'`) con copy editable (D-15a) más las tarjetas libres que
     crea el staff (`kind: 'custom'`, D-15b). El editor completo es el mismo
     `AvisoEditorDialog` de la pestaña "Avisos en la app" (plan 11), con
     `placement="tarjeta"` — nunca se duplica el formulario.

     Orden (D-15b): el endpoint del socio (`GET /me/tarjetas`,
     prompt-service.ts) ordena TODAS las tarjetas por `sortOrder, id` sin
     distinguir sistema/propia — por eso acá se puede reordenar cualquier
     fila, no solo las libres; el valor de fábrica (1..4 para las fijas)
     hace que las libres nazcan después salvo que el staff las suba a mano.
     Reordenar es subir/bajar (swap de `sortOrder` con la fila vecina,
     persistido con 2 `updateAviso`): NO se reusó `useDragReorder.ts`
     (composables/) porque su contrato asume un endpoint de paso a paso
     (`reorderExercise(id, direction)`) que acá no existe — adaptarlo
     hubiera significado escribir la misma lógica de swap por debajo de una
     interfaz pensada para otro dominio, sin ganancia real en una lista de
     5-10 filas. -->
<template>
  <div>
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-subtitle1 text-weight-medium">Tarjetas de Mi Templo</div>
        <div class="text-caption text-grey-7">
          Carrusel premium que ve el socio en Mi Templo. Las 4 fijas siempre están; el staff suma
          tarjetas propias con destino, alcance y vigencia.
        </div>
      </div>
      <div class="col-auto">
        <q-btn color="primary" icon="add" label="Nueva tarjeta" unelevated @click="openCreate" />
      </div>
    </div>

    <q-table
      :rows="tarjetas"
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
            :label="props.row.kind === 'system' ? 'Sistema' : 'Propia'"
          >
            <q-tooltip v-if="props.row.kind === 'system'" max-width="260px">
              Su visibilidad la decide la app (plan, sede virtual, programa activo); acá editás el
              texto.
            </q-tooltip>
          </q-badge>
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

      <template #body-cell-alcance="props">
        <q-td :props="props">
          {{ alcanceLabel(props.row) }}
        </q-td>
      </template>

      <template #body-cell-orden="props">
        <q-td :props="props">
          <q-btn
            flat
            round
            dense
            icon="arrow_upward"
            :disable="!canMoveUp(props.row) || reorderingId !== null"
            @click="move(props.row, 'up')"
          >
            <q-tooltip>Subir</q-tooltip>
          </q-btn>
          <q-btn
            flat
            round
            dense
            icon="arrow_downward"
            :disable="!canMoveDown(props.row) || reorderingId !== null"
            @click="move(props.row, 'down')"
          >
            <q-tooltip>Bajar</q-tooltip>
          </q-btn>
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
            :disable="props.row.kind === 'system'"
            @click="confirmDelete(props.row)"
          >
            <q-tooltip>
              {{
                props.row.kind === 'system'
                  ? 'Las tarjetas de sistema no se borran: pausalas'
                  : 'Borrar'
              }}
            </q-tooltip>
          </q-btn>
        </q-td>
      </template>

      <template #no-data>
        <div class="full-width text-center q-pa-lg text-grey-6">
          No hay tarjetas todavía. Las 4 de sistema aparecen solas al abrir esta pestaña por
          primera vez.
        </div>
      </template>
    </q-table>

    <AvisoEditorDialog
      v-model="editorOpen"
      :aviso="editingAviso"
      placement="tarjeta"
      :create-sort-order="nextSortOrder"
      @saved="onSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import type { QTableColumn } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import AvisoEditorDialog from 'src/components/comunicaciones/AvisoEditorDialog.vue';
import { useCommunicationsApi } from 'src/composables/useCommunicationsApi';
import type { AvisoRow } from 'src/composables/useCommunicationsApi';
import { vigenciaLabel, avisoStatusColor, avisoStatusLabel } from 'src/utils/aviso-format';

const log = createLogger('TarjetasTab');
const $q = useQuasar();
const commsApi = useCommunicationsApi();

const tarjetas = ref<AvisoRow[]>([]);
const loading = ref(true);

const editorOpen = ref(false);
const editingAviso = ref<AvisoRow | null>(null);

// D-15b: el alta de una tarjeta libre entra al final del orden vigente
// (fijas 1..4 + libres existentes) — el staff la sube después con las
// flechas si quiere adelantarla.
const nextSortOrder = computed(() => {
  if (tarjetas.value.length === 0) return 1;
  return Math.max(...tarjetas.value.map((t) => t.sortOrder)) + 1;
});

const columns: QTableColumn[] = [
  { name: 'title', label: 'Título', field: 'title', align: 'left', sortable: true },
  { name: 'kind', label: 'Tipo', field: 'kind', align: 'left' },
  { name: 'status', label: 'Estado', field: 'status', align: 'left' },
  { name: 'vigencia', label: 'Vigencia', field: 'startsOn', align: 'left' },
  { name: 'alcance', label: 'Alcance', field: 'scopeBranchIds', align: 'left' },
  {
    name: 'clickedCount',
    label: 'Clics',
    field: 'clickedCount',
    align: 'center',
    sortable: true,
  },
  { name: 'orden', label: 'Orden', field: 'sortOrder', align: 'center' },
  { name: 'actions', label: '', field: 'id', align: 'center' },
];

function alcanceLabel(row: AvisoRow): string {
  const parts: string[] = [];
  if (row.scopeBranchIds?.length) parts.push(`${row.scopeBranchIds.length} sede(s)`);
  if (row.scopeCountries?.length) parts.push(row.scopeCountries.join('/'));
  if (row.scopeSegments?.length) parts.push(row.scopeSegments.join('/'));
  return parts.length ? parts.join(' · ') : 'Todos';
}

async function loadTarjetas() {
  loading.value = true;
  try {
    tarjetas.value = await commsApi.listAvisos('tarjeta');
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando las tarjetas');
    log.error('Error loading tarjetas', { error: message });
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

function onSaved() {
  void loadTarjetas();
}

function confirmDelete(row: AvisoRow) {
  if (row.kind === 'system') return;
  $q.dialog({
    title: 'Borrar tarjeta',
    message: `¿Borrar la tarjeta "${row.title}"? Esta acción no se puede deshacer.`,
    cancel: true,
    persistent: true,
  }).onOk(() => {
    void deleteAviso(row);
  });
}

async function deleteAviso(row: AvisoRow) {
  try {
    await commsApi.deleteAviso(row.id);
    tarjetas.value = tarjetas.value.filter((t) => t.id !== row.id);
    $q.notify({ type: 'positive', message: 'Tarjeta borrada' });
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo borrar la tarjeta');
    log.error('Error deleting tarjeta', { error: message, avisoId: row.id });
    $q.notify({ type: 'negative', message });
  }
}

// ── Orden (subir/bajar) ─────────────────────────────────────────────────
// `tarjetas` ya llega ordenada por `sortOrder, id` (mismo criterio que
// GET /me/tarjetas) — swap de `sortOrder` con la fila vecina en el arreglo.

const reorderingId = ref<number | null>(null);

function canMoveUp(row: AvisoRow): boolean {
  return tarjetas.value.findIndex((t) => t.id === row.id) > 0;
}

function canMoveDown(row: AvisoRow): boolean {
  const idx = tarjetas.value.findIndex((t) => t.id === row.id);
  return idx >= 0 && idx < tarjetas.value.length - 1;
}

async function move(row: AvisoRow, direction: 'up' | 'down') {
  const idx = tarjetas.value.findIndex((t) => t.id === row.id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= tarjetas.value.length) return;

  const current = tarjetas.value[idx];
  const neighbor = tarjetas.value[swapIdx];
  if (!current || !neighbor) return;

  reorderingId.value = current.id;
  try {
    await Promise.all([
      commsApi.updateAviso(current.id, { sortOrder: neighbor.sortOrder }),
      commsApi.updateAviso(neighbor.id, { sortOrder: current.sortOrder }),
    ]);
    await loadTarjetas();
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo reordenar la tarjeta');
    log.error('Error reordering tarjeta', { error: message, avisoId: current.id });
    $q.notify({ type: 'negative', message });
  } finally {
    reorderingId.value = null;
  }
}

onMounted(loadTarjetas);
onUnmounted(() => {
  commsApi.cleanup();
});
</script>
