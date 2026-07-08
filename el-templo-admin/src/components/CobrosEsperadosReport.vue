<template>
  <div>
    <div class="text-body2 text-grey-7 q-mb-md">
      Saldos de planes <strong>programados a futuro</strong> que aún no arrancaron. No son deuda
      cobrable hoy: es plata que se espera recibir cuando cada plan comience.
    </div>

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
    </div>

    <!-- Totales por mes de inicio -->
    <template v-if="isOwner && currencyKeys.length > 0">
      <div v-for="(cur, idx) in currencyKeys" :key="cur" :class="idx > 0 ? 'q-mt-md' : ''">
        <div class="text-subtitle1 q-mb-sm">Esperado por mes de inicio ({{ cur }})</div>
        <MonthlyTotalsRow :totals="monthlyTotalsByCurrency[cur] ?? []" :currency="cur" />
      </div>
    </template>
    <template v-else>
      <div class="text-subtitle1 q-mb-sm">Esperado por mes de inicio</div>
      <MonthlyTotalsRow :totals="monthlyTotalsFlat" :currency="displayCurrency" />
    </template>

    <!-- Tabla detallada -->
    <q-table
      :rows="items"
      :columns="columns"
      :row-key="rowKey"
      :loading="loading"
      flat
      bordered
      class="q-mt-md"
      :pagination="{ rowsPerPage: 0 }"
      hide-pagination
    >
      <template #body-cell-monto="props">
        <q-td :props="props">
          {{ formatPrice(props.row.amount, props.row.currency) }}
        </q-td>
      </template>
      <template #body-cell-inicio="props">
        <q-td :props="props">
          {{ formatDate(props.row.startDate) }}
        </q-td>
      </template>
      <template #no-data>
        <div class="full-width row q-py-md justify-center text-grey-6">
          No hay planes programados a futuro
        </div>
      </template>
    </q-table>

    <div v-if="hasMore" class="row justify-center q-mt-md">
      <q-btn label="Cargar más" color="primary" flat :loading="loading" @click="loadMore" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, h } from 'vue';
import { useQuasar, QCard, QCardSection } from 'quasar';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import { formatPrice } from 'src/utils/format-price';
import { formatDate } from 'src/utils/format-date';
import { createLogger } from 'src/utils/logger';
import type {
  ScheduledIncomeRow,
  MonthlyIncomeTotal,
  ScheduledIncomeFilters,
  ScheduledIncomeResult,
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
const log = createLogger('CobrosEsperadosReport');
const api = useTransactionsApi();

const CURRENCY_OPTIONS = ['ARS', 'EUR'];
const PAGE_SIZE = 50;

// Fila de tarjetas con el total esperado por mes (functional inline component).
const MonthlyTotalsRow = (p: { totals: MonthlyIncomeTotal[]; currency: string }) => {
  if (p.totals.length === 0) {
    return h('div', { class: 'text-grey-6 q-mb-md' }, 'Sin cobros programados');
  }
  return h(
    'div',
    { class: 'row q-gutter-sm q-mb-md' },
    p.totals.map((t) =>
      h(QCard, { flat: true, bordered: true, class: 'col-auto' }, () =>
        h(QCardSection, () => [
          h('div', { class: 'text-caption text-grey-7' }, t.label),
          h('div', { class: 'text-h6' }, formatPrice(t.amount, p.currency)),
        ])
      )
    )
  );
};

const filters = reactive<{
  branchId: number | null;
  currency: string | null;
  search: string | null;
}>({ branchId: null, currency: null, search: '' });

const items = ref<ScheduledIncomeRow[]>([]);
const total = ref(0);
const currentPage = ref(1);
const loading = ref(false);
const monthlyTotalsFlat = ref<MonthlyIncomeTotal[]>([]);
const monthlyTotalsByCurrency = ref<Record<string, MonthlyIncomeTotal[]>>({});
const currencyKeys = computed(() => Object.keys(monthlyTotalsByCurrency.value).sort());

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
    field: (r: ScheduledIncomeRow) => r.memberPhone ?? '—',
    align: 'left' as const,
    sortable: false,
  },
  {
    name: 'plan',
    label: 'Plan',
    field: 'planName',
    align: 'left' as const,
    sortable: false,
  },
  {
    name: 'sucursal',
    label: 'Sucursal',
    field: (r: ScheduledIncomeRow) => r.branchName ?? '—',
    align: 'left' as const,
    sortable: false,
  },
  {
    name: 'monto',
    label: 'Monto esperado',
    field: 'amount',
    align: 'right' as const,
    sortable: false,
  },
  {
    name: 'inicio',
    label: 'Fecha de inicio',
    field: 'startDate',
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

function rowKey(r: ScheduledIncomeRow): number {
  return r.subscriptionId;
}

function currentFilters(): ScheduledIncomeFilters {
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
    const res: ScheduledIncomeResult = await api.getScheduledIncome({
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

    const mt = res.monthlyTotals;
    if (Array.isArray(mt)) {
      monthlyTotalsFlat.value = mt;
      monthlyTotalsByCurrency.value = {};
    } else {
      monthlyTotalsByCurrency.value = mt;
      monthlyTotalsFlat.value = [];
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Failed to load Cobros esperados report', { error: message });
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
</script>
