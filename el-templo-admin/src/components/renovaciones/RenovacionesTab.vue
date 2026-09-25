<!-- Renovaciones — pantalla operativa que reemplaza el Excel semanal (SPEC
     Admin). Lista las membresías que vencen en el rango filtrado, con estado
     derivado (Renovó/Volvió tarde/Pausada se calculan solos; No renovó y el
     avance de contacto son manuales) y KPIs recalculados server-side.

     Movido a tab de ReportesPage (2026-09-24): la sede YA NO tiene selector
     propio acá — viene de `branchId` (el selector global de Reportes). El
     API de renovaciones no acepta un override de país por query (siempre usa
     `request.scope.country` resuelto server-side, ver
     el-templo-api/src/modules/renewals/routes.ts), así que a diferencia de
     otros tabs este no recibe/reenvía un prop de país — no habría nada que
     hacer con él del lado del cliente. -->
<template>
  <div>
    <div class="row items-center q-mb-md">
      <div class="col text-caption text-grey-7">
        Vencimientos de membresía y su seguimiento — reemplaza la planilla semanal
      </div>
      <div class="col-auto">
        <q-btn
          v-if="canManageReasons"
          flat
          round
          dense
          icon="settings"
          @click="reasonsDialogOpen = true"
        >
          <q-tooltip>Motivos de no renovación</q-tooltip>
        </q-btn>
      </div>
    </div>

    <!-- ============================================================== -->
    <!-- Filtros: solo semana — la sede es el selector global de Reportes -->
    <!-- ============================================================== -->
    <div class="row items-center q-gutter-sm q-mb-md">
      <div class="col-auto">
        <q-btn-dropdown outline :label="dateRangeLabel" icon="date_range" dense>
          <q-list dense>
            <q-item
              v-for="preset in weekPresets"
              :key="preset.label"
              clickable
              v-close-popup
              @click="applyWeekPreset(preset)"
            >
              <q-item-section>{{ preset.label }}</q-item-section>
            </q-item>
            <q-separator />
            <q-item clickable @click="showCustomRange = !showCustomRange">
              <q-item-section>Personalizado</q-item-section>
              <q-item-section side>
                <q-icon :name="showCustomRange ? 'expand_less' : 'expand_more'" />
              </q-item-section>
            </q-item>
            <template v-if="showCustomRange">
              <q-item>
                <q-item-section>
                  <q-input v-model="customFrom" type="date" label="Desde" dense outlined />
                </q-item-section>
              </q-item>
              <q-item>
                <q-item-section>
                  <q-input v-model="customTo" type="date" label="Hasta" dense outlined />
                </q-item-section>
              </q-item>
              <q-item>
                <q-item-section>
                  <q-btn
                    label="Aplicar"
                    color="primary"
                    dense
                    flat
                    v-close-popup
                    @click="applyCustomRange"
                  />
                </q-item-section>
              </q-item>
            </template>
          </q-list>
        </q-btn-dropdown>
      </div>
    </div>

    <!-- ============================================================== -->
    <!-- KPIs (clickeables: funcionan como filtro rápido por estado) -->
    <!-- ============================================================== -->
    <div class="row q-col-gutter-sm q-mb-sm">
      <div v-for="card in kpiCards" :key="card.key" class="col-6 col-sm-4 col-md-3">
        <KpiCard
          :label="card.label"
          :value="card.value"
          :hint="card.hint"
          :icon="card.icon"
          :active="statusFilter === card.filter"
          :loading="loading"
          @click="card.filter ? (statusFilter = card.filter) : null"
        />
      </div>
    </div>
    <div class="text-caption text-grey-6 q-mb-md">
      % de Renovación sobre gestionados (Renovó / Renovó + No renovó + Volvió tarde).
    </div>

    <!-- Distribución de plan nuevo -->
    <div v-if="kpis && kpis.newPlanDistribution.length > 0" class="q-mb-md">
      <div class="text-caption text-grey-7 q-mb-xs">Plan nuevo (entre renovaciones)</div>
      <div class="row q-gutter-xs">
        <q-chip
          v-for="entry in kpis.newPlanDistribution"
          :key="entry.planId"
          dense
          outline
          color="primary"
          text-color="primary"
        >
          {{ entry.planName }}: {{ entry.count }} ({{ entry.percentage.toFixed(0) }}%)
        </q-chip>
      </div>
    </div>

    <!-- ============================================================== -->
    <!-- Tabla -->
    <!-- ============================================================== -->
    <q-table
      :rows="filteredRows"
      :columns="columns"
      row-key="subscriptionId"
      :loading="loading"
      flat
      bordered
      :grid="$q.screen.lt.md"
      :pagination="{ rowsPerPage: 0 }"
      hide-pagination
      :row-class="rowClass"
    >
      <!-- ── Desktop/tablet: celdas custom ───────────────────────────── -->
      <template #body-cell-memberName="props">
        <q-td :props="props">
          <q-btn flat dense no-caps color="primary" @click="openDialog(props.row)">
            {{ props.row.memberName }}
          </q-btn>
          <q-icon v-if="props.row.manualOverridden" name="history" color="warning" size="16px" class="q-ml-xs">
            <q-tooltip>Estaba marcado No renovó; se detectó una renovación</q-tooltip>
          </q-icon>
        </q-td>
      </template>

      <template #body-cell-endDate="props">
        <q-td :props="props">{{ formatDate(props.row.endDate) }}</q-td>
      </template>

      <template #body-cell-status="props">
        <q-td :props="props">
          <q-badge :color="renewalStatusMeta(props.row.status).color" :label="renewalStatusLabel(props.row)" />
          <q-icon
            v-if="renewalStatusMeta(props.row.status).tooltip"
            name="info"
            size="14px"
            color="grey-6"
            class="q-ml-xs"
          >
            <q-tooltip>{{ renewalStatusMeta(props.row.status).tooltip }}</q-tooltip>
          </q-icon>
        </q-td>
      </template>

      <template #body-cell-phone="props">
        <q-td :props="props">
          <div class="row items-center no-wrap q-gutter-xs">
            <span>{{ props.row.phoneE164 ?? props.row.phone ?? '—' }}</span>
            <q-btn
              v-if="props.row.phoneE164 || props.row.phone"
              flat
              round
              dense
              size="sm"
              icon="content_copy"
              @click="copyPhone(props.row)"
            >
              <q-tooltip>Copiar número</q-tooltip>
            </q-btn>
            <q-icon v-if="!props.row.phoneE164" name="warning" color="warning" size="16px">
              <q-tooltip>Número inválido: revisalo en la ficha</q-tooltip>
            </q-icon>
          </div>
        </q-td>
      </template>

      <template #body-cell-messageCount="props">
        <q-td :props="props">
          <div class="row items-center no-wrap q-gutter-xs">
            <q-btn-group dense>
              <q-btn
                v-for="n in [0, 1, 2, 3, 4]"
                :key="n"
                dense
                size="sm"
                :color="props.row.messageCount === n ? 'primary' : 'grey-4'"
                :text-color="props.row.messageCount === n ? 'white' : 'grey-8'"
                :label="String(n)"
                @click="setMessageCount(props.row, n)"
              />
            </q-btn-group>
            <q-btn
              flat
              round
              dense
              size="sm"
              icon="send"
              :disable="props.row.messageCount >= 4"
              @click="incrementMessageCount(props.row)"
            >
              <q-tooltip>Marcar mensaje enviado (+1)</q-tooltip>
            </q-btn>
          </div>
        </q-td>
      </template>

      <template #body-cell-newPlanName="props">
        <q-td :props="props">{{ props.row.newPlanName ?? '—' }}</q-td>
      </template>

      <template #body-cell-reasonLabel="props">
        <q-td :props="props">{{ props.row.reasonLabel ?? '—' }}</q-td>
      </template>

      <template #body-cell-lastNote="props">
        <q-td :props="props">
          <span v-if="props.row.lastNote" class="ellipsis-note">
            {{ props.row.lastNote.content }}
            <q-tooltip>{{ props.row.lastNote.content }}</q-tooltip>
          </span>
          <span v-else class="text-grey-5">—</span>
        </q-td>
      </template>

      <!-- ── Mobile: cards (sin scroll horizontal de página) ─────────── -->
      <template #item="props">
        <div class="col-12 q-pa-xs">
          <q-card flat bordered :class="rowClass(props.row)">
            <q-card-section class="q-pb-none">
              <div class="row items-center justify-between">
                <q-btn flat dense no-caps color="primary" @click="openDialog(props.row)">
                  {{ props.row.memberName }}
                </q-btn>
                <q-badge
                  :color="renewalStatusMeta(props.row.status).color"
                  :label="renewalStatusLabel(props.row)"
                />
              </div>
              <div class="text-caption text-grey-7">
                {{ props.row.planName }} · Vence {{ formatDate(props.row.endDate) }} ·
                {{ props.row.branchName }}
              </div>
            </q-card-section>
            <q-card-section class="q-pt-sm">
              <div class="row items-center no-wrap q-gutter-xs q-mb-xs">
                <span class="text-body2">{{ props.row.phoneE164 ?? props.row.phone ?? '—' }}</span>
                <q-btn
                  v-if="props.row.phoneE164 || props.row.phone"
                  flat
                  round
                  dense
                  size="sm"
                  icon="content_copy"
                  @click="copyPhone(props.row)"
                />
                <q-icon v-if="!props.row.phoneE164" name="warning" color="warning" size="16px" />
              </div>
              <div class="row items-center no-wrap q-gutter-xs">
                <q-btn-group dense>
                  <q-btn
                    v-for="n in [0, 1, 2, 3, 4]"
                    :key="n"
                    dense
                    size="sm"
                    :color="props.row.messageCount === n ? 'primary' : 'grey-4'"
                    :text-color="props.row.messageCount === n ? 'white' : 'grey-8'"
                    :label="String(n)"
                    @click="setMessageCount(props.row, n)"
                  />
                </q-btn-group>
                <q-btn
                  flat
                  round
                  dense
                  size="sm"
                  icon="send"
                  :disable="props.row.messageCount >= 4"
                  @click="incrementMessageCount(props.row)"
                />
              </div>
            </q-card-section>
          </q-card>
        </div>
      </template>

      <template #no-data>
        <div class="full-width text-center q-pa-lg text-grey-6">
          No hay vencimientos en el rango seleccionado
        </div>
      </template>
    </q-table>

    <RenewalMemberDialog
      v-model="dialogOpen"
      :row="selectedRow"
      :reasons="reasons"
      @row-updated="onRowUpdated"
    />
    <RenewalReasonsDialog v-model="reasonsDialogOpen" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useQuasar, type QTableColumn } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import { createLogger } from 'src/utils/logger';
