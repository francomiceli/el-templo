<template>
  <div v-if="props.loading" class="q-pa-md">
    <q-skeleton type="rect" height="300px" class="q-mb-md" />
    <q-skeleton type="rect" height="200px" />
  </div>
  <div v-else-if="!props.data" class="text-center q-pa-xl text-grey-5 text-italic">
    No hay datos para el periodo seleccionado
  </div>
  <template v-else>
    <!-- Stat cards: Altas + Bajas del período seleccionado. Fuente: el motor
         canónico de cohorte de vencimiento (fase 121) vía /member-flows —
         reemplaza las métricas legacy newMembers/churnedMembers (deprecated
         121 D-09) que se calculaban por updatedAt/cancelledAt. -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-6">
        <q-card flat bordered>
          <q-card-section class="text-center">
            <div class="text-caption text-grey-7">Altas (período)</div>
            <div class="text-h4 text-positive">
              <q-spinner-dots v-if="loadingFlows" size="28px" />
              <template v-else>{{ periodAltas }}</template>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6">
        <q-card flat bordered>
          <q-card-section class="text-center">
            <div class="text-caption text-grey-7">Bajas (período)</div>
            <div class="text-h4 text-negative">
              <q-spinner-dots v-if="loadingFlows" size="28px" />
              <template v-else>
                {{ periodBajas }}<span v-if="periodBajasProvisional">*</span>
              </template>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Charts row: Altas vs Bajas mensual + Plan distribution donut -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-md-7">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">Altas vs Bajas — últimos 12 meses</div>
            <div style="height: 300px; position: relative">
              <Bar :data="flowsChartData" :options="barChartOptions" />
            </div>
            <div v-if="hasProvisionalMonths" class="text-caption text-grey-6 q-mt-xs">
              * mes provisional: parte de sus vencimientos todavía está dentro de la ventana de
              renovación y puede volver.
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-5">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">Distribucion por plan</div>
            <div style="height: 300px; position: relative">
              <Doughnut :data="planDistributionData" :options="doughnutChartOptions" />
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Bajas del mes: la lista con contexto de ficha para buscar patrones -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="row items-center q-col-gutter-sm q-mb-sm">
          <div class="col">
            <div class="text-subtitle2">Bajas del mes</div>
            <div class="text-caption text-grey-6">
              Socios cuyo plan venció en el mes y no renovaron dentro de la ventana. Los que todavía
              están en gracia no aparecen (pueden volver).
            </div>
          </div>
          <div class="col-auto">
            <q-select
              v-model="churnedMonth"
              :options="monthOptions"
              emit-value
              map-options
              dense
              outlined
              label="Mes"
              style="min-width: 150px"
            />
          </div>
          <div class="col-auto">
            <q-btn
              outline
              color="primary"
              icon="download"
              label="Exportar"
              :loading="exportingChurned"
              :disable="churnedMembers.length === 0"
              @click="onExportChurned"
            />
          </div>
        </div>

        <div v-if="loadingChurned" class="flex flex-center q-pa-md">
          <q-spinner-dots size="30px" color="primary" />
        </div>
        <q-table
          v-else-if="churnedMembers.length > 0"
          :rows="churnedMembers"
          :columns="churnedColumns"
          row-key="userId"
          flat
          dense
          :pagination="{ rowsPerPage: 15 }"
        >
          <template #body-cell-nombre="slotProps">
            <q-td :props="slotProps">
              <a class="text-primary cursor-pointer" @click="goToMember(slotProps.row.userId)">
                {{ [slotProps.row.firstName, slotProps.row.lastName].filter(Boolean).join(' ') }}
              </a>
            </q-td>
          </template>
          <template #body-cell-telefono="slotProps">
            <q-td :props="slotProps">
              <a
                v-if="slotProps.row.phone"
                class="text-primary cursor-pointer"
                @click="openWhatsApp(slotProps.row.phone)"
              >
                {{ slotProps.row.phone }}
              </a>
              <span v-else class="text-grey-5">—</span>
            </q-td>
          </template>
          <template #body-cell-precio="slotProps">
            <q-td :props="slotProps">
              {{ formatChurnedPrice(slotProps.row) }}
            </q-td>
          </template>
        </q-table>
        <div v-else class="text-center q-pa-md text-grey-5 text-italic">
          Sin bajas maduras en el mes seleccionado
        </div>
      </q-card-section>
    </q-card>

    <!-- Attention list -->
    <q-card flat bordered>
      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">Miembros que requieren atencion</div>
        <div class="text-caption text-grey-6 q-mb-sm">
          Ordenados por prioridad: ausentes y en alerta primero (más probable que se vayan).
        </div>
        <q-table
          v-if="prioritizedAttentionList.length > 0"
          :rows="prioritizedAttentionList"
          :columns="attentionColumns"
          row-key="userId"
          flat
          dense
          :pagination="{ rowsPerPage: 10 }"
        >
          <template #body-cell-nombre="slotProps">
            <q-td :props="slotProps">
              <a class="text-primary cursor-pointer" @click="goToMember(slotProps.row.userId)">
                {{ formatMemberName(slotProps.row) }}
              </a>
            </q-td>
          </template>
          <template #body-cell-estado="slotProps">
            <q-td :props="slotProps">
              <q-chip
                :color="slotProps.row.type === 'expiring' ? 'warning' : 'negative'"
                text-color="white"
                dense
                size="sm"
              >
                {{
                  slotProps.row.type === 'expiring'
                    ? `Vence en ${slotProps.row.daysUntilExpiry} dias`
                    : `${slotProps.row.daysOverdue} dias de mora`
                }}
              </q-chip>
            </q-td>
          </template>
          <template #body-cell-segmento="slotProps">
            <q-td :props="slotProps">
              <q-chip
                v-if="slotProps.row.segment"
                :color="segmentColor(slotProps.row.segment)"
                text-color="white"
                dense
                size="sm"
                :label="segmentLabel(slotProps.row.segment)"
              />
              <span v-else class="text-grey-5">—</span>
            </q-td>
          </template>
          <template #body-cell-pago="slotProps">
            <q-td :props="slotProps">
              <q-chip
                :color="slotProps.row.yaPago ? 'positive' : 'grey-4'"
                :text-color="slotProps.row.yaPago ? 'white' : 'grey-9'"
                dense
                size="sm"
                :icon="slotProps.row.yaPago ? 'check' : 'schedule'"
                :label="slotProps.row.yaPago ? 'Ya pagó' : 'No pagó'"
              />
            </q-td>
          </template>
          <template #body-cell-acciones="slotProps">
            <q-td :props="slotProps">
              <q-btn
                flat
                dense
                size="sm"
                label="Extender"
                color="primary"
                @click="openExtendDialog(slotProps.row)"
              />
              <q-btn
                flat
                dense
                size="sm"
                label="Contactar"
                color="positive"
                icon="chat"
                :disable="!slotProps.row.phone"
                @click="contactMember(slotProps.row)"
              />
            </q-td>
          </template>
        </q-table>
        <div v-else class="text-center q-pa-md text-grey-5 text-italic">
          No hay miembros que requieran atencion
        </div>
      </q-card-section>
    </q-card>

    <!-- Extend Dialog -->
    <q-dialog v-model="showExtendDialog">
      <q-card style="min-width: 350px">
        <q-card-section>
          <div class="text-h6">Extender suscripcion</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <div class="text-body2 q-mb-md">
            {{ extendMemberName }}
          </div>
          <q-input
            v-model.number="extendDays"
            type="number"
            label="Dias a extender"
            outlined
            dense
            :rules="[(v: number) => v > 0 || 'Debe ser mayor a 0']"
          />
        </q-card-section>
        <q-card-section class="text-caption text-grey-6 q-pt-none">
          Proximamente: esta funcionalidad estara disponible pronto.
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn flat label="Extender" color="primary" v-close-popup disabled />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </template>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'vue-chartjs';
import { COLORS, chartColors } from 'src/utils/chart-colors';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import { useAnalyticsApi } from 'src/composables/useAnalyticsApi';
import { SEGMENT_LABELS, SEGMENT_COLORS, type MemberSegment } from 'src/types/member';
import type {
  MemberAnalytics,
  AttentionMember,
  MemberFlowsPoint,
  ChurnedMemberRow,
} from 'src/types/analytics';

