<template>
  <q-page class="q-pa-md">
    <!-- ================================================================== -->
    <!-- Header -->
    <!-- ================================================================== -->
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-h5">Reportes</div>
        <div class="text-caption text-grey-7">
          Listas operativas — para actuar (contactar, cobrar, exportar)
        </div>
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- Global Filters: Country (owner only) + Branch -->
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
          @update:model-value="onCountryChange"
        />
      </div>
      <div class="col-12 col-sm-3">
        <q-select
          v-model="selectedBranchId"
          :options="branchOptions"
          :display-value="selectedBranchLabel"
          label="Sucursal"
          dense
          outlined
          emit-value
          map-options
          :loading="loadingBranches"
          @update:model-value="onBranchChange"
        />
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
      <q-tab name="accesos" label="Accesos" icon="login" />
      <q-tab name="cobros" label="Cobros" icon="payments" />
      <q-tab name="vencimientos" label="Vencimientos" icon="event_busy" />
      <q-tab name="inactivos" label="Inactivos" icon="person_off" />
      <q-tab name="deudas" label="Deudas" icon="warning" />
      <q-tab name="conversion" label="Conversión" icon="trending_up" />
      <q-tab name="sesiones-de-prueba" label="Sesiones de Prueba" icon="how_to_reg" />
    </q-tabs>

    <q-tab-panels v-model="activeTab" animated>
      <!-- ================================================================ -->
      <!-- Accesos Tab -->
      <!-- ================================================================ -->
      <q-tab-panel name="accesos">
        <div class="row items-center q-gutter-sm q-mb-md">
          <div class="col-auto">
            <q-btn-dropdown outline :label="accessDateLabel" icon="date_range" dense>
              <q-list dense>
                <q-item
                  v-for="preset in datePresets"
                  :key="preset.label"
                  clickable
                  v-close-popup
                  @click="applyAccessPreset(preset)"
                >
                  <q-item-section>{{ preset.label }}</q-item-section>
                </q-item>
                <q-separator />
                <q-item clickable @click="showAccessCustomRange = !showAccessCustomRange">
                  <q-item-section>Personalizado</q-item-section>
                  <q-item-section side>
                    <q-icon :name="showAccessCustomRange ? 'expand_less' : 'expand_more'" />
                  </q-item-section>
                </q-item>
                <template v-if="showAccessCustomRange">
                  <q-item>
                    <q-item-section>
                      <q-input
                        v-model="accessCustomFrom"
                        type="date"
                        label="Desde"
                        dense
                        outlined
                      />
                    </q-item-section>
                  </q-item>
                  <q-item>
                    <q-item-section>
                      <q-input v-model="accessCustomTo" type="date" label="Hasta" dense outlined />
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
                        @click="applyAccessCustomRange"
                      />
                    </q-item-section>
                  </q-item>
                </template>
              </q-list>
            </q-btn-dropdown>
          </div>

          <div class="col-auto" style="min-width: 200px">
            <q-input
              v-model="accessSearch"
              label="Buscar miembro"
              dense
              outlined
              clearable
              debounce="400"
              @update:model-value="fetchAccessData"
            >
              <template #prepend>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>

          <div class="col-auto" style="min-width: 140px">
            <q-select
              v-model="accessSource"
              :options="sourceOptions"
              label="Fuente"
              dense
              outlined
              emit-value
              map-options
              @update:model-value="fetchAccessData"
            />
          </div>

          <q-space />

          <div class="col-auto">
            <q-btn
              outline
              icon="download"
              label="Exportar Excel"
              color="primary"
              :loading="exportingAccess"
              @click="onExportAccess"
            />
          </div>
        </div>

        <q-table
          :rows="accessRows"
          :columns="accessColumns"
          row-key="id"
          :loading="loadingAccess"
          :pagination="accessPagination"
          :rows-per-page-options="[20, 50, 100]"
          @request="onAccessRequest"
          flat
          bordered
        >
          <template #no-data>
            <div class="full-width text-center q-pa-lg text-grey-6">
              No hay registros de acceso para los filtros seleccionados
            </div>
          </template>
        </q-table>
      </q-tab-panel>

      <!-- ================================================================ -->
      <!-- Cobros Tab -->
      <!-- ================================================================ -->
      <q-tab-panel name="cobros">
        <div class="row items-center q-gutter-sm q-mb-md">
          <div class="col-auto">
            <q-btn-dropdown outline :label="chargesDateLabel" icon="date_range" dense>
              <q-list dense>
                <q-item
                  v-for="preset in datePresets"
                  :key="preset.label"
                  clickable
                  v-close-popup
                  @click="applyChargesPreset(preset)"
                >
                  <q-item-section>{{ preset.label }}</q-item-section>
                </q-item>
                <q-separator />
                <q-item clickable @click="showChargesCustomRange = !showChargesCustomRange">
                  <q-item-section>Personalizado</q-item-section>
                  <q-item-section side>
                    <q-icon :name="showChargesCustomRange ? 'expand_less' : 'expand_more'" />
                  </q-item-section>
                </q-item>
                <template v-if="showChargesCustomRange">
                  <q-item>
                    <q-item-section>
                      <q-input
                        v-model="chargesCustomFrom"
                        type="date"
                        label="Desde"
                        dense
                        outlined
                      />
                    </q-item-section>
                  </q-item>
                  <q-item>
                    <q-item-section>
                      <q-input v-model="chargesCustomTo" type="date" label="Hasta" dense outlined />
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
                        @click="applyChargesCustomRange"
                      />
                    </q-item-section>
                  </q-item>
                </template>
              </q-list>
            </q-btn-dropdown>
          </div>

          <div class="col-auto" style="min-width: 200px">
            <q-input
              v-model="chargesSearch"
              label="Buscar miembro"
              dense
              outlined
              clearable
              debounce="400"
              @update:model-value="fetchChargesData"
            >
              <template #prepend>
                <q-icon name="search" />
              </template>
            </q-input>
          </div>

          <div class="col-auto" style="min-width: 160px">
            <q-select
              v-model="chargesPaymentMethod"
              :options="paymentMethodFilterOptions"
              label="Metodo"
              dense
              outlined
              emit-value
              map-options
              @update:model-value="fetchChargesData"
            />
          </div>

          <q-space />

          <div class="col-auto">
            <q-btn
              outline
              icon="download"
              label="Exportar Excel"
              color="primary"
              :loading="exportingCharges"
              @click="onExportCharges"
            />
          </div>
        </div>

        <q-table
          :rows="chargesRows"
          :columns="chargesColumns"
          row-key="id"
          :loading="loadingCharges"
          :pagination="chargesPagination"
          :rows-per-page-options="[20, 50, 100]"
          @request="onChargesRequest"
          flat
          bordered
        >
          <template #body="props">
            <q-tr :props="props" :class="props.row.voidedAt ? 'text-grey-5 text-strike' : ''">
              <q-td v-for="col in props.cols" :key="col.name" :props="props">
                <template v-if="col.name === 'estado'">
                  <q-badge v-if="props.row.voidedAt" color="negative" label="ANULADO" />
                  <q-badge v-else color="positive" label="Vigente" />
                </template>
                <template v-else>
                  {{ col.value }}
                </template>
              </q-td>
            </q-tr>
          </template>
          <template #no-data>
            <div class="full-width text-center q-pa-lg text-grey-6">
              No hay cobros para los filtros seleccionados
            </div>
          </template>
        </q-table>
      </q-tab-panel>

      <!-- ================================================================ -->
      <!-- Vencimientos Tab -->
      <!-- ================================================================ -->
      <q-tab-panel name="vencimientos">
        <div class="row items-center q-gutter-sm q-mb-md">
          <div class="col-auto">
            <q-input
              v-model.number="expiringDaysWindow"
              type="number"
              label="Ventana de dias"
              dense
              outlined
              :min="1"
              :max="365"
              style="width: 180px"
              @update:model-value="fetchExpiringData"
            />
          </div>

          <div class="col-auto">
            <q-toggle
              v-model="expiringIncludeExpired"
              label="Incluir vencidos"
              @update:model-value="fetchExpiringData"
            />
          </div>

          <q-space />

          <div class="col-auto">
            <q-btn
              outline
              icon="download"
              label="Exportar Excel"
              color="primary"
              :loading="exportingExpiring"
              @click="onExportExpiring"
            />
          </div>
        </div>

        <q-table
          :rows="expiringRows"
          :columns="expiringColumns"
          row-key="userId"
          :loading="loadingExpiring"
          flat
          bordered
          :pagination="{ rowsPerPage: 0 }"
          hide-pagination
        >
          <template #body-cell-daysRemaining="props">
            <q-td :props="props">
              <template v-if="props.row.daysRemaining > 0">
                {{ props.row.daysRemaining }}
              </template>
              <template v-else-if="props.row.daysRemaining === 0">
                <span class="text-warning text-weight-bold">Hoy</span>
              </template>
              <template v-else>
                <span class="text-negative text-weight-bold">
                  Vencido {{ Math.abs(props.row.daysRemaining) }}d
                </span>
              </template>
            </q-td>
          </template>
          <template #body-cell-acciones="props">
            <q-td :props="props">
              <q-btn
                round
                flat
                dense
                icon="chat"
                color="positive"
                :disable="!props.row.phone"
                @click="contactMember(props.row.phone)"
              >
                <q-tooltip>Contactar por WhatsApp</q-tooltip>
              </q-btn>
            </q-td>
          </template>
          <template #no-data>
            <div class="full-width text-center q-pa-lg text-grey-6">
              No hay miembros con vencimientos proximos
            </div>
          </template>
        </q-table>
      </q-tab-panel>

      <!-- ================================================================ -->
      <!-- Inactivos Tab -->
      <!-- ================================================================ -->
      <q-tab-panel name="inactivos">
        <div class="row items-center q-gutter-sm q-mb-md">
          <div class="col-auto">
            <q-input
              v-model.number="inactiveDaysThreshold"
              type="number"
              label="Dias sin asistir"
              dense
              outlined
              :min="1"
              :max="365"
              style="width: 180px"
              @update:model-value="fetchInactiveData"
            />
          </div>

          <q-space />

          <div class="col-auto">
            <q-btn
              outline
              icon="download"
              label="Exportar Excel"
              color="primary"
              :loading="exportingInactive"
              @click="onExportInactive"
            />
          </div>
        </div>

        <q-table
          :rows="inactiveRows"
          :columns="inactiveColumns"
          row-key="userId"
          :loading="loadingInactive"
          flat
          bordered
          :pagination="{ rowsPerPage: 0 }"
          hide-pagination
        >
          <template #body-cell-acciones="props">
            <q-td :props="props">
              <q-btn
                round
                flat
                dense
                icon="chat"
                color="positive"
                :disable="!props.row.phone"
                @click="contactMember(props.row.phone)"
              >
                <q-tooltip>Contactar por WhatsApp</q-tooltip>
              </q-btn>
            </q-td>
          </template>
          <template #no-data>
            <div class="full-width text-center q-pa-lg text-grey-6">
              No hay miembros inactivos con los filtros seleccionados
            </div>
          </template>
        </q-table>
      </q-tab-panel>

      <!-- ================================================================ -->
      <!-- Deudas Tab (Phase 109 CAJA-03) -->
      <!-- ================================================================ -->
      <q-tab-panel name="deudas">
        <DeudasReport
          :branch-options="deudasBranchOptions"
          :display-currency="displayCurrency"
          :country-scope="countryScope"
          :is-owner="isOwner"
        />
      </q-tab-panel>

      <!-- ================================================================ -->
      <!-- Conversión de Trials Tab (Phase 102-07) -->
      <!-- ================================================================ -->
      <q-tab-panel name="conversion">
        <div class="row items-center q-gutter-sm q-mb-md">
          <div class="col-auto">
            <q-btn-dropdown outline :label="conversionDateLabel" icon="date_range" dense>
              <q-list dense>
                <q-item
                  v-for="preset in conversionDatePresets"
                  :key="preset.label"
                  clickable
                  v-close-popup
                  @click="applyConversionPreset(preset)"
                >
                  <q-item-section>{{ preset.label }}</q-item-section>
                </q-item>
              </q-list>
            </q-btn-dropdown>
          </div>
          <div class="col-auto text-caption text-grey-7">
            {{ conversionDateFrom }} al {{ conversionDateTo }}
          </div>
        </div>

        <div v-if="loadingConversion" class="flex flex-center q-pa-lg">
          <q-spinner-dots size="40px" color="primary" />
        </div>

        <div v-else-if="conversionReport">
          <!-- KPI Cards -->
          <div class="row q-col-gutter-sm q-mb-md">
            <div class="col-6 col-md-3">
              <q-card flat bordered>
                <q-card-section class="q-pa-sm">
                  <div class="text-caption text-grey-7">Conversión</div>
                  <div class="text-h5 text-weight-bold">
                    {{ formatPct(conversionReport.totals.conversionRatePct) }}
                  </div>
                  <div class="text-caption text-grey-7">
                    {{ conversionReport.totals.convertedCount }} de
                    {{ conversionReport.totals.trialsCount }} leads
                  </div>
                </q-card-section>
              </q-card>
            </div>
            <div class="col-6 col-md-3">
              <q-card flat bordered>
                <q-card-section class="q-pa-sm">
                  <div class="text-caption text-grey-7">Mediana días a conversión</div>
                  <div class="text-h5 text-weight-bold">
                    {{
                      conversionReport.totals.medianDaysToConvert !== null
                        ? `${conversionReport.totals.medianDaysToConvert}d`
                        : '—'
                    }}
                  </div>
                </q-card-section>
              </q-card>
            </div>
            <div class="col-6 col-md-3">
              <q-card flat bordered>
                <q-card-section class="q-pa-sm">
                  <div class="text-caption text-grey-7">Revenue de convertidos</div>
                  <div class="text-h5 text-weight-bold">
                    {{ formatPrice(conversionReport.totals.revenueFromConverted, displayCurrency) }}
                  </div>
                </q-card-section>
              </q-card>
            </div>
            <div class="col-6 col-md-3">
              <q-card flat bordered>
                <q-card-section class="q-pa-sm">
                  <div class="text-caption text-grey-7">Revenue por trial</div>
                  <div class="text-h5 text-weight-bold">
                    {{ formatPrice(conversionReport.totals.revenuePerTrial, displayCurrency) }}
                  </div>
                </q-card-section>
              </q-card>
            </div>
          </div>

          <!-- Breakdowns -->
          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-12 col-md-6">
              <q-card flat bordered>
                <q-card-section class="q-pb-none">
                  <div class="text-subtitle2 text-weight-bold">Por sede</div>
                </q-card-section>
                <q-table
                  :rows="conversionReport.byBranch"
                  :columns="branchBreakdownColumns"
                  row-key="branchId"
                  flat
                  :pagination="{ rowsPerPage: 0 }"
                  hide-pagination
                />
              </q-card>
            </div>
            <div class="col-12 col-md-6">
              <q-card flat bordered>
                <q-card-section class="q-pb-none">
                  <div class="text-subtitle2 text-weight-bold">Por turno</div>
                </q-card-section>
                <q-table
                  :rows="conversionReport.byShift"
                  :columns="shiftBreakdownColumns"
                  row-key="shift"
                  flat
                  :pagination="{ rowsPerPage: 0 }"
                  hide-pagination
                />
              </q-card>
            </div>
            <div class="col-12">
              <q-card flat bordered>
                <q-card-section class="q-pb-none">
                  <div class="text-subtitle2 text-weight-bold">Por horario</div>
                </q-card-section>
                <q-table
                  :rows="conversionReport.byHourSlot"
                  :columns="hourBreakdownColumns"
                  row-key="hour"
                  flat
                  :pagination="{ rowsPerPage: 0 }"
                  hide-pagination
                />
              </q-card>
            </div>
          </div>

          <!-- Pending leads -->
          <q-card flat bordered>
            <q-card-section class="q-pb-none">
              <div class="text-subtitle2 text-weight-bold">
                Leads pendientes ({{ conversionReport.pendingLeads.length }})
              </div>
              <div class="text-caption text-grey-7">
                No convirtieron todavía — ordenados por más antiguos primero
              </div>
            </q-card-section>
            <q-table
              :rows="conversionReport.pendingLeads"
              :columns="pendingLeadsColumns"
              row-key="userId"
              flat
              :pagination="{ rowsPerPage: 20 }"
            >
              <template #body-cell-acciones="props">
                <q-td :props="props">
                  <q-btn
                    round
                    flat
                    dense
                    icon="chat"
                    color="positive"
                    :disable="!props.row.phone"
                    @click="contactMember(props.row.phone)"
                  >
                    <q-tooltip>Contactar por WhatsApp</q-tooltip>
                  </q-btn>
                  <q-btn
                    round
                    flat
                    dense
                    icon="person"
                    color="primary"
                    :to="`/alumnos/${props.row.userId}`"
                  >
                    <q-tooltip>Ver alumno</q-tooltip>
                  </q-btn>
                </q-td>
              </template>
              <template #no-data>
                <div class="full-width text-center q-pa-lg text-grey-6">
                  Sin leads pendientes en este período
                </div>
              </template>
            </q-table>
          </q-card>
        </div>
      </q-tab-panel>

      <!-- ================================================================ -->
      <!-- Sesiones de Prueba Tab (Phase 114) -->
      <!-- ================================================================ -->
      <q-tab-panel name="sesiones-de-prueba">
        <TrialSessionsReport :branch-id="selectedBranchId" />
      </q-tab-panel>
    </q-tab-panels>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import { useQuasar, type QTableColumn, type QTableProps } from 'quasar';
