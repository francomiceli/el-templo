<template>
  <q-page class="q-pa-md">
    <!-- ================================================================== -->
    <!-- Header -->
    <!-- ================================================================== -->
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-h5">Analiticas</div>
        <div class="text-caption text-grey-7">Metricas y reportes de operacion</div>
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- Global Filters: Branch + Date Range -->
    <!-- ================================================================== -->
    <div class="row items-center q-gutter-sm q-mb-md">
      <div class="col-12 col-sm-3">
        <q-select
          v-model="selectedBranchId"
          :options="branchOptions"
          label="Sucursal"
          dense
          outlined
          emit-value
          map-options
          :loading="loadingBranches"
          @update:model-value="onFilterChange"
        />
      </div>

      <div class="col-auto">
        <q-btn-dropdown outline :label="dateRangeLabel" icon="date_range" dense>
          <q-list dense>
            <q-item
              v-for="preset in datePresets"
              :key="preset.label"
              clickable
              v-close-popup
              @click="applyPreset(preset)"
            >
              <q-item-section>{{ preset.label }}</q-item-section>
            </q-item>
            <q-separator />
            <q-item clickable @click="showCustomRange = !showCustomRange">
              <q-item-section>Personalizado</q-item-section>
              <q-item-section side>
                <q-icon :name="showCustomRange ? 'expand_less' : 'expand_more'" />
              </q-item-section>
            </q-item>
            <template v-if="showCustomRange">
              <q-item>
                <q-item-section>
                  <q-input v-model="customFrom" type="date" label="Desde" dense outlined />
                </q-item-section>
              </q-item>
              <q-item>
                <q-item-section>
                  <q-input v-model="customTo" type="date" label="Hasta" dense outlined />
                </q-item-section>
              </q-item>
              <q-item>
                <q-item-section>
                  <q-btn
                    label="Aplicar"
                    color="primary"
                    dense
                    flat
                    v-close-popup
                    @click="applyCustomRange"
                  />
                </q-item-section>
              </q-item>
            </template>
          </q-list>
        </q-btn-dropdown>
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- KPI Cards -->
    <!-- ================================================================== -->
    <div v-if="loadingKpis" class="row q-col-gutter-md q-mb-md">
      <div v-for="n in 4" :key="n" class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered>
          <q-card-section>
            <q-skeleton type="text" width="60%" />
            <q-skeleton type="text" width="40%" class="q-mt-sm" />
          </q-card-section>
        </q-card>
      </div>
    </div>

    <div v-else class="row q-col-gutter-md q-mb-md">
      <div v-for="kpi in kpiCards" :key="kpi.key" class="col-12 col-sm-6 col-md-3">
        <q-card flat bordered>
          <q-card-section>
            <div class="row items-center no-wrap q-mb-xs">
              <q-icon :name="kpi.icon" size="24px" class="q-mr-sm" color="primary" />
              <span class="text-caption text-grey-7">{{ kpi.label }}</span>
            </div>
            <div class="text-h5 q-mb-xs">{{ kpi.formattedValue }}</div>
            <div class="row items-center no-wrap">
              <q-icon
                :name="trendIcon(kpi.trend.direction)"
                :color="trendColor(kpi.key, kpi.trend.direction)"
                size="18px"
              />
              <span
                class="text-caption q-ml-xs"
                :class="'text-' + trendColor(kpi.key, kpi.trend.direction)"
              >
                {{ kpi.trend.percentage.toFixed(1) }}%
              </span>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- Tabs -->
    <!-- ================================================================== -->
    <q-tabs
      v-model="activeTab"
      dense
      align="left"
      class="q-mb-md"
      active-color="primary"
      indicator-color="primary"
    >
      <q-tab name="miembros" label="Miembros" icon="people" />
      <q-tab name="asistencia" label="Asistencia" icon="how_to_reg" />
      <q-tab name="finanzas" label="Finanzas" icon="payments" />
    </q-tabs>

    <q-tab-panels v-model="activeTab" animated>
      <!-- ================================================================ -->
      <!-- Miembros Tab -->
      <!-- ================================================================ -->
      <q-tab-panel name="miembros">
        <div v-if="loadingMembers" class="q-pa-md">
          <q-skeleton type="rect" height="300px" class="q-mb-md" />
          <q-skeleton type="rect" height="200px" />
        </div>
        <div v-else-if="!memberData" class="text-center q-pa-xl text-grey-5 text-italic">
          No hay datos para el periodo seleccionado
        </div>
        <template v-else>
          <!-- Stat cards: Nuevos + Bajas + Retencion -->
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-sm-4">
              <q-card flat bordered>
                <q-card-section class="text-center">
                  <div class="text-caption text-grey-7">Nuevos</div>
                  <div class="text-h4 text-positive">{{ memberData.newMembers }}</div>
                </q-card-section>
              </q-card>
            </div>
            <div class="col-12 col-sm-4">
              <q-card flat bordered>
                <q-card-section class="text-center">
                  <div class="text-caption text-grey-7">Bajas</div>
                  <div class="text-h4 text-negative">{{ memberData.churnedMembers }}</div>
                </q-card-section>
              </q-card>
            </div>
            <div class="col-12 col-sm-4">
              <q-card flat bordered>
                <q-card-section class="text-center">
                  <div class="text-caption text-grey-7">Tasa de retencion</div>
                  <div
                    class="text-h4"
                    :class="
                      memberData.retentionRate >= 80
                        ? 'text-positive'
                        : memberData.retentionRate >= 50
                          ? 'text-warning'
                          : 'text-negative'
                    "
                  >
                    {{ memberData.retentionRate.toFixed(1) }}%
                  </div>
                </q-card-section>
              </q-card>
            </div>
          </div>

          <!-- Charts row: New vs Churned bar + Plan distribution donut -->
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-md-7">
              <q-card flat bordered>
                <q-card-section>
                  <div class="text-subtitle2 q-mb-sm">Nuevos vs Bajas</div>
                  <div style="height: 300px; position: relative">
                    <Bar :data="newVsChurnedData" :options="barChartOptions" />
                  </div>
                </q-card-section>
              </q-card>
            </div>
            <div class="col-12 col-md-5">
              <q-card flat bordered>
                <q-card-section>
                  <div class="text-subtitle2 q-mb-sm">Distribucion por plan</div>
                  <div style="height: 300px; position: relative">
                    <Doughnut :data="planDistributionData" :options="doughnutChartOptions" />
                  </div>
                </q-card-section>
              </q-card>
            </div>
          </div>

          <!-- Attention list -->
          <q-card flat bordered>
            <q-card-section>
              <div class="text-subtitle2 q-mb-sm">Miembros que requieren atencion</div>
              <q-table
                v-if="memberData.attentionList.length > 0"
                :rows="memberData.attentionList"
                :columns="attentionColumns"
                row-key="userId"
                flat
                dense
                :pagination="{ rowsPerPage: 10 }"
              >
                <template #body-cell-nombre="props">
                  <q-td :props="props">
                    <a class="text-primary cursor-pointer" @click="goToMember(props.row.userId)">
                      {{ formatMemberName(props.row) }}
                    </a>
                  </q-td>
                </template>
                <template #body-cell-estado="props">
                  <q-td :props="props">
                    <q-chip
                      :color="props.row.type === 'expiring' ? 'warning' : 'negative'"
                      text-color="white"
                      dense
                      size="sm"
                    >
                      {{
                        props.row.type === 'expiring'
                          ? `Vence en ${props.row.daysUntilExpiry} dias`
                          : `${props.row.daysOverdue} dias de mora`
                      }}
                    </q-chip>
                  </q-td>
                </template>
                <template #body-cell-acciones="props">
                  <q-td :props="props">
                    <q-btn
                      flat
                      dense
                      size="sm"
                      label="Extender"
                      color="primary"
                      @click="openExtendDialog(props.row)"
                    />
                    <q-btn
                      flat
                      dense
                      size="sm"
                      label="Contactar"
                      color="positive"
                      icon="chat"
                      :disable="!props.row.phone"
                      @click="contactMember(props.row)"
                    />
                  </q-td>
                </template>
              </q-table>
              <div v-else class="text-center q-pa-md text-grey-5 text-italic">
                No hay miembros que requieran atencion
              </div>
            </q-card-section>
          </q-card>
        </template>
      </q-tab-panel>

      <!-- ================================================================ -->
      <!-- Asistencia Tab -->
      <!-- ================================================================ -->
      <q-tab-panel name="asistencia">
        <div v-if="loadingAttendance" class="q-pa-md">
          <q-skeleton type="rect" height="300px" class="q-mb-md" />
          <q-skeleton type="rect" height="250px" />
        </div>
        <div v-else-if="!attendanceData" class="text-center q-pa-xl text-grey-5 text-italic">
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
                    :class="attendanceData.noShowRate > 20 ? 'text-negative' : 'text-positive'"
                  >
                    {{ attendanceData.noShowRate.toFixed(1) }}%
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
                <span class="heatmap-legend" style="background-color: #5a9a6b">&lt;50%</span>
                <span class="heatmap-legend" style="background-color: #d4a843">50-70%</span>
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
                v-if="attendanceData.slotOccupancy.length > 0"
                :rows="attendanceData.slotOccupancy"
                :columns="slotOccupancyColumns"
                row-key="scheduleId"
                flat
                dense
                :pagination="{ rowsPerPage: 10 }"
              >
                <template #body-cell-dia="props">
                  <q-td :props="props">{{ dayName(props.row.dayOfWeek) }}</q-td>
                </template>
                <template #body-cell-ocupacion="props">
                  <q-td :props="props">
                    <div class="row items-center no-wrap">
                      <q-linear-progress
                        :value="props.row.averageOccupancy / 100"
                        :color="occupancyColor(props.row.averageOccupancy)"
                        style="width: 80px"
                        class="q-mr-sm"
                        rounded
                      />
                      <span>{{ props.row.averageOccupancy.toFixed(0) }}%</span>
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
      </q-tab-panel>

      <!-- ================================================================ -->
      <!-- Finanzas Tab -->
      <!-- ================================================================ -->
      <q-tab-panel name="finanzas">
        <div v-if="loadingFinancial" class="q-pa-md">
          <q-skeleton type="rect" height="300px" class="q-mb-md" />
          <q-skeleton type="rect" height="200px" />
        </div>
        <div v-else-if="!financialData" class="text-center q-pa-xl text-grey-5 text-italic">
          No hay datos para el periodo seleccionado
        </div>
        <template v-else>
          <!-- Revenue trend chart -->
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-md-8">
              <q-card flat bordered>
                <q-card-section>
                  <div class="text-subtitle2 q-mb-sm">Ingresos por mes</div>
                  <div style="height: 300px; position: relative">
                    <Bar :data="revenueTrendData" :options="revenueChartOptions" />
                  </div>
                </q-card-section>
              </q-card>
            </div>
            <div class="col-12 col-md-4">
              <q-card flat bordered class="q-mb-md">
                <q-card-section>
                  <div class="text-subtitle2 q-mb-sm">Ingresos por metodo</div>
                  <div class="column q-gutter-sm">
                    <div class="row items-center justify-between">
                      <span class="text-caption">Efectivo</span>
                      <span class="text-weight-bold">{{
                        formatCurrency(financialData.revenueByMethod.cash)
                      }}</span>
                    </div>
                    <div class="row items-center justify-between">
                      <span class="text-caption">Transferencia</span>
                      <span class="text-weight-bold">{{
                        formatCurrency(financialData.revenueByMethod.transfer)
                      }}</span>
                    </div>
                    <div class="row items-center justify-between">
                      <span class="text-caption">Tarjeta</span>
                      <span class="text-weight-bold">{{
                        formatCurrency(financialData.revenueByMethod.card)
                      }}</span>
                    </div>
                  </div>
                </q-card-section>
              </q-card>
            </div>
          </div>

          <!-- Revenue by branch -->
          <div v-if="financialData.revenueByBranch.length > 1" class="q-mb-md">
            <q-card flat bordered>
              <q-card-section>
                <div class="text-subtitle2 q-mb-sm">Ingresos por sede</div>
                <div style="height: 300px; position: relative">
                  <Bar :data="revenueByBranchData" :options="branchChartOptions" />
                </div>
              </q-card-section>
            </q-card>
          </div>

          <!-- Bottom stat cards -->
          <div class="row q-col-gutter-md">
            <div class="col-12 col-sm-6">
              <q-card flat bordered>
                <q-card-section class="text-center">
                  <div class="text-caption text-grey-7">Deuda pendiente</div>
                  <div class="text-h4 text-negative">
                    {{ formatCurrency(financialData.totalOutstanding) }}
                  </div>
                </q-card-section>
              </q-card>
            </div>
            <div class="col-12 col-sm-6">
              <q-card flat bordered>
                <q-card-section class="text-center">
                  <div class="text-caption text-grey-7">Tasa de cobro</div>
                  <div
                    class="text-h4"
                    :class="
                      financialData.collectionRate >= 80
                        ? 'text-positive'
                        : financialData.collectionRate >= 50
                          ? 'text-warning'
                          : 'text-negative'
                    "
                  >
                    {{ financialData.collectionRate.toFixed(1) }}%
                  </div>
                </q-card-section>
              </q-card>
            </div>
          </div>
        </template>
      </q-tab-panel>
    </q-tab-panels>

    <!-- ================================================================== -->
    <!-- Extend Dialog -->
    <!-- ================================================================== -->
    <q-dialog v-model="showExtendDialog">
      <q-card style="min-width: 350px">
        <q-card-section>
          <div class="text-h6">Extender suscripcion</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <div class="text-body2 q-mb-md">
            {{ extendMemberName }}
          </div>
          <q-input
            v-model.number="extendDays"
            type="number"
            label="Dias a extender"
            outlined
            dense
            :rules="[(v: number) => v > 0 || 'Debe ser mayor a 0']"
          />
        </q-card-section>
        <q-card-section class="text-caption text-grey-6 q-pt-none">
          Proximamente: esta funcionalidad estara disponible pronto.
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" v-close-popup />
          <q-btn flat label="Extender" color="primary" v-close-popup disabled />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type TooltipItem,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'vue-chartjs';