// -- Register Chart.js components ----------------------------------------

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

// -- Props ---------------------------------------------------------------

const props = defineProps<{
  data: MemberAnalytics | null;
  loading: boolean;
  /** Page-level filters: the flows/bajas fetches this tab owns follow them. */
  branchId?: number;
  dateFrom: string;
  dateTo: string;
}>();

// -- Setup ---------------------------------------------------------------

const router = useRouter();
const $q = useQuasar();
const log = createLogger('MiembrosTab');
const analyticsApi = useAnalyticsApi();

// -- Member flows (altas vs bajas) ----------------------------------------
// Two fetches this tab owns (the page keeps owning `data`): the 12-month
// series for the chart, and the page-period flows for the stat cards. Both
// come from /member-flows (canonical expiry-cohort engine, fase 121).

const loadingFlows = ref(false);
const flowsSeries12m = ref<MemberFlowsPoint[]>([]);
const periodFlows = ref<MemberFlowsPoint[]>([]);

/** First day of the month `monthsAgo` months before today (YYYY-MM-DD). */
function monthStart(monthsAgo: number): string {
  const d = new Date();
  const start = new Date(Date.UTC(d.getFullYear(), d.getMonth() - monthsAgo, 1));
  return start.toISOString().split('T')[0]!;
}

