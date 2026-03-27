<template>
  <div v-if="props.loading" class="q-pa-md">
    <q-skeleton type="rect" height="300px" class="q-mb-md" />
    <q-skeleton type="rect" height="200px" />
  </div>
  <div v-else-if="!props.data" class="text-center q-pa-xl text-grey-5 text-italic">
    No hay datos para el periodo seleccionado
  </div>
  <template v-else>
    <!-- Revenue trend chart -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-md-8">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">Ingresos por mes</div>
            <div style="height: 300px; position: relative">
              <Bar :data="revenueTrendData" :options="revenueChartOptions" />
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-4">
        <q-card flat bordered class="q-mb-md">
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">Ingresos por metodo</div>
            <div class="column q-gutter-sm">
              <div class="row items-center justify-between">
                <span class="text-caption">Efectivo</span>
                <span class="text-weight-bold">{{
                  formatCurrency(props.data.revenueByMethod.cash)
                }}</span>
              </div>
              <div class="row items-center justify-between">
                <span class="text-caption">Transferencia</span>
                <span class="text-weight-bold">{{
                  formatCurrency(props.data.revenueByMethod.transfer)
                }}</span>
              </div>
              <div class="row items-center justify-between">
                <span class="text-caption">Tarjeta</span>
                <span class="text-weight-bold">{{
                  formatCurrency(props.data.revenueByMethod.card)
                }}</span>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Revenue by branch -->
    <div v-if="props.data.revenueByBranch.length > 1" class="q-mb-md">
      <q-card flat bordered>
        <q-card-section>
          <div class="text-subtitle2 q-mb-sm">Ingresos por sede</div>
          <div style="height: 300px; position: relative">
            <Bar :data="revenueByBranchData" :options="branchChartOptions" />
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- Bottom stat cards -->
    <div class="row q-col-gutter-md">
      <div class="col-12 col-sm-6">
        <q-card flat bordered>
          <q-card-section class="text-center">
            <div class="text-caption text-grey-7">Deuda pendiente</div>
            <div class="text-h4 text-negative">
              {{ formatCurrency(props.data.totalOutstanding ?? 0) }}
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6">
        <q-card flat bordered>
          <q-card-section class="text-center">
            <div class="text-caption text-grey-7">Tasa de cobro</div>
            <div
              class="text-h4"
              :class="
                (props.data.collectionRate ?? 0) >= 80
                  ? 'text-positive'
                  : (props.data.collectionRate ?? 0) >= 50
                    ? 'text-warning'
                    : 'text-negative'
              "
            >
              {{ (props.data.collectionRate ?? 0).toFixed(1) }}%
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </template>
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
import { COLORS, chartColors } from 'src/utils/chart-colors';
import type { FinancialAnalytics } from 'src/types/analytics';

// -- Register Chart.js components ----------------------------------------

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// -- Props ---------------------------------------------------------------

const props = defineProps<{
  data: FinancialAnalytics | null;
  loading: boolean;
}>();

// -- Currency formatter --------------------------------------------------

const arsFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

function formatCurrency(value: number): string {
  return arsFormatter.format(value);
}

// -- Chart data ----------------------------------------------------------

const revenueChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<'bar'>) => formatCurrency(ctx.parsed.y ?? 0),
      },
    },
  },
  scales: {
    y: { beginAtZero: true },
  },
};

const revenueTrendData = computed(() => {
  if (!props.data) return { labels: [], datasets: [] };
  const trend = props.data.revenueTrend;
  return {
    labels: trend.map((t) => t.month),
    datasets: [
      {
        label: 'Ingresos',
        data: trend.map((t) => t.revenue),
        backgroundColor: COLORS.primary,
      },
    ],
  };
});

const branchChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y' as const,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<'bar'>) => formatCurrency(ctx.parsed.x ?? 0),
      },
    },
  },
  scales: {
    x: { beginAtZero: true },
  },
};

const revenueByBranchData = computed(() => {
  if (!props.data) return { labels: [], datasets: [] };
  const byBranch = props.data.revenueByBranch;
  return {
    labels: byBranch.map((b) => b.branchName),
    datasets: [
      {
        label: 'Ingresos',
        data: byBranch.map((b) => b.revenue),
        backgroundColor: byBranch.map((_, i) => chartColors[i % chartColors.length]),
      },
    ],
  };
});
</script>
