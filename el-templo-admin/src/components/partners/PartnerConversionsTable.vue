<!--
  Tabla de conversiones por partner (D-20, fase 179-13). Muestra, por
  vínculo `partner_referrals`, quién se vinculó, en qué estado quedó el
  vínculo/beneficio y cuánta comisión generó. Self-contained: trae su
  propia lista de partners (para el filtro) y sus propias filas — la
  sección "Beneficios sin conversión" (D-08) vive en PartnersPage.vue, no
  acá (reporte distinto, con su propia query).
-->
<template>
  <div>
    <!-- ================================================================== -->
    <!-- Filters -->
    <!-- ================================================================== -->
    <div class="row q-col-gutter-sm q-mb-md items-end">
      <div class="col-12 col-sm-3">
        <q-select
          v-model="filters.partnerId"
          :options="partnerOptions"
          label="Partner"
          dense
          outlined
          clearable
          emit-value
          map-options
          @update:model-value="loadConversions"
        />
      </div>

      <div class="col-6 col-sm-2">
        <q-select
          v-model="filters.status"
          :options="STATUS_OPTIONS"
          label="Estado del vínculo"
          dense
          outlined
          clearable
          emit-value
          map-options
          @update:model-value="loadConversions"
        />
      </div>

      <div class="col-6 col-sm-2">
        <q-input
          v-model="filters.dateFrom"
          label="Desde"
          type="date"
          dense
          outlined
          clearable
          @update:model-value="loadConversions"
        />
      </div>

      <div class="col-6 col-sm-2">
        <q-input
          v-model="filters.dateTo"
          label="Hasta"
          type="date"
          dense
          outlined
          clearable
          @update:model-value="loadConversions"
        />
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- Table -->
    <!-- ================================================================== -->
    <q-table
      :rows="rows"
      :columns="columns"
      row-key="linkId"
      :loading="loading"
      :pagination="{ rowsPerPage: 50 }"
      :rows-per-page-options="[20, 50, 100]"
      flat
      bordered
    >
      <template #no-data>
        <div class="full-width text-center text-grey-7 q-pa-md">
          No hay conversiones para los filtros seleccionados.
        </div>
      </template>

      <!-- Partner column: nombre + código -->
      <template #body-cell-partner="props">
        <q-td :props="props"> {{ props.row.partnerName }} ({{ props.row.partnerCode }}) </q-td>
      </template>

      <!-- Estado del vínculo -->
      <template #body-cell-status="props">
        <q-td :props="props">
          <q-chip
            dense
            :color="linkStatusColor(props.row.status)"
            text-color="white"
            :label="linkStatusLabel(props.row.status)"
          />
        </q-td>
      </template>

      <!-- Beneficio: tipo + estado -->
      <template #body-cell-beneficio="props">
        <q-td :props="props"> {{ benefitLabel(props.row) }} </q-td>
      </template>

      <!-- Comisión: monto + moneda + estado -->
      <template #body-cell-comision="props">
        <q-td :props="props">
          <template v-if="props.row.commissionId !== null">
            {{
              formatPrice(props.row.commissionAmount ?? 0, props.row.commissionCurrency ?? 'ARS')
            }}
            ({{ commissionStatusLabel(props.row.commissionStatus) }})
          </template>
          <span v-else class="text-grey-5">Sin comisión</span>
        </q-td>
      </template>
    </q-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { formatPrice } from 'src/utils/format-price';
import {
  usePartnersApi,
  type ConversionRow,
  type ConversionFilters,
  type PartnerLinkStatus,
  type PartnerCommissionStatus,
} from 'src/composables/usePartnersApi';

const log = createLogger('PartnerConversionsTable');
const partnersApi = usePartnersApi();

const rows = ref<ConversionRow[]>([]);
const loading = ref(false);

const filters = ref<ConversionFilters>({
  partnerId: undefined,
  status: undefined,
  dateFrom: undefined,
  dateTo: undefined,
});

const STATUS_OPTIONS: Array<{ label: string; value: PartnerLinkStatus }> = [
  { label: 'Pendiente', value: 'pending' },
  { label: 'Cualificado', value: 'qualified' },
  { label: 'Revocado', value: 'revoked' },
];

// =========================================================================
// Partner options (para el filtro) — carga propia, independiente de la
// tabla CRUD de la página: este componente es self-contained.
// =========================================================================

const partnerOptions = ref<Array<{ label: string; value: number }>>([]);

async function loadPartnerOptions() {
  try {
    const partners = await partnersApi.listPartners();
    partnerOptions.value = partners.map((p) => ({ label: `${p.name} (${p.code})`, value: p.id }));
  } catch (err: unknown) {
    log.error('Error loading partner options', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =========================================================================
// Table columns
// =========================================================================

const columns: QTableProps['columns'] = [
  { name: 'referredName', label: 'Socio', field: 'referredName', align: 'left', sortable: true },
  { name: 'partner', label: 'Partner', field: 'partnerName', align: 'left', sortable: true },
  {
    name: 'createdAt',
    label: 'Fecha de vínculo',
    field: (row) => formatDate(row.createdAt),
    align: 'left',
    sortable: true,
  },
  { name: 'status', label: 'Estado del vínculo', field: 'status', align: 'center' },
  { name: 'beneficio', label: 'Beneficio', field: 'benefitType', align: 'left' },
  { name: 'comision', label: 'Comisión', field: 'commissionAmount', align: 'right' },
];

// =========================================================================
// Display helpers
// =========================================================================

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR');
}

function linkStatusColor(status: PartnerLinkStatus): string {
  switch (status) {
    case 'qualified':
      return 'positive';
    case 'revoked':
      return 'negative';
    case 'pending':
    default:
      return 'info';
  }
}

function linkStatusLabel(status: PartnerLinkStatus): string {
  switch (status) {
    case 'qualified':
      return 'Cualificado';
    case 'revoked':
      return 'Revocado';
    case 'pending':
    default:
      return 'Pendiente';
  }
}

function benefitStatusLabel(status: ConversionRow['benefitStatus']): string {
  switch (status) {
    case 'consumed':
      return 'consumido';
    case 'expired':
      return 'vencido';
    case 'pending':
    default:
      return 'pendiente';
  }
}

function benefitLabel(row: ConversionRow): string {
  const type = row.benefitType === 'free_pass' ? 'Semana gratis' : 'Descuento primera cuota';
  return `${type} (${benefitStatusLabel(row.benefitStatus)})`;
}

function commissionStatusLabel(status: PartnerCommissionStatus | null): string {
  switch (status) {
    case 'settled':
      return 'liquidada';
    case 'void':
      return 'anulada';
    case 'pending':
    default:
      return 'pendiente';
  }
}

// =========================================================================
// Data loading
// =========================================================================

async function loadConversions() {
  loading.value = true;
  try {
    rows.value = await partnersApi.listConversions(filters.value);
  } catch (err: unknown) {
    log.error('Error loading conversions', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadPartnerOptions();
  loadConversions();
});
</script>
