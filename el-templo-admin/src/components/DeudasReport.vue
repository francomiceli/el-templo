<template>
  <div>
    <!-- Filters row -->
    <div class="row q-gutter-sm q-mb-md items-center">
      <q-select
        v-model="filters.branchId"
        :options="branchOptions"
        emit-value
        map-options
        label="Sucursal"
        outlined
        dense
        clearable
        class="col-12 col-sm-3"
      />
      <q-select
        v-if="isOwner"
        v-model="filters.currency"
        :options="CURRENCY_OPTIONS"
        label="Moneda"
        outlined
        dense
        clearable
        class="col-12 col-sm-2"
      />
      <q-input
        v-model="filters.search"
        label="Buscar miembro"
        outlined
        dense
        clearable
        debounce="400"
        class="col-12 col-sm-3"
      />
      <q-space />
      <q-btn
        label="Exportar Excel"
        color="primary"
        icon="file_download"
        :loading="exporting"
        :disable="loading"
        @click="onExport"
      />
    </div>

    <!-- Cards: bucket totals (D-05 / D-06) -->
    <template v-if="isOwner && currencyKeys.length > 0">
      <div v-for="(cur, idx) in currencyKeys" :key="cur" :class="idx > 0 ? 'q-mt-md' : ''">
        <div class="text-subtitle1 q-mb-sm">Totales por antigüedad ({{ cur }})</div>
        <div class="row q-gutter-sm q-mb-md">
          <q-card v-for="bucket in BUCKETS" :key="bucket" flat bordered class="col">
            <q-card-section>
              <div class="text-caption text-grey-7">
                {{ BUCKET_LABELS_ES[bucket] }}
              </div>
              <div class="text-h6">
                {{ formatPrice((bucketTotalsByCurrency[cur] ?? emptyBucketTotals())[bucket], cur) }}
              </div>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </template>
    <template v-else>
      <div class="text-subtitle1 q-mb-sm">Totales por antigüedad</div>
      <div class="row q-gutter-sm q-mb-md">
        <q-card v-for="bucket in BUCKETS" :key="bucket" flat bordered class="col">
          <q-card-section>
            <div class="text-caption text-grey-7">
              {{ BUCKET_LABELS_ES[bucket] }}
            </div>
            <div class="text-h6">
              {{ formatPrice(bucketTotalsFlat[bucket], displayCurrency) }}
            </div>
          </q-card-section>
        </q-card>
      </div>
    </template>

    <!-- Tabla detallada -->
    <q-table
      :rows="items"
      :columns="columns"
      :row-key="rowKey"
      :loading="loading"
      flat
      bordered
      :pagination="{ rowsPerPage: 0 }"
      hide-pagination
    >
      <template #body-cell-monto="props">
        <q-td :props="props">
          {{ formatPrice(props.row.amount, props.row.currency) }}
        </q-td>
      </template>
      <template #body-cell-bucket="props">
        <q-td :props="props">
          <q-badge :color="bucketColor(props.row.bucket)">
            {{ BUCKET_LABELS_ES[props.row.bucket as DebtBucket] }}
          </q-badge>
        </q-td>
      </template>
      <template #body-cell-fechaDevengo="props">
        <q-td :props="props">
          {{ formatDate(props.row.effectiveDate) }}
        </q-td>
      </template>
      <template #no-data>
        <div class="full-width row q-py-md justify-center text-grey-6">
          No hay deudas pendientes
        </div>
      </template>
    </q-table>

    <div v-if="hasMore" class="row justify-center q-mt-md">
      <q-btn label="Cargar más" color="primary" flat :loading="loading" @click="loadMore" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useQuasar } from 'quasar';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import { formatPrice } from 'src/utils/format-price';
import { formatDate } from 'src/utils/format-date';
import { createLogger } from 'src/utils/logger';
import type {
  DebtBucket,
  OutstandingBalanceRow,
  BucketTotals,
  OutstandingBalancesFilters,
  OutstandingBalancesResult,
} from 'src/types/transaction';

interface BranchOption {
  label: string;
  value: number | undefined;
}

interface Props {
  branchOptions: BranchOption[];
  displayCurrency: 'ARS' | 'EUR';
  countryScope: 'AR' | 'ES' | undefined;
  isOwner: boolean;
}

const props = defineProps<Props>();

const $q = useQuasar();
const log = createLogger('DeudasReport');
const api = useTransactionsApi();

// Internal naming (D-01): aging / outstanding-balances. UI labels always
// in Spanish — the constants below are what the user actually sees.
const BUCKETS: DebtBucket[] = ['0-30', '31-60', '61-90', '90+'];
const BUCKET_LABELS_ES: Record<DebtBucket, string> = {
  '0-30': 'Hasta 30 días',
  '31-60': '31-60 días',
  '61-90': '61-90 días',
  '90+': '90+ días',
};
const CURRENCY_OPTIONS = ['ARS', 'EUR'];
const PAGE_SIZE = 50;

