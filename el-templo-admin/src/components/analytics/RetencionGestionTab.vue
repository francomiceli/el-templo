<template>
  <div v-if="props.loading" class="q-pa-md">
    <q-skeleton type="rect" height="120px" class="q-mb-md" />
    <q-skeleton type="rect" height="300px" />
  </div>
  <div
    v-else-if="!props.churn && !props.renewal"
    class="text-center q-pa-xl text-grey-5 text-italic"
  >
    No hay datos para el periodo seleccionado
  </div>
  <template v-else>
    <!-- Churn + Renovación in the SAME card row (D-03: two faces of one thing) -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="row q-col-gutter-md items-start">
          <!-- Churn headline: 15d titular + 5/10d comparison (D-02) -->
          <div class="col-12 col-sm-6">
            <div class="text-center q-pa-sm">
              <div class="text-caption text-grey-7">Churn de no-renovación (15 días)</div>
              <div class="text-h4 text-negative">{{ formatPct(churnHeadline) }}</div>
              <div v-if="churnComparison.length > 0" class="q-mt-sm">
                <div
                  v-for="c in churnComparison"
                  :key="c.windowDays"
                  class="text-caption text-warning"
                >
                  {{ c.windowDays }} días: {{ formatPct(c.churn.percentage) }}
                  <span class="text-grey-6">(prematuro)</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Renovación headline + "número vivo" note (D-03) -->
          <div class="col-12 col-sm-6">
            <div class="text-center q-pa-sm">
              <div class="text-caption text-grey-7">Tasa de renovación</div>
              <div class="text-h4 text-positive">
                {{ props.renewal ? formatPct(props.renewal.renewal.percentage) : '—' }}
              </div>
              <div class="text-caption text-grey-6 q-mt-sm">
                Número vivo: sube con el tiempo, no suma 100% con el churn (hay gente todavía en el
                margen).
              </div>
            </div>
          </div>
        </div>
      </q-card-section>
    </q-card>

    <!-- Month-over-month churn curve (D-02) -->
    <q-card v-if="props.churn && props.churn.series.length > 0" flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">Churn mes a mes</div>
        <div style="height: 300px; position: relative">
          <Line :data="churnSeriesData" :options="churnSeriesOptions" />
        </div>
        <div class="text-caption text-grey-6 q-mt-sm">
          Los meses con tono más claro son <b>provisionales</b>: la cohorte todavía no maduró y el
          valor puede cambiar.
        </div>
      </q-card-section>
    </q-card>

    <!-- Desglose por sucursal / plan (D-02 / D-03) -->
    <q-card v-if="breakdownRows.length > 0" flat bordered>
      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">Desglose por sucursal y plan</div>
        <q-table
          :rows="breakdownRows"
          :columns="breakdownColumns"
          row-key="rowKey"
          flat
          dense
          :pagination="{ rowsPerPage: 10 }"
        >
          <template #body-cell-churn="slotProps">
            <q-td :props="slotProps">
              <span v-if="slotProps.row.churn !== null" class="text-negative">
                {{ formatPct(slotProps.row.churn) }}
              </span>
              <span v-else class="text-grey-5">—</span>
            </q-td>
          </template>
          <template #body-cell-renewal="slotProps">
            <q-td :props="slotProps">
              <span v-if="slotProps.row.renewal !== null" class="text-positive">
                {{ formatPct(slotProps.row.renewal) }}
              </span>
              <span v-else class="text-grey-5">—</span>
            </q-td>
          </template>
        </q-table>
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
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  type TooltipItem,
} from 'chart.js';
import { Line } from 'vue-chartjs';
import { COLORS } from 'src/utils/chart-colors';
import type { ChurnAnalytics, RenewalAnalytics, ChurnRenewalAxis } from 'src/types/analytics';

// -- Register Chart.js components ----------------------------------------

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend);

// -- Props ---------------------------------------------------------------

const props = defineProps<{
  churn: ChurnAnalytics | null;
  renewal: RenewalAnalytics | null;
  loading: boolean;
}>();

// -- Helpers -------------------------------------------------------------

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

const AXIS_LABELS: Record<ChurnRenewalAxis, string> = {
  branch: 'Sucursal',
  country: 'País',
  duration: 'Duración',
  plan: 'Plan',
};