import { useReportsApi } from 'src/composables/useReportsApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import { createLogger } from 'src/utils/logger';
import { formatPrice } from 'src/utils/format-price';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_OPTIONS,
  type PaymentMethod,
  type LegacyPaymentMethod,
} from 'src/types/transaction';
import type {
  AccessReportRow,
  ChargeReportRow,
  ExpiringReportRow,
  InactiveReportRow,
  TrialConversionReport,
} from 'src/types/report';
import type { BranchOption } from 'src/types/member';
import DeudasReport from 'src/components/DeudasReport.vue';
import TrialSessionsReport from 'src/components/reports/TrialSessionsReport.vue';

// -- Setup -------------------------------------------------------------------

const log = createLogger('ReportesPage');
const $q = useQuasar();
const reportsApi = useReportsApi();
const membersApi = useMembersApi();
const authStore = useAuthStore();

// -- Country selector (owner-only per D-06 / D-10) ---------------------------

const isOwner = computed(() => authStore.user?.role === 'owner');

const countryOptions = [
  { label: 'Argentina', value: 'AR' as const },
  { label: 'España', value: 'ES' as const },
];

// Default Argentina per D-06; no persistence (D-06 "Claude's Discretion")
const selectedCountry = ref<'AR' | 'ES'>('AR');

