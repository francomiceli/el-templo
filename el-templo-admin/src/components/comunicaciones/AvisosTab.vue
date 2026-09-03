<!-- Categoría "Avisos en la app" del dashboard de Comunicaciones (Fase 193,
     Plan B, pedido de Franco 2026-09-03) — reemplaza la vieja `q-table` por
     una grilla de `ComunicacionCard`. El listado (`avisos`, ya filtrado a
     placement 'popup') lo carga y cachea `ComunicacionesPage.vue`; acá solo
     se pide `reload` tras crear/editar/borrar/restaurar/toggle. Homogéneo:
     ahora también se borran los de sistema (antes deshabilitado, ver
     `git log` de este archivo) — "Restaurar las del sistema" los repone.

     Plan C 2026-09-03: la grilla plana pasa a agruparse por AUDIENCIA
     (`groupByAudience`, `src/utils/comunicaciones-audience.ts`) en vez de
     por origen — la línea de meta "Todos los socios" que calculaba
     `alcanceLabel` sale de acá porque ahora vive en el chip de la card. -->
<template>
  <div>
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-subtitle1 text-weight-medium">Avisos en la app</div>
        <div class="text-caption text-grey-7">
          Pop-ups que ve el socio al abrir la app. Vigencia, alcance y frecuencia por aviso.
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

    <div v-if="!avisos.length" class="text-center q-pa-lg text-grey-6">
      No hay avisos todavía. Creá uno con "Nuevo aviso".
    </div>

    <template v-else>
      <div v-for="group in groupedAvisos" :key="group.breadth" class="comm-group">
        <div class="comm-group__title">{{ group.title }} ({{ group.rows.length }})</div>
        <div class="row q-col-gutter-md">
          <div v-for="row in group.rows" :key="row.id" class="col-12 col-sm-6 col-lg-4">
            <ComunicacionCard
              :title="row.title"
              :subtitle="row.body"
              :origin="row.kind"
              :audience="audienceOfAviso(row, branches)"
              :enabled="row.status === 'active'"
              :meta="cardMeta(row)"
              :metrics="cardMetrics(row)"
              @update:enabled="(val) => toggleActive(row, val)"
              @edit="openEdit(row)"
              @delete="handleDelete(row)"
            >
              <template #preview>
                <q-expansion-item
                  dense
                  label="Vista previa"
                  header-class="text-caption text-grey-7"
                >
                  <AvisoPreview
                    placement="popup"
                    :title="row.title"
                    :body="row.body"
                    :button-text="row.buttonText"
                    :destination-label="destinationLabel(row)"
                  />
                </q-expansion-item>
              </template>
              <template #extra-actions>
                <q-btn flat round dense icon="groups" color="primary" @click="openVerSocios(row)">
                  <q-tooltip>Ver socios</q-tooltip>
                </q-btn>
              </template>
            </ComunicacionCard>
          </div>
        </div>
      </div>
    </template>

    <AvisoEditorDialog v-model="editorOpen" :aviso="editingAviso" @saved="emit('reload')" />

    <VerSociosDialog
      v-model="verSociosOpen"
      :aviso-id="verSociosAvisoId"
      :aviso-title="verSociosAvisoTitle"
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
import VerSociosDialog from 'src/components/comunicaciones/VerSociosDialog.vue';
import ComunicacionCard from 'src/components/comunicaciones/ComunicacionCard.vue';
import { useCommunicationsApi } from 'src/composables/useCommunicationsApi';
import type { AvisoRow, AvisoFrequencyType } from 'src/composables/useCommunicationsApi';
import { vigenciaLabel } from 'src/utils/aviso-format';
import { confirmDeleteComunicacion } from 'src/utils/confirm-delete-comunicacion';
import { APP_SECTIONS } from 'src/config/destinations';
import type { BranchOption } from 'src/types/member';
import { audienceOfAviso, byOriginThenTitle, groupByAudience } from 'src/utils/comunicaciones-audience';

const log = createLogger('AvisosTab');
const $q = useQuasar();
const commsApi = useCommunicationsApi();

