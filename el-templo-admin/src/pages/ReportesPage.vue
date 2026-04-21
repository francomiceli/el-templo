<template>
  <q-page class="q-pa-md">
    <!-- ================================================================== -->
    <!-- Header -->
    <!-- ================================================================== -->
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-h5">Reportes</div>
        <div class="text-caption text-grey-7">Reportes operativos</div>
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
              style="max-width: 120px"
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
              style="max-width: 120px"
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
    </q-tab-panels>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
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
} from 'src/types/payment';
import type {
  AccessReportRow,
  ChargeReportRow,
  ExpiringReportRow,
  InactiveReportRow,
} from 'src/types/report';
import type { BranchOption } from 'src/types/member';

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

const activeTab = ref('accesos');

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
const chargesPaymentMethod = ref<PaymentMethod | undefined>(undefined);
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
