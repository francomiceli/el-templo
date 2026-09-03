<!-- Categoría "Tarjetas de Mi Templo" del dashboard de Comunicaciones (Fase
     193, Plan B, pedido de Franco 2026-09-03) — reemplaza la vieja
     `q-table` por una grilla de `ComunicacionCard`. El listado (`tarjetas`,
     ya filtrado a placement 'tarjeta') lo carga y cachea
     `ComunicacionesPage.vue`; acá solo se pide `reload` tras
     crear/editar/borrar/restaurar/toggle/reordenar. El editor completo
     sigue siendo `AvisoEditorDialog` con `placement="tarjeta"` (nunca se
     duplica el formulario). "Restaurar las del sistema" pega al MISMO
     endpoint que Avisos (misma entidad, distinta `placement`) — el parent
     refresca las dos listas juntas para que ninguna quede desactualizada. -->
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
      <div class="col-auto q-gutter-sm">
        <q-btn
          flat
          no-caps
          icon="restore"
          label="Restaurar las del sistema"
          :loading="restoring"
          @click="handleRestore"
        />
        <q-btn color="primary" icon="add" label="Nueva tarjeta" unelevated @click="openCreate" />
      </div>
    </div>

    <div v-if="!tarjetas.length" class="text-center q-pa-lg text-grey-6">
      No hay tarjetas todavía. Las 4 de sistema aparecen solas al abrir esta categoría por primera
      vez.
    </div>

    <div v-else class="row q-col-gutter-md">
      <div v-for="row in orderedTarjetas" :key="row.id" class="col-12 col-sm-6 col-lg-4">
        <ComunicacionCard
          :title="row.title"
          :subtitle="row.body"
          :origin="row.kind"
          :enabled="row.status === 'active'"
          :meta="cardMeta(row)"
          :metrics="cardMetrics(row)"
          @update:enabled="(val) => toggleActive(row, val)"
          @edit="openEdit(row)"
          @delete="handleDelete(row)"
        >
          <template #preview>
            <q-expansion-item dense label="Vista previa" header-class="text-caption text-grey-7">
              <AvisoPreview
                placement="tarjeta"
                :title="row.title"
                :body="row.body"
                :button-text="row.buttonText"
                :destination-label="destinationLabel(row)"
              />
            </q-expansion-item>
          </template>
          <template #extra-actions>
            <q-btn
              flat
              round
              dense
              icon="arrow_upward"
              :disable="!canMoveUp(row) || reorderingId !== null"
              @click="move(row, 'up')"
            >
              <q-tooltip>Subir</q-tooltip>
            </q-btn>
            <q-btn
              flat
              round
              dense
              icon="arrow_downward"
              :disable="!canMoveDown(row) || reorderingId !== null"
              @click="move(row, 'down')"
            >
              <q-tooltip>Bajar</q-tooltip>
            </q-btn>
          </template>
        </ComunicacionCard>
      </div>
    </div>

    <AvisoEditorDialog
      v-model="editorOpen"
      :aviso="editingAviso"
      placement="tarjeta"
      :create-sort-order="nextSortOrder"
      @saved="emit('reload')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import AvisoEditorDialog from 'src/components/comunicaciones/AvisoEditorDialog.vue';
import AvisoPreview from 'src/components/comunicaciones/AvisoPreview.vue';
import ComunicacionCard from 'src/components/comunicaciones/ComunicacionCard.vue';
import { useCommunicationsApi } from 'src/composables/useCommunicationsApi';
import type { AvisoRow } from 'src/composables/useCommunicationsApi';
import { vigenciaLabel } from 'src/utils/aviso-format';
import { confirmDeleteComunicacion } from 'src/utils/confirm-delete-comunicacion';
import { APP_SECTIONS } from 'src/config/destinations';

const log = createLogger('TarjetasTab');
const $q = useQuasar();
const commsApi = useCommunicationsApi();

const props = defineProps<{ tarjetas: AvisoRow[] }>();
const emit = defineEmits<{ reload: [] }>();

// `tarjetas` ya llega ordenada por `sortOrder, id` (mismo criterio que
// GET /me/tarjetas) — se respeta ese orden tal cual para que subir/bajar
// tenga sentido visual.
const orderedTarjetas = computed(() => props.tarjetas);

// D-15b: el alta de una tarjeta libre entra al final del orden vigente.
const nextSortOrder = computed(() => {
  if (props.tarjetas.length === 0) return 1;
  return Math.max(...props.tarjetas.map((t) => t.sortOrder)) + 1;
});

