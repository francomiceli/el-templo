<!-- Renovaciones — pantalla operativa que reemplaza el Excel semanal (SPEC
     Admin). Lista las membresías que vencen en el rango filtrado, con estado
     derivado (Renovó/Volvió tarde/Pausada se calculan solos; No renovó y el
     avance de contacto son manuales) y KPIs recalculados server-side. -->
<template>
  <q-page class="q-pa-md">
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-h5">Renovaciones</div>
        <div class="text-caption text-grey-7">
          Vencimientos de membresía y su seguimiento — reemplaza la planilla semanal
        </div>
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
    <!-- Filtros -->
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

      <div class="col-12 col-sm-3">
        <q-select
          v-model="selectedBranchId"
          :options="branchOptions"
          :display-value="selectedBranchLabel"
          label="Sucursal"
          dense
          outlined
          emit-value
          map-options
          :loading="loadingBranches"
          @update:model-value="fetchRows"
        />
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
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useQuasar, type QTableColumn } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { formatDate } from 'src/utils/format-date';
import { useRenewalsApi } from 'src/composables/useRenewalsApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import { isBranchScopedRole } from 'src/utils/branch-scope';
import { DUENO_ROLES } from 'src/config/templo-config';
import { getWeekRange } from 'src/utils/renewals-week';
import { renewalStatusMeta, renewalStatusLabel } from 'src/utils/renewal-status';
import RenewalMemberDialog from 'src/components/renovaciones/RenewalMemberDialog.vue';
import RenewalReasonsDialog from 'src/components/renovaciones/RenewalReasonsDialog.vue';
import type {
  RenewalRow,
  RenewalKpis,
  RenewalReason,
  RenewalFollowupUpdateInput,
} from 'src/types/renewals';
import type { BranchOption } from 'src/types/member';

const log = createLogger('RenovacionesPage');
const $q = useQuasar();
const renewalsApi = useRenewalsApi();
const membersApi = useMembersApi();
const authStore = useAuthStore();

const canManageReasons = computed(() =>
  (DUENO_ROLES as readonly string[]).includes(authStore.user?.role ?? '')
);

// ============================================================================
// Filtros — sucursal (mismo patrón que ReportesPage)
// ============================================================================

const selectedBranchId = ref<number | undefined>(undefined);
const branchOptions = ref<Array<{ label: string; value: number | undefined }>>([
  { label: 'Todas las sedes', value: undefined },
]);
const loadingBranches = ref(false);

const selectedBranchLabel = computed(() => {
  const match = branchOptions.value.find((o) => o.value === selectedBranchId.value);
  return match?.label ?? 'Todas las sedes';
});

async function fetchBranches() {
  loadingBranches.value = true;
  try {
    const branches = await membersApi.getBranches();
    const scoped = isBranchScopedRole(authStore.user?.role);
    branchOptions.value = scoped
      ? branches.map((b: BranchOption) => ({ label: b.name, value: b.id }))
      : [
          { label: 'Todas las sedes', value: undefined },
          ...branches.map((b: BranchOption) => ({ label: b.name, value: b.id })),
        ];
    if (scoped && selectedBranchId.value === undefined) {
      selectedBranchId.value = branches[0]?.id;
    }
  } catch (err: unknown) {
    log.error('Error cargando sucursales', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    loadingBranches.value = false;
  }
}

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

const initialWeek = getWeekRange(0);
const dateFrom = ref(initialWeek.dateFrom);
const dateTo = ref(initialWeek.dateTo);
const presetLabel = ref('Esta semana');
const showCustomRange = ref(false);
const customFrom = ref(initialWeek.dateFrom);
const customTo = ref(initialWeek.dateTo);

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
  loading.value = true;
  try {
    const result = await renewalsApi.listRenewals({
      dateFrom: dateFrom.value,
      dateTo: dateTo.value,
      branchId: selectedBranchId.value,
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

onMounted(async () => {
  await fetchBranches();
  await Promise.all([fetchRows(), fetchReasons()]);
});

onUnmounted(() => {
  renewalsApi.cleanup();
  membersApi.cleanup();
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
