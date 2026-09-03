<!-- Categoría "Notificaciones push" del dashboard de Comunicaciones (Fase
     193, Plan B, pedido de Franco 2026-09-03) — reemplaza la vieja
     `q-table` + sub-tabs por una grilla de `ComunicacionCard`. El listado
     (`templates`) lo carga y cachea `ComunicacionesPage.vue` (una sola vez
     al montar, para que las 4 KpiCard tengan número aunque no se haya
     visitado esta categoría) — acá solo se pide `reload` después de
     crear/editar/borrar/restaurar/toggle. Orden (plan): propias primero
     (más recientes arriba), luego sistema agrupadas por categoría.

     Plan C 2026-09-03: la grilla plana pasa a agruparse por AUDIENCIA
     (`groupByAudience`) — dentro de cada grupo de audiencia las de sistema
     pueden ser de categorías bien distintas (ej. "Solo algunos socios"
     mezcla segment_transition_* de Motivación con plan_renewal_warning_*
     de Planes), así que ACÁ se mantiene el comparador propio de siempre
     (propias por id desc, sistema por categoría+título) en vez de
     `byOriginThenTitle` genérico — perder el sub-orden por categoría sería
     peor lectura que antes. -->
<template>
  <div>
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-subtitle1 text-weight-medium">Notificaciones push</div>
        <div class="text-caption text-grey-7">
          Avisos automáticos que recibe el socio en el celular. Las propias corren con condición
          y cadencia propia; las de sistema son fijas.
        </div>
      </div>
      <div class="col-auto q-gutter-sm">
        <q-btn
          flat
          no-caps
          icon="send"
          label="Enviar ahora a segmento"
          @click="sendSegmentOpen = true"
        />
        <q-btn
          flat
          no-caps
          icon="restore"
          label="Restaurar las del sistema"
          :loading="restoring"
          @click="handleRestore"
        />
        <q-btn
          color="primary"
          icon="add"
          label="Nueva notificación"
          unelevated
          @click="openCreate"
        />
      </div>
    </div>

    <div v-if="!templates.length" class="text-center q-pa-lg text-grey-6">
      No hay notificaciones todavía.
    </div>

    <template v-else>
      <div v-for="group in groupedTemplates" :key="group.breadth" class="comm-group">
        <div class="comm-group__title">{{ group.title }} ({{ group.rows.length }})</div>
        <div class="row q-col-gutter-md">
          <div v-for="row in group.rows" :key="row.id" class="col-12 col-sm-6 col-lg-4">
            <ComunicacionCard
              :title="cardTitle(row)"
              :subtitle="cardSubtitle(row)"
              :origin="row.kind"
              :audience="audienceOfTemplate(row, branches)"
              :enabled="row.isEnabled"
              :meta="cardMeta(row)"
              :metrics="cardMetrics(row)"
              @update:enabled="(val) => toggleEnabled(row, val)"
              @edit="openEdit(row)"
              @delete="handleDelete(row)"
            />
          </div>
        </div>
      </div>
    </template>

    <PushRuleEditorDialog
      v-model="editorOpen"
      :template="editingTemplate"
      :all-templates="templates"
      @saved="emit('reload')"
    />
    <SendSegmentDialog v-model="sendSegmentOpen" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import ComunicacionCard from 'src/components/comunicaciones/ComunicacionCard.vue';
import PushRuleEditorDialog from 'src/components/comunicaciones/PushRuleEditorDialog.vue';
import SendSegmentDialog from 'src/components/comunicaciones/SendSegmentDialog.vue';
import { useCommunicationsApi } from 'src/composables/useCommunicationsApi';
import type { TemplateRow } from 'src/composables/useCommunicationsApi';
import { confirmDeleteComunicacion } from 'src/utils/confirm-delete-comunicacion';
import {
  categoryLabel,
  findRuleTrigger,
  systemTriggerDescription,
} from 'src/config/rule-triggers';
import type { BranchOption } from 'src/types/member';
import { audienceOfTemplate, groupByAudience } from 'src/utils/comunicaciones-audience';

const log = createLogger('PushTab');
const $q = useQuasar();
const commsApi = useCommunicationsApi();

const props = defineProps<{ templates: TemplateRow[]; branches: BranchOption[] }>();
const emit = defineEmits<{ reload: [] }>();