import { formatDate } from 'src/utils/format-date';
import { useRenewalsApi } from 'src/composables/useRenewalsApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import { DUENO_ROLES } from 'src/config/templo-config';
import { getWeekRange } from 'src/utils/renewals-week';
import { renewalStatusMeta, renewalStatusLabel } from 'src/utils/renewal-status';
import KpiCard from 'src/components/comunicaciones/KpiCard.vue';
import RenewalMemberDialog from 'src/components/renovaciones/RenewalMemberDialog.vue';
import RenewalReasonsDialog from 'src/components/renovaciones/RenewalReasonsDialog.vue';
import type {
  RenewalRow,
  RenewalKpis,
  RenewalReason,
  RenewalFollowupUpdateInput,
} from 'src/types/renewals';

// La sede viene del selector global de Reportes (`selectedBranchId`), no de
// un selector propio — ver nota de arriba sobre por qué no hay prop de país.
const props = defineProps<{
  branchId?: number | undefined;
}>();

const log = createLogger('RenovacionesTab');
const $q = useQuasar();
const renewalsApi = useRenewalsApi();
const authStore = useAuthStore();

const canManageReasons = computed(() =>
  (DUENO_ROLES as readonly string[]).includes(authStore.user?.role ?? '')
);

// ============================================================================
// Filtros — rango de fechas (semana en curso por default, hora de Argentina)
// ============================================================================

