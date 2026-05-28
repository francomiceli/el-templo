<template>
  <q-page class="q-pa-md">
    <!-- ================================================================== -->
    <!-- Header -->
    <!-- ================================================================== -->
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-h5">Analiticas</div>
        <div class="text-caption text-grey-7">Tendencias y métricas — para entender el negocio</div>
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- Global Filters: Country (owner) + Branch + Date Range -->
    <!-- ================================================================== -->
    <div class="row items-center q-gutter-sm q-mb-md">
      <div v-if="isOwner" class="col-auto" style="min-width: 180px">
        <q-select
          v-model="selectedCountry"
          :options="countryOptions"
          label="Pais"
          dense
          outlined
          emit-value
          map-options
          @update:model-value="onFilterChange"
        />
      </div>

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
      <div v-for="n in 3" :key="n" class="col-12 col-sm-6 col-md-4">
        <q-card flat bordered>
          <q-card-section>
            <q-skeleton type="text" width="60%" />
            <q-skeleton type="text" width="40%" class="q-mt-sm" />
          </q-card-section>
        </q-card>
      </div>
    </div>

    <div v-else class="row q-col-gutter-md q-mb-md">
      <div v-for="kpi in kpiCards" :key="kpi.key" class="col-12 col-sm-6 col-md-4">
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
      <q-tab name="finanzas" label="Finanzas" icon="payments" />
      <q-tab name="programas" label="Programas" icon="school" />
      <q-tab name="funnel" label="Funnel" icon="filter_alt" />
      <q-tab name="retencion" label="Retención" icon="replay" />
    </q-tabs>

    <q-tab-panels v-model="activeTab" animated>
      <q-tab-panel name="miembros">
        <MiembrosTab :data="memberData" :loading="loadingMembers" />
      </q-tab-panel>
      <q-tab-panel name="finanzas">
        <FinanzasTab
          :data="financialData"
          :loading="loadingFinancial"
          :currency="displayCurrency"
        />
        <!-- Finanzas avanzadas (caja vs devengado + ARPU) — below the standard
             financial cards in the same tab (Phase 118 follow-up). -->
        <q-separator class="q-my-lg" />
        <div class="text-h6 q-mb-md">Finanzas avanzadas</div>
        <FinanzasAvanzadasTab :data="advancedFinanceData" :loading="loadingAdvancedFinance" />
      </q-tab-panel>

      <!-- Programas Tab -->
      <q-tab-panel name="programas">
        <div class="text-h6 q-mb-md">Programas — Resumen de Inscripciones</div>

        <div v-if="loadingProgramAnalytics" class="row q-col-gutter-md">
          <div v-for="n in 3" :key="n" class="col-12 col-sm-4">
            <q-card flat bordered>
              <q-card-section>
                <q-skeleton type="text" width="60%" />
                <q-skeleton type="text" width="40%" class="q-mt-sm" />
              </q-card-section>
            </q-card>
          </div>
        </div>

        <div v-else class="row q-col-gutter-md">
          <div class="col-12 col-sm-4">
            <q-card flat bordered>
              <q-card-section>
                <div class="row items-center no-wrap q-mb-xs">
                  <q-icon name="people" size="24px" class="q-mr-sm" color="primary" />
                  <span class="text-caption text-grey-7">Total Inscripciones</span>
                </div>
                <div class="text-h5">{{ programAnalytics?.totalEnrollments ?? 0 }}</div>
              </q-card-section>
            </q-card>
          </div>
          <div class="col-12 col-sm-4">
            <q-card flat bordered>
              <q-card-section>
                <div class="row items-center no-wrap q-mb-xs">
                  <q-icon name="play_circle" size="24px" class="q-mr-sm" color="positive" />
                  <span class="text-caption text-grey-7">Inscripciones Activas</span>
                </div>
                <div class="text-h5">{{ programAnalytics?.activeEnrollments ?? 0 }}</div>
              </q-card-section>
            </q-card>
          </div>
          <div class="col-12 col-sm-4">
            <q-card flat bordered>
              <q-card-section>
                <div class="row items-center no-wrap q-mb-xs">
                  <q-icon name="check_circle" size="24px" class="q-mr-sm" color="info" />
                  <span class="text-caption text-grey-7">Completados</span>
                </div>
                <div class="text-h5">{{ programAnalytics?.completedCount ?? 0 }}</div>
              </q-card-section>
            </q-card>
          </div>
        </div>
      </q-tab-panel>

      <!-- Funnel Tab (Phase 118) -->
      <q-tab-panel name="funnel">
        <FunnelTab
          v-model:entry-origin="funnelEntryOrigin"
          :data="funnelData"
          :loading="loadingFunnel"
          @update:entry-origin="onFunnelFilterChange"
        />
      </q-tab-panel>

      <!-- Retención Tab (Phase 118) -->
      <q-tab-panel name="retencion">
        <RetencionTab
          v-model:plan-id="retentionPlanId"
          :data="retentionData"
          :loading="loadingRetention"
          @update:plan-id="onRetentionFilterChange"
        />
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useAnalyticsApi } from 'src/composables/useAnalyticsApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import { useProgramsApi } from 'src/composables/useProgramsApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import { createLogger } from 'src/utils/logger';
import { formatPrice } from 'src/utils/format-price';
import MiembrosTab from 'src/components/analytics/MiembrosTab.vue';
import FinanzasTab from 'src/components/analytics/FinanzasTab.vue';
import FunnelTab from 'src/components/analytics/FunnelTab.vue';
import RetencionTab from 'src/components/analytics/RetencionTab.vue';
import FinanzasAvanzadasTab from 'src/components/analytics/FinanzasAvanzadasTab.vue';
import type {
  KpiStats,
  MemberAnalytics,
  FinancialAnalytics,
  AnalyticsFilters,
  TrendInfo,
  FunnelAnalytics,
  RetentionAnalytics,
  AdvancedFinanceAnalytics,
  FunnelEntryOrigin,
} from 'src/types/analytics';
import type { BranchOption } from 'src/types/member';
import type { ProgramAnalytics } from 'src/types/program';

