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
              {{ formatPrice(bucketTotalsFlat[bucket], flatCurrency) }}
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
      <!-- Motivo (DEUDA-02): short structured reason; período subtitle (DEUDA-03) -->
      <!-- and free-text nota in a tooltip (D-11), never as its own column. -->
      <template #body-cell-motivo="props">
        <q-td :props="props">
          <div class="row items-center no-wrap">
            <span>{{ props.row.reasonLabel }}</span>
            <q-icon
              v-if="props.row.notes"
              name="sticky_note_2"
              size="16px"
              class="q-ml-xs text-grey-6"
            />
          </div>
          <div v-if="props.row.periodStart && props.row.periodEnd" class="text-caption text-grey-6">
            {{ formatPeriod(props.row.periodStart, props.row.periodEnd) }}
          </div>
          <q-tooltip v-if="props.row.notes" anchor="top middle" self="bottom middle">
            {{ props.row.notes }}
          </q-tooltip>
        </q-td>
      </template>
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
      <template #body-cell-fechaRegistro="props">
        <q-td :props="props">
          {{ formatDate(props.row.registeredAt) }}
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
const log = createLogger('PorDeudaTab');
const api = useTransactionsApi();

// Internal naming (D-01): aging / outstanding-balances. UI labels always
// in Spanish — the constants below are what the user actually sees.
const BUCKETS: DebtBucket[] = ['0-5', '6-10', '11-15', '15+'];
const BUCKET_LABELS_ES: Record<DebtBucket, string> = {
  '0-5': 'Hasta 5 días',
  '6-10': '6-10 días',
  '11-15': '11-15 días',
  '15+': '15+ días',
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
  '0-5': 0,
  '6-10': 0,
  '11-15': 0,
  '15+': 0,
});
const bucketTotalsByCurrency = ref<Record<string, BucketTotals>>({});
const currencyKeys = computed(() => Object.keys(bucketTotalsByCurrency.value).sort());

// WR-06: for non-owner the country selector is hidden and displayCurrency is
// hardcoded to 'ARS', but the backend returns the flat bucketTotals in THAT
// user's country currency (EUR for gestión ES). Derive the display currency
// from the data (all non-owner rows share one currency) so España no ve euros
// formateados como pesos. Falls back to displayCurrency when there are no rows.
const flatCurrency = computed<string>(() => items.value[0]?.currency ?? props.displayCurrency);

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
    name: 'motivo',
    label: 'Motivo',
    field: 'reasonLabel',
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
    name: 'fechaRegistro',
    label: 'Fecha de registro',
    field: 'registeredAt',
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
  if (b === '0-5') return 'positive';
  if (b === '6-10') return 'warning';
  if (b === '11-15') return 'orange';
  return 'negative';
}

function emptyBucketTotals(): BucketTotals {
  return { '0-5': 0, '6-10': 0, '11-15': 0, '15+': 0 };
}

// Period (DEUDA-03) as a dd/mm–dd/mm range under the motivo. Inputs are ISO
// YYYY-MM-DD; render locale-free short day/month to keep the cell compact.
function formatPeriod(start: string, end: string): string {
  return `${toDDMM(start)}–${toDDMM(end)}`;
}

function toDDMM(iso: string): string {
  const [, month, day] = iso.split('-');
  return day !== undefined && month !== undefined ? `${day}/${month}` : iso;
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

// WR-07: request token guards against out-of-order responses. A filter change
// fires load(true) while a "Cargar más" load(false) may still be in flight; if
// the older response resolves last, items.value.push(...) would mix pages from
// different filters or duplicate rows (row-key collision). Only the latest
// request is allowed to mutate state.
let requestSeq = 0;

async function load(reset = true): Promise<void> {
  const seq = ++requestSeq;
  loading.value = true;
  try {
    const page = reset ? 1 : currentPage.value + 1;
    const res: OutstandingBalancesResult = await api.getOutstandingBalances({
      ...currentFilters(),
      page,
      limit: PAGE_SIZE,
    });
    if (seq !== requestSeq) return; // stale response — a newer load() superseded it
    if (reset) {
      items.value = res.rows;
    } else {
      items.value.push(...res.rows);
    }
    currentPage.value = res.page;
    total.value = res.total;

    const bt = res.bucketTotals;
    // Discriminator: the flat shape is keyed by bucket strings ('0-5' …);
    // the per-currency shape is keyed by currency codes ('ARS', 'EUR' …).
    const looksFlat = Object.prototype.hasOwnProperty.call(bt, '0-5');
    if (looksFlat) {
      bucketTotalsFlat.value = bt as BucketTotals;
      bucketTotalsByCurrency.value = {};
    } else {
      bucketTotalsByCurrency.value = bt as Record<string, BucketTotals>;
      bucketTotalsFlat.value = emptyBucketTotals();
    }
  } catch (err: unknown) {
    if (seq !== requestSeq) return; // stale error — a newer load() superseded it
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Failed to load Deudas report', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    if (seq === requestSeq) loading.value = false;
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
