<template>
  <div>
    <!-- ================================================================== -->
    <!-- Seguimiento de invitados: lista de trabajo igual a la de Renovaciones. -->
    <!-- Va arriba: es lo que se usa todos los días.                         -->
    <!-- ================================================================== -->
    <div class="row items-center q-mb-sm">
      <div class="col text-subtitle1">Seguimiento de invitados</div>
      <div class="col-auto">
        <q-btn flat round dense icon="refresh" :loading="loadingLeads" @click="reloadLeads()">
          <q-tooltip>Actualizar (ver lo que cargó otra persona)</q-tooltip>
        </q-btn>
      </div>
    </div>

    <div class="row q-col-gutter-sm q-mb-md items-end">
      <div class="col-12 col-sm-4 col-md-3">
        <q-select
          v-model="statusFilter"
          :options="FOLLOW_STATUS_FILTER_OPTIONS"
          label="Estado"
          dense
          outlined
          emit-value
          map-options
        />
      </div>
      <div class="col-12 col-sm-4 col-md-3">
        <q-select
          v-model="branchFilter"
          :options="branchFilterOptions"
          label="Sede de activación"
          dense
          outlined
          emit-value
          map-options
        />
      </div>
    </div>

    <q-table
      v-model:pagination="pagination"
      :rows="leadRows"
      :columns="leadColumns"
      row-key="invitationId"
      :loading="loadingLeads"
      :rows-per-page-options="[25, 50, 100]"
      flat
      bordered
      dense
      :grid="$q.screen.lt.md"
      class="q-mb-lg"
      @request="onLeadsRequest"
    >
      <!-- ── Desktop/tablet: celdas custom ───────────────────────────── -->
      <template #body-cell-invitee="props">
        <q-td :props="props"><InvitationInvitee :row="props.row" /></q-td>
      </template>
      <template #body-cell-inviter="props">
        <q-td :props="props">
          <router-link :to="`/alumnos/${props.row.inviter.userId}`" class="text-primary">
            {{ props.row.inviter.name }}
          </router-link>
        </q-td>
      </template>
      <template #body-cell-accesses="props">
        <q-td :props="props">
          {{ accessesLabel(props.row.accessesUsed, props.row.accessesBudget) ?? '-' }}
        </q-td>
      </template>
      <template #body-cell-ended="props">
        <q-td :props="props"><InvitationEnded :row="props.row" /></q-td>
      </template>
      <template #body-cell-branches="props">
        <q-td :props="props">
          <template v-if="props.row.branchesTrained.length > 0">
            {{ props.row.branchesTrained.join(', ') }}
          </template>
          <span v-else class="text-grey-6">Aún no entrenó</span>
          <div class="text-caption text-grey-7">Activó en {{ props.row.branchName }}</div>
        </q-td>
      </template>
      <template #body-cell-status="props">
        <q-td :props="props">
          <InvitationStatusChip
            :row="props.row"
            :reasons="reasons"
            @change="(input) => patchFollowup(props.row, input)"
            @open-details="openNoSigueDialog(props.row)"
          />
        </q-td>
      </template>
      <template #body-cell-messageCount="props">
        <q-td :props="props">
          <MessageCounter
            :count="props.row.followup.messageCount"
            :disabled="followupLocked(props.row)"
            :title="followupLocked(props.row) ? lockedHint(props.row) : undefined"
            @set="(n) => patchFollowup(props.row, { messageCount: n })"
          />
          <div v-if="lastMessageLabel(props.row)" class="text-caption text-grey-6">
            {{ lastMessageLabel(props.row) }}
          </div>
        </q-td>
      </template>
      <template #body-cell-reason="props">
        <q-td :props="props"><InvitationReason :row="props.row" /></q-td>
      </template>
      <template #body-cell-lastNote="props">
        <q-td :props="props" style="min-width: 200px">
          <FollowupNoteCell
            :note="props.row.lastNote"
            :save="(content) => saveNote(props.row, content)"
          />
        </q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props">
          <q-btn
            v-if="!hasPurchased(props.row)"
            dense
            no-caps
            outline
            size="sm"
            color="primary"
            icon="shopping_cart"
            label="Vender plan"
            @click="sellPlan(props.row)"
          />
        </q-td>
      </template>
      <template #body-cell-channel="props">
        <q-td :props="props">
          <q-chip
            dense
            outline
            :label="props.row.channel === 'assisted' ? 'Asistida' : 'Autogestión'"
          />
        </q-td>
      </template>

      <!-- ── Celular: tarjetas (sin scroll horizontal de página) ─────── -->
      <template #item="props">
        <div class="col-12 q-pa-xs">
          <q-card flat bordered>
            <q-card-section class="q-pb-none">
              <div class="row items-center justify-between no-wrap">
                <InvitationInvitee :row="props.row" />
                <InvitationStatusChip
                  :row="props.row"
                  :reasons="reasons"
                  @change="(input) => patchFollowup(props.row, input)"
                  @open-details="openNoSigueDialog(props.row)"
                />
              </div>
              <div class="text-caption text-grey-7">
                Invitado por {{ props.row.inviter.name }} ·
                {{
                  accessesLabel(props.row.accessesUsed, props.row.accessesBudget) ?? 'Sin accesos'
                }}
                · {{ props.row.channel === 'assisted' ? 'Asistida' : 'Autogestión' }}
              </div>
            </q-card-section>
            <q-card-section class="q-pt-sm q-gutter-y-xs">
              <div class="row items-baseline q-gutter-x-xs">
                <span class="text-grey-7">Terminó:</span>
                <InvitationEnded :row="props.row" />
              </div>
              <div class="text-caption text-grey-7">
                <template v-if="props.row.branchesTrained.length > 0">
                  Entrenó en {{ props.row.branchesTrained.join(', ') }}
                </template>
                <template v-else>Aún no entrenó</template>
                · activó en {{ props.row.branchName }}
              </div>
              <MessageCounter
                :count="props.row.followup.messageCount"
                :disabled="followupLocked(props.row)"
                :title="followupLocked(props.row) ? lockedHint(props.row) : undefined"
                :tooltip="false"
                @set="(n) => patchFollowup(props.row, { messageCount: n })"
              />
              <div v-if="lastMessageLabel(props.row)" class="text-caption text-grey-6">
                {{ lastMessageLabel(props.row) }}
              </div>
              <div v-if="props.row.followStatus === 'no_sigue'" class="row q-gutter-x-xs">
                <span class="text-grey-7">Motivo:</span>
                <InvitationReason :row="props.row" />
              </div>
              <FollowupNoteCell
                :note="props.row.lastNote"
                :save="(content) => saveNote(props.row, content)"
              />
              <q-btn
                v-if="!hasPurchased(props.row)"
                dense
                no-caps
                outline
                size="sm"
                color="primary"
                icon="shopping_cart"
                label="Vender plan"
                @click="sellPlan(props.row)"
              />
            </q-card-section>
          </q-card>
        </div>
      </template>

      <template #no-data>
        <div class="full-width text-center q-pa-lg text-grey-6">
          No hay invitaciones con estos filtros
        </div>
      </template>
    </q-table>

    <InvitationNoSigueDialog
      v-model="noSigueDialogOpen"
      :row="noSigueRow"
      :reasons="reasons"
      :saving="savingNoSigue"
      @save="onNoSigueSave"
    />

    <!-- ================================================================== -->
    <!-- Reporte del programa: solo gestión, admin y dueño (a un admin de sede -->
    <!-- el API le responde 403, así que ni se pide).                        -->
    <!-- ================================================================== -->
    <template v-if="showProgramReport">
      <div class="text-subtitle1 q-mb-sm">Reporte del programa</div>
      <!-- ================================================================== -->
      <!-- Rango de meses del reporte (los KPIs son de todo el gimnasio, o de  -->
      <!-- tu país si sos gestión/admin; la sede solo filtra la lista).      -->
      <!-- ================================================================== -->
      <div class="row items-center q-col-gutter-sm q-mb-md">
        <div class="col text-caption text-grey-7">
          Rendimiento del programa de invitaciones por mes de activación
        </div>
        <div class="col-auto" style="min-width: 150px">
          <q-select
            v-model="rangeFrom"
            :options="monthOptions"
            label="Desde"
            dense
            outlined
            emit-value
            map-options
            :disable="loadingReport"
          />
        </div>
        <div class="col-auto" style="min-width: 150px">
          <q-select
            v-model="rangeTo"
            :options="monthOptions"
            label="Hasta"
            dense
            outlined
            emit-value
            map-options
            :disable="loadingReport"
          />
        </div>
      </div>
      <div v-if="!rangeValid" class="text-negative text-caption q-mb-md">
        El mes inicial no puede ser posterior al final.
      </div>

      <!-- ================================================================== -->
      <!-- KPIs del rango -->
      <!-- ================================================================== -->
      <div class="row q-col-gutter-sm q-mb-md">
        <div v-for="card in kpiCards" :key="card.key" class="col-6 col-md-3">
          <KpiCard
            :label="card.label"
            :value="card.value"
            :hint="card.hint"
            :icon="card.icon"
            :active="false"
            :loading="loadingReport"
          />
        </div>
      </div>

      <!-- ================================================================== -->
      <!-- Tabla por mes -->
      <!-- ================================================================== -->
      <q-table
        :rows="monthRows"
        :columns="monthColumns"
        row-key="month"
        :loading="loadingReport"
        :pagination="{ rowsPerPage: 0 }"
        hide-pagination
        flat
        bordered
        dense
        class="q-mb-md"
      >
        <template #body-cell-month="props">
          <q-td :props="props" class="text-weight-medium">{{ monthLabel(props.row.month) }}</q-td>
        </template>
        <template #body-cell-conversionRate="props">
          <q-td :props="props">{{ formatPercent(props.row.conversionRate) }}</q-td>
        </template>
        <!-- Una línea por moneda: ARS y EUR nunca se suman. -->
        <template #body-cell-discounts="props">
          <q-td :props="props">
            <template v-if="props.row.discounts.length > 0">
              <div v-for="d in props.row.discounts" :key="d.currency">
                {{ formatPrice(d.amount, d.currency) }}
                <span class="text-caption text-grey-7">({{ d.credits }})</span>
              </div>
            </template>
            <span v-else class="text-grey-5">-</span>
          </q-td>
        </template>
        <template #no-data>
          <div class="full-width text-center q-pa-md text-grey-6">Sin datos en el rango</div>
        </template>
      </q-table>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar, type QTableColumn } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { formatPrice } from 'src/utils/format-price';