// -- Setup ---------------------------------------------------------------

const log = createLogger('AnaliticasPage');
const analyticsApi = useAnalyticsApi();
const membersApi = useMembersApi();
const programsApi = useProgramsApi();
const authStore = useAuthStore();

// -- Country selector (owner-only per D-06 / D-10) -----------------------

const isOwner = computed(() => authStore.user?.role === 'owner');

const countryOptions = [
  { label: 'Argentina', value: 'AR' as const },
  { label: 'España', value: 'ES' as const },
];

// Default Argentina; no session persistence (D-06 Claude's Discretion)
const selectedCountry = ref<'AR' | 'ES'>('AR');

// Currency derived from selected country — drives KPI card + FinanzasTab charts.
const displayCurrency = computed<'ARS' | 'EUR'>(() =>
  selectedCountry.value === 'ES' ? 'EUR' : 'ARS'
);

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
  country: isOwner.value ? selectedCountry.value : undefined,
  dateFrom: dateFrom.value,
  dateTo: dateTo.value,
}));

// -- Tab state -----------------------------------------------------------

const activeTab = ref('miembros');

// -- Data refs -----------------------------------------------------------

const kpis = ref<KpiStats | null>(null);
const memberData = ref<MemberAnalytics | null>(null);
const financialData = ref<FinancialAnalytics | null>(null);

const loadingKpis = ref(false);
const loadingMembers = ref(false);
const loadingFinancial = ref(false);
const programAnalytics = ref<ProgramAnalytics | null>(null);
const loadingProgramAnalytics = ref(false);

// Phase 118 — funnel / retención / finanzas avanzadas
const funnelData = ref<FunnelAnalytics | null>(null);
const retentionData = ref<RetentionAnalytics | null>(null);
const advancedFinanceData = ref<AdvancedFinanceAnalytics | null>(null);

const loadingFunnel = ref(false);
const loadingRetention = ref(false);
const loadingAdvancedFinance = ref(false);

// Local plan filter for the Retención tab (follow-up). `null` = todos los planes.
// Re-fetches the cohort curve server-side. Options built from availablePlans.
const retentionPlanId = ref<number | null>(null);

// Local entry-origin segment for the Funnel tab (funnel follow-up). Re-fetches
// the funnel server-side. Default 'all' (classic 3-stage funnel).
const funnelEntryOrigin = ref<FunnelEntryOrigin>('all');

// -- KPI cards -----------------------------------------------------------

interface KpiCard {
  key: 'activeMembers' | 'monthlyRevenue' | 'dailyAttendanceAvg';
  label: string;
  icon: string;
  formattedValue: string;
  trend: TrendInfo;
}

function formatCurrency(value: number): string {
  return formatPrice(value, displayCurrency.value);
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
      // Per-currency revenue (D-05/D-17): pick the currency matching the
      // selected country — ARS and EUR are never summed.
      formattedValue: formatCurrency(k.monthlyRevenue[displayCurrency.value].value),
      trend: k.monthlyRevenue[displayCurrency.value].trend,
    },
    {
      key: 'dailyAttendanceAvg',
      label: 'Asistencia/dia',
      icon: 'how_to_reg',
      formattedValue: k.dailyAttendanceAvg.value.toFixed(1),
      trend: k.dailyAttendanceAvg.trend,
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
  return direction === 'up' ? 'positive' : 'negative';
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

async function fetchProgramAnalytics() {
  loadingProgramAnalytics.value = true;
  try {
    programAnalytics.value = await programsApi.getAnalytics();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching program analytics', { error: message });
  } finally {
    loadingProgramAnalytics.value = false;
  }
}

async function fetchFunnelData() {
  loadingFunnel.value = true;
  try {
    funnelData.value = await analyticsApi.getFunnel({
      ...currentFilters.value,
      entryOrigin: funnelEntryOrigin.value,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching funnel analytics', { error: message });
    funnelData.value = null;
  } finally {
    loadingFunnel.value = false;
  }
}

async function fetchRetentionData() {
  loadingRetention.value = true;
  try {
    retentionData.value = await analyticsApi.getRetention({
      ...currentFilters.value,
      planId: retentionPlanId.value ?? undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching retention analytics', { error: message });
    retentionData.value = null;
  } finally {
    loadingRetention.value = false;
  }
}

async function fetchAdvancedFinanceData() {
  loadingAdvancedFinance.value = true;
  try {
    advancedFinanceData.value = await analyticsApi.getAdvancedFinance(currentFilters.value);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching advanced finance analytics', { error: message });
    advancedFinanceData.value = null;
  } finally {
    loadingAdvancedFinance.value = false;
  }
}

// Re-fetch the retention curve when the local plan filter changes.
function onRetentionFilterChange() {
  void fetchRetentionData();
}

// Re-fetch the funnel when the local entry-origin segment changes.
function onFunnelFilterChange() {
  void fetchFunnelData();
}

async function fetchTabData() {
  switch (activeTab.value) {
    case 'miembros':
      await fetchMemberData();
      break;
    case 'finanzas':
      // Finanzas avanzadas now lives in the Finanzas tab → fetch both.
      await Promise.all([fetchFinancialData(), fetchAdvancedFinanceData()]);
      break;
    case 'programas':
      await fetchProgramAnalytics();
      break;
    case 'funnel':
      await fetchFunnelData();
      break;
    case 'retencion':
      await fetchRetentionData();
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
