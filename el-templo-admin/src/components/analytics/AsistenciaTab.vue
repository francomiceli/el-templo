<template>
  <div v-if="props.loading" class="q-pa-md">
    <q-skeleton type="rect" height="300px" class="q-mb-md" />
    <q-skeleton type="rect" height="250px" />
  </div>
  <div v-else-if="!props.data" class="text-center q-pa-xl text-grey-5 text-italic">
    No hay datos para el periodo seleccionado
  </div>
  <template v-else>
    <!-- Daily checkins line chart -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-md-8">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">Asistencias por dia</div>
            <div style="height: 300px; position: relative">
              <Line :data="dailyCheckinsData" :options="lineChartOptions" />
            </div>
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-md-4">
        <q-card flat bordered>
          <q-card-section class="text-center">
            <div class="text-caption text-grey-7">Tasa de no-show</div>
            <div
              class="text-h4"
              :class="props.data.noShowRate > 20 ? 'text-negative' : 'text-positive'"
            >
              {{ props.data.noShowRate.toFixed(1) }}%
            </div>
            <q-icon name="event_busy" size="32px" class="q-mt-sm text-grey-5" />
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Peak hours heatmap -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">Horas pico (ocupacion promedio)</div>
        <div class="overflow-auto">
          <table class="heatmap-table">
            <thead>
              <tr>
                <th class="heatmap-header">Hora</th>
                <th v-for="day in heatmapDays" :key="day.value" class="heatmap-header">
                  {{ day.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="hour in heatmapHours" :key="hour">
                <td class="heatmap-label">{{ hour }}:00</td>
                <td
                  v-for="day in heatmapDays"
                  :key="`${hour}-${day.value}`"
                  class="heatmap-cell"
                  :style="{ backgroundColor: heatmapCellColor(hour, day.value) }"
                >
                  {{ heatmapCellValue(hour, day.value) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <!-- Legend -->
        <div class="row items-center q-mt-sm q-gutter-sm text-caption text-grey-7">
          <span>Ocupacion:</span>
          <span class="heatmap-legend" style="background-color: #3b7249">&lt;50%</span>
          <span class="heatmap-legend" style="background-color: #7d6520">50-70%</span>
          <span class="heatmap-legend" style="background-color: #e08a3a">70-90%</span>
          <span class="heatmap-legend" style="background-color: #b34a4a">&gt;90%</span>
        </div>
      </q-card-section>
    </q-card>

    <!-- Slot occupancy table -->
    <q-card flat bordered>
      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">Ocupacion por clase</div>
        <q-table
          v-if="props.data.slotOccupancy.length > 0"
          :rows="props.data.slotOccupancy"
          :columns="slotOccupancyColumns"
          row-key="scheduleId"
          flat
          dense
          :pagination="{ rowsPerPage: 10 }"
        >
          <template #body-cell-dia="slotProps">
            <q-td :props="slotProps">{{ dayName(slotProps.row.dayOfWeek) }}</q-td>
          </template>
          <template #body-cell-ocupacion="slotProps">
            <q-td :props="slotProps">
              <div class="row items-center no-wrap">
                <q-linear-progress
                  :value="slotProps.row.averageOccupancy / 100"
                  :color="occupancyColor(slotProps.row.averageOccupancy)"
                  style="width: 80px"
                  class="q-mr-sm"
                  rounded
                />
                <span>{{ slotProps.row.averageOccupancy.toFixed(0) }}%</span>
              </div>
            </q-td>
          </template>
        </q-table>
        <div v-else class="text-center q-pa-md text-grey-5 text-italic">
          No hay datos de ocupacion por clase
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
  Filler,
} from 'chart.js';
import { Line } from 'vue-chartjs';
import { COLORS } from 'src/utils/chart-colors';
import type { AttendanceAnalytics } from 'src/types/analytics';

// -- Register Chart.js components ----------------------------------------

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

// -- Props ---------------------------------------------------------------

const props = defineProps<{
  data: AttendanceAnalytics | null;
  loading: boolean;
}>();

// -- Chart data ----------------------------------------------------------

const dailyCheckinsData = computed(() => {
  if (!props.data) return { labels: [], datasets: [] };
  const checkins = props.data.dailyCheckins;
  return {
    labels: checkins.map((c) => {
      const d = new Date(c.date + 'T12:00:00');
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
    }),
    datasets: [
      {
        label: 'Asistencias',
        data: checkins.map((c) => c.count),
        borderColor: COLORS.primary,
        backgroundColor: COLORS.primary + '33',
        fill: true,
        tension: 0.3,
      },
    ],
  };
});

const lineChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
  },
  scales: {
    y: { beginAtZero: true, ticks: { stepSize: 1 } },
  },
};

// -- Heatmap helpers -----------------------------------------------------

const heatmapDays = [
  { label: 'Lun', value: 1 },
  { label: 'Mar', value: 2 },
  { label: 'Mie', value: 3 },
  { label: 'Jue', value: 4 },
  { label: 'Vie', value: 5 },
  { label: 'Sab', value: 6 },
];

const heatmapHours = computed(() => {
  if (!props.data) return [];
  const hours = new Set(props.data.peakHoursHeatmap.map((c) => c.hour));
  if (hours.size === 0) {
    // Default range
    return Array.from({ length: 17 }, (_, i) => i + 6);
  }
  const sorted = [...hours].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return Array.from({ length: max - min + 1 }, (_, i) => i + min);
});

function heatmapLookup(hour: number, day: number): number | null {
  if (!props.data) return null;
  const cell = props.data.peakHoursHeatmap.find((c) => c.hour === hour && c.dayOfWeek === day);
  return cell ? cell.averageOccupancy : null;
}

function heatmapCellColor(hour: number, day: number): string {
  const occ = heatmapLookup(hour, day);
  if (occ === null) return '#f5f5f5';
  if (occ > 90) return '#b34a4a';
  if (occ > 70) return '#e08a3a';
  if (occ > 50) return '#7d6520';
  return '#3b7249';
}

function heatmapCellValue(hour: number, day: number): string {
  const occ = heatmapLookup(hour, day);
  if (occ === null) return '-';
  return `${occ.toFixed(0)}%`;
}

function dayName(dow: number): string {
  const names: Record<number, string> = {
    1: 'Lunes',
    2: 'Martes',
    3: 'Miercoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sabado',
    7: 'Domingo',
  };
  return names[dow] ?? String(dow);
}

function occupancyColor(value: number): string {
  if (value > 90) return 'negative';
  if (value > 70) return 'warning';
  if (value > 50) return 'accent';
  return 'positive';
}

// -- Slot occupancy columns ----------------------------------------------

const slotOccupancyColumns = [
  {
    name: 'actividad',
    label: 'Actividad',
    field: 'activityName',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'dia',
    label: 'Dia',
    field: 'dayOfWeek',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'horario',
    label: 'Horario',
    field: 'startTime',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'ocupacion',
    label: 'Ocupacion promedio',
    field: 'averageOccupancy',
    align: 'left' as const,
    sortable: true,
  },
];
</script>

<style scoped>
.heatmap-table {
  border-collapse: collapse;
  width: 100%;
  min-width: 400px;
}

.heatmap-header {
  text-align: center;
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 600;
  color: #666;
  border-bottom: 1px solid #ddd;
}

.heatmap-label {
  text-align: right;
  padding: 4px 8px;
  font-size: 12px;
  color: #666;
  white-space: nowrap;
}

.heatmap-cell {
  text-align: center;
  padding: 4px 6px;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.3);
  min-width: 50px;
}

.heatmap-legend {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: #fff;
}
</style>
