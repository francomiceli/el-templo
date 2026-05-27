<template>
  <div>
    <!-- Permanent ramp-up caveat (D-01) — always visible -->
    <q-banner dense rounded class="bg-orange-2 text-orange-10 q-mb-md">
      <template #avatar>
        <q-icon name="info" color="orange-9" />
      </template>
      Las transiciones precisas de prueba e inactivo se registran solo desde el 26/05/2026. Los
      datos anteriores son aproximados (reconstruidos desde la primera suscripción). Las cohortes
      nuevas se vuelven confiables con el tiempo — período de ramp-up.
    </q-banner>

    <!-- Entry-origin segment toggle — attributes conversions by trial origin -->
    <div class="q-mb-md">
      <q-btn-toggle
        :model-value="props.entryOrigin"
        no-caps
        unelevated
        spread
        toggle-color="primary"
        color="grey-3"
        text-color="grey-8"
        :options="originOptions"
        @update:model-value="onOriginChange"
      />
      <div class="text-caption text-grey-7 q-mt-xs">{{ originHint }}</div>
    </div>

    <div v-if="props.loading" class="q-pa-md">
      <q-skeleton type="rect" height="300px" class="q-mb-md" />
      <q-skeleton type="rect" height="120px" />
    </div>
    <div
      v-else-if="!props.data || props.data.cohorts.length === 0"
      class="text-center q-pa-xl text-grey-5 text-italic"
    >
      Aún no hay cohortes con datos de conversión en este alcance
    </div>
    <template v-else>
      <!-- Funnel chart -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle2 q-mb-sm">{{ chartTitle }}</div>
          <div style="height: 300px; position: relative">
            <Bar :data="funnelChartData" :options="funnelOptions" />
          </div>
        </q-card-section>
      </q-card>

      <!-- Median days per stage -->
      <q-card flat bordered>
        <q-card-section>
          <div class="text-subtitle2 q-mb-sm">Tiempo mediano por etapa</div>
          <div class="row q-col-gutter-md">
            <div v-for="card in medianCards" :key="card.label" class="col-12 col-sm-6">
              <div class="text-center q-pa-sm">
                <div class="text-h4 text-primary">{{ card.value }}</div>
                <div class="text-caption text-grey-7">{{ card.label }}</div>
              </div>
            </div>
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
import { COLORS } from 'src/utils/chart-colors';
import type { FunnelAnalytics, FunnelEntryOrigin } from 'src/types/analytics';

// -- Register Chart.js components ----------------------------------------

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// -- Props / emits -------------------------------------------------------

const props = defineProps<{
  data: FunnelAnalytics | null;
  loading: boolean;
  entryOrigin: FunnelEntryOrigin;
}>();

const emit = defineEmits<{
  'update:entryOrigin': [value: FunnelEntryOrigin];
}>();

// -- Origin segment toggle -----------------------------------------------

const originOptions: Array<{ label: string; value: FunnelEntryOrigin }> = [
  { label: 'Todos', value: 'all' },
  { label: 'Prueba directa', value: 'directo' },
  { label: 'Desde freemium', value: 'freemium' },
];

function onOriginChange(value: FunnelEntryOrigin): void {
  emit('update:entryOrigin', value);
}

const originHint = computed(() => {
  switch (props.entryOrigin) {
    case 'directo':
      return 'Pruebas creadas directamente (Meta ads / WhatsApp / walk-in): prueba → activo.';
    case 'freemium':
      return 'Freemium que pasaron a prueba: freemium → prueba → activo.';
    default:
      return 'Todas las altas del período: freemium → prueba → activo.';
  }
});

// The shape to render follows the segment the backend actually computed; while
// loading (data null) fall back to the selected toggle.
const segment = computed<FunnelEntryOrigin>(() => props.data?.entryOrigin ?? props.entryOrigin);

// -- Aggregate funnel across cohorts -------------------------------------

// We aggregate the per-cohort percentages weighted by cohort size into absolute
// member counts so the visual reads as a true embudo. For `all`, every cohort
// member starts at freemium; for `directo`/`freemium` the cohort is already the
// trials of that origin (toPruebaPct is 100), so the funnel is prueba → activo.
const stageCounts = computed(() => {
  if (!props.data) return { freemium: 0, prueba: 0, activo: 0 };
  let freemium = 0;
  let prueba = 0;
  let activo = 0;
  for (const c of props.data.cohorts) {
    freemium += c.size;
    prueba += Math.round((c.toPruebaPct / 100) * c.size);
    activo += Math.round((c.toActivoPct / 100) * c.size);
  }
  return { freemium, prueba, activo };
});

const chartTitle = computed(() =>
  segment.value === 'all'
    ? 'Funnel de conversión (freemium → prueba → activo)'
    : 'Funnel de conversión (prueba → activo)'
);

const funnelChartData = computed(() => {
  const s = stageCounts.value;
  if (segment.value === 'all') {
    return {
      labels: ['Freemium', 'Prueba', 'Activo'],
      datasets: [
        {
          label: 'Miembros',
          data: [s.freemium, s.prueba, s.activo],
          backgroundColor: [COLORS.primary, COLORS.secondary, COLORS.accent],
        },
      ],
    };
  }
  return {
    labels: ['Prueba', 'Activo'],
    datasets: [
      {
        label: 'Miembros',
        data: [s.prueba, s.activo],
        backgroundColor: [COLORS.secondary, COLORS.accent],
      },
    ],
  };
});

const funnelOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y' as const,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<'bar'>) => {
          // Total = the first stage of the rendered funnel (freemium for `all`,
          // prueba for the origin segments) — the conversion denominator.
          const total =
            (segment.value === 'all' ? stageCounts.value.freemium : stageCounts.value.prueba) || 1;
          const value = ctx.parsed.x ?? 0;
          const pct = Math.round((value / total) * 100);
          return `${value} miembros (${pct}% del total)`;
        },
      },
    },
  },
  scales: {
    x: { beginAtZero: true },
  },
}));

// -- Median days per stage (size-weighted average of cohort medians) -----

const medianCards = computed<Array<{ label: string; value: string }>>(() => {
  if (!props.data) return [];
  // Size-weighted average of per-cohort medians, skipping cohorts whose stage
  // median is null (no user reached that stage).
  const avg = (key: 'medianDaysFreemiumToPrueba' | 'medianDaysPruebaToActivo'): string => {
    let weightedSum = 0;
    let weight = 0;
    for (const c of props.data!.cohorts) {
      const m = c[key];
      if (m !== null) {
        weightedSum += m * c.size;
        weight += c.size;
      }
    }
    if (weight === 0) return '—';
    return `${Math.round(weightedSum / weight)} d`;
  };
  const cards: Array<{ label: string; value: string }> = [];
  // freemium → prueba is meaningless for trials created directly as prueba.
  if (segment.value !== 'directo') {
    cards.push({ label: 'Mediana freemium → prueba', value: avg('medianDaysFreemiumToPrueba') });
  }
  cards.push({ label: 'Mediana prueba → activo', value: avg('medianDaysPruebaToActivo') });
  return cards;
});
</script>
