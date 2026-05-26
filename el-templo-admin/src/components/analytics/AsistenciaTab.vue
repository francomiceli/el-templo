<template>
  <div v-if="props.loading" class="q-pa-md">
    <q-skeleton type="rect" height="300px" class="q-mb-md" />
    <q-skeleton type="rect" height="250px" />
  </div>
  <div v-else-if="!props.data" class="text-center q-pa-xl text-grey-5 text-italic">
    No hay datos para el periodo seleccionado
  </div>
  <template v-else>
    <!-- Representatividad warning: la sede filtrada casi no pasa lista (D-13) -->
    <q-banner v-if="lowAdoptionBranch" dense rounded class="bg-orange-2 text-orange-10 q-mb-md">
      <template #avatar>
        <q-icon name="warning" color="orange-9" />
      </template>
      Solo el {{ lowAdoptionBranch.ratioPct }}% de las reservas confirmadas de
      <b>{{ lowAdoptionBranch.branchName }}</b> registran check-in. Los miembros únicos y el
      engagement de esta sede <b>no son representativos</b> — la gente asiste pero no pasa lista.
    </q-banner>

    <!-- KPI: miembros únicos 7 / 14 / 30 (D-11) + no-show -->
    <div class="row q-col-gutter-md q-mb-md">
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered>
          <q-card-section class="text-center">
            <div class="text-caption text-grey-7">Miembros únicos (7 días)</div>
            <div class="text-h4 text-primary">{{ uniqueMembersDisplay.last7 }}</div>
            <q-icon name="groups" size="28px" class="q-mt-sm text-grey-5" />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered>
          <q-card-section class="text-center">
            <div class="text-caption text-grey-7">Miembros únicos (14 días)</div>
            <div class="text-h4 text-primary">{{ uniqueMembersDisplay.last14 }}</div>
            <q-icon name="groups" size="28px" class="q-mt-sm text-grey-5" />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered>
          <q-card-section class="text-center">
            <div class="text-caption text-grey-7">Miembros únicos (30 días)</div>
            <div class="text-h4 text-primary">{{ uniqueMembersDisplay.last30 }}</div>
            <q-icon name="groups" size="28px" class="q-mt-sm text-grey-5" />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered>
          <q-card-section class="text-center">
            <div class="text-caption text-grey-7">Tasa de no-show</div>
            <div
              class="text-h4"
              :class="props.data.noShowRate > 20 ? 'text-negative' : 'text-positive'"
            >
              {{ props.data.noShowRate.toFixed(1) }}%
            </div>
            <q-icon name="event_busy" size="28px" class="q-mt-sm text-grey-5" />
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Conteo de activos por segmento de engagement (D-12) -->
    <q-card v-if="props.engagement" flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">Activos por segmento de engagement</div>
        <div class="row q-col-gutter-sm">
          <div v-for="seg in segmentCountCards" :key="seg.key" class="col-6 col-sm-4 col-md-2">
            <q-card flat bordered>
              <q-card-section class="text-center q-pa-sm">
                <q-chip :color="seg.color" text-color="white" dense size="sm" :label="seg.label" />
                <div class="text-h6 q-mt-xs">{{ seg.count }}</div>
              </q-card-section>
            </q-card>
          </div>
        </div>

        <!-- Referencia: qué significa cada segmento -->
        <q-list dense class="q-mt-md">
          <div class="text-caption text-grey-7 q-mb-xs">¿Qué significa cada segmento?</div>
          <q-item v-for="seg in segmentCountCards" :key="`ref-${seg.key}`" dense class="q-px-none">
            <q-item-section avatar style="min-width: 130px">
              <q-chip :color="seg.color" text-color="white" dense size="sm" :label="seg.label" />
            </q-item-section>
            <q-item-section class="text-caption text-grey-8">{{ seg.description }}</q-item-section>
          </q-item>
        </q-list>
      </q-card-section>
    </q-card>

    <!-- Worklist nominal en_riesgo / ghost con WhatsApp (D-12) -->
    <q-card v-if="props.engagement" flat bordered>
      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">
          En riesgo / Ghost — contactar antes de que se vayan
        </div>
        <q-table
          v-if="props.engagement.nominalList.length > 0"
          :rows="props.engagement.nominalList"
          :columns="engagementColumns"
          row-key="userId"
          flat
          dense
          :pagination="{ rowsPerPage: 10 }"
        >
          <template #body-cell-nombre="slotProps">
            <q-td :props="slotProps">{{ formatMemberName(slotProps.row) }}</q-td>
          </template>
          <template #body-cell-segmento="slotProps">
            <q-td :props="slotProps">
              <q-chip
                :color="segmentColor(slotProps.row.segment)"
                text-color="white"
                dense
                size="sm"
                :label="segmentLabel(slotProps.row.segment)"
              />
            </q-td>
          </template>
          <template #body-cell-acciones="slotProps">
            <q-td :props="slotProps">
              <q-btn
                flat
                dense
                size="sm"
                label="WhatsApp"
                color="positive"
                icon="chat"
                :disable="!slotProps.row.phone"
                @click="contactMember(slotProps.row)"
              />
            </q-td>
          </template>
        </q-table>
        <div v-else class="text-center q-pa-md text-grey-5 text-italic">
          No hay miembros en riesgo o ghost en este alcance
        </div>
      </q-card-section>
    </q-card>

    <!-- Daily checkins line chart -->
    <div class="row q-col-gutter-md q-mb-md q-mt-none">
      <div class="col-12">
        <q-card flat bordered>
          <q-card-section>
            <div class="text-subtitle2 q-mb-sm">Asistencias por dia</div>
            <div style="height: 300px; position: relative">
              <Line :data="dailyCheckinsData" :options="lineChartOptions" />
            </div>
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
import {
  SEGMENT_LABELS,
  SEGMENT_COLORS,
  SEGMENT_DESCRIPTIONS,
  type MemberSegment,
} from 'src/types/member';
import type {
  AttendanceAnalytics,
  UniqueMembersMetric,
  EngagementAnalytics,
  EngagementMember,
  CheckInAdoptionRow,
} from 'src/types/analytics';

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
  uniqueMembers?: UniqueMembersMetric | null;
  engagement?: EngagementAnalytics | null;
  checkInAdoption?: CheckInAdoptionRow[] | null;
  /** Currently filtered branch (undefined = all branches in scope). */
  branchId?: number | undefined;
}>();