function alcanceLabel(row: AvisoRow): string {
  const parts: string[] = [];
  if (row.scopeBranchIds?.length) parts.push(`${row.scopeBranchIds.length} sede(s)`);
  if (row.scopeCountries?.length) parts.push(row.scopeCountries.join('/'));
  if (row.scopeSegments?.length) parts.push(row.scopeSegments.join('/'));
  return parts.length ? parts.join(' · ') : 'Todos';
}

function cardMeta(row: AvisoRow): Array<{ icon: string; text: string }> {
  return [
    { icon: 'event', text: vigenciaLabel(row) },
    { icon: 'place', text: alcanceLabel(row) },
    { icon: 'format_list_numbered', text: `Orden ${row.sortOrder}` },
  ];
}

function cardMetrics(row: AvisoRow): Array<{ label: string; value: string | number }> {
  return [{ label: 'Clics', value: row.clickedCount }];
}

function destinationLabel(row: AvisoRow): string {
  if (row.destinationType === 'whatsapp_sales') return 'WhatsApp de ventas';
  const section = APP_SECTIONS.find((s) => s.key === row.destinationSection);
  return section?.label ?? 'Mi Templo';
}

const editorOpen = ref(false);
const editingAviso = ref<AvisoRow | null>(null);

function openCreate(): void {
  editingAviso.value = null;
  editorOpen.value = true;
}

function openEdit(row: AvisoRow): void {
  editingAviso.value = row;
  editorOpen.value = true;
}

async function toggleActive(row: AvisoRow, enabled: boolean): Promise<void> {
  try {
    await commsApi.updateAviso(row.id, { status: enabled ? 'active' : 'paused' });
    emit('reload');
  } catch (err: unknown) {
    const message = extractError(err, 'Error actualizando la tarjeta');
    log.error('Error toggling tarjeta', { error: message, avisoId: row.id });
    $q.notify({ type: 'negative', message });
  }
}

async function handleDelete(row: AvisoRow): Promise<void> {
  const ok = await confirmDeleteComunicacion($q, {
    title: 'Borrar tarjeta',
    itemLabel: row.title,
    isSystem: row.kind === 'system',
  });
  if (!ok) return;

  try {
    await commsApi.deleteAviso(row.id);
    $q.notify({ type: 'positive', message: 'Tarjeta borrada' });
    emit('reload');
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo borrar la tarjeta');
    log.error('Error deleting tarjeta', { error: message, avisoId: row.id });
    $q.notify({ type: 'negative', message });
  }
}

// ── Orden (subir/bajar) ─────────────────────────────────────────────────
const reorderingId = ref<number | null>(null);

function canMoveUp(row: AvisoRow): boolean {
  return orderedTarjetas.value.findIndex((t) => t.id === row.id) > 0;
}

function canMoveDown(row: AvisoRow): boolean {
  const idx = orderedTarjetas.value.findIndex((t) => t.id === row.id);
  return idx >= 0 && idx < orderedTarjetas.value.length - 1;
}

async function move(row: AvisoRow, direction: 'up' | 'down'): Promise<void> {
  const idx = orderedTarjetas.value.findIndex((t) => t.id === row.id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= orderedTarjetas.value.length) return;

  const current = orderedTarjetas.value[idx];
  const neighbor = orderedTarjetas.value[swapIdx];
  if (!current || !neighbor) return;

  reorderingId.value = current.id;
  try {
    await Promise.all([
      commsApi.updateAviso(current.id, { sortOrder: neighbor.sortOrder }),
      commsApi.updateAviso(neighbor.id, { sortOrder: current.sortOrder }),
    ]);
    emit('reload');
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo reordenar la tarjeta');
    log.error('Error reordering tarjeta', { error: message, avisoId: current.id });
    $q.notify({ type: 'negative', message });
  } finally {
    reorderingId.value = null;
  }
}

// ── Restaurar las del sistema (misma entidad que Avisos) ────────────────
const restoring = ref(false);

async function handleRestore(): Promise<void> {
  restoring.value = true;
  try {
    const { restored } = await commsApi.restoreSystemAvisos();
    $q.notify({
      type: 'positive',
      message:
        restored > 0
          ? `${restored} avisos de sistema restaurados`
          : 'Ya estaban todas las tarjetas de sistema',
    });
    emit('reload');
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudieron restaurar las tarjetas de sistema');
    log.error('Error restoring system tarjetas', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    restoring.value = false;
  }
}
</script>