import {
  accessesLabel,
  FOLLOW_STATUS_FILTER_OPTIONS,
  hasPurchased,
  parseFollowStatus,
} from 'src/utils/invitation-meta';
import { formatDayMonth } from 'src/utils/renewal-status';
import { useInvitationReportApi } from 'src/composables/useInvitationReportApi';
import { useRenewalsApi } from 'src/composables/useRenewalsApi';
import { useAdminStore } from 'src/stores/useAdminStore';
import KpiCard from 'src/components/comunicaciones/KpiCard.vue';
import MessageCounter from 'src/components/seguimiento/MessageCounter.vue';
import FollowupNoteCell from 'src/components/seguimiento/FollowupNoteCell.vue';
import InvitationEnded from 'src/components/reports/InvitationEnded.vue';
import InvitationInvitee from 'src/components/reports/InvitationInvitee.vue';
import InvitationNoSigueDialog from 'src/components/reports/InvitationNoSigueDialog.vue';
import InvitationReason from 'src/components/reports/InvitationReason.vue';
import InvitationStatusChip from 'src/components/reports/InvitationStatusChip.vue';
import type { RenewalReason } from 'src/types/renewals';
import type {
  InvitationFollowStatus,
  InvitationFollowupUpdateInput,
  InvitationLeadRow,
  InvitationReport,
  InvitationReportDiscount,
} from 'src/types/report';

