<template>
  <!-- Permanent ramp-up caveat (D-01) — always visible, even while loading -->
  <q-banner dense rounded class="bg-orange-2 text-orange-10 q-mb-md">
    <template #avatar>
      <q-icon name="info" color="orange-9" />
    </template>
    Las cohortes anteriores al 26/05/2026 son aproximadas: solo se reconstruyó la primera
    suscripción, no los ciclos intermedios. La curva es 100% confiable solo para cohortes nuevas.
  </q-banner>

  <!-- Filters: plan (server-side re-fetch) + year (client-side, reduces lines) -->
  <div class="row q-col-gutter-md q-mb-md">
    <div class="col-12 col-sm-5">
      <q-select
        :model-value="props.planId"
        :options="planOptions"
        label="Plan"
        dense
        outlined
        emit-value
        map-options
        @update:model-value="onPlanChange"
      />
    </div>
    <div class="col-12 col-sm-3">
      <q-select
        v-model="selectedYear"
        :options="yearOptions"
        label="Año de la cohorte"
        dense
        outlined
        emit-value
        map-options
        :disable="yearOptions.length === 0"
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
        <div class="text-caption text-grey-7 q-mt-sm">
          Cada línea es una cohorte: los miembros cuyo <b>ciclo 1</b> (primera suscripción) empezó
          ese mes — p. ej. «Marzo 2026» son los que arrancaron en marzo de 2026. El eje X son
          <b>ciclos consecutivos</b> (renovaciones sin cortar más de 30 días), no meses calendario.
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
import { computed, ref, watch } from 'vue';
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
import type { RetentionAnalytics } from 'src/types/analytics';

// -- Register Chart.js components ----------------------------------------

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend);

// -- Props / emits -------------------------------------------------------

const props = defineProps<{
  data: RetentionAnalytics | null;
  loading: boolean;
  planId: number | null;
}>();

const emit = defineEmits<{
  'update:planId': [value: number | null];
}>();

// -- Plan filter (server-side) -------------------------------------------

// Options come from the plans the backend reports as present in scope; the
// duration is shown in parentheses. `null` = todos los planes.
const planOptions = computed<Array<{ label: string; value: number | null }>>(() => {
  const opts: Array<{ label: string; value: number | null }> = [
    { label: 'Todos los planes', value: null },
  ];
  for (const p of props.data?.availablePlans ?? []) {
    const dur = p.durationDays !== null ? ` (${p.durationDays} días)` : '';
    opts.push({ label: `${p.name}${dur}`, value: p.id });
  }
  return opts;
});

function onPlanChange(value: number | null): void {
  emit('update:planId', value);
}

// -- Year filter (client-side — keeps the chart from drawing too many lines) --

const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

// "YYYY-MM" → "Mes Año" (es). Falls back to the raw value if malformed.
function cohortLabel(cohort: string): string {
  const [year, month] = cohort.split('-');
  const name = MONTH_NAMES[Number(month) - 1];
  return name !== undefined ? `${name} ${year}` : cohort;
}

const availableYears = computed<string[]>(() => {
  const set = new Set<string>();
  for (const c of props.data?.cohorts ?? []) set.add(c.cohort.slice(0, 4));
  return [...set].sort();
});

const yearOptions = computed(() => availableYears.value.map((y) => ({ label: y, value: y })));

const selectedYear = ref<string | null>(null);

// Default to the most recent year; re-clamp if the available set changes (e.g.
// after a plan filter re-fetch) so we never keep a year that no longer exists.
watch(
  availableYears,
  (years) => {
    if (years.length === 0) {
      selectedYear.value = null;
    } else if (selectedYear.value === null || !years.includes(selectedYear.value)) {
      selectedYear.value = years[years.length - 1];
    }
  },
  { immediate: true }
);

const filteredCohorts = computed(() =>
  (props.data?.cohorts ?? []).filter(
    (c) => selectedYear.value === null || c.cohort.slice(0, 4) === selectedYear.value
  )
);

// -- Retention curve (one line per cohort of the selected year) ----------

const retentionChartData = computed(() => {
  const maxCycle = Math.max(props.data?.maxCycle ?? 1, 1);
  // X-axis labels are cycle numbers (ciclo N), NOT calendar months.
  const labels = Array.from({ length: maxCycle }, (_, i) => `Ciclo ${i + 1}`);
  return {
    labels,
    datasets: filteredCohorts.value.map((cohort, i) => ({
      label: cohortLabel(cohort.cohort),
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
