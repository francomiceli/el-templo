<template>
  <!-- Permanent ramp-up caveat (D-01) — always visible, even while loading -->
  <q-banner dense rounded class="bg-orange-2 text-orange-10 q-mb-md">
    <template #avatar>
      <q-icon name="info" color="orange-9" />
    </template>
    Las cohortes anteriores al 26/05/2026 son aproximadas: solo se reconstruyó la primera
    suscripción, no los ciclos intermedios. La curva es 100% confiable solo para cohortes nuevas.
  </q-banner>

  <!-- plan_category (D-06) + duration filters -->
  <div class="row q-col-gutter-md q-mb-md">
    <div class="col-12 col-sm-4">
      <q-select
        :model-value="props.planCategory"
        :options="planCategoryOptions"
        label="Categoría de plan"
        dense
        outlined
        emit-value
        map-options
        @update:model-value="onPlanCategoryChange"
      />
    </div>
    <div class="col-12 col-sm-4">
      <q-select
        :model-value="props.durationDays"
        :options="durationOptions"
        label="Duración del plan"
        dense
        outlined
        emit-value
        map-options
        @update:model-value="onDurationChange"
      />
    </div>
  </div>

  <div v-if="props.loading" class="q-pa-md">
    <q-skeleton type="rect" height="300px" class="q-mb-md" />
    <q-skeleton type="rect" height="120px" />
  </div>
  <div
    v-else-if="!props.data || props.data.cohorts.length === 0"
    class="text-center q-pa-xl text-grey-5 text-italic"
  >
    Aún no hay cohortes con suscripciones activas en este alcance
  </div>
  <template v-else>
    <!-- Retention curve -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">Retención por ciclos de plan</div>
        <div style="height: 300px; position: relative">
          <Line :data="retentionChartData" :options="retentionOptions" />
        </div>
      </q-card-section>
    </q-card>

    <!-- Cycle distribution among current actives -->
    <q-card flat bordered>
      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">
          Distribución de ciclos completados (activos actuales)
        </div>
        <div class="row q-col-gutter-md">
          <div v-for="card in distributionCards" :key="card.label" class="col-12 col-sm-4">
            <div class="text-center q-pa-sm">
              <div class="text-h4 text-primary">{{ card.value }}</div>
              <div class="text-caption text-grey-7">{{ card.label }}</div>
            </div>
          </div>
        </div>
        <div v-if="props.data.invalidWindowSubs > 0" class="text-caption text-grey-6 q-mt-sm">
          Se excluyeron {{ props.data.invalidWindowSubs }} suscripciones con ventana inválida (sin
          fecha de fin o duración 0).
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
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  type TooltipItem,
} from 'chart.js';
import { Line } from 'vue-chartjs';
import { chartColors } from 'src/utils/chart-colors';
import type { RetentionAnalytics, RetentionPlanCategory } from 'src/types/analytics';

// -- Register Chart.js components ----------------------------------------

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend);

// -- Props / emits -------------------------------------------------------

const props = defineProps<{
  data: RetentionAnalytics | null;
  loading: boolean;
  planCategory: RetentionPlanCategory;
  durationDays: number | null;
}>();

const emit = defineEmits<{
  'update:planCategory': [value: RetentionPlanCategory];
  'update:durationDays': [value: number | null];
}>();

const planCategoryOptions: Array<{ label: string; value: RetentionPlanCategory }> = [
  { label: 'Todas', value: 'todas' },
  { label: 'Presencial', value: 'presencial' },
  { label: 'Online regular', value: 'online_regular' },
  { label: 'Online goal', value: 'online_goal' },
  { label: 'Online coach', value: 'online_coach' },
];

function onPlanCategoryChange(value: RetentionPlanCategory): void {
  emit('update:planCategory', value);
}

// Duration options are built from the durations the backend reports as present
// in the current scope/category (`null` = todas). Stays in sync as the category
// filter changes the available set.
const durationOptions = computed<Array<{ label: string; value: number | null }>>(() => {
  const opts: Array<{ label: string; value: number | null }> = [{ label: 'Todas', value: null }];
  for (const d of props.data?.availableDurations ?? []) {
    opts.push({ label: `${d} días`, value: d });
  }
  return opts;
});

function onDurationChange(value: number | null): void {
  emit('update:durationDays', value);
}

// -- Retention curve (multi-cohort, X = ciclo N) -------------------------

const retentionChartData = computed(() => {
  if (!props.data) return { labels: [] as string[], datasets: [] };
  const maxCycle = Math.max(props.data.maxCycle, 1);
  // X-axis labels are cycle numbers (ciclo N), NOT calendar months.
  const labels = Array.from({ length: maxCycle }, (_, i) => `Ciclo ${i + 1}`);
  return {
    labels,
    datasets: props.data.cohorts.map((cohort, i) => ({
      label: cohort.cohort,
      data: labels.map((_, idx) => cohort.cycleRetention[idx] ?? null),
      borderColor: chartColors[i % chartColors.length],
      backgroundColor: chartColors[i % chartColors.length],
      tension: 0.3,
      spanGaps: false,
    })),
  };
});

const retentionOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: 'top' as const },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<'line'>) => {
          const value = ctx.parsed.y;
          return `${ctx.dataset.label}: ${value === null ? '—' : `${value}%`}`;
        },
      },
    },
  },
  scales: {
    y: { beginAtZero: true, max: 100, ticks: { callback: (v: number | string) => `${v}%` } },
  },
}));

// -- Cycle distribution among current actives ----------------------------

const distributionCards = computed<Array<{ label: string; value: number }>>(() => {
  if (!props.data) return [];
  const d = props.data.cycleDistribution;
  return [
    { label: 'Ciclo 1', value: d.ciclo1 },
    { label: 'Ciclo 2', value: d.ciclo2 },
    { label: 'Ciclo 3+', value: d.ciclo3plus },
  ];
});
</script>