const props = defineProps<{
  /** Sedes para el filtro de la lista (el selector de la página, con "Todas" = undefined). */
  branchOptions: Array<{ label: string; value: number | undefined }>;
  /** Reporte del programa (KPIs y tabla por mes): solo gestión, admin y dueño; el API le da 403 al resto. */
  showProgramReport: boolean;
}>();

const log = createLogger('InvitationsReport');
const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const reportApi = useInvitationReportApi();
const renewalsApi = useRenewalsApi();
const adminStore = useAdminStore();

// -- Reporte del programa (D-19) -----------------------------------------------------------

const report = ref<InvitationReport | null>(null);
const loadingReport = ref(false);
// Vacíos hasta la primera respuesta: el servidor decide el default (últimos 12 meses).
const rangeFrom = ref<string | null>(null);
const rangeTo = ref<string | null>(null);

const rangeValid = computed(
  () => rangeFrom.value === null || rangeTo.value === null || rangeFrom.value <= rangeTo.value
);

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** 'YYYY-MM' desplazado `delta` meses. */
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-AR', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// El servidor admite rangos de hasta 36 meses: ofrecemos los últimos 36.
const monthOptions = computed(() => {
  const anchor = [currentMonth(), report.value?.to ?? ''].sort().pop() ?? currentMonth();
  return Array.from({ length: 36 }, (_, i) => shiftMonth(anchor, -i)).map((m) => ({
    label: monthLabel(m),
    value: m,
  }));
});

