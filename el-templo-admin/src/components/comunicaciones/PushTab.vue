<!-- Pestaña "Notificaciones push" de Comunicaciones (Fase 193, plan 08).
     Contenido migrado de la vieja página de Notificaciones (retirada) — dos sub-tabs
     (Plantillas automáticas / Enviar a segmento), con el ÚNICO cambio de
     fondo: el input de "Ruta de destino" de texto libre se reemplazó por
     `DestinoSelector` (D-05), y las llamadas mandan `destination:
     { type, section, whatsappText }` en vez de `route` (D-01/D-02). -->
<template>
  <div>
    <q-tabs
      v-model="tab"
      dense
      align="left"
      class="q-mb-md"
      active-color="primary"
      indicator-color="primary"
    >
      <q-tab name="plantillas" label="Plantillas automaticas" />
      <q-tab name="enviar" label="Enviar a segmento" />
    </q-tabs>

    <q-tab-panels v-model="tab" animated>
      <!-- ============================================================ -->
      <!-- Tab 1: Plantillas automaticas -->
      <!-- ============================================================ -->
      <q-tab-panel name="plantillas">
        <q-table
          :rows="templates"
          :columns="templateColumns"
          row-key="id"
          flat
          bordered
          :loading="loading"
          :pagination="{ rowsPerPage: 20 }"
        >
          <!-- Category badge -->
          <template #body-cell-category="props">
            <q-td :props="props">
              <q-badge
                :color="categoryColor(props.row.category)"
                :label="categoryLabel(props.row.category)"
              />
            </q-td>
          </template>

          <!-- Title (male + female stacked) -->
          <template #body-cell-title="props">
            <q-td :props="props" class="cursor-pointer" @click="openEdit(props.row)">
              <div class="text-primary">{{ props.row.title }}</div>
              <div
                v-if="props.row.titleFemale && props.row.titleFemale !== props.row.title"
                class="text-caption text-grey-6"
              >
                ♀ {{ props.row.titleFemale }}
              </div>
            </q-td>
          </template>

          <!-- Body (male + female stacked, truncated) -->
          <template #body-cell-body="props">
            <q-td
              :props="props"
              class="cursor-pointer"
              @click="openEdit(props.row)"
              style="max-width: 350px"
            >
              <div :class="{ ellipsis: props.row.body.length > 60 }">
                {{ truncate(props.row.body) }}
              </div>
              <div
                v-if="props.row.bodyFemale && props.row.bodyFemale !== props.row.body"
                class="text-caption text-grey-6"
                :class="{ ellipsis: props.row.bodyFemale.length > 60 }"
              >
                ♀ {{ truncate(props.row.bodyFemale) }}
              </div>
            </q-td>
          </template>

          <!-- Enable/disable toggle -->
          <template #body-cell-isEnabled="props">
            <q-td :props="props">
              <q-toggle
                :model-value="props.row.isEnabled"
                color="positive"
                @update:model-value="(val: boolean) => toggleEnabled(props.row, val)"
              />
            </q-td>
          </template>

          <!-- Open rate -->
          <template #body-cell-openRate="props">
            <q-td :props="props">
              {{ formatRate(props.row.openRate) }}
            </q-td>
          </template>

          <!-- Actions -->
          <template #body-cell-actions="props">
            <q-td :props="props">
              <q-btn flat round dense icon="edit" color="primary" @click="openEdit(props.row)">
                <q-tooltip>Editar plantilla</q-tooltip>
              </q-btn>
            </q-td>
          </template>
        </q-table>
      </q-tab-panel>

      <!-- ============================================================ -->
      <!-- Tab 2: Enviar a segmento -->
      <!-- ============================================================ -->
      <q-tab-panel name="enviar">
        <div class="q-pa-md" style="max-width: 600px">
          <q-input v-model="sendForm.title" label="Titulo" class="q-mb-md" outlined dense />
          <q-input
            v-model="sendForm.body"
            label="Mensaje"
            type="textarea"
            autogrow
            class="q-mb-md"
            outlined
            dense
          />
          <q-separator class="q-my-md" />
          <div class="text-subtitle2 q-mb-sm">Version femenina (opcional)</div>
          <q-input
            v-model="sendForm.titleFemale"
            label="Titulo (femenino)"
            class="q-mb-md"
            outlined
            dense
          />
          <q-input
            v-model="sendForm.bodyFemale"
            label="Mensaje (femenino)"
            type="textarea"
            autogrow
            class="q-mb-md"
            outlined
            dense
          />

          <DestinoSelector v-model="sendForm.destination" />

          <div class="q-mb-md q-mt-md">
            <div class="text-subtitle2 q-mb-sm">Segmentos destino</div>
            <div class="row q-gutter-sm">
              <q-checkbox
                v-for="seg in segments"
                :key="seg.value"
                v-model="sendForm.segmentIds"
                :val="seg.value"
                :label="seg.label"
              />
            </div>
          </div>

          <q-btn
            color="primary"
            label="Enviar notificacion"
            icon="send"
            :loading="sending"
            :disable="!canSend"
            @click="handleSendSegment"
            no-caps
            unelevated
          />
        </div>
      </q-tab-panel>
    </q-tab-panels>

    <!-- ============================================================ -->
    <!-- Edit template dialog -->
    <!-- ============================================================ -->
    <q-dialog v-model="editDialog">
      <q-card style="min-width: 700px; max-width: 900px">
        <q-card-section class="text-h6">Editar plantilla</q-card-section>
        <q-card-section>
          <div class="row q-col-gutter-md">
            <!-- Male / Default column -->
            <div class="col-6">
              <div class="text-subtitle2 q-mb-sm">Masculino / Default</div>
              <q-input v-model="editForm.title" label="Titulo" class="q-mb-md" outlined dense />
              <q-input
                v-model="editForm.body"
                label="Cuerpo"
                type="textarea"
                autogrow
                outlined
                dense
              />
            </div>
            <!-- Female column -->
            <div class="col-6">
              <div class="text-subtitle2 q-mb-sm">Femenino</div>
              <q-input
                v-model="editForm.titleFemale"
                label="Titulo femenino"
                class="q-mb-md"
                outlined
                dense
              />
              <q-input
                v-model="editForm.bodyFemale"
                label="Cuerpo femenino"
                type="textarea"
                autogrow
                outlined
                dense
              />
            </div>
          </div>
          <DestinoSelector v-model="editForm.destination" class="q-mt-md" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn color="primary" label="Guardar" @click="saveTemplate" :loading="saving" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useQuasar } from 'quasar';