// Derived currency for formatters that don't have a row-level `currency` field.
const displayCurrency = computed<'ARS' | 'EUR'>(() =>
  selectedCountry.value === 'ES' ? 'EUR' : 'ARS'
);

// Scope helper for API calls: owner passes their selection, non-owner omits
// (server derives from branch via preHandler per Plan 03).
const countryScope = computed<'AR' | 'ES' | undefined>(() =>
  isOwner.value ? selectedCountry.value : undefined
);

async function onCountryChange() {
  await fetchTabData();
}

// -- Row-level price formatter ----------------------------------------------

function formatRowCurrency(value: number, row: { currency?: string } | undefined): string {
  // Row carries `currency` when server populates it (Plan 06 charges/expiring);
  // otherwise fall back to the page-level derived currency.
  return formatPrice(value, row?.currency ?? displayCurrency.value);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// -- Branch filter -----------------------------------------------------------

const selectedBranchId = ref<number | undefined>(undefined);
const branchOptions = ref<Array<{ label: string; value: number | undefined }>>([
  { label: 'Todas las sedes', value: undefined },
]);
const loadingBranches = ref(false);

const selectedBranchLabel = computed(() => {
  const match = branchOptions.value.find((o) => o.value === selectedBranchId.value);
  return match?.label ?? 'Todas las sedes';
});

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

function onBranchChange() {
  fetchTabData();
}

// Phase 109-04 — Deudas tab consumes the same branch list as the global
// filter, but exposes it under its own prop so the component stays
// decoupled from the shape of `branchOptions` if it ever changes.
const deudasBranchOptions = computed(() => branchOptions.value);

// -- Date range helpers (shared) ---------------------------------------------

interface DatePreset {
  label: string;
  getRange: () => { dateFrom: string; dateTo: string };
}

function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function getMonthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

const datePresets: DatePreset[] = [
  {
    label: 'Este mes',
    getRange: () => ({
      dateFrom: toIsoDate(getMonthStart(new Date())),
      dateTo: toIsoDate(getMonthEnd(new Date())),
    }),
  },
  {
    label: 'Mes anterior',
    getRange: () => {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      return {
        dateFrom: toIsoDate(getMonthStart(d)),
        dateTo: toIsoDate(getMonthEnd(d)),
      };
    },
  },
  {
    label: 'Ultimos 3 meses',
    getRange: () => {
      const d = new Date();
      d.setMonth(d.getMonth() - 2);
      return {
        dateFrom: toIsoDate(getMonthStart(d)),
        dateTo: toIsoDate(getMonthEnd(new Date())),
      };
    },
  },
  {
    label: 'Este ano',
    getRange: () => ({
      dateFrom: toIsoDate(new Date(new Date().getFullYear(), 0, 1)),
      dateTo: toIsoDate(getMonthEnd(new Date())),
    }),
  },
];

// -- Tab state ---------------------------------------------------------------

const route = useRoute();
const VALID_TABS = [
  'accesos',
  'cobros',
  'vencimientos',
  'inactivos',
  'deudas',
  'conversion',
  'sesiones-de-prueba',
];
const initialTab = (() => {
  const q = route.query.tab;
  return typeof q === 'string' && VALID_TABS.includes(q) ? q : 'accesos';
})();
const activeTab = ref(initialTab);

// -- Source filter options ---------------------------------------------------

const sourceOptions = [
  { label: 'Todas', value: undefined as string | undefined },
  { label: 'QR', value: 'qr' },
  { label: 'Manual', value: 'manual' },
];

// -- Payment method filter options -------------------------------------------

const paymentMethodFilterOptions = [
  { label: 'Todos', value: undefined as PaymentMethod | undefined },
  ...PAYMENT_METHOD_OPTIONS,
];

// -- WhatsApp contact --------------------------------------------------------

function contactMember(phone: string | null) {
  if (!phone) return;
  const cleaned = phone.replace(/\D/g, '');
  window.open(`https://wa.me/${cleaned}`, '_blank');
}

// -- Download helper ---------------------------------------------------------

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// ACCESOS TAB
// ============================================================================

const now = new Date();
const accessDateFrom = ref(toIsoDate(getMonthStart(now)));
const accessDateTo = ref(toIsoDate(getMonthEnd(now)));
const accessPresetLabel = ref('Este mes');
const showAccessCustomRange = ref(false);
const accessCustomFrom = ref(accessDateFrom.value);
const accessCustomTo = ref(accessDateTo.value);
const accessSearch = ref('');
const accessSource = ref<string | undefined>(undefined);
const accessRows = ref<AccessReportRow[]>([]);
const loadingAccess = ref(false);
const exportingAccess = ref(false);
const accessPagination = ref({
  page: 1,
  rowsPerPage: 20,
  rowsNumber: 0,
  sortBy: null as string | null,
  descending: false,
});

const accessDateLabel = computed(() => {
  if (accessPresetLabel.value) return accessPresetLabel.value;
  return `${accessDateFrom.value} - ${accessDateTo.value}`;
});

function applyAccessPreset(preset: DatePreset) {
  const range = preset.getRange();
  accessDateFrom.value = range.dateFrom;
  accessDateTo.value = range.dateTo;
  accessPresetLabel.value = preset.label;
  showAccessCustomRange.value = false;
  fetchAccessData();
}

function applyAccessCustomRange() {
  accessDateFrom.value = accessCustomFrom.value;
  accessDateTo.value = accessCustomTo.value;
  accessPresetLabel.value = '';
  fetchAccessData();
}

const accessColumns: QTableColumn[] = [
  {
    name: 'checkedInAt',
    label: 'Fecha/Hora',
    field: 'checkedInAt',
    align: 'left',
    format: (val: string) => formatDateTime(val),
  },
  { name: 'memberName', label: 'Miembro', field: 'memberName', align: 'left' },
  { name: 'branchName', label: 'Sede', field: 'branchName', align: 'left' },
  {
    name: 'source',
    label: 'Fuente',
    field: 'source',
    align: 'left',
    format: (val: string) => (val === 'qr' ? 'QR' : 'Manual'),
  },
  {
    name: 'scheduleSlot',
    label: 'Turno',
    field: 'scheduleSlot',
    align: 'left',
    format: (val: string | null) => val ?? '-',
  },
];

async function fetchAccessData() {
  loadingAccess.value = true;
  try {
    const result = await reportsApi.getAccessLog({
      branchId: selectedBranchId.value,
      country: countryScope.value,
      dateFrom: accessDateFrom.value,
      dateTo: accessDateTo.value,
      search: accessSearch.value || undefined,
      source: accessSource.value as 'qr' | 'manual' | undefined,
      page: accessPagination.value.page,
      limit: accessPagination.value.rowsPerPage,
    });
    accessRows.value = result.rows;
    accessPagination.value.rowsNumber = result.total;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching access report', { error: message });
  } finally {
    loadingAccess.value = false;
  }
}

function onAccessRequest(props: Parameters<NonNullable<QTableProps['onRequest']>>[0]) {
  accessPagination.value.page = props.pagination.page ?? 1;
  accessPagination.value.rowsPerPage = props.pagination.rowsPerPage ?? 20;
  fetchAccessData();
}

async function onExportAccess() {
  exportingAccess.value = true;
  try {
    const blob = await reportsApi.exportAccessLog({
      branchId: selectedBranchId.value,
      country: countryScope.value,
      dateFrom: accessDateFrom.value,
      dateTo: accessDateTo.value,
      search: accessSearch.value || undefined,
      source: accessSource.value as 'qr' | 'manual' | undefined,
    });
    const today = new Date().toISOString().split('T')[0];
    downloadBlob(blob, `reportes-accesos-${today}.xlsx`);
    $q.notify({ type: 'positive', message: 'Exportacion completada' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error exporting access report', { error: message });
    $q.notify({ type: 'negative', message: 'Error al exportar' });
  } finally {
    exportingAccess.value = false;
  }
}

// ============================================================================
// COBROS TAB
// ============================================================================

const chargesDateFrom = ref(toIsoDate(getMonthStart(now)));
const chargesDateTo = ref(toIsoDate(getMonthEnd(now)));
const chargesPresetLabel = ref('Este mes');
const showChargesCustomRange = ref(false);
const chargesCustomFrom = ref(chargesDateFrom.value);
const chargesCustomTo = ref(chargesDateTo.value);
const chargesSearch = ref('');
const chargesPaymentMethod = ref<LegacyPaymentMethod | undefined>(undefined);
const chargesRows = ref<ChargeReportRow[]>([]);
const loadingCharges = ref(false);
const exportingCharges = ref(false);
const chargesPagination = ref({
  page: 1,
  rowsPerPage: 20,
  rowsNumber: 0,
  sortBy: null as string | null,
  descending: false,
});

const chargesDateLabel = computed(() => {
  if (chargesPresetLabel.value) return chargesPresetLabel.value;
  return `${chargesDateFrom.value} - ${chargesDateTo.value}`;
});

function applyChargesPreset(preset: DatePreset) {
  const range = preset.getRange();
  chargesDateFrom.value = range.dateFrom;
  chargesDateTo.value = range.dateTo;
  chargesPresetLabel.value = preset.label;
  showChargesCustomRange.value = false;
  fetchChargesData();
}

function applyChargesCustomRange() {
  chargesDateFrom.value = chargesCustomFrom.value;
  chargesDateTo.value = chargesCustomTo.value;
  chargesPresetLabel.value = '';
  fetchChargesData();
}

const chargesColumns: QTableColumn[] = [
  {
    name: 'paymentDate',
    label: 'Fecha',
    field: 'paymentDate',
    align: 'left',
    format: (val: string) => formatDate(val),
  },
  { name: 'memberName', label: 'Miembro', field: 'memberName', align: 'left' },
  { name: 'planName', label: 'Plan', field: 'planName', align: 'left' },
  {
    name: 'amount',
    label: 'Monto',
    field: 'amount',
    align: 'right',
    format: (val: number, row: ChargeReportRow) => formatRowCurrency(val, row),
  },
  {
    name: 'paymentMethod',
    label: 'Metodo',
    field: 'paymentMethod',
    align: 'left',
    format: (val: PaymentMethod) => PAYMENT_METHOD_LABELS[val] ?? val,
  },
  { name: 'recorderName', label: 'Registro', field: 'recorderName', align: 'left' },
  { name: 'estado', label: 'Estado', field: 'voidedAt', align: 'center' },
];

async function fetchChargesData() {
  loadingCharges.value = true;
  try {
    const result = await reportsApi.getChargeHistory({
      branchId: selectedBranchId.value,
      country: countryScope.value,
      dateFrom: chargesDateFrom.value,
      dateTo: chargesDateTo.value,
      search: chargesSearch.value || undefined,
      paymentMethod: chargesPaymentMethod.value,
      page: chargesPagination.value.page,
      limit: chargesPagination.value.rowsPerPage,
    });
    chargesRows.value = result.rows;
    chargesPagination.value.rowsNumber = result.total;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching charges report', { error: message });
  } finally {
    loadingCharges.value = false;
  }
}

function onChargesRequest(props: Parameters<NonNullable<QTableProps['onRequest']>>[0]) {
  chargesPagination.value.page = props.pagination.page ?? 1;
  chargesPagination.value.rowsPerPage = props.pagination.rowsPerPage ?? 20;
  fetchChargesData();
}

async function onExportCharges() {
  exportingCharges.value = true;
  try {
    const blob = await reportsApi.exportChargeHistory({
      branchId: selectedBranchId.value,
      country: countryScope.value,
      dateFrom: chargesDateFrom.value,
      dateTo: chargesDateTo.value,
      search: chargesSearch.value || undefined,
      paymentMethod: chargesPaymentMethod.value,
    });
    const today = new Date().toISOString().split('T')[0];
    downloadBlob(blob, `reportes-cobros-${today}.xlsx`);
    $q.notify({ type: 'positive', message: 'Exportacion completada' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error exporting charges report', { error: message });
    $q.notify({ type: 'negative', message: 'Error al exportar' });
  } finally {
    exportingCharges.value = false;
  }
}

// ============================================================================
// VENCIMIENTOS TAB
// ============================================================================

const expiringDaysWindow = ref(7);
const expiringIncludeExpired = ref(true);
const expiringRows = ref<ExpiringReportRow[]>([]);
const loadingExpiring = ref(false);
const exportingExpiring = ref(false);

const expiringColumns: QTableColumn[] = [
  { name: 'memberName', label: 'Miembro', field: 'memberName', align: 'left' },
  { name: 'branchName', label: 'Sucursal', field: 'branchName', align: 'left' },
  { name: 'planName', label: 'Plan', field: 'planName', align: 'left' },
  {
    name: 'endDate',
    label: 'Vence',
    field: 'endDate',
    align: 'left',
    format: (val: string) => formatDate(val),
  },
  { name: 'daysRemaining', label: 'Dias restantes', field: 'daysRemaining', align: 'center' },
  {
    name: 'phone',
    label: 'Telefono',
    field: 'phone',
    align: 'left',
    format: (val: string | null) => val ?? '-',
  },
  { name: 'acciones', label: 'Acciones', field: 'userId', align: 'center' },
];

async function fetchExpiringData() {
  loadingExpiring.value = true;
  try {
    expiringRows.value = await reportsApi.getExpiringMemberships({
      branchId: selectedBranchId.value,
      country: countryScope.value,
      daysWindow: expiringDaysWindow.value,
      includeExpired: expiringIncludeExpired.value,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching expiring report', { error: message });
  } finally {
    loadingExpiring.value = false;
  }
}

async function onExportExpiring() {
  exportingExpiring.value = true;
  try {
    const blob = await reportsApi.exportExpiringMemberships({
      branchId: selectedBranchId.value,
      country: countryScope.value,
      daysWindow: expiringDaysWindow.value,
      includeExpired: expiringIncludeExpired.value,
    });
    const today = new Date().toISOString().split('T')[0];
    downloadBlob(blob, `reportes-vencimientos-${today}.xlsx`);
    $q.notify({ type: 'positive', message: 'Exportacion completada' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error exporting expiring report', { error: message });
    $q.notify({ type: 'negative', message: 'Error al exportar' });
  } finally {
    exportingExpiring.value = false;
  }
}

// ============================================================================
// INACTIVOS TAB
// ============================================================================

const inactiveDaysThreshold = ref(14);
const inactiveRows = ref<InactiveReportRow[]>([]);
const loadingInactive = ref(false);
const exportingInactive = ref(false);

const inactiveColumns: QTableColumn[] = [
  { name: 'memberName', label: 'Miembro', field: 'memberName', align: 'left' },
  { name: 'planName', label: 'Plan', field: 'planName', align: 'left' },
  {
    name: 'lastCheckIn',
    label: 'Ultima asistencia',
    field: 'lastCheckIn',
    align: 'left',
    format: (val: string | null) => (val ? formatDate(val) : 'Sin registros'),
  },
  { name: 'daysSinceCheckIn', label: 'Dias sin ir', field: 'daysSinceCheckIn', align: 'center' },
  {
    name: 'phone',
    label: 'Telefono',
    field: 'phone',
    align: 'left',
    format: (val: string | null) => val ?? '-',
  },
  { name: 'acciones', label: 'Acciones', field: 'userId', align: 'center' },
];

async function fetchInactiveData() {
  loadingInactive.value = true;
  try {
    inactiveRows.value = await reportsApi.getInactiveMembers({
      branchId: selectedBranchId.value,
      country: countryScope.value,
      daysThreshold: inactiveDaysThreshold.value,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching inactive report', { error: message });
  } finally {
    loadingInactive.value = false;
  }
}

async function onExportInactive() {
  exportingInactive.value = true;
  try {
    const blob = await reportsApi.exportInactiveMembers({
      branchId: selectedBranchId.value,
      country: countryScope.value,
      daysThreshold: inactiveDaysThreshold.value,
    });
    const today = new Date().toISOString().split('T')[0];
    downloadBlob(blob, `reportes-inactivos-${today}.xlsx`);
    $q.notify({ type: 'positive', message: 'Exportacion completada' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error exporting inactive report', { error: message });
    $q.notify({ type: 'negative', message: 'Error al exportar' });
  } finally {
    exportingInactive.value = false;
  }
}

// ============================================================================
// CONVERSION TAB (Phase 102-07)
// ============================================================================

const conversionReport = ref<TrialConversionReport | null>(null);
const loadingConversion = ref(false);
const conversionDateFrom = ref(toIsoDate(getDaysAgo(new Date(), 30)));
const conversionDateTo = ref(toIsoDate(new Date()));

const conversionDateLabel = computed(
  () => `${conversionDateFrom.value} — ${conversionDateTo.value}`
);

interface ConversionDatePreset {
  label: string;
  getRange: () => { dateFrom: string; dateTo: string };
}

const conversionDatePresets: ConversionDatePreset[] = [
  {
    label: 'Últimos 30 días',
    getRange: () => ({
      dateFrom: toIsoDate(getDaysAgo(new Date(), 30)),
      dateTo: toIsoDate(new Date()),
    }),
  },
  {
    label: 'Últimos 90 días',
    getRange: () => ({
      dateFrom: toIsoDate(getDaysAgo(new Date(), 90)),
      dateTo: toIsoDate(new Date()),
    }),
  },
  {
    label: 'Este mes',
    getRange: () => ({
      dateFrom: toIsoDate(getMonthStart(new Date())),
      dateTo: toIsoDate(getMonthEnd(new Date())),
    }),
  },
  {
    label: 'Desde siempre',
    getRange: () => ({ dateFrom: '2020-01-01', dateTo: toIsoDate(new Date()) }),
  },
];

function getDaysAgo(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return d;
}

function applyConversionPreset(preset: ConversionDatePreset) {
  const range = preset.getRange();
  conversionDateFrom.value = range.dateFrom;
  conversionDateTo.value = range.dateTo;
  void fetchConversionData();
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

const branchBreakdownColumns: QTableColumn[] = [
  { name: 'branchName', label: 'Sede', field: 'branchName', align: 'left' },
  { name: 'trialsCount', label: 'Leads', field: 'trialsCount', align: 'center' },
  {
    name: 'convertedCount',
    label: 'Convertidos',
    field: 'convertedCount',
    align: 'center',
  },
  {
    name: 'conversionRatePct',
    label: 'Conversión',
    field: 'conversionRatePct',
    align: 'right',
    format: (v: number) => formatPct(v),
  },
];

const hourBreakdownColumns: QTableColumn[] = [
  { name: 'hour', label: 'Hora', field: 'hour', align: 'left' },
  { name: 'trialsCount', label: 'Leads', field: 'trialsCount', align: 'center' },
  {
    name: 'convertedCount',
    label: 'Convertidos',
    field: 'convertedCount',
    align: 'center',
  },
  {
    name: 'conversionRatePct',
    label: 'Conversión',
    field: 'conversionRatePct',
    align: 'right',
    format: (v: number) => formatPct(v),
  },
];

const shiftBreakdownColumns: QTableColumn[] = [
  {
    name: 'shift',
    label: 'Turno',
    field: 'shift',
    align: 'left',
    format: (v: string) => (v === 'TM' ? 'Mañana (TM)' : 'Tarde (TT)'),
  },
  { name: 'trialsCount', label: 'Leads', field: 'trialsCount', align: 'center' },
  {
    name: 'convertedCount',
    label: 'Convertidos',
    field: 'convertedCount',
    align: 'center',
  },
  {
    name: 'conversionRatePct',
    label: 'Conversión',
    field: 'conversionRatePct',
    align: 'right',
    format: (v: number) => formatPct(v),
  },
];

const pendingLeadsColumns: QTableColumn[] = [
  {
    name: 'memberName',
    label: 'Lead',
    field: (r: { firstName: string; lastName: string }) => `${r.firstName} ${r.lastName}`.trim(),
    align: 'left',
  },
  { name: 'branchName', label: 'Sede', field: 'branchName', align: 'left' },
  {
    name: 'trialDate',
    label: 'Fecha trial',
    field: 'trialDate',
    align: 'left',
    format: (val: string) => formatDate(val),
  },
  {
    name: 'daysSinceTrial',
    label: 'Días desde trial',
    field: 'daysSinceTrial',
    align: 'center',
  },
  {
    name: 'phone',
    label: 'Teléfono',
    field: 'phone',
    align: 'left',
    format: (val: string | null) => val ?? '-',
  },
  { name: 'acciones', label: 'Acciones', field: 'userId', align: 'center' },
];

async function fetchConversionData() {
  loadingConversion.value = true;
  try {
    conversionReport.value = await reportsApi.getTrialConversion({
      branchId: selectedBranchId.value,
      country: countryScope.value,
      dateFrom: conversionDateFrom.value,
      dateTo: conversionDateTo.value,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching trial conversion report', { error: message });
  } finally {
    loadingConversion.value = false;
  }
}

// ============================================================================
// TAB DATA FETCHING
// ============================================================================

async function fetchTabData() {
  switch (activeTab.value) {
    case 'accesos':
      await fetchAccessData();
      break;
    case 'cobros':
      await fetchChargesData();
      break;
    case 'vencimientos':
      await fetchExpiringData();
      break;
    case 'inactivos':
      await fetchInactiveData();
      break;
    case 'conversion':
      await fetchConversionData();
      break;
  }
}

// -- Tab change: lazy load ---------------------------------------------------

watch(activeTab, () => {
  fetchTabData();
});

// -- Lifecycle ---------------------------------------------------------------

onMounted(async () => {
  await fetchBranches();
  await fetchTabData();
});

onUnmounted(() => {
  reportsApi.cleanup();
  membersApi.cleanup();
});
</script>