import { useAnalyticsApi } from 'src/composables/useAnalyticsApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import { createLogger } from 'src/utils/logger';
import type {
  KpiStats,
  MemberAnalytics,
  AttendanceAnalytics,
  FinancialAnalytics,
  AnalyticsFilters,
  AttentionMember,
  TrendInfo,
} from 'src/types/analytics';
import type { BranchOption } from 'src/types/member';

// -- Register Chart.js components ----------------------------------------

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// -- Setup ---------------------------------------------------------------

const log = createLogger('AnaliticasPage');
const router = useRouter();
const analyticsApi = useAnalyticsApi();
const membersApi = useMembersApi();

// -- Brand colors for charts ---------------------------------------------

const COLORS = {
  primary: '#c07a56',
  secondary: '#b89b5e',
  positive: '#5a9a6b',
  negative: '#b34a4a',
  warning: '#d4a843',
  accent: '#3d3732',
  info: '#8a8472',
};

// -- Branch filter -------------------------------------------------------

const selectedBranchId = ref<number | undefined>(undefined);
const branchOptions = ref<Array<{ label: string; value: number | undefined }>>([
  { label: 'Todas las sedes', value: undefined },
]);
const loadingBranches = ref(false);

async function fetchBranches() {
  loadingBranches.value = true;
  try {
    const branches = await membersApi.getBranches();
    branchOptions.value = [
      { label: 'Todas las sedes', value: undefined },
      ...branches.map((b: BranchOption) => ({ label: b.name, value: b.id })),
    ];
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching branches', { error: message });
  } finally {
    loadingBranches.value = false;
  }
}