import type { QTableColumn } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import DestinoSelector from 'src/components/comunicaciones/DestinoSelector.vue';
import { useCommunicationsApi } from 'src/composables/useCommunicationsApi';
import type {
  TemplateRow,
  MemberSegmentKey,
} from 'src/composables/useCommunicationsApi';
import type { Destination } from 'src/config/destinations';

const log = createLogger('PushTab');
const $q = useQuasar();
const commsApi = useCommunicationsApi();

// ----------------------------------------------------------------
// State
// ----------------------------------------------------------------
const tab = ref('plantillas');
const loading = ref(true);
const templates = ref<TemplateRow[]>([]);
const editDialog = ref(false);

function emptyDestination(): Destination {
  return { type: 'app_section', section: 'mi_templo', whatsappText: null };
}

const editForm = reactive({
  id: 0,
  title: '',
  body: '',
  titleFemale: '',
  bodyFemale: '',
  destination: emptyDestination(),
});
const saving = ref(false);

const sendForm = reactive({
  title: '',
  body: '',
  titleFemale: '',
  bodyFemale: '',
  destination: emptyDestination(),
  segmentIds: [] as MemberSegmentKey[],
});
const sending = ref(false);

// ----------------------------------------------------------------
// Segments
// ----------------------------------------------------------------
const segments: Array<{ value: MemberSegmentKey; label: string }> = [
  { value: 'optima', label: 'Óptima' },
  { value: 'regular', label: 'Regular' },
  { value: 'alerta', label: 'Alerta' },
  { value: 'ausente', label: 'Ausente' },
];

// ----------------------------------------------------------------
// Table columns
// ----------------------------------------------------------------
const templateColumns: QTableColumn[] = [
  { name: 'category', label: 'Categoria', field: 'category', align: 'left', sortable: true },
  { name: 'title', label: 'Titulo', field: 'title', align: 'left', sortable: true },
  { name: 'body', label: 'Cuerpo', field: 'body', align: 'left' },
  { name: 'isEnabled', label: 'Activo', field: 'isEnabled', align: 'center' },
  { name: 'sentCount', label: 'Enviados', field: 'sentCount', align: 'center', sortable: true },
  { name: 'openedCount', label: 'Abiertos', field: 'openedCount', align: 'center', sortable: true },
  { name: 'openRate', label: 'Tasa apertura', field: 'openRate', align: 'center', sortable: true },
  { name: 'actions', label: '', field: 'id', align: 'center' },
];