interface WeekPreset {
  label: string;
  offsetWeeks: number;
}

const weekPresets: WeekPreset[] = [
  { label: 'Semana pasada', offsetWeeks: -1 },
  { label: 'Esta semana', offsetWeeks: 0 },
  { label: 'Semana que viene', offsetWeeks: 1 },
];

// Los filtros viven en la URL (?tab=renovaciones&from=&to=&branch=) para que
// al volver de Cobros (returnTo = fullPath) la pantalla quede en la misma
// semana, sede Y tab. `syncQuery` mergea con la query existente de Reportes
// (no la pisa) y siempre reafirma `tab=renovaciones`.
const route = useRoute();
const router = useRouter();
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function queryString(key: string): string | null {
  const raw = route.query[key];
  return typeof raw === 'string' ? raw : null;
}

function initialRange(): { dateFrom: string; dateTo: string; label: string } {
  const from = queryString('from');
  const to = queryString('to');
  if (from && to && ISO_DATE.test(from) && ISO_DATE.test(to) && from <= to) {
    const preset = weekPresets.find((p) => {
      const r = getWeekRange(p.offsetWeeks);
      return r.dateFrom === from && r.dateTo === to;
    });
    return { dateFrom: from, dateTo: to, label: preset?.label ?? '' };
  }
  const week = getWeekRange(0);
  return { ...week, label: 'Esta semana' };
}

