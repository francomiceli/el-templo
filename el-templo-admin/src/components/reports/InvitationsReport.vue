<template>
  <div>
    <!-- ================================================================== -->
    <!-- Rango de meses del reporte (los KPIs son de todo el gimnasio, o de  -->
    <!-- tu país si sos gestión/admin; la sede solo filtra la bandeja).      -->
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

    <!-- ================================================================== -->
    <!-- Bandeja de leads de invitación -->
    <!-- ================================================================== -->
    <div class="text-subtitle1 q-mb-sm">Leads de invitación</div>

    <div class="row q-col-gutter-sm q-mb-md items-end">
      <div class="col-12 col-sm-4 col-md-3">
        <q-select
          v-model="stageFilter"
          :options="stageOptions"
          label="Etapa"
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
      @request="onLeadsRequest"
    >
      <template #body-cell-invitee="props">
        <q-td :props="props">
          <div class="row items-center no-wrap">
            <router-link :to="`/alumnos/${props.row.invitee.userId}`" class="text-primary">
              {{ props.row.invitee.firstName }} {{ props.row.invitee.lastName }}
            </router-link>
            <q-btn
              round
              flat
              dense
              icon="chat"
              color="positive"
              class="q-ml-xs"
              :disable="!props.row.invitee.phone"
              @click="contactInvitee(props.row.invitee.phone)"
            >
              <q-tooltip>Contactar por WhatsApp</q-tooltip>
            </q-btn>
          </div>
        </q-td>
      </template>
      <template #body-cell-inviter="props">
        <q-td :props="props">
          <router-link :to="`/alumnos/${props.row.inviter.userId}`" class="text-primary">
            {{ props.row.inviter.name }}
          </router-link>
        </q-td>
      </template>
      <template #body-cell-activatedAt="props">
        <q-td :props="props">{{ formatDate(props.row.activatedAt) }}</q-td>
      </template>
      <template #body-cell-accesses="props">
        <q-td :props="props">
          {{ accessesLabel(props.row.accessesUsed, props.row.accessesBudget) ?? '-' }}
        </q-td>
      </template>
      <template #body-cell-accessExpiresOn="props">
        <q-td :props="props">{{ formatDate(props.row.accessExpiresOn) }}</q-td>
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
      <template #body-cell-stage="props">
        <q-td :props="props">
          <q-chip
            dense
            text-color="white"
            :color="LEAD_STAGE_META[props.row.stage as LeadStage].color"
            :label="LEAD_STAGE_META[props.row.stage as LeadStage].label"
          />
        </q-td>
      </template>
      <!-- Estado del lead: 'ganado' lo pone la compra (exige plan cargado en el
           PATCH), así que no se edita acá; el resto se cambia con el PATCH existente. -->
      <template #body-cell-leadStatus="props">
        <q-td :props="props">
          <q-chip
            v-if="props.row.leadStatus === 'ganado'"
            dense
            color="positive"
            text-color="white"
            label="Ganado"
          >
            <q-tooltip>Lo marca la compra del plan</q-tooltip>
          </q-chip>
          <q-select
            v-else
            :model-value="props.row.leadStatus"
            :options="LEAD_STATUS_OPTIONS"
            dense
            outlined
            emit-value
            map-options
            options-dense
            placeholder="Sin estado"
            style="min-width: 150px"
            :loading="savingUserId === props.row.invitee.userId"
            :disable="savingUserId === props.row.invitee.userId"
            @update:model-value="onLeadStatusChange(props.row, $event)"
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
      <template #no-data>
        <div class="full-width text-center q-pa-lg text-grey-6">
          No hay invitaciones activadas con estos filtros
        </div>
      </template>
    </q-table>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useQuasar, type QTableColumn } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { formatDate } from 'src/utils/format-date';
import { formatPrice } from 'src/utils/format-price';
import { accessesLabel, LEAD_STAGE_META } from 'src/utils/invitation-meta';
import { useInvitationReportApi } from 'src/composables/useInvitationReportApi';
import { useMembersApi, type LeadStatusValue } from 'src/composables/useMembersApi';
import KpiCard from 'src/components/comunicaciones/KpiCard.vue';
import type { LeadStage } from 'src/types/member';
import type {
  InvitationLeadRow,
  InvitationReport,
  InvitationReportDiscount,
} from 'src/types/report';

const props = defineProps<{
  /** Sedes para el filtro de la bandeja (el selector de la página, con "Todas" = undefined). */
  branchOptions: Array<{ label: string; value: number | undefined }>;
}>();

const log = createLogger('InvitationsReport');
const $q = useQuasar();
const reportApi = useInvitationReportApi();
const membersApi = useMembersApi();

