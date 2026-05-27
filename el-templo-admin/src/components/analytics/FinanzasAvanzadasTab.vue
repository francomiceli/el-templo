<template>
  <div v-if="props.loading" class="q-pa-md">
    <q-skeleton type="rect" height="300px" class="q-mb-md" />
    <q-skeleton type="rect" height="200px" />
  </div>
  <div v-else-if="!props.data || !hasAnyData" class="text-center q-pa-xl text-grey-5 text-italic">
    No hay ingresos para el periodo seleccionado
  </div>
  <template v-else>
    <!-- Caja vs Devengado — ONE chart PER currency (ARS/EUR never summed, D-08) -->
    <div class="row q-col-gutter-md q-mb-md">
      <div
        v-for="cur in renderedCurrencies"
        :key="cur"
        class="col-12"
        :class="renderedCurrencies.length > 1 ? 'col-md-6' : 'col-md-12'"
      >
        <q-card flat bordered>
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">
              Caja vs Devengado por mes
              <span class="text-caption text-grey-6">({{ cur }})</span>
            </div>
            <div style="height: 300px; position: relative">
              <Bar :data="cashVsAccruedData(cur)" :options="chartOptions(cur)" />
            </div>
            <div
              v-if="cur === 'ARS' && props.data.excludedInvalidWindow > 0"
              class="text-caption text-grey-6 q-mt-sm"
            >
              Se excluyeron {{ props.data.excludedInvalidWindow }} suscripciones con ventana
              inválida (sin fecha de fin o duración 0).
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- ARPU per currency -->
    <q-card flat bordered>
      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">ARPU mensual</div>
        <div class="row q-col-gutter-md">
          <div
            v-for="entry in arpuEntries"
            :key="entry.currency"
            class="col-12"
            :class="arpuEntries.length > 1 ? 'col-sm-6' : 'col-sm-12'"
          >
            <div class="text-center q-pa-sm">
              <div class="text-h4">{{ formatPrice(entry.value, entry.currency) }}</div>
              <div class="text-caption text-grey-7">ARPU mensual ({{ entry.currency }})</div>
            </div>
          </div>
        </div>
      </q-card-section>
    </q-card>
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
import { COLORS } from 'src/utils/chart-colors';
import { formatPrice } from 'src/utils/format-price';
import type { AdvancedFinanceAnalytics } from 'src/types/analytics';

type CurrencyCode = 'ARS' | 'EUR';

// -- Register Chart.js components ----------------------------------------

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// -- Props ---------------------------------------------------------------

const props = defineProps<{
  data: AdvancedFinanceAnalytics | null;
  loading: boolean;
}>();

// -- Currency presence (only render currencies with data, D-08) ----------

function currencyHasData(cur: CurrencyCode): boolean {
  if (!props.data) return false;
  const sum = (arr: Array<{ ARS: number; EUR: number }>): number =>
    arr.reduce((acc, p) => acc + p[cur], 0);
  return sum(props.data.cashTrend) > 0 || sum(props.data.accruedTrend) > 0;
}

const renderedCurrencies = computed<CurrencyCode[]>(() => {
  const out: CurrencyCode[] = [];
  if (currencyHasData('ARS')) out.push('ARS');
  if (currencyHasData('EUR')) out.push('EUR');
  // Fall back to an explicit ARS chart (with zeros) rather than nothing so the
  // operator always sees the scoped currency.
  if (out.length === 0) out.push('ARS');
  return out;
});

const hasAnyData = computed(() => currencyHasData('ARS') || currencyHasData('EUR'));

// -- Chart data: Caja (primary) vs Devengado (accent), per currency ------

function cashVsAccruedData(cur: CurrencyCode) {
  if (!props.data) return { labels: [] as string[], datasets: [] };
  // Union of months across both series, sorted ascending.
  const months = Array.from(
    new Set([
      ...props.data.cashTrend.map((p) => p.month),
      ...props.data.accruedTrend.map((p) => p.month),
    ])
  ).sort();
  const cashByMonth = new Map(props.data.cashTrend.map((p) => [p.month, p[cur]]));
  const accruedByMonth = new Map(props.data.accruedTrend.map((p) => [p.month, p[cur]]));
  return {
    labels: months,
    datasets: [
      {
        label: 'Caja',
        data: months.map((m) => cashByMonth.get(m) ?? 0),
        backgroundColor: COLORS.primary,
      },
      {
        label: 'Devengado',
        data: months.map((m) => accruedByMonth.get(m) ?? 0),
        backgroundColor: COLORS.accent,
      },
    ],
  };
}

function chartOptions(cur: CurrencyCode) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' as const },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) =>
            `${ctx.dataset.label}: ${formatPrice(ctx.parsed.y ?? 0, cur)}`,
        },
      },
    },
    scales: {
      y: { beginAtZero: true },
    },
  };
}

// -- ARPU per currency (latest month with data) --------------------------

const arpuEntries = computed<Array<{ currency: CurrencyCode; value: number }>>(() => {
  if (!props.data) return [];
  const entries: Array<{ currency: CurrencyCode; value: number }> = [];
  for (const cur of renderedCurrencies.value) {
    // Use the most recent month's ARPU for the scoped currency.
    const points = props.data.arpu;
    const latest = points.length > 0 ? points[points.length - 1]![cur] : 0;
    entries.push({ currency: cur, value: latest });
  }
  return entries;
});
</script>