const initial = initialRange();
const dateFrom = ref(initial.dateFrom);
const dateTo = ref(initial.dateTo);
const presetLabel = ref(initial.label);
const showCustomRange = ref(false);
const customFrom = ref(initial.dateFrom);
const customTo = ref(initial.dateTo);

function syncQuery() {
  void router.replace({
    query: {
      ...route.query,
      tab: 'renovaciones',
      from: dateFrom.value,
      to: dateTo.value,
      branch: props.branchId !== undefined ? String(props.branchId) : undefined,
    },
  });
}

const dateRangeLabel = computed(() => presetLabel.value || `${dateFrom.value} - ${dateTo.value}`);

function applyWeekPreset(preset: WeekPreset) {
  const range = getWeekRange(preset.offsetWeeks);
  dateFrom.value = range.dateFrom;
  dateTo.value = range.dateTo;
  presetLabel.value = preset.label;
  showCustomRange.value = false;
  fetchRows();
}

function applyCustomRange() {
  dateFrom.value = customFrom.value;
  dateTo.value = customTo.value;
  presetLabel.value = '';
  fetchRows();
}

// ============================================================================
// Filtro rápido por estado (las tarjetas de KPI hacen de filtro clickeable)
// ============================================================================

type StatusFilter =
  | 'all'
  | 'en_proceso'
  | 'sin_contactar'
  | 'para_cerrar'
  | 'pausada'
  | 'no_renovo'
  | 'volvio_tarde';

const statusFilter = ref<StatusFilter>('all');

const filteredRows = computed(() => {
  switch (statusFilter.value) {
    case 'all':
      return rows.value;
    case 'sin_contactar':
      return rows.value.filter((r) => r.status === 'en_proceso' && r.messageCount === 0);
    case 'para_cerrar':
      return rows.value.filter((r) => r.paraCerrar);
    default:
      return rows.value.filter((r) => r.status === statusFilter.value);
  }
});

// ============================================================================
// Datos — listado + KPIs
// ============================================================================

const rows = ref<RenewalRow[]>([]);
const kpis = ref<RenewalKpis | null>(null);
const reasons = ref<RenewalReason[]>([]);
const loading = ref(false);

async function fetchRows() {
  syncQuery();
  loading.value = true;
  try {
    const result = await renewalsApi.listRenewals({
      dateFrom: dateFrom.value,
      dateTo: dateTo.value,
      branchId: props.branchId,
    });
    rows.value = result.rows;
    kpis.value = result.kpis;
  } catch (err: unknown) {
    log.error('Error cargando renovaciones', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'No se pudieron cargar las renovaciones' });
  } finally {
    loading.value = false;
  }
}

async function fetchReasons() {
  try {
    reasons.value = await renewalsApi.listReasons(false);
  } catch (err: unknown) {
    log.error('Error cargando motivos', { error: err instanceof Error ? err.message : String(err) });
  }
}

interface KpiCardConfig {
  key: string;
  label: string;
  value: number | string;
  hint?: string;
  icon: string;
  /** `null` = tarjeta no filtra (hoy solo "% Renovación", que no es un subconjunto de filas). */
  filter: StatusFilter | null;
}

const kpiCards = computed<KpiCardConfig[]>(() => {
  const k = kpis.value;
  return [
    {
      key: 'rate',
      label: '% Renovación',
      value: k?.renewalRate != null ? `${k.renewalRate.toFixed(0)}%` : '—',
      hint: 'sobre gestionados',
      icon: 'percent',
      filter: null,
    },
    {
      key: 'total',
      label: 'Vencimientos',
      value: k?.total ?? 0,
      icon: 'event_busy',
      filter: 'all',
    },
    {
      key: 'en_proceso',
      label: 'En proceso',
      value: k?.enProceso ?? 0,
      icon: 'hourglass_empty',
      filter: 'en_proceso',
    },
    {
      key: 'sin_contactar',
      label: 'Sin contactar',
      value: k?.sinContactar ?? 0,
      icon: 'phone_disabled',
      filter: 'sin_contactar',
    },
    {
      key: 'para_cerrar',
      label: 'Para cerrar',
      value: k?.paraCerrar ?? 0,
      icon: 'priority_high',
      filter: 'para_cerrar',
    },
    {
      key: 'pausadas',
      label: 'Pausadas',
      value: k?.pausadas ?? 0,
      icon: 'pause_circle',
      filter: 'pausada',
    },
    {
      key: 'no_renovo',
      label: 'No renovó',
      value: k?.noRenovo ?? 0,
      icon: 'cancel',
      filter: 'no_renovo',
    },
    {
      key: 'volvio_tarde',
      label: 'Volvió tarde',
      value: k?.volvioTarde ?? 0,
      icon: 'schedule',
      filter: 'volvio_tarde',
    },
  ];
});