function formatPercent(rate: number): string {
  return `${(rate * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`;
}

async function loadReport(): Promise<void> {
  if (!rangeValid.value) return;
  loadingReport.value = true;
  try {
    const data = await reportApi.getReport({
      from: rangeFrom.value ?? undefined,
      to: rangeTo.value ?? undefined,
    });
    report.value = data;
    rangeFrom.value = data.from;
    rangeTo.value = data.to;
  } catch (err: unknown) {
    $q.notify({
      type: 'negative',
      message: extractError(err, 'Error cargando el reporte de invitaciones'),
    });
  } finally {
    loadingReport.value = false;
  }
}

const kpiCards = computed(() => {
  const totals = report.value?.totals;
  return [
    {
      key: 'activated',
      label: 'Activadas',
      value: totals?.activated ?? 0,
      hint: 'Invitaciones activadas en el rango',
      icon: 'how_to_reg',
    },
    {
      key: 'converted',
      label: 'Compraron',
      value: totals?.converted ?? 0,
      hint: 'De las activadas, las que compraron un plan',
      icon: 'shopping_cart',
    },
    {
      key: 'conversion',
      label: 'Conversión',
      value: formatPercent(totals?.conversionRate ?? 0),
      hint: 'Compraron / activadas',
      icon: 'trending_up',
    },
    {
      key: 'activeInvitees',
      label: 'Invitados activos',
      value: report.value?.activeInvitees ?? 0,
      hint: 'Hoy, con membresía vigente (no depende del rango)',
      icon: 'groups',
    },
  ];
});

// Descuentos agrupados por mes: una entrada por moneda, nunca sumadas entre sí.
const monthRows = computed(() => {
  const data = report.value;
  if (!data) return [];
  const byMonth = new Map<string, InvitationReportDiscount[]>();
  for (const d of data.discounts) {
    const list = byMonth.get(d.month) ?? [];
    list.push(d);
    byMonth.set(d.month, list);
  }
  return data.months.map((m) => ({ ...m, discounts: byMonth.get(m.month) ?? [] }));
});

const monthColumns: QTableColumn[] = [
  { name: 'month', label: 'Mes', field: 'month', align: 'left' },
  { name: 'activated', label: 'Activadas', field: 'activated', align: 'right' },
  { name: 'converted', label: 'Compraron', field: 'converted', align: 'right' },
  { name: 'conversionRate', label: 'Conversión', field: 'conversionRate', align: 'right' },
  { name: 'discounts', label: 'Descuentos del mes', field: 'discounts', align: 'right' },
];