const groupedTemplates = computed(() =>
  groupByAudience(props.templates, (row) => audienceOfTemplate(row, props.branches), (a, b) => {
    if (a.kind !== b.kind) return a.kind === 'custom' ? -1 : 1;
    if (a.kind === 'custom') return b.id - a.id;
    return a.category.localeCompare(b.category) || a.title.localeCompare(b.title);
  }),
);

function cardTitle(row: TemplateRow): string {
  return row.kind === 'custom' && row.name ? row.name : row.title;
}

function cardSubtitle(row: TemplateRow): string {
  return row.kind === 'custom' && row.name ? row.title : categoryLabel(row.category);
}

function alcanceLabel(row: TemplateRow): string {
  const parts: string[] = [];
  if (row.scopeBranchIds?.length) parts.push(`${row.scopeBranchIds.length} sede(s)`);
  if (row.scopeCountries?.length) parts.push(row.scopeCountries.join('/'));
  return parts.length ? parts.join(' · ') : 'Todos los socios';
}

function cardMeta(row: TemplateRow): Array<{ icon: string; text: string }> {
  if (row.kind === 'system') {
    return [
      { icon: 'bolt', text: systemTriggerDescription(row.templateKey) },
      { icon: 'category', text: categoryLabel(row.category) },
    ];
  }
  const trigger = row.triggerType ? findRuleTrigger(row.triggerType) : undefined;
  const conditionText = trigger
    ? trigger.needsValue
      ? `${trigger.label.replace('N', String(row.triggerValue ?? '?'))}`
      : trigger.needsSegment
        ? `Segmento: ${row.triggerSegment ?? '?'}`
        : trigger.label
    : 'Sin condición';
  return [
    { icon: 'bolt', text: conditionText },
    { icon: 'place', text: alcanceLabel(row) },
    { icon: 'schedule', text: `No repetir antes de ${row.cooldownDays} días` },
  ];
}

function formatRate(rate: number): string {
  return rate > 0 ? `${rate.toFixed(1)}%` : '—';
}

function cardMetrics(row: TemplateRow): Array<{ label: string; value: string | number }> {
  return [
    { label: 'Enviados', value: row.sentCount },
    { label: 'Abiertos', value: row.openedCount },
    { label: 'Apertura', value: formatRate(row.openRate) },
  ];
}

// ── Editor ─────────────────────────────────────────────────────────────
const editorOpen = ref(false);
const editingTemplate = ref<TemplateRow | null>(null);

function openCreate(): void {
  editingTemplate.value = null;
  editorOpen.value = true;
}

function openEdit(row: TemplateRow): void {
  editingTemplate.value = row;
  editorOpen.value = true;
}

// ── Enviar a segmento ──────────────────────────────────────────────────
const sendSegmentOpen = ref(false);

// ── Toggle activo/pausado ─────────────────────────────────────────────
async function toggleEnabled(row: TemplateRow, enabled: boolean): Promise<void> {
  try {
    await commsApi.updateTemplate(row.id, { isEnabled: enabled });
    emit('reload');
  } catch (err: unknown) {
    const message = extractError(err, 'Error actualizando la notificación');
    log.error('Error toggling template', { error: message, templateId: row.id });
    $q.notify({ type: 'negative', message });
  }
}

// ── Borrar (homogéneo: también sistema) ───────────────────────────────
async function handleDelete(row: TemplateRow): Promise<void> {
  const label = cardTitle(row);
  const ok = await confirmDeleteComunicacion($q, {
    title: 'Borrar notificación',
    itemLabel: label,
    isSystem: row.kind === 'system',
  });
  if (!ok) return;

  try {
    await commsApi.deleteTemplate(row.id);
    $q.notify({ type: 'positive', message: 'Notificación borrada' });
    emit('reload');
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo borrar la notificación');
    log.error('Error deleting template', { error: message, templateId: row.id });
    $q.notify({ type: 'negative', message });
  }
}

// ── Restaurar las del sistema (ADMIN_ROLES en el server, homogéneo con avisos) ──
const restoring = ref(false);

async function handleRestore(): Promise<void> {
  restoring.value = true;
  try {
    const { restored } = await commsApi.restoreSystemTemplates();
    $q.notify({
      type: 'positive',
      message:
        restored > 0
          ? `${restored} notificaciones de sistema restauradas`
          : 'Ya estaban todas las notificaciones de sistema',
    });
    emit('reload');
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudieron restaurar las notificaciones de sistema');
    log.error('Error restoring system templates', { error: message });
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