// ----------------------------------------------------------------
// Category helpers
// ----------------------------------------------------------------
const CATEGORY_COLORS: Record<string, string> = {
  entrenamiento: 'blue',
  programas: 'green',
  motivacion: 'orange',
  anuncios: 'purple',
};

const CATEGORY_LABELS: Record<string, string> = {
  entrenamiento: 'Entrenamiento',
  programas: 'Programas',
  motivacion: 'Motivacion',
  anuncios: 'Anuncios',
};

function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? 'grey';
}

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

function formatRate(rate: number): string {
  return `${rate.toFixed(1)}%`;
}

function truncate(text: string, max = 60): string {
  return text.length > max ? text.substring(0, max) + '...' : text;
}

// ----------------------------------------------------------------
// Computed
// ----------------------------------------------------------------
const canSend = computed(() => {
  return (
    sendForm.title.trim().length > 0 &&
    sendForm.body.trim().length > 0 &&
    sendForm.segmentIds.length > 0
  );
});

// ----------------------------------------------------------------
// API methods
// ----------------------------------------------------------------
async function loadTemplates() {
  loading.value = true;
  try {
    templates.value = await commsApi.listTemplates();
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando plantillas');
    log.error('Error loading templates', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    loading.value = false;
  }
}

async function toggleEnabled(template: TemplateRow, enabled: boolean) {
  try {
    await commsApi.updateTemplate(template.id, { isEnabled: enabled });
    template.isEnabled = enabled;
  } catch (err: unknown) {
    const message = extractError(err, 'Error actualizando plantilla');
    log.error('Error toggling template', { error: message, templateId: template.id });
    $q.notify({ type: 'negative', message });
  }
}

function openEdit(template: TemplateRow) {
  editForm.id = template.id;
  editForm.title = template.title;
  editForm.body = template.body;
  editForm.titleFemale = template.titleFemale ?? '';
  editForm.bodyFemale = template.bodyFemale ?? '';
  editForm.destination = {
    type: template.destinationType,
    section: template.destinationSection,
    whatsappText: template.whatsappText,
  };
  editDialog.value = true;
}

async function saveTemplate() {
  saving.value = true;
  try {
    const updated = await commsApi.updateTemplate(editForm.id, {
      title: editForm.title,
      body: editForm.body,
      titleFemale: editForm.titleFemale,
      bodyFemale: editForm.bodyFemale,
      destination: editForm.destination,
    });

    // Update local row
    const row = templates.value.find((t) => t.id === editForm.id);
    if (row) {
      row.title = updated.title;
      row.body = updated.body;
      row.titleFemale = updated.titleFemale;
      row.bodyFemale = updated.bodyFemale;
      row.destinationType = updated.destinationType;
      row.destinationSection = updated.destinationSection;
      row.whatsappText = updated.whatsappText;
    }

    editDialog.value = false;
    $q.notify({ type: 'positive', message: 'Plantilla actualizada' });
  } catch (err: unknown) {
    const message = extractError(err, 'Error guardando plantilla');
    log.error('Error saving template', { error: message, templateId: editForm.id });
    $q.notify({ type: 'negative', message });
  } finally {
    saving.value = false;
  }
}

async function handleSendSegment() {
  sending.value = true;
  try {
    const payload: {
      title: string;
      body: string;
      segmentIds: MemberSegmentKey[];
      destination: Destination;
      titleFemale?: string;
      bodyFemale?: string;
    } = {
      title: sendForm.title,
      body: sendForm.body,
      segmentIds: sendForm.segmentIds,
      destination: sendForm.destination,
    };
    if (sendForm.titleFemale.trim() && sendForm.bodyFemale.trim()) {
      payload.titleFemale = sendForm.titleFemale.trim();
      payload.bodyFemale = sendForm.bodyFemale.trim();
    }

    const data = await commsApi.sendSegment(payload);

    $q.notify({
      type: 'positive',
      message: `${data.queued} notificaciones enviadas`,
    });

    // Clear form
    sendForm.title = '';
    sendForm.body = '';
    sendForm.titleFemale = '';
    sendForm.bodyFemale = '';
    sendForm.destination = emptyDestination();
    sendForm.segmentIds = [];
  } catch (err: unknown) {
    const message = extractError(err, 'Error enviando notificacion');
    log.error('Error sending segment notification', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    sending.value = false;
  }
}

// ----------------------------------------------------------------
// Lifecycle
// ----------------------------------------------------------------
onMounted(loadTemplates);
onUnmounted(() => {
  commsApi.cleanup();
});
</script>