/** Exclusive upper bound: first day of NEXT month (YYYY-MM-DD). */
function nextMonthStart(): string {
  const d = new Date();
  const next = new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 1));
  return next.toISOString().split('T')[0]!;
}

async function loadFlows() {
  loadingFlows.value = true;
  try {
    const [chart, period] = await Promise.all([
      // Chart: fixed last-12-months window, independent of the page period.
      analyticsApi.getMemberFlows({
        branchId: props.branchId,
        dateFrom: monthStart(11),
        dateTo: nextMonthStart(),
      }),
      // Cards: the page's selected period (dateTo is exclusive server-side,
      // matching every other analytics endpoint's half-open range).
      analyticsApi.getMemberFlows({
        branchId: props.branchId,
        dateFrom: props.dateFrom,
        dateTo: props.dateTo,
      }),
    ]);
    flowsSeries12m.value = chart.series;
    periodFlows.value = period.series;
  } catch (err: unknown) {
    log.error('Error loading member flows', { error: extractError(err, 'flows') });
  } finally {
    loadingFlows.value = false;
  }
}

const periodAltas = computed(() => periodFlows.value.reduce((a, p) => a + p.altas, 0));
const periodBajas = computed(() => periodFlows.value.reduce((a, p) => a + p.bajas, 0));
const periodBajasProvisional = computed(() => periodFlows.value.some((p) => p.bajasProvisional));
const hasProvisionalMonths = computed(() => flowsSeries12m.value.some((p) => p.bajasProvisional));

const MONTH_LABELS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/** "2026-03" → "mar 26" (con * si el mes es provisional). */
function formatBucket(bucket: string, provisional: boolean): string {
  const [year, month] = bucket.split('-');
  const label = `${MONTH_LABELS[Number(month) - 1] ?? month} ${year?.slice(2) ?? ''}`;
  return provisional ? `${label}*` : label;
}

const flowsChartData = computed(() => ({
  labels: flowsSeries12m.value.map((p) => formatBucket(p.bucket, p.bajasProvisional)),
  datasets: [
    {
      label: 'Altas',
      data: flowsSeries12m.value.map((p) => p.altas),
      backgroundColor: COLORS.positive,
    },
    {
      label: 'Bajas',
      data: flowsSeries12m.value.map((p) => p.bajas),
      backgroundColor: COLORS.negative,
    },
  ],
}));

// -- Bajas del mes (detalle con contexto de ficha) -------------------------

const loadingChurned = ref(false);
const exportingChurned = ref(false);
const churnedMembers = ref<ChurnedMemberRow[]>([]);
// Default: el último mes COMPLETO — el corriente suele estar casi todo en
// gracia (ventana de renovación) y mostraría una lista vacía engañosa.
const churnedMonth = ref(monthStart(1).slice(0, 7));

const monthOptions = computed(() => {
  const opts: Array<{ label: string; value: string }> = [];
  for (let i = 0; i < 12; i++) {
    const bucket = monthStart(i).slice(0, 7);
    opts.push({ label: formatBucket(bucket, false), value: bucket });
  }
  return opts;
});

/** [inicio de mes, inicio del mes siguiente) para el bucket YYYY-MM. */
function monthRange(bucket: string): { dateFrom: string; dateTo: string } {
  const [year, month] = bucket.split('-').map(Number);
  const from = new Date(Date.UTC(year!, month! - 1, 1));
  const to = new Date(Date.UTC(year!, month!, 1));
  return {
    dateFrom: from.toISOString().split('T')[0]!,
    dateTo: to.toISOString().split('T')[0]!,
  };
}

async function loadChurnedMembers() {
  loadingChurned.value = true;
  try {
    const range = monthRange(churnedMonth.value);
    const result = await analyticsApi.getChurnedMembers({
      branchId: props.branchId,
      ...range,
    });
    churnedMembers.value = result.members;
  } catch (err: unknown) {
    log.error('Error loading churned members', { error: extractError(err, 'bajas') });
    churnedMembers.value = [];
  } finally {
    loadingChurned.value = false;
  }
}

