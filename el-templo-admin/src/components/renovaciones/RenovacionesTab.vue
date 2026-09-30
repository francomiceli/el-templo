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
        <q-btn flat round dense icon="refresh" :loading="loading" @click="fetchRows()">
          <q-tooltip>Actualizar (ver lo que cargó otra persona)</q-tooltip>
        </q-btn>
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
    <!-- Filtros: semana + tipo de actividad — la sede es el selector
         global de Reportes -->
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
      <div class="col-auto">
        <q-select
          v-model="activityType"
          :options="activityTypeOptions"
          emit-value
          map-options
          outlined
          dense
          options-dense
          label="Tipo de actividad"
          style="min-width: 220px"
          @update:model-value="fetchRows()"
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
      % de Renovación sobre gestionados (Renovó / Renovó + No renueva + Volvió tarde).
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
      ref="tableRef"
      class="renewals-table"
      :style="$q.screen.lt.md ? undefined : { maxHeight: tableMaxHeight }"
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
        <q-td :props="props" class="sticky-nombre">
          <q-btn flat dense no-caps color="primary" @click="openDialog(props.row)">
            {{ props.row.memberName }}
          </q-btn>
          <q-icon
            v-if="props.row.manualOverridden"
            name="history"
            color="warning"
            size="16px"
            class="q-ml-xs"
          >
            <q-tooltip>Estaba marcado No renueva; se detectó una renovación</q-tooltip>
          </q-icon>
        </q-td>
      </template>

      <template #body-cell-endDate="props">
        <q-td :props="props">{{ formatDate(props.row.endDate) }}</q-td>
      </template>

      <template #body-cell-status="props">
        <q-td :props="props">
          <RenewalStatusMenu
            :row="props.row"
            :reasons="reasons"
            @change="(input) => patchFollowup(props.row, input)"
            @open-details="openDialog(props.row)"
          />
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
          <div v-if="renewalLastTouchLabel(props.row)" class="text-caption text-grey-6">
            {{ renewalLastTouchLabel(props.row) }}
          </div>
        </q-td>
      </template>

      <template #body-cell-newPlanName="props">
        <q-td :props="props">{{ props.row.newPlanName ?? '—' }}</q-td>
      </template>

      <template #body-cell-reasonLabel="props">
        <q-td :props="props">{{ props.row.reasonLabel ?? '—' }}</q-td>
      </template>

      <!-- Observación editable en la celda (feedback 2026-09-29, mismo gesto
         que Comentarios en SP): click → escribir → se guarda al salir del
         campo, Esc cancela. Cada guardado es una nota NUEVA del socio (la
         anterior queda en el historial de la ficha), por eso el campo
         arranca vacío en vez de precargar la última. -->
      <template #body-cell-lastNote="props">
        <q-td :props="props" class="note-cell">
          <q-input
            v-if="editingNoteSubId === props.row.subscriptionId"
            v-model="noteDraft"
            type="textarea"
            autogrow
            dense
            outlined
            autofocus
            maxlength="2000"
            placeholder="Nueva observación…"
            :loading="savingNoteSubId === props.row.subscriptionId"
            @blur="saveInlineNote(props.row)"
            @keydown.esc.prevent="cancelInlineNote"
          />
          <div v-else class="cursor-pointer note-display" @click="startInlineNote(props.row)">
            <template v-if="props.row.lastNote">
              <span class="ellipsis-note">{{ props.row.lastNote.content }}</span>
              <q-tooltip max-width="320px">
                <div style="white-space: pre-wrap">{{ props.row.lastNote.content }}</div>
                <div class="text-caption q-mt-xs">
                  {{ formatDate(props.row.lastNote.createdAt) }}
                  <template v-if="props.row.lastNote.authorName">
                    · {{ props.row.lastNote.authorName }}
                  </template>
                  — click para agregar otra
                </div>
              </q-tooltip>
            </template>
            <span v-else class="text-grey-5"> <q-icon name="edit" size="14px" /> Agregar… </span>
          </div>
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
                <RenewalStatusMenu
                  :row="props.row"
                  :reasons="reasons"
                  @change="(input) => patchFollowup(props.row, input)"
                  @open-details="openDialog(props.row)"
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
              <div v-if="renewalLastTouchLabel(props.row)" class="text-caption text-grey-6">
                Última gestión: {{ renewalLastTouchLabel(props.row) }}
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
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { useQuasar, type QTable, type QTableColumn } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import { createLogger } from 'src/utils/logger';
import { formatDate } from 'src/utils/format-date';
import { useRenewalsApi } from 'src/composables/useRenewalsApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import { DUENO_ROLES } from 'src/config/templo-config';
import { getWeekRange } from 'src/utils/renewals-week';
import { renewalStatusMeta, renewalLastTouchLabel } from 'src/utils/renewal-status';
import KpiCard from 'src/components/comunicaciones/KpiCard.vue';
import RenewalMemberDialog from 'src/components/renovaciones/RenewalMemberDialog.vue';
import RenewalReasonsDialog from 'src/components/renovaciones/RenewalReasonsDialog.vue';
import RenewalStatusMenu from 'src/components/renovaciones/RenewalStatusMenu.vue';
import type {
  RenewalRow,
  RenewalKpis,
  RenewalReason,
  RenewalFollowupUpdateInput,
  RenewalActivityType,
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

// Los filtros viven en la URL (?tab=renovaciones&from=&to=&branch=&tipo=) para que
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

// Tipo de actividad (feedback Nacho 2026-09-25): el pase "Actividades con
// Aura" se gestiona aparte de la membresía. Default = Membresías, lo que se
// gestiona todas las semanas. Filtra server-side para que los KPIs también
// queden acotados al tipo elegido.
type ActivityTypeFilter = RenewalActivityType | 'todas';

const activityTypeOptions: { label: string; value: ActivityTypeFilter }[] = [
  { label: 'Membresías', value: 'membresia' },
  { label: 'Actividades con Aura', value: 'aura' },
  { label: 'Todas', value: 'todas' },
];

function initialActivityType(): ActivityTypeFilter {
  const raw = queryString('tipo');
  return activityTypeOptions.find((o) => o.value === raw)?.value ?? 'membresia';
}

const activityType = ref<ActivityTypeFilter>(initialActivityType());

function syncQuery() {
  void router.replace({
    query: {
      ...route.query,
      tab: 'renovaciones',
      from: dateFrom.value,
      to: dateTo.value,
      branch: props.branchId !== undefined ? String(props.branchId) : undefined,
      tipo: activityType.value,
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

/**
 * Carga por cambio de filtros (semana/sede/tipo): escribe la URL y muestra el
 * loading. OJO: cualquier `router.replace` dispara el `scrollBehavior` del
 * router (vuelve arriba de todo) — por eso las recargas después de editar
 * una fila llaman directo a `loadRows`, que NO toca la URL.
 */
async function fetchRows() {
  syncQuery();
  loading.value = true;
  try {
    await loadRows();
  } finally {
    loading.value = false;
  }
  await nextTick();
  fitTableHeight();
}

/**
 * Pide listado + KPIs sin tocar la URL ni el loading. Llamada directa =
 * recarga silenciosa después de editar mensaje/estado de una fila, así la
 * página queda donde estaba (feedback 2026-09-25: al marcar un mensaje abajo
 * de todo, saltaba arriba).
 */
async function loadRows(opts: { background?: boolean } = {}) {
  try {
    const result = await renewalsApi.listRenewals({
      dateFrom: dateFrom.value,
      dateTo: dateTo.value,
      branchId: props.branchId,
      activityType: activityType.value === 'todas' ? undefined : activityType.value,
    });
    rows.value = result.rows;
    kpis.value = result.kpis;
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    // El refresco en segundo plano no molesta con un aviso por minuto si se
    // cae la red — queda en el log y el próximo intento lo reintenta.
    if (opts.background) {
      log.warn('Error refrescando renovaciones en segundo plano', { error });
      return;
    }
    log.error('Error cargando renovaciones', { error });
    $q.notify({ type: 'negative', message: 'No se pudieron cargar las renovaciones' });
  }
}

async function fetchReasons() {
  try {
    reasons.value = await renewalsApi.listReasons(false);
  } catch (err: unknown) {
    log.error('Error cargando motivos', {
      error: err instanceof Error ? err.message : String(err),
    });
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
      label: 'No renueva',
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
  {
    name: 'memberName',
    label: 'Nombre',
    field: 'memberName',
    align: 'left',
    headerClasses: 'sticky-nombre',
  },
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
    await loadRows();
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

// ─── Observación inline ───────────────────────────────────────────────────

const editingNoteSubId = ref<number | null>(null);
const savingNoteSubId = ref<number | null>(null);
const noteDraft = ref('');

function startInlineNote(row: RenewalRow) {
  editingNoteSubId.value = row.subscriptionId;
  noteDraft.value = '';
}

function cancelInlineNote() {
  editingNoteSubId.value = null;
  noteDraft.value = '';
}

async function saveInlineNote(row: RenewalRow) {
  // `@blur` puede dispararse de nuevo mientras se guarda (el input pierde el
  // foco al pasar a loading) — el primer guardado manda.
  if (savingNoteSubId.value === row.subscriptionId) return;
  const content = noteDraft.value.trim();
  if (!content) {
    cancelInlineNote();
    return;
  }
  savingNoteSubId.value = row.subscriptionId;
  try {
    const note = await renewalsApi.addNote(row.subscriptionId, content);
    // Busca la fila vigente (un refresco pudo reemplazar el objeto mientras
    // se guardaba) — reemplazar `row` capturado pisaría datos más nuevos.
    const current = rows.value.find((r) => r.subscriptionId === row.subscriptionId) ?? row;
    replaceRow({
      ...current,
      lastNote: {
        content: note.content,
        createdAt: note.createdAt,
        authorName: note.authorName || null,
      },
    });
    $q.notify({ type: 'positive', message: 'Observación guardada', timeout: 1500 });
    cancelInlineNote();
  } catch (err: unknown) {
    log.error('Error guardando observación', {
      error: err instanceof Error ? err.message : String(err),
    });
    // Se deja el borrador abierto para no perder lo escrito.
    $q.notify({
      type: 'negative',
      message: renewalsApi.error.value ?? 'No se pudo guardar la observación',
    });
  } finally {
    savingNoteSubId.value = null;
  }
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
    message: row.phoneE164
      ? 'Copiado'
      : 'Número inválido: revisalo en la ficha (copiado el original)',
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
  if (refreshKpis) await loadRows();
}

// ============================================================================
// Alto de la tabla — la barra horizontal tiene que quedar a la vista
// ============================================================================

/**
 * Feedback 2026-09-29: con un alto fijo (`100vh - 140px`) la tabla quedaba
 * más alta que el espacio que le dejan filtros + KPIs, y para llegar a la
 * barra de scroll horizontal (al pie de la tabla) había que bajar la página.
 * Ahora el alto se calcula desde donde arranca la tabla hasta el borde de la
 * ventana, así la barra entra en pantalla sin scrollear. Piso de 360px para
 * que en pantallas bajas la tabla no quede con dos filas.
 */
const TABLE_MIN_HEIGHT_PX = 360;
const TABLE_BOTTOM_GAP_PX = 16;
const tableRef = ref<QTable | null>(null);
const tableMaxHeight = ref(`${TABLE_MIN_HEIGHT_PX}px`);

function fitTableHeight() {
  const el = tableRef.value?.$el as HTMLElement | undefined;
  if (!el) return;
  // Posición respecto del documento (no del viewport) para que dé lo mismo
  // si la página ya estaba scrolleada al recalcular.
  const top = el.getBoundingClientRect().top + window.scrollY;
  const available = window.innerHeight - top - TABLE_BOTTOM_GAP_PX;
  tableMaxHeight.value = `${Math.max(Math.round(available), TABLE_MIN_HEIGHT_PX)}px`;
}

// ============================================================================
// Refresco — dos personas trabajan la misma planilla a la vez
// ============================================================================

/**
 * Recarga silenciosa (sin loading ni URL) cada minuto con la pestaña visible
 * y al volver a la pestaña, para ver lo que marcó la otra persona antes de
 * contactar a alguien. Se saltea mientras se escribe una observación.
 */
const BACKGROUND_REFRESH_MS = 60_000;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

function backgroundRefresh() {
  if (document.hidden || loading.value || editingNoteSubId.value !== null) return;
  void loadRows({ background: true });
}

function onVisibilityChange() {
  if (!document.hidden) backgroundRefresh();
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
  window.addEventListener('resize', fitTableHeight);
  document.addEventListener('visibilitychange', onVisibilityChange);
  refreshTimer = setInterval(backgroundRefresh, BACKGROUND_REFRESH_MS);
  await Promise.all([fetchRows(), fetchReasons()]);
});

onUnmounted(() => {
  window.removeEventListener('resize', fitTableHeight);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  if (refreshTimer !== null) clearInterval(refreshTimer);
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
}

.note-cell {
  min-width: 200px;
}

.note-display {
  min-height: 20px;
}

:deep(.renewal-row--para-cerrar) {
  background-color: rgba($warning, 0.12);
  box-shadow: inset 3px 0 0 $warning;
}

/*
 * Tabla con alto propio (feedback 2026-09-25): el scroll horizontal y el
 * vertical viven DENTRO de la tabla. Header pegado arriba y Nombre fijo a la
 * izquierda — mismo patrón que `PorDeudaTab.vue` (scroller nativo de
 * q-table, .q-table__middle). El alto lo calcula `fitTableHeight` (inline
 * style) para que la barra horizontal entre en pantalla. En mobile la tabla
 * es grid de cards (sin scroll horizontal): no aplica.
 */

:deep(.renewals-table thead tr th) {
  position: sticky;
  top: 0;
  z-index: 2;
  background-color: #fff;
}

:deep(.renewals-table .sticky-nombre) {
  position: sticky;
  left: 0;
  z-index: 1;
  background-color: #fff;
  box-shadow: 6px 0 8px -8px rgba(0, 0, 0, 0.3);
}

:deep(.renewals-table thead .sticky-nombre) {
  z-index: 3;
}

// La celda fija necesita fondo opaco: en filas "para cerrar" replica el
// tinte de la fila (12% de $warning sobre blanco) para no cortarlo.
:deep(.renewals-table .renewal-row--para-cerrar .sticky-nombre) {
  background-color: mix($warning, #fff, 12%);
}
</style>