// -- Unique members (D-11) -----------------------------------------------

const uniqueMembersDisplay = computed<UniqueMembersMetric>(
  () => props.uniqueMembers ?? { last7: 0, last14: 0, last30: 0 }
);

// -- Low check-in adoption warning (D-13) --------------------------------
// Only when a single branch is filtered AND its check-in ratio is < 50%.

const ADOPTION_WARNING_THRESHOLD = 0.5;

const lowAdoptionBranch = computed<{ branchName: string; ratioPct: number } | null>(() => {
  if (props.branchId === undefined || !props.checkInAdoption) return null;
  const row = props.checkInAdoption.find((r) => r.branchId === props.branchId);
  if (!row || row.confirmados === 0) return null;
  if (row.ratio >= ADOPTION_WARNING_THRESHOLD) return null;
  return { branchName: row.branchName, ratioPct: Math.round(row.ratio * 100) };
});

// -- Segment counts (D-12) -----------------------------------------------

const segmentCountCards = computed(() => {
  const counts = props.engagement?.counts;
  if (!counts) return [];
  const segmentKeys: MemberSegment[] = [
    'nuevo',
    'espartano',
    'intermitente',
    'en_riesgo',
    'digital_warrior',
    'ghost',
  ];
  // "Sin segmento" (active members with NULL segment) is intentionally hidden —
  // it's a data-staleness bucket, not an actionable engagement category.
  return segmentKeys.map((key) => ({
    key,
    label: SEGMENT_LABELS[key],
    color: SEGMENT_COLORS[key],
    count: counts[key],
    description: SEGMENT_DESCRIPTIONS[key],
  }));
});

// -- Engagement worklist (D-12) ------------------------------------------

const engagementColumns = [
  { name: 'nombre', label: 'Nombre', field: 'firstName', align: 'left' as const },
  { name: 'plan', label: 'Plan', field: 'planName', align: 'left' as const },
  { name: 'segmento', label: 'Segmento', field: 'segment', align: 'left' as const, sortable: true },
  { name: 'acciones', label: 'Acciones', field: 'userId', align: 'right' as const },
];

function formatMemberName(member: EngagementMember): string {
  const parts = [member.firstName, member.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : `Miembro #${member.userId}`;
}

function segmentLabel(segment: string): string {
  return SEGMENT_LABELS[segment as MemberSegment] ?? segment;
}

function segmentColor(segment: string): string {
  return SEGMENT_COLORS[segment as MemberSegment] ?? 'grey';
}

function contactMember(member: EngagementMember): void {
  if (!member.phone) return;
  const cleaned = member.phone.replace(/\D/g, '');
  window.open(`https://wa.me/${cleaned}`, '_blank');
}

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
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sábado',
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