// -- Churn headline: prefer the 15-day window, else the official window --

const churnHeadline = computed<number>(() => {
  if (!props.churn) return 0;
  const fifteen = props.churn.comparison.find((c) => c.windowDays === 15);
  if (fifteen) return fifteen.churn.percentage;
  if (props.churn.window.windowDays === 15) return props.churn.window.churn.percentage;
  return props.churn.window.churn.percentage;
});

// 5/10-day comparison readings (premature) — exclude the 15d headline.
const churnComparison = computed(() => {
  if (!props.churn) return [];
  return props.churn.comparison
    .filter((c) => c.windowDays !== 15)
    .sort((a, b) => a.windowDays - b.windowDays);
});

// -- Month-over-month churn curve ----------------------------------------

const MONTH_NAMES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

// "YYYY-MM" → "Mes YYYY". Falls back to the raw bucket if malformed.
function bucketLabel(bucket: string): string {
  const [year, month] = bucket.split('-');
  const name = MONTH_NAMES[Number(month) - 1];
  return name !== undefined ? `${name} ${year}` : bucket;
}

const churnSeriesData = computed(() => {
  const series = props.churn?.series ?? [];
  return {
    labels: series.map((p) => bucketLabel(p.bucket)),
    datasets: [
      {
        label: 'Churn mensual',
        data: series.map((p) => p.churn.percentage),
        borderColor: COLORS.negative,
        // Lighten provisional points so they read as not-yet-final.
        pointBackgroundColor: series.map((p) => (p.provisional ? COLORS.warning : COLORS.negative)),
        pointRadius: series.map((p) => (p.provisional ? 5 : 3)),
        // Dash the segment leading into a provisional point.
        segment: {
          borderDash: (ctx: { p1DataIndex: number }) =>
            series[ctx.p1DataIndex]?.provisional ? [6, 4] : undefined,
        },
        tension: 0.3,
        spanGaps: false,
      },
    ],
  };
});

const churnSeriesOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<'line'>) => {
          const point = props.churn?.series[ctx.dataIndex];
          const suffix = point?.provisional ? ' (provisional)' : '';
          return `Churn: ${ctx.parsed.y}%${suffix}`;
        },
      },
    },
  },
  scales: {
    y: { beginAtZero: true, max: 100, ticks: { callback: (v: number | string) => `${v}%` } },
  },
}));

// -- Desglose por sucursal / plan (merge churn + renovación by axis/key) --

interface BreakdownRow {
  rowKey: string;
  axisLabel: string;
  key: string;
  churn: number | null;
  renewal: number | null;
}

const breakdownRows = computed<BreakdownRow[]>(() => {
  const byKey = new Map<string, BreakdownRow>();
  const keyOf = (axis: ChurnRenewalAxis, key: string) => `${axis}::${key}`;

  for (const row of props.churn?.breakdowns ?? []) {
    const k = keyOf(row.axis, row.key);
    const existing = byKey.get(k);
    if (existing) {
      existing.churn = row.churn.percentage;
    } else {
      byKey.set(k, {
        rowKey: k,
        axisLabel: AXIS_LABELS[row.axis],
        key: row.key,
        churn: row.churn.percentage,
        renewal: null,
      });
    }
  }

  for (const row of props.renewal?.breakdowns ?? []) {
    const k = keyOf(row.axis, row.key);
    const existing = byKey.get(k);
    if (existing) {
      existing.renewal = row.renewal.percentage;
    } else {
      byKey.set(k, {
        rowKey: k,
        axisLabel: AXIS_LABELS[row.axis],
        key: row.key,
        churn: null,
        renewal: row.renewal.percentage,
      });
    }
  }

  return [...byKey.values()].sort(
    (a, b) => a.axisLabel.localeCompare(b.axisLabel) || a.key.localeCompare(b.key)
  );
});

const breakdownColumns = [
  { name: 'axis', label: 'Eje', field: 'axisLabel', align: 'left' as const, sortable: true },
  { name: 'key', label: 'Valor', field: 'key', align: 'left' as const, sortable: true },
  { name: 'churn', label: 'Churn', field: 'churn', align: 'right' as const, sortable: true },
  {
    name: 'renewal',
    label: 'Renovación',
    field: 'renewal',
    align: 'right' as const,
    sortable: true,
  },
];
</script>