async function onExportChurned() {
  exportingChurned.value = true;
  try {
    const range = monthRange(churnedMonth.value);
    const blob = await analyticsApi.exportChurnedMembers({
      branchId: props.branchId,
      ...range,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bajas-${churnedMonth.value}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err: unknown) {
    const message = extractError(err, 'Error exportando bajas');
    log.error('Error exporting churned members', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    exportingChurned.value = false;
  }
}

const churnedColumns = [
  { name: 'nombre', label: 'Nombre', field: 'firstName', align: 'left' as const, sortable: true },
  { name: 'telefono', label: 'Teléfono', field: 'phone', align: 'left' as const },
  { name: 'sede', label: 'Sede', field: 'branchName', align: 'left' as const, sortable: true },
  { name: 'plan', label: 'Plan', field: 'planName', align: 'left' as const, sortable: true },
  { name: 'precio', label: 'Precio', field: 'pricePaid', align: 'right' as const, sortable: true },
  {
    name: 'antiguedad',
    label: 'Antigüedad (meses)',
    field: 'tenureMonths',
    align: 'right' as const,
    sortable: true,
  },
  {
    name: 'membresias',
    label: 'Membresías',
    field: 'membershipsPaid',
    align: 'right' as const,
    sortable: true,
  },
  {
    name: 'baja',
    label: 'Fecha de baja',
    field: 'lastEndDate',
    align: 'left' as const,
    sortable: true,
  },
];

function formatChurnedPrice(row: ChurnedMemberRow): string {
  return `$${row.pricePaid.toLocaleString('es-AR')} ${row.currency}`;
}

function openWhatsApp(phone: string) {
  const cleaned = phone.replace(/\D/g, '');
  window.open(`https://wa.me/${cleaned}`, '_blank');
}

// -- Lifecycle -------------------------------------------------------------

onMounted(() => {
  void loadFlows();
  void loadChurnedMembers();
});

watch(
  () => [props.branchId, props.dateFrom, props.dateTo],
  () => {
    void loadFlows();
    void loadChurnedMembers();
  }
);

watch(churnedMonth, () => {
  void loadChurnedMembers();
});

// -- Attention list prioritization (D-16, Phase 136 D-01) ----------------
// Ausente / alerta about to expire are the highest-priority contacts. Sort
// them first; within the same priority keep the backend's urgency order
// (alineado con priorityRank del backend: ausente=0, alerta=1, resto=2).

const SEGMENT_PRIORITY: Record<string, number> = {
  ausente: 0,
  alerta: 1,
};

const prioritizedAttentionList = computed<AttentionMember[]>(() => {
  const list = props.data?.attentionList ?? [];
  return [...list].sort((a, b) => {
    const pa = a.segment ? (SEGMENT_PRIORITY[a.segment] ?? 2) : 2;
    const pb = b.segment ? (SEGMENT_PRIORITY[b.segment] ?? 2) : 2;
    return pa - pb;
  });
});

function segmentLabel(segment: string): string {
  return SEGMENT_LABELS[segment as MemberSegment] ?? segment;
}

function segmentColor(segment: string): string {
  return SEGMENT_COLORS[segment as MemberSegment] ?? 'grey';
}

// -- Chart data ----------------------------------------------------------

const planDistributionData = computed(() => {
  if (!props.data) return { labels: [], datasets: [] };
  const dist = props.data.planDistribution;
  return {
    labels: dist.map((d) => d.planName),
    datasets: [
      {
        data: dist.map((d) => d.count),
        backgroundColor: dist.map((_, i) => chartColors[i % chartColors.length]),
      },
    ],
  };
});

const barChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' as const },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { stepSize: 1 },
    },
  },
};

const doughnutChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'right' as const, labels: { boxWidth: 12 } },
  },
};

// -- Attention list columns / helpers ------------------------------------

const attentionColumns = [
  {
    name: 'nombre',
    label: 'Nombre',
    field: 'firstName',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'plan',
    label: 'Plan',
    field: 'planName',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'estado',
    label: 'Estado',
    field: 'type',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'segmento',
    label: 'Segmento',
    field: 'segment',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'pago',
    label: 'Pago',
    field: 'yaPago',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'acciones',
    label: 'Acciones',
    field: 'userId',
    align: 'right' as const,
  },
];

function formatMemberName(member: AttentionMember): string {
  const parts = [member.firstName, member.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : `Miembro #${member.userId}`;
}

function goToMember(userId: number) {
  router.push(`/alumnos/${userId}`);
}

function contactMember(member: AttentionMember) {
  if (!member.phone) return;
  const cleaned = member.phone.replace(/\D/g, '');
  window.open(`https://wa.me/${cleaned}`, '_blank');
}

// -- Extend dialog -------------------------------------------------------

const showExtendDialog = ref(false);
const extendDays = ref(30);
const extendMemberName = ref('');

function openExtendDialog(member: AttentionMember) {
  extendMemberName.value = formatMemberName(member);
  extendDays.value = 30;
  showExtendDialog.value = true;
}
</script>