const filters = reactive<{
  branchId: number | null;
  currency: string | null;
  search: string | null;
}>({ branchId: null, currency: null, search: '' });

const items = ref<OutstandingBalanceRow[]>([]);
const total = ref(0);
const currentPage = ref(1);
const loading = ref(false);
const exporting = ref(false);
const bucketTotalsFlat = ref<BucketTotals>({
  '0-30': 0,
  '31-60': 0,
  '61-90': 0,
  '90+': 0,
});
const bucketTotalsByCurrency = ref<Record<string, BucketTotals>>({});
const currencyKeys = computed(() => Object.keys(bucketTotalsByCurrency.value).sort());

const hasMore = computed(() => items.value.length < total.value);

const columns = [
  {
    name: 'miembro',
    label: 'Miembro',
    field: 'memberName',
    align: 'left' as const,
    sortable: false,
  },
  {
    name: 'telefono',
    label: 'Teléfono',
    field: (r: OutstandingBalanceRow) => r.memberPhone ?? '—',
    align: 'left' as const,
    sortable: false,
  },
  {
    name: 'concepto',
    label: 'Plan/Concepto',
    field: 'conceptLabel',
    align: 'left' as const,
    sortable: false,
  },
  {
    name: 'sucursal',
    label: 'Sucursal',
    field: (r: OutstandingBalanceRow) => r.branchName ?? '—',
    align: 'left' as const,
    sortable: false,
  },
  {
    name: 'monto',
    label: 'Monto',
    field: 'amount',
    align: 'right' as const,
    sortable: false,
  },
  {
    name: 'antiguedad',
    label: 'Antigüedad (días)',
    field: 'ageInDays',
    align: 'right' as const,
    sortable: false,
  },
  {
    name: 'bucket',
    label: 'Antigüedad',
    field: 'bucket',
    align: 'center' as const,
    sortable: false,
  },
  {
    name: 'fechaDevengo',
    label: 'Fecha devengo',
    field: 'effectiveDate',
    align: 'center' as const,
    sortable: false,
  },
  {
    name: 'moneda',
    label: 'Moneda',
    field: 'currency',
    align: 'center' as const,
    sortable: false,
  },
];

function bucketColor(b: DebtBucket): string {
  if (b === '0-30') return 'positive';
  if (b === '31-60') return 'warning';
  if (b === '61-90') return 'orange';
  return 'negative';
}

function emptyBucketTotals(): BucketTotals {
  return { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
}

function rowKey(r: OutstandingBalanceRow): string {
  return `${r.targetKind}:${r.targetId}`;
}

function currentFilters(): OutstandingBalancesFilters {
  return {
    branchId: filters.branchId ?? undefined,
    country: props.countryScope,
    currency: filters.currency ?? undefined,
    search: filters.search?.trim() ? filters.search.trim() : undefined,
  };
}

async function load(reset = true): Promise<void> {
  loading.value = true;
  try {
    const page = reset ? 1 : currentPage.value + 1;
    const res: OutstandingBalancesResult = await api.getOutstandingBalances({
      ...currentFilters(),
      page,
      limit: PAGE_SIZE,
    });
    if (reset) {
      items.value = res.rows;
    } else {
      items.value.push(...res.rows);
    }
    currentPage.value = res.page;
    total.value = res.total;

    const bt = res.bucketTotals;
    // Discriminator: the flat shape is keyed by bucket strings ('0-30' …);
    // the per-currency shape is keyed by currency codes ('ARS', 'EUR' …).
    const looksFlat = Object.prototype.hasOwnProperty.call(bt, '0-30');
    if (looksFlat) {
      bucketTotalsFlat.value = bt as BucketTotals;
      bucketTotalsByCurrency.value = {};
    } else {
      bucketTotalsByCurrency.value = bt as Record<string, BucketTotals>;
      bucketTotalsFlat.value = emptyBucketTotals();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Failed to load Deudas report', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    loading.value = false;
  }
}

function loadMore(): Promise<void> {
  return load(false);
}

watch(
  () => [filters.branchId, filters.currency, filters.search],
  () => {
    void load(true);
  }
);

watch(
  () => props.countryScope,
  () => {
    void load(true);
  }
);

onMounted(() => {
  void load(true);
});

// Server-side Excel export (Plan 109-04 redirection — backend renders
// the .xlsx, admin only triggers download via Blob → object URL).
async function onExport(): Promise<void> {
  exporting.value = true;
  try {
    const blob = await api.exportOutstandingBalancesToExcel(currentFilters());
    const today = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `deudas-${today}.xlsx`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Deudas export failed', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    exporting.value = false;
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
</script>
