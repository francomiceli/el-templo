<template>
  <div v-if="props.loading" class="q-pa-md">
    <q-skeleton type="rect" height="120px" class="q-mb-md" />
    <q-skeleton type="rect" height="300px" class="q-mb-md" />
    <q-skeleton type="rect" height="200px" />
  </div>

  <div
    v-else-if="!props.data || props.data.overall.count === 0"
    class="text-center q-pa-xl text-grey-6"
  >
    <q-icon name="star_border" size="48px" color="grey-5" class="q-mb-md" />
    <div class="text-subtitle1 text-weight-medium">Todavía no hay puntuaciones de clase</div>
    <div class="text-body2 q-mt-sm" style="max-width: 460px; margin: 0 auto">
      Cuando los miembros puntúen sus clases presenciales en el período seleccionado, vas a ver acá
      la tendencia y el desglose por sucursal y turno.
    </div>
  </div>

  <template v-else>
    <!-- KPI: promedio global + total -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-6 col-md-4">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-caption text-grey-7 q-mb-xs">Promedio de clase</div>
            <div class="row items-center no-wrap q-gutter-sm">
              <q-rating
                :model-value="props.data.overall.avgStars ?? 0"
                readonly
                size="1.5em"
                color="primary"
                icon="star"
                icon-half="star_half"
              />
              <span class="text-h5">{{ (props.data.overall.avgStars ?? 0).toFixed(1) }}</span>
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-4">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-caption text-grey-7 q-mb-xs">Puntuaciones</div>
            <div class="text-h5">{{ props.data.overall.count }}</div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Tendencia diaria -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">Tendencia (promedio por día)</div>
        <div v-if="props.data.trend.length > 0" style="height: 300px; position: relative">
          <Line :data="trendChartData" :options="lineChartOptions" />
        </div>
        <div v-else class="text-grey-6 text-italic q-pa-md">
          No hay suficientes datos para trazar una tendencia.
        </div>
      </q-card-section>
    </q-card>

    <div class="row q-col-gutter-md">
      <!-- Por sucursal -->
      <div class="col-12 col-md-7">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">Por sucursal</div>
            <q-table
              :rows="props.data.byBranch"
              :columns="branchColumns"
              row-key="branchId"
              flat
              dense
              :rows-per-page-options="[0]"
              hide-pagination
              no-data-label="Sin datos"
            >
              <template #body-cell-avgStars="cellProps">
                <q-td :props="cellProps">
                  <div class="row items-center no-wrap q-gutter-xs">
                    <q-rating
                      :model-value="cellProps.row.avgStars"
                      readonly
                      size="1.1em"
                      color="primary"
                      icon="star"
                      icon-half="star_half"
                    />
                    <span class="text-weight-medium">{{ cellProps.row.avgStars.toFixed(1) }}</span>
                  </div>
                </q-td>
              </template>
            </q-table>
          </q-card-section>
        </q-card>
      </div>

      <!-- Por turno -->
      <div class="col-12 col-md-5">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">Por turno</div>
            <q-list separator>
              <q-item v-for="row in turnoRows" :key="row.turno">
                <q-item-section>
                  <q-item-label class="text-weight-medium">{{
                    turnoLabel(row.turno)
                  }}</q-item-label>
                  <q-item-label caption>{{ row.count }} puntuaciones</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <div class="row items-center no-wrap q-gutter-xs">
                    <q-rating
                      :model-value="row.avgStars"
                      readonly
                      size="1.1em"
                      color="primary"
                      icon="star"
                      icon-half="star_half"
                    />
                    <span class="text-weight-medium">{{ row.avgStars.toFixed(1) }}</span>
                  </div>
                </q-item-section>
              </q-item>
              <q-item v-if="turnoRows.length === 0">
                <q-item-section class="text-grey-6 text-italic"
                  >Sin datos por turno.</q-item-section
                >
              </q-item>
            </q-list>
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
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'vue-chartjs';
import { COLORS } from 'src/utils/chart-colors';
import type { ClassRatingsAnalytics } from 'src/types/analytics';

ChartJS.register(
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const props = defineProps<{
  data: ClassRatingsAnalytics | null;
  loading: boolean;
}>();

const branchColumns = [
  {
    name: 'branchName',
    label: 'Sucursal',
    field: 'branchName',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'avgStars',
    label: 'Promedio',
    field: 'avgStars',
    align: 'left' as const,
    sortable: true,
  },
  { name: 'count', label: 'Puntuaciones', field: 'count', align: 'right' as const, sortable: true },
];

// Mostrar siempre mañana antes que tarde.
const turnoRows = computed(() => {
  const rows = props.data?.byTurno ?? [];
  return [...rows].sort(
    (a, b) => (a.turno === 'manana' ? -1 : 1) - (b.turno === 'manana' ? -1 : 1)
  );
});

function turnoLabel(turno: 'manana' | 'tarde'): string {
  return turno === 'manana' ? 'Mañana' : 'Tarde';
}

const trendChartData = computed(() => ({
  labels: props.data?.trend.map((p) => p.period) ?? [],
  datasets: [
    {
      label: 'Promedio de clase',
      data: props.data?.trend.map((p) => p.avgStars) ?? [],
      borderColor: COLORS.primary,
      backgroundColor: COLORS.primary,
      tension: 0.3,
      fill: false,
    },
  ],
}));

const lineChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: { parsed: { y: number } }) => `${ctx.parsed.y.toFixed(1)} ★`,
      },
    },
  },
  scales: {
    y: { beginAtZero: true, min: 0, max: 5, ticks: { stepSize: 1 } },
  },
};
</script>