// -- Date range filter ---------------------------------------------------

interface DatePreset {
  label: string;
  getRange: () => { dateFrom: string; dateTo: string };
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getMonthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

const now = new Date();

const datePresets: DatePreset[] = [
  {
    label: 'Este mes',
    getRange: () => ({
      dateFrom: formatDate(getMonthStart(new Date())),
      dateTo: formatDate(getMonthEnd(new Date())),
    }),
  },
  {
    label: 'Mes anterior',
    getRange: () => {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      return {
        dateFrom: formatDate(getMonthStart(d)),
        dateTo: formatDate(getMonthEnd(d)),
      };
    },
  },
  {
    label: 'Ultimos 3 meses',
    getRange: () => {
      const d = new Date();
      d.setMonth(d.getMonth() - 2);
      return {
        dateFrom: formatDate(getMonthStart(d)),
        dateTo: formatDate(getMonthEnd(new Date())),
      };
    },
  },
  {
    label: 'Este ano',
    getRange: () => ({
      dateFrom: formatDate(new Date(new Date().getFullYear(), 0, 1)),
      dateTo: formatDate(getMonthEnd(new Date())),
    }),
  },
];

const dateFrom = ref(formatDate(getMonthStart(now)));
const dateTo = ref(formatDate(getMonthEnd(now)));
const activePresetLabel = ref('Este mes');
const showCustomRange = ref(false);
const customFrom = ref(dateFrom.value);
const customTo = ref(dateTo.value);

const dateRangeLabel = computed(() => {
  if (activePresetLabel.value) return activePresetLabel.value;
  return `${dateFrom.value} - ${dateTo.value}`;
});

function applyPreset(preset: DatePreset) {
  const range = preset.getRange();
  dateFrom.value = range.dateFrom;
  dateTo.value = range.dateTo;
  activePresetLabel.value = preset.label;
  showCustomRange.value = false;
  onFilterChange();
}

function applyCustomRange() {
  dateFrom.value = customFrom.value;
  dateTo.value = customTo.value;
  activePresetLabel.value = '';
  onFilterChange();
}

// -- Active filters computed ---------------------------------------------

const currentFilters = computed<AnalyticsFilters>(() => ({
  branchId: selectedBranchId.value,
  dateFrom: dateFrom.value,
  dateTo: dateTo.value,
}));

// -- Tab state -----------------------------------------------------------

const activeTab = ref('miembros');

// -- Data refs -----------------------------------------------------------

const kpis = ref<KpiStats | null>(null);
const memberData = ref<MemberAnalytics | null>(null);
const attendanceData = ref<AttendanceAnalytics | null>(null);
const financialData = ref<FinancialAnalytics | null>(null);

const loadingKpis = ref(false);
const loadingMembers = ref(false);
const loadingAttendance = ref(false);
const loadingFinancial = ref(false);

// -- KPI cards -----------------------------------------------------------

interface KpiCard {
  key: 'activeMembers' | 'monthlyRevenue' | 'dailyAttendanceAvg' | 'morososCount';
  label: string;
  icon: string;
  formattedValue: string;
  trend: TrendInfo;
}

const arsFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

function formatCurrency(value: number): string {
  return arsFormatter.format(value);
}

const kpiCards = computed<KpiCard[]>(() => {
  if (!kpis.value) return [];
  const k = kpis.value;
  return [
    {
      key: 'activeMembers',
      label: 'Activos',
      icon: 'people',
      formattedValue: String(k.activeMembers.value),
      trend: k.activeMembers.trend,
    },
    {
      key: 'monthlyRevenue',
      label: 'Ingresos',
      icon: 'payments',
      formattedValue: formatCurrency(k.monthlyRevenue.value),
      trend: k.monthlyRevenue.trend,
    },
    {
      key: 'dailyAttendanceAvg',
      label: 'Asistencia/dia',
      icon: 'how_to_reg',
      formattedValue: k.dailyAttendanceAvg.value.toFixed(1),
      trend: k.dailyAttendanceAvg.trend,
    },
    {
      key: 'morososCount',
      label: 'Morosos',
      icon: 'warning',
      formattedValue: String(k.morososCount.value),
      trend: k.morososCount.trend,
    },
  ];
});

function trendIcon(direction: TrendInfo['direction']): string {
  if (direction === 'up') return 'trending_up';
  if (direction === 'down') return 'trending_down';
  return 'trending_flat';
}

function trendColor(key: KpiCard['key'], direction: TrendInfo['direction']): string {
  if (direction === 'flat') return 'grey-6';
  // Morosos: up is bad, down is good (inverted)
  if (key === 'morososCount') {
    return direction === 'up' ? 'negative' : 'positive';
  }
  // All others: up is good, down is bad
  return direction === 'up' ? 'positive' : 'negative';
}

// -- Chart data: Members tab ---------------------------------------------

const chartColors = [
  COLORS.primary,
  COLORS.secondary,
  COLORS.positive,
  COLORS.negative,
  COLORS.warning,
  COLORS.accent,
  COLORS.info,
  '#7b68a8',
  '#4a90c2',
  '#c2694a',
];

const newVsChurnedData = computed(() => ({
  labels: memberData.value ? ['Periodo seleccionado'] : [],
  datasets: memberData.value
    ? [
        {
          label: 'Nuevos',
          data: [memberData.value.newMembers],
          backgroundColor: COLORS.positive,
        },
        {
          label: 'Bajas',
          data: [memberData.value.churnedMembers],
          backgroundColor: COLORS.negative,
        },
      ]
    : [],
}));

const planDistributionData = computed(() => {
  if (!memberData.value) return { labels: [], datasets: [] };
  const dist = memberData.value.planDistribution;
  return {
    labels: dist.map((d) => d.planName),
    datasets: [
      {
        data: dist.map((d) => d.count),
        backgroundColor: dist.map((_, i) => chartColors[i % chartColors.length]),
      },
    ],
  };
});

const barChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' as const },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { stepSize: 1 },
    },
  },
};

const doughnutChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'right' as const, labels: { boxWidth: 12 } },
  },
};

// -- Chart data: Attendance tab ------------------------------------------

const dailyCheckinsData = computed(() => {
  if (!attendanceData.value) return { labels: [], datasets: [] };
  const checkins = attendanceData.value.dailyCheckins;
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
  if (!attendanceData.value) return [];
  const hours = new Set(attendanceData.value.peakHoursHeatmap.map((c) => c.hour));
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
  if (!attendanceData.value) return null;
  const cell = attendanceData.value.peakHoursHeatmap.find(
    (c) => c.hour === hour && c.dayOfWeek === day
  );
  return cell ? cell.averageOccupancy : null;
}

function heatmapCellColor(hour: number, day: number): string {
  const occ = heatmapLookup(hour, day);
  if (occ === null) return '#f5f5f5';
  if (occ > 90) return '#b34a4a';
  if (occ > 70) return '#e08a3a';
  if (occ > 50) return '#d4a843';
  return '#5a9a6b';
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

// -- Chart data: Financial tab -------------------------------------------

const revenueChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<'bar'>) => formatCurrency(ctx.parsed.y ?? 0),
      },
    },
  },
  scales: {
    y: { beginAtZero: true },
  },
};

const revenueTrendData = computed(() => {
  if (!financialData.value) return { labels: [], datasets: [] };
  const trend = financialData.value.revenueTrend;
  return {
    labels: trend.map((t) => t.month),
    datasets: [
      {
        label: 'Ingresos',
        data: trend.map((t) => t.revenue),
        backgroundColor: COLORS.primary,
      },
    ],
  };
});

const branchChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y' as const,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<'bar'>) => formatCurrency(ctx.parsed.x ?? 0),
      },
    },
  },
  scales: {
    x: { beginAtZero: true },
  },
};

const revenueByBranchData = computed(() => {
  if (!financialData.value) return { labels: [], datasets: [] };
  const byBranch = financialData.value.revenueByBranch;
  return {
    labels: byBranch.map((b) => b.branchName),
    datasets: [
      {
        label: 'Ingresos',
        data: byBranch.map((b) => b.revenue),
        backgroundColor: byBranch.map((_, i) => chartColors[i % chartColors.length]),
      },
    ],
  };
});

// -- Attention list columns / helpers ------------------------------------

const attentionColumns = [
  {
    name: 'nombre',
    label: 'Nombre',
    field: 'firstName',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'plan',
    label: 'Plan',
    field: 'planName',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'estado',
    label: 'Estado',
    field: 'type',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'acciones',
    label: 'Acciones',
    field: 'userId',
    align: 'right' as const,
  },
];

function formatMemberName(member: AttentionMember): string {
  const parts = [member.firstName, member.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : `Miembro #${member.userId}`;
}

function goToMember(userId: number) {
  router.push(`/alumnos/${userId}`);
}

function contactMember(member: AttentionMember) {
  if (!member.phone) return;
  const cleaned = member.phone.replace(/\D/g, '');
  window.open(`https://wa.me/${cleaned}`, '_blank');
}

// -- Extend dialog -------------------------------------------------------

const showExtendDialog = ref(false);
const extendDays = ref(30);
const extendMemberName = ref('');

function openExtendDialog(member: AttentionMember) {
  extendMemberName.value = formatMemberName(member);
  extendDays.value = 30;
  showExtendDialog.value = true;
}

// -- Data fetching -------------------------------------------------------

async function fetchKpis() {
  loadingKpis.value = true;
  try {
    kpis.value = await analyticsApi.getKpis(currentFilters.value);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching KPIs', { error: message });
  } finally {
    loadingKpis.value = false;
  }
}

async function fetchMemberData() {
  loadingMembers.value = true;
  try {
    memberData.value = await analyticsApi.getMemberAnalytics(currentFilters.value);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching member analytics', { error: message });
  } finally {
    loadingMembers.value = false;
  }
}

async function fetchAttendanceData() {
  loadingAttendance.value = true;
  try {
    attendanceData.value = await analyticsApi.getAttendanceAnalytics(currentFilters.value);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching attendance analytics', { error: message });
  } finally {
    loadingAttendance.value = false;
  }
}

async function fetchFinancialData() {
  loadingFinancial.value = true;
  try {
    financialData.value = await analyticsApi.getFinancialAnalytics(currentFilters.value);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching financial analytics', { error: message });
  } finally {
    loadingFinancial.value = false;
  }
}

async function fetchTabData() {
  switch (activeTab.value) {
    case 'miembros':
      await fetchMemberData();
      break;
    case 'asistencia':
      await fetchAttendanceData();
      break;
    case 'finanzas':
      await fetchFinancialData();
      break;
  }
}

async function onFilterChange() {
  await Promise.all([fetchKpis(), fetchTabData()]);
}

// -- Tab change: lazy load -----------------------------------------------

watch(activeTab, () => {
  fetchTabData();
});

// -- Lifecycle -----------------------------------------------------------

onMounted(async () => {
  await fetchBranches();
  await Promise.all([fetchKpis(), fetchTabData()]);
});

onUnmounted(() => {
  analyticsApi.cleanup();
  membersApi.cleanup();
});
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