// ============================================================================
// Tabla — columnas
// ============================================================================

const columns: QTableColumn[] = [
  { name: 'memberName', label: 'Nombre', field: 'memberName', align: 'left' },
  { name: 'planName', label: 'Membresía vigente', field: 'planName', align: 'left' },
  { name: 'endDate', label: 'Vencimiento', field: 'endDate', align: 'left', sortable: true },
  { name: 'branchName', label: 'Sucursal', field: 'branchName', align: 'left' },
  { name: 'phone', label: 'Celular', field: 'phone', align: 'left' },
  { name: 'status', label: 'Estado', field: 'status', align: 'left' },
  { name: 'messageCount', label: 'Mensaje', field: 'messageCount', align: 'left' },
  { name: 'newPlanName', label: 'Plan nuevo', field: 'newPlanName', align: 'left' },
  { name: 'reasonLabel', label: 'Motivo', field: 'reasonLabel', align: 'left' },
  { name: 'lastNote', label: 'Observación', field: 'lastNote', align: 'left' },
];

function rowClass(row: RenewalRow): string {
  return row.paraCerrar ? 'renewal-row--para-cerrar' : '';
}

// ============================================================================
// Acciones de fila
// ============================================================================

function replaceRow(updated: RenewalRow) {
  const idx = rows.value.findIndex((r) => r.subscriptionId === updated.subscriptionId);
  if (idx !== -1) rows.value[idx] = updated;
}

async function patchFollowup(row: RenewalRow, input: RenewalFollowupUpdateInput) {
  try {
    const updated = await renewalsApi.updateFollowup(row.subscriptionId, input);
    replaceRow(updated);
    // KPIs dependen de estado/mensaje — recargar el listado es lo más simple
    // y consistente (SPEC: "recalcular KPIs volviendo a pedir el listado").
    await fetchRows();
  } catch (err: unknown) {
    log.error('Error actualizando seguimiento', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({
      type: 'negative',
      message: renewalsApi.error.value ?? 'No se pudo actualizar',
    });
  }
}

function setMessageCount(row: RenewalRow, n: number) {
  if (row.messageCount === n) return;
  void patchFollowup(row, { messageCount: n });
}

function incrementMessageCount(row: RenewalRow) {
  if (row.messageCount >= 4) return;
  void patchFollowup(row, { messageCount: row.messageCount + 1 });
}

async function copyPhone(row: RenewalRow) {
  const target = row.phoneE164 ?? row.phone;
  if (!target) return;
  try {
    await navigator.clipboard.writeText(target);
  } catch (err: unknown) {
    log.error('Error copiando número', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'No se pudo copiar' });
    return;
  }
  $q.notify({
    type: row.phoneE164 ? 'positive' : 'warning',
    message: row.phoneE164 ? 'Copiado' : 'Número inválido: revisalo en la ficha (copiado el original)',
  });
}

// ============================================================================
// Diálogo del socio
// ============================================================================

const dialogOpen = ref(false);
const selectedRow = ref<RenewalRow | null>(null);
const reasonsDialogOpen = ref(false);

function openDialog(row: RenewalRow) {
  selectedRow.value = row;
  dialogOpen.value = true;
}

async function onRowUpdated(row: RenewalRow, refreshKpis: boolean) {
  replaceRow(row);
  if (selectedRow.value?.subscriptionId === row.subscriptionId) {
    selectedRow.value = row;
  }
  if (refreshKpis) await fetchRows();
}

// ============================================================================
// Lifecycle
// ============================================================================

// La sede es un prop (selector global de Reportes) — recargar cuando cambia.
watch(
  () => props.branchId,
  () => {
    void fetchRows();
  }
);

onMounted(async () => {
  await Promise.all([fetchRows(), fetchReasons()]);
});

onUnmounted(() => {
  renewalsApi.cleanup();
});
</script>

<style scoped lang="scss">
.ellipsis-note {
  display: inline-block;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
  cursor: default;
}

:deep(.renewal-row--para-cerrar) {
  background-color: rgba($warning, 0.12);
  box-shadow: inset 3px 0 0 $warning;
}
</style>
