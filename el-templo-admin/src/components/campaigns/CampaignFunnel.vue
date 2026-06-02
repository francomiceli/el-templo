<template>
  <div>
    <!-- Loading skeleton -->
    <div v-if="props.loading" class="q-pa-md">
      <q-skeleton type="rect" height="320px" class="q-mb-md" />
      <q-skeleton type="rect" height="80px" />
    </div>

    <!-- Empty -->
    <div v-else-if="!props.data" class="text-center q-pa-xl text-grey-5 text-italic">
      Seleccioná una campaña para ver su funnel de conversión
    </div>

    <template v-else>
      <!-- "Abierto" approximate caveat (D-18) — Apple Mail Privacy -->
      <q-banner dense rounded class="bg-orange-2 text-orange-10 q-mb-md">
        <template #avatar>
          <q-icon name="info" color="orange-9" />
        </template>
        Aproximado — Apple Mail Privacy puede inflar las aperturas. El click es la métrica
        confiable.
      </q-banner>

      <!-- Funnel chart (6 stages, horizontal bars) -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle2 q-mb-sm">Funnel de conversión (enviado → convirtió)</div>
          <div style="height: 320px; position: relative">
            <Bar :data="funnelChartData" :options="funnelOptions" />
          </div>
        </q-card-section>
      </q-card>

      <!-- Per-stage counts -->
      <q-card flat bordered>
        <q-card-section>
          <div class="text-subtitle2 q-mb-sm">Detalle por etapa</div>
          <div class="row q-col-gutter-md">
            <div v-for="stage in stageCards" :key="stage.key" class="col-6 col-sm-4 col-md-2">
              <div class="text-center q-pa-sm">
                <div
                  class="text-h5 text-weight-bold"
                  :class="stage.highlight ? 'text-primary' : ''"
                >
                  {{ stage.value }}
                </div>
                <div class="text-caption text-grey-7">{{ stage.label }}</div>
                <q-icon
                  v-if="stage.key === 'abierto'"
                  name="help_outline"
                  size="14px"
                  class="q-ml-xs text-orange-9"
                >
                  <q-tooltip>
                    Aproximado — Apple Mail Privacy puede inflar las aperturas.
                  </q-tooltip>
                </q-icon>
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
import type { CampaignFunnel } from 'src/types/campaign';

// -- Register Chart.js components ----------------------------------------

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// -- Props ---------------------------------------------------------------

const props = defineProps<{
  data: CampaignFunnel | null;
  loading: boolean;
}>();

// -- Stage model ---------------------------------------------------------

interface StageDef {
  key: keyof Pick<
    CampaignFunnel,
    'enviado' | 'abierto' | 'click' | 'reservo' | 'asistio' | 'convirtio'
  >;
  label: string;
  highlight: boolean;
}

// Order: enviado → abierto → click → reservó → asistió → convirtió.
// First + convirtió rendered in $primary (terracotta) per UI-SPEC.
const STAGES: StageDef[] = [
  { key: 'enviado', label: 'Enviado', highlight: true },
  { key: 'abierto', label: 'Abierto', highlight: false },
  { key: 'click', label: 'Click', highlight: false },
  { key: 'reservo', label: 'Reservó', highlight: false },
  { key: 'asistio', label: 'Asistió', highlight: false },
  { key: 'convirtio', label: 'Convirtió', highlight: true },
];

const stageCards = computed(() =>
  STAGES.map((s) => ({
    key: s.key,
    label: s.label,
    highlight: s.highlight,
    value: props.data ? props.data[s.key] : 0,
  }))
);

const funnelChartData = computed(() => {
  const d = props.data;
  const values = STAGES.map((s) => (d ? d[s.key] : 0));
  return {
    labels: STAGES.map((s) => s.label),
    datasets: [
      {
        label: 'Personas',
        data: values,
        // First + last (convirtió) in primary terracotta; the rest in secondary.
        backgroundColor: STAGES.map((s) => (s.highlight ? COLORS.primary : COLORS.secondary)),
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
          const total = props.data?.enviado || 1;
          const value = ctx.parsed.x ?? 0;
          const pct = Math.round((value / total) * 100);
          return `${value} (${pct}% de enviados)`;
        },
      },
    },
  },
  scales: {
    x: { beginAtZero: true },
  },
}));
</script>
