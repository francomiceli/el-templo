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
        <q-table
          v-if="props.data.attentionList.length > 0"
          :rows="props.data.attentionList"
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
