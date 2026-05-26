<template>
  <div v-if="props.loading" class="q-pa-md">
    <q-skeleton type="rect" height="300px" class="q-mb-md" />
    <q-skeleton type="rect" height="200px" />
  </div>
  <div v-else-if="!props.data" class="text-center q-pa-xl text-grey-5 text-italic">
    No hay datos para el periodo seleccionado
  </div>
  <template v-else>
    <!-- Stat cards: Nuevos + Bajas + Retencion -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-4">
        <q-card flat bordered>
          <q-card-section class="text-center">
            <div class="text-caption text-grey-7">Nuevos</div>
            <div class="text-h4 text-positive">{{ props.data.newMembers }}</div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-4">
        <q-card flat bordered>
          <q-card-section class="text-center">
            <div class="text-caption text-grey-7">Bajas</div>
            <div class="text-h4 text-negative">{{ props.data.churnedMembers }}</div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-4">
        <q-card flat bordered>
          <q-card-section class="text-center">
            <div class="text-caption text-grey-7">Tasa de retencion</div>
            <div
              class="text-h4"
              :class="
                props.data.retentionRate >= 80
                  ? 'text-positive'
                  : props.data.retentionRate >= 50
                    ? 'text-warning'
                    : 'text-negative'
              "
            >
              {{ props.data.retentionRate.toFixed(1) }}%
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Renewal rate 7/14/30 (D-15) -->
    <div class="row q-col-gutter-md q-mb-md">
      <div v-for="r in renewalRateCards" :key="r.key" class="col-12 col-sm-4">
        <q-card flat bordered>
          <q-card-section class="text-center">
            <div class="text-caption text-grey-7">{{ r.label }}</div>
            <div
              class="text-h4"
              :class="
                r.value >= 70 ? 'text-positive' : r.value >= 40 ? 'text-warning' : 'text-negative'
              "
            >
              {{ r.value.toFixed(0) }}%
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Charts row: New vs Churned bar + Plan distribution donut -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-md-7">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">Nuevos vs Bajas</div>
            <div style="height: 300px; position: relative">
              <Bar :data="newVsChurnedData" :options="barChartOptions" />
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

    <!-- Attention list -->
    <q-card flat bordered>
      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">Miembros que requieren atencion</div>
        <div class="text-caption text-grey-6 q-mb-sm">
          Ordenados por prioridad: ghost y en riesgo primero (más probable que se vayan).
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
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
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
import { SEGMENT_LABELS, SEGMENT_COLORS, type MemberSegment } from 'src/types/member';
import type { MemberAnalytics, AttentionMember } from 'src/types/analytics';

// -- Register Chart.js components ----------------------------------------

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

// -- Props ---------------------------------------------------------------

const props = defineProps<{
  data: MemberAnalytics | null;
  loading: boolean;
}>();

// -- Setup ---------------------------------------------------------------

const router = useRouter();

// -- Renewal rate 7/14/30 (D-15) -----------------------------------------

const renewalRateCards = computed(() => {
  const rr = props.data?.renewalRate;
  if (!rr) return [];
  return [
    { key: 'last7', label: 'Renovación (7 días)', value: rr.last7 },
    { key: 'last14', label: 'Renovación (14 días)', value: rr.last14 },
    { key: 'last30', label: 'Renovación (30 días)', value: rr.last30 },
  ];
});

// -- Attention list prioritization (D-16) --------------------------------
// Ghost / en_riesgo about to expire are the highest-priority contacts. Sort
// them first; within the same priority keep the backend's urgency order.

const SEGMENT_PRIORITY: Record<string, number> = {
  ghost: 0,
  en_riesgo: 1,
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

const newVsChurnedData = computed(() => ({
  labels: props.data ? ['Periodo seleccionado'] : [],
  datasets: props.data
    ? [
        {
          label: 'Nuevos',
          data: [props.data.newMembers],
          backgroundColor: COLORS.positive,
        },
        {
          label: 'Bajas',
          data: [props.data.churnedMembers],
          backgroundColor: COLORS.negative,
        },
      ]
    : [],
}));

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