// -- Lista de seguimiento (D-18) -----------------------------------------------

const leadRows = ref<InvitationLeadRow[]>([]);
const loadingLeads = ref(false);
const pagination = ref({ page: 1, rowsPerPage: 25, rowsNumber: 0 });
// Motivos de "No sigue": los mismos que Renovaciones.
const reasons = ref<RenewalReason[]>([]);

// El estado puede venir en la URL (`?estado=para_contactar`): lo usa el aviso de Renovaciones.
const statusFilter = ref<InvitationFollowStatus | null>(parseFollowStatus(route.query.estado));
const branchFilter = ref<number | null>(null);

// El selector de la página usa `undefined` para "Todas las sedes"; el q-select
// de acá usa null.
const branchFilterOptions = computed(() =>
  props.branchOptions.map((o) => ({ label: o.label, value: o.value ?? null }))
);

const leadColumns: QTableColumn[] = [
  { name: 'invitee', label: 'Invitado', field: 'invitee', align: 'left' },
  { name: 'inviter', label: 'Invitado por', field: 'inviter', align: 'left' },
  { name: 'accesses', label: 'Accesos', field: 'accessesUsed', align: 'left' },
  { name: 'ended', label: 'Terminó', field: 'endedOn', align: 'left' },
  { name: 'branches', label: 'Sedes', field: 'branchesTrained', align: 'left' },
  { name: 'status', label: 'Estado', field: 'followStatus', align: 'left' },
  { name: 'messageCount', label: 'Mensaje', field: 'followup', align: 'left' },
  { name: 'reason', label: 'Motivo', field: 'followup', align: 'left' },
  { name: 'lastNote', label: 'Observación', field: 'lastNote', align: 'left' },
  { name: 'actions', label: 'Acción', field: 'invitationId', align: 'left' },
  { name: 'channel', label: 'Canal', field: 'channel', align: 'left' },
];

/**
 * Deja el filtro de estado en la URL (junto con la pestaña) para que al volver de Cobros
 * (`returnTo` = fullPath) la lista quede igual. Mergea con la query existente.
 */
function syncQuery(): void {
  void router.replace({
    query: {
      ...route.query,
      tab: 'invitaciones',
      estado: statusFilter.value ?? undefined,
    },
  });
}

async function loadLeads(page: number, pageSize: number): Promise<void> {
  loadingLeads.value = true;
  try {
    const data = await reportApi.listLeads({
      followStatus: statusFilter.value ?? undefined,
      branchId: branchFilter.value ?? undefined,
      page,
      pageSize,
    });
    leadRows.value = data.rows;
    pagination.value = { page: data.page, rowsPerPage: data.pageSize, rowsNumber: data.total };
  } catch (err: unknown) {
    $q.notify({
      type: 'negative',
      message: extractError(err, 'Error cargando los invitados'),
    });
  } finally {
    loadingLeads.value = false;
  }
}

/** Recarga la página actual y el aviso rojo (para ver lo que cargó otra persona). */
function reloadLeads(): void {
  void loadLeads(pagination.value.page, pagination.value.rowsPerPage);
  void adminStore.fetchInvitationsPendingCount();
}

function onLeadsRequest(req: { pagination: { page: number; rowsPerPage: number } }): void {
  void loadLeads(req.pagination.page, req.pagination.rowsPerPage);
}

async function loadReasons(): Promise<void> {
  try {
    reasons.value = await renewalsApi.listReasons(false);
  } catch (err: unknown) {
    log.warn('No se pudieron cargar los motivos', { error: extractError(err, 'sin detalle') });
  }
}

// -- Acciones de fila ---------------------------------------------------------

/** Sin plan de accesos cargado (409 del API) o ya compró: no se registra seguimiento. */
function followupLocked(row: InvitationLeadRow): boolean {
  return hasPurchased(row) || row.followup.subscriptionId === null;
}

