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
            <div class="text-subtitle2 q-mb-sm">
              Ingresos por mes
              <span class="text-caption text-grey-6">(ARS y EUR por separado)</span>
            </div>
            <div style="height: 300px; position: relative">
              <Bar :data="revenueTrendData" :options="revenueChartOptions" />
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-4">
        <q-card flat bordered class="q-mb-md">
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">
              Ingresos por metodo
              <span class="text-caption text-grey-6">({{ props.currency }})</span>
            </div>
            <div class="column q-gutter-sm">
              <div class="row items-center justify-between">
                <span class="text-caption">Efectivo</span>
                <span class="text-weight-bold">{{
                  formatCurrency(props.data.revenueByMethod.cash[currencyCode])
                }}</span>
              </div>
              <div class="row items-center justify-between">
                <span class="text-caption">Transferencia</span>
                <span class="text-weight-bold">{{
                  formatCurrency(props.data.revenueByMethod.transfer[currencyCode])
                }}</span>
              </div>
              <div class="row items-center justify-between">
                <span class="text-caption">Tarjeta</span>
                <span class="text-weight-bold">{{
                  formatCurrency(props.data.revenueByMethod.card[currencyCode])
                }}</span>
              </div>
              <!-- Domiciliación (SEPA): solo sedes ES, y solo cuando hubo
                   movimiento — en Argentina la fila nunca aparece. -->
              <div
                v-if="props.data.revenueByMethod.direct_debit[currencyCode] > 0"
                class="row items-center justify-between"
              >
                <span class="text-caption">Domiciliación</span>
                <span class="text-weight-bold">{{
                  formatCurrency(props.data.revenueByMethod.direct_debit[currencyCode])
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

    <!-- Outstanding debt snapshot (at "now", not period-scoped) -->
    <div class="row q-col-gutter-md">
      <div
        v-for="entry in outstandingEntries"
        :key="entry.currency"
        class="col-12"
        :class="outstandingEntries.length > 1 ? 'col-sm-6' : 'col-sm-12'"
      >
        <q-card flat bordered class="cursor-pointer" @click="goToDeudas">
          <q-card-section class="text-center">
            <div class="text-caption text-grey-7">
              Deuda al hoy{{ outstandingEntries.length > 1 ? ` (${entry.currency})` : '' }}
            </div>
            <div class="text-h4" :class="entry.amount > 0 ? 'text-negative' : 'text-positive'">
              {{ formatPrice(entry.amount, entry.currency) }}
            </div>
            <div class="text-caption text-grey-6 q-mt-xs">
              Ver detalle en Reportes → Deudas
              <q-icon name="arrow_forward" size="xs" />
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
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
import { formatPrice } from 'src/utils/format-price';
import type { FinancialAnalytics } from 'src/types/analytics';

const router = useRouter();

// -- Register Chart.js components ----------------------------------------

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// -- Props ---------------------------------------------------------------

const props = withDefaults(
  defineProps<{
    data: FinancialAnalytics | null;
    loading: boolean;
    currency?: 'ARS' | 'EUR';
  }>(),
  { currency: 'ARS' }
);

// -- Currency formatter --------------------------------------------------

// `currency` is the country-derived display currency (ARS/EUR). Revenue is
// reported per-currency (D-05/D-17) and NEVER summed across currencies.
const currencyCode = computed<'ARS' | 'EUR'>(() => props.currency);

function formatCurrency(value: number): string {
  return formatPrice(value, props.currency);
}

// -- Chart data ----------------------------------------------------------

const revenueChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: 'top' as const },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<'bar'>) => {
          const code = ctx.dataset.label === 'EUR' ? 'EUR' : 'ARS';
          return `${code}: ${formatPrice(ctx.parsed.y ?? 0, code)}`;
        },
      },
    },
  },
  scales: {
    y: { beginAtZero: true },
  },
}));

// ARS and EUR are separate datasets so they are never summed into one bar.
const revenueTrendData = computed(() => {
  if (!props.data) return { labels: [], datasets: [] };
  const trend = props.data.revenueTrend;
  return {
    labels: trend.map((t) => t.month),
    datasets: [
      {
        label: 'ARS',
        data: trend.map((t) => t.ARS),
        backgroundColor: COLORS.primary,
      },
      {
        label: 'EUR',
        data: trend.map((t) => t.EUR),
        backgroundColor: COLORS.accent,
      },
    ],
  };
});

const branchChartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y' as const,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<'bar'>) => formatPrice(ctx.parsed.x ?? 0, props.currency),
      },
    },
  },
  scales: {
    x: { beginAtZero: true },
  },
}));

// Per-branch revenue in the displayed currency (branches belong to one country,
// so the non-displayed currency is 0 for them). Never summed across currencies.
const revenueByBranchData = computed(() => {
  if (!props.data) return { labels: [], datasets: [] };
  const byBranch = props.data.revenueByBranch;
  const code = currencyCode.value;
  return {
    labels: byBranch.map((b) => b.branchName),
    datasets: [
      {
        label: `Ingresos (${code})`,
        data: byBranch.map((b) => b[code]),
        backgroundColor: byBranch.map((_, i) => chartColors[i % chartColors.length]),
      },
    ],
  };
});

// Show only currencies with non-zero debt; if all zero, show one card in the
// scoped currency so the operator sees an explicit "0" instead of nothing.
const outstandingEntries = computed<Array<{ currency: 'ARS' | 'EUR'; amount: number }>>(() => {
  if (!props.data) return [];
  const breakdown = props.data.outstandingByCurrency;
  const entries: Array<{ currency: 'ARS' | 'EUR'; amount: number }> = [];
  if (breakdown.ARS > 0) entries.push({ currency: 'ARS', amount: breakdown.ARS });
  if (breakdown.EUR > 0) entries.push({ currency: 'EUR', amount: breakdown.EUR });
  if (entries.length === 0) {
    entries.push({ currency: props.currency, amount: 0 });
  }
  return entries;
});

function goToDeudas(): void {
  void router.push({ path: '/reportes', query: { tab: 'deudas' } });
}
</script>