// -- Reporte (D-19) -----------------------------------------------------------

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

// -- Bandeja de leads (D-18) ---------------------------------------------------

const leadRows = ref<InvitationLeadRow[]>([]);
const loadingLeads = ref(false);
const savingUserId = ref<number | null>(null);
const pagination = ref({ page: 1, rowsPerPage: 25, rowsNumber: 0 });

const stageFilter = ref<LeadStage | null>(null);
const branchFilter = ref<number | null>(null);

const stageOptions = [
  { label: 'Todas las etapas', value: null },
  ...(Object.keys(LEAD_STAGE_META) as LeadStage[]).map((stage) => ({
    label: LEAD_STAGE_META[stage].label,
    value: stage,
  })),
];

// El selector de la página usa `undefined` para "Todas las sedes"; el q-select
// de acá usa null.
const branchFilterOptions = computed(() =>
  props.branchOptions.map((o) => ({ label: o.label, value: o.value ?? null }))
);

// 'ganado' no se ofrece: lo marca la compra, y el PATCH exige un plan cargado.
const LEAD_STATUS_OPTIONS: Array<{ label: string; value: LeadStatusValue }> = [
  { label: 'En seguimiento', value: 'en_seguimiento' },
  { label: 'Perdido', value: 'perdido' },
];

const leadColumns: QTableColumn[] = [
  { name: 'invitee', label: 'Invitado', field: 'invitee', align: 'left' },
  { name: 'inviter', label: 'Invitado por', field: 'inviter', align: 'left' },
  { name: 'activatedAt', label: 'Activación', field: 'activatedAt', align: 'left' },
  { name: 'accesses', label: 'Accesos', field: 'accessesUsed', align: 'left' },
  { name: 'accessExpiresOn', label: 'Vence', field: 'accessExpiresOn', align: 'left' },
  { name: 'branches', label: 'Sedes', field: 'branchesTrained', align: 'left' },
  { name: 'stage', label: 'Etapa', field: 'stage', align: 'left' },
  { name: 'leadStatus', label: 'Estado del lead', field: 'leadStatus', align: 'left' },
  { name: 'channel', label: 'Canal', field: 'channel', align: 'left' },
];

async function loadLeads(page: number, pageSize: number): Promise<void> {
  loadingLeads.value = true;
  try {
    const data = await reportApi.listLeads({
      stage: stageFilter.value ?? undefined,
      branchId: branchFilter.value ?? undefined,
      page,
      pageSize,
    });
    leadRows.value = data.rows;
    pagination.value = { page: data.page, rowsPerPage: data.pageSize, rowsNumber: data.total };
  } catch (err: unknown) {
    $q.notify({
      type: 'negative',
      message: extractError(err, 'Error cargando los leads de invitación'),
    });
  } finally {
    loadingLeads.value = false;
  }
}

function onLeadsRequest(req: { pagination: { page: number; rowsPerPage: number } }): void {
  void loadLeads(req.pagination.page, req.pagination.rowsPerPage);
}

async function onLeadStatusChange(
  row: InvitationLeadRow,
  next: LeadStatusValue | null
): Promise<void> {
  if (next === null || next === row.leadStatus) return;
  savingUserId.value = row.invitee.userId;
  try {
    // PATCH existente (el servidor valida rol y reglas del lead).
    const snapshot = await membersApi.updateLead(row.invitee.userId, { leadStatus: next });
    row.leadStatus = snapshot.leadStatus;
    $q.notify({ type: 'positive', message: 'Estado del lead actualizado', timeout: 1500 });
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo actualizar el estado del lead');
    log.warn('Failed to update invitation lead status', {
      error: message,
      userId: row.invitee.userId,
    });
    $q.notify({ type: 'negative', message });
  } finally {
    savingUserId.value = null;
  }
}

function contactInvitee(phone: string | null): void {
  if (!phone) return;
  window.open(`https://wa.me/${phone.replace(/\D/g, '')}`, '_blank');
}

// -- Wiring -------------------------------------------------------------------

watch([rangeFrom, rangeTo], ([from, to], [prevFrom, prevTo]) => {
  // Solo recargar por una elección del usuario, no por el seteo inicial que hace loadReport().
  if (prevFrom === null || prevTo === null) return;
  if (from === prevFrom && to === prevTo) return;
  void loadReport();
});

watch([stageFilter, branchFilter], () => {
  void loadLeads(1, pagination.value.rowsPerPage);
});

onMounted(() => {
  void loadReport();
  void loadLeads(1, pagination.value.rowsPerPage);
});

// Los composables no se limpian solos: el componente es dueño del ciclo de vida.
onBeforeUnmount(() => {
  reportApi.cleanup();
  membersApi.cleanup();
});
</script>