function lockedHint(row: InvitationLeadRow): string {
  return hasPurchased(row)
    ? 'Ya compró: no hace falta seguimiento'
    : 'Este invitado no tiene accesos cargados: no se puede registrar seguimiento';
}

function lastMessageLabel(row: InvitationLeadRow): string | null {
  const at = row.followup.lastMessageAt;
  return at ? `Último mensaje: ${formatDayMonth(at)}` : null;
}

function replaceRow(updated: InvitationLeadRow): void {
  const idx = leadRows.value.findIndex((r) => r.invitationId === updated.invitationId);
  if (idx !== -1) leadRows.value[idx] = updated;
}

/** PATCH del seguimiento: reemplaza la fila por la del servidor y refresca el aviso rojo. */
async function patchFollowup(
  row: InvitationLeadRow,
  input: InvitationFollowupUpdateInput
): Promise<boolean> {
  try {
    replaceRow(await reportApi.updateFollowup(row.invitationId, input));
    void adminStore.fetchInvitationsPendingCount();
    return true;
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo actualizar el seguimiento');
    log.warn('Failed to update invitation followup', {
      error: message,
      invitationId: row.invitationId,
    });
    $q.notify({ type: 'negative', message });
    return false;
  }
}

/** Nota nueva del invitado; false = falló y el borrador queda abierto. */
async function saveNote(row: InvitationLeadRow, content: string): Promise<boolean> {
  try {
    const note = await reportApi.addNote(row.invitationId, content);
    // Busca la fila vigente: un refresco pudo reemplazar el objeto mientras se guardaba.
    const current = leadRows.value.find((r) => r.invitationId === row.invitationId) ?? row;
    replaceRow({
      ...current,
      lastNote: {
        content: note.content,
        createdAt: note.createdAt,
        authorName: note.authorName || null,
      },
    });
    $q.notify({ type: 'positive', message: 'Observación guardada', timeout: 1500 });
    return true;
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo guardar la observación');
    log.warn('Failed to add invitation note', { error: message, invitationId: row.invitationId });
    $q.notify({ type: 'negative', message });
    return false;
  }
}

// "No sigue" con nota del motivo
const noSigueDialogOpen = ref(false);
const noSigueRow = ref<InvitationLeadRow | null>(null);
const savingNoSigue = ref(false);

function openNoSigueDialog(row: InvitationLeadRow): void {
  noSigueRow.value = row;
  noSigueDialogOpen.value = true;
}

async function onNoSigueSave(input: InvitationFollowupUpdateInput): Promise<void> {
  const row = noSigueRow.value;
  if (!row) return;
  savingNoSigue.value = true;
  try {
    if (await patchFollowup(row, input)) noSigueDialogOpen.value = false;
  } finally {
    savingNoSigue.value = false;
  }
}

/** Mismo deep-link que "Renovar": Cobros con el socio elegido y vuelta a esta lista. */
function sellPlan(row: InvitationLeadRow): void {
  void router.push({
    path: '/cobros',
    query: { memberId: String(row.invitee.userId), returnTo: route.fullPath },
  });
}

// -- Wiring -------------------------------------------------------------------

watch([rangeFrom, rangeTo], ([from, to], [prevFrom, prevTo]) => {
  // Solo recargar por una elección del usuario, no por el seteo inicial que hace loadReport().
  if (prevFrom === null || prevTo === null) return;
  if (from === prevFrom && to === prevTo) return;
  void loadReport();
});

watch([statusFilter, branchFilter], () => {
  syncQuery();
  void loadLeads(1, pagination.value.rowsPerPage);
});

onMounted(() => {
  syncQuery();
  if (props.showProgramReport) void loadReport();
  void loadLeads(1, pagination.value.rowsPerPage);
  void loadReasons();
});

// Los composables no se limpian solos: el componente es dueño del ciclo de vida.
onBeforeUnmount(() => {
  reportApi.cleanup();
  renewalsApi.cleanup();
});
</script>