const props = defineProps<{ avisos: AvisoRow[]; branches: BranchOption[] }>();
const emit = defineEmits<{ reload: [] }>();

const groupedAvisos = computed(() =>
  groupByAudience(
    props.avisos,
    (row) => audienceOfAviso(row, props.branches),
    byOriginThenTitle(
      (row) => row.kind,
      (row) => row.id,
      (row) => row.title,
    ),
  ),
);

const editorOpen = ref(false);
const editingAviso = ref<AvisoRow | null>(null);

const verSociosOpen = ref(false);
const verSociosAvisoId = ref<number | null>(null);
const verSociosAvisoTitle = ref('');

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

function cardMeta(row: AvisoRow): Array<{ icon: string; text: string }> {
  return [
    { icon: 'event', text: vigenciaLabel(row) },
    { icon: 'repeat', text: frecuenciaLabel(row) },
    { icon: 'open_in_new', text: destinationLabel(row) },
  ];
}

function cardMetrics(row: AvisoRow): Array<{ label: string; value: string | number }> {
  return [
    { label: 'Alcanzados', value: row.reachedCount },
    { label: 'Cerraron', value: row.dismissedCount },
    { label: 'Tocaron', value: row.clickedCount },
  ];
}

function destinationLabel(row: AvisoRow): string {
  if (row.destinationType === 'whatsapp_sales') return 'WhatsApp de ventas';
  const section = APP_SECTIONS.find((s) => s.key === row.destinationSection);
  return section?.label ?? 'Mi Templo';
}

function openCreate(): void {
  editingAviso.value = null;
  editorOpen.value = true;
}

function openEdit(row: AvisoRow): void {
  editingAviso.value = row;
  editorOpen.value = true;
}

function openVerSocios(row: AvisoRow): void {
  verSociosAvisoId.value = row.id;
  verSociosAvisoTitle.value = row.title;
  verSociosOpen.value = true;
}

async function toggleActive(row: AvisoRow, enabled: boolean): Promise<void> {
  try {
    await commsApi.updateAviso(row.id, { status: enabled ? 'active' : 'paused' });
    emit('reload');
  } catch (err: unknown) {
    const message = extractError(err, 'Error actualizando el aviso');
    log.error('Error toggling aviso', { error: message, avisoId: row.id });
    $q.notify({ type: 'negative', message });
  }
}

async function handleDelete(row: AvisoRow): Promise<void> {
  const ok = await confirmDeleteComunicacion($q, {
    title: 'Borrar aviso',
    itemLabel: row.title,
    isSystem: row.kind === 'system',
  });
  if (!ok) return;

  try {
    await commsApi.deleteAviso(row.id);
    $q.notify({ type: 'positive', message: 'Aviso borrado' });
    emit('reload');
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo borrar el aviso');
    log.error('Error deleting aviso', { error: message, avisoId: row.id });
    $q.notify({ type: 'negative', message });
  }
}

const restoring = ref(false);

async function handleRestore(): Promise<void> {
  restoring.value = true;
  try {
    const { restored } = await commsApi.restoreSystemAvisos();
    $q.notify({
      type: 'positive',
      message:
        restored > 0 ? `${restored} avisos de sistema restaurados` : 'Ya estaban todos los avisos de sistema',
    });
    emit('reload');
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudieron restaurar los avisos de sistema');
    log.error('Error restoring system avisos', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    restoring.value = false;
  }
}
</script>

<style lang="scss" scoped>
// Subheader de cada grupo de audiencia (Plan C 2026-09-03). Repetido igual
// en las 4 tabs de Comunicaciones — no hay hoja de tokens compartida entre
// componentes en este módulo (mismo criterio que `ComunicacionCard.vue`,
// que también declara sus colores localmente).
.comm-group + .comm-group {
  margin-top: 4px;
}

.comm-group__title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6b6459;
  margin: 16px 0 8px;
}
</style>

<!-- deploy: fase 193 comunicaciones (fix de tests de tenancy en el mismo push) -->