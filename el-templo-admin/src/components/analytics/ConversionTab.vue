<template>
  <div>
    <!-- Loading skeleton (reused from FunnelTab.vue) -->
    <div v-if="props.loading" class="q-pa-md">
      <q-skeleton type="rect" height="300px" class="q-mb-md" />
      <q-skeleton type="rect" height="120px" />
    </div>

    <!-- Empty state: no trial sessions in the period (all stage counts 0) -->
    <div v-else-if="isEmpty" class="text-center q-pa-xl text-grey-5 text-italic">
      No hay sesiones de prueba en el periodo seleccionado
    </div>

    <template v-else>
      <!-- Star rate (D-06): tasaCierre is the dominant headline -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="row q-col-gutter-md items-end">
            <!-- Dominant: Tasa de cierre (compró sobre asistió) -->
            <div class="col-12 col-md-6 text-center q-pa-sm">
              <div class="text-h3 text-primary">{{ tasaCierrePct }}</div>
              <div class="text-caption text-grey-7">Tasa de cierre (compró sobre asistió)</div>
            </div>
            <!-- Secondary: tasaShow + puntaAPunta -->
            <div class="col-6 col-md-3 text-center q-pa-sm">
              <div class="text-h6">{{ tasaShowPct }}</div>
              <div class="text-caption text-grey-7">% asiste (asistió sobre reservó)</div>
            </div>
            <div class="col-6 col-md-3 text-center q-pa-sm">
              <div class="text-h6">{{ puntaAPuntaPct }}</div>
              <div class="text-caption text-grey-7">Punta a punta (compró sobre reservó)</div>
            </div>
          </div>
        </q-card-section>
      </q-card>

      <!-- Embudo: 3 descending-width horizontal bars (reservaron ≥ asistieron ≥ compraron) -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle2 q-mb-sm">Embudo de sesiones de prueba</div>
          <div style="height: 300px; position: relative">
            <Bar :data="funnelChartData" :options="funnelOptions" />
          </div>
        </q-card-section>
      </q-card>

      <!-- Sucursal breakdown (D-11): the turno×sucursal cross is achieved by the
           page-level turno filter + this sucursal breakdown — no 2D component. -->
      <q-card flat bordered>
        <q-card-section>
          <div class="text-subtitle2 q-mb-sm">Cierre por sucursal</div>
          <q-table
            v-if="branchBreakdown.length > 0"
            flat
            dense
            :rows="branchBreakdown"
            :columns="branchColumns"
            row-key="key"
            hide-bottom
          />
          <div v-else class="text-grey-6 text-italic q-pa-sm">
            No hay desglose por sucursal en este alcance
          </div>
        </q-card-section>
      </q-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  type TooltipItem,
} from 'chart.js';
import { Bar } from 'vue-chartjs';
import type { QTableColumn } from 'quasar';
import { COLORS } from 'src/utils/chart-colors';
import { createLogger } from 'src/utils/logger';
import type { TrialFunnelAnalytics, TrialFunnelBreakdownRow } from 'src/types/analytics';

// -- Register Chart.js components ----------------------------------------

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const log = createLogger('ConversionTab');

// -- Props ---------------------------------------------------------------

const props = defineProps<{
  data: TrialFunnelAnalytics | null;
  loading: boolean;
}>();

// -- Empty detection: no trial sessions reached any stage ----------------

const isEmpty = computed(() => {
  if (!props.data) return true;
  const c = props.data.counts;
  return c.reservaron === 0 && c.asistieron === 0 && c.compraron === 0;
});

// -- Star rate + secondary rates (D-06) ----------------------------------

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Math.round(value)}%`;
}

const tasaCierrePct = computed(() => pct(props.data?.rates.tasaCierre.percentage));
const tasaShowPct = computed(() => pct(props.data?.rates.tasaShow.percentage));
const puntaAPuntaPct = computed(() => pct(props.data?.rates.puntaAPunta.percentage));

// -- Embudo: descending-width horizontal bars ----------------------------

const funnelChartData = computed(() => {
  const c = props.data?.counts ?? { reservaron: 0, asistieron: 0, compraron: 0 };
  return {
    labels: ['Reservaron', 'Asistieron', 'Compraron'],
    datasets: [
      {
        label: 'Sesiones de prueba',
        data: [c.reservaron, c.asistieron, c.compraron],
        // reservaron (terracotta) → asistieron (clay) → compraron (positive green, D-06)
        backgroundColor: [COLORS.primary, COLORS.secondary, COLORS.positive],
      },
    ],
  };
});

const funnelOptions = computed(() => {
  const reservaron = props.data?.counts.reservaron ?? 0;
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y' as const,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => {
            const value = ctx.parsed.x ?? 0;
            const denom = reservaron || 1;
            const p = Math.round((value / denom) * 100);
            return `${value} (${p}% de los que reservaron)`;
          },
        },
      },
    },
    scales: {
      x: { beginAtZero: true },
    },
  };
});

// -- Sucursal breakdown (D-11) — single axis, no 2D aggregation ----------

const branchColumns: QTableColumn<BranchRow>[] = [
  { name: 'key', label: 'Sucursal', field: 'key', align: 'left' },
  { name: 'reservaron', label: 'Reservaron', field: 'reservaron', align: 'right' },
  { name: 'asistieron', label: 'Asistieron', field: 'asistieron', align: 'right' },
  { name: 'compraron', label: 'Compraron', field: 'compraron', align: 'right' },
  { name: 'tasaCierre', label: 'Tasa de cierre', field: 'tasaCierre', align: 'right' },
];

interface BranchRow {
  key: string;
  reservaron: number;
  asistieron: number;
  compraron: number;
  tasaCierre: string;
}

const branchBreakdown = computed<BranchRow[]>(() => {
  if (!props.data) return [];
  const rows = props.data.breakdowns.filter((b: TrialFunnelBreakdownRow) => b.axis === 'branch');
  if (rows.length === 0 && props.data.breakdowns.length > 0) {
    log.debug('TrialFunnel breakdowns present but none on the branch axis');
  }
  return rows.map((b) => ({
    key: b.key,
    reservaron: b.counts.reservaron,
    asistieron: b.counts.asistieron,
    compraron: b.counts.compraron,
    tasaCierre: pct(b.rates.tasaCierre.percentage),
  }));
});
</script>
