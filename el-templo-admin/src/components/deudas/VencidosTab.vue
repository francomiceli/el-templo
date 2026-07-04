<template>
  <div>
    <!-- Filters row — sin moneda ni export (D-06: es un lead, no una deuda). -->
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

    <!-- Tabla read-only (D-13): sin acciones por fila, sin monto (D-06). Orden -->
    <!-- default = vencimiento más reciente primero (menor daysOverdue), ya       -->
    <!-- garantizado por el backend (plan 153-02, daysOverdue ASC).               -->
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
      <template #body-cell-vencimiento="props">
        <q-td :props="props">
          {{ formatDate(props.row.expiryDate) }}
        </q-td>
      </template>
      <template #no-data>
        <div class="full-width row q-py-md justify-center text-grey-6">
          No hay socios con plan vencido sin renovar
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
import { formatDate } from 'src/utils/format-date';
import { createLogger } from 'src/utils/logger';
import type {
  ExpiredMemberRow,
  ExpiredMembersFilters,
  ExpiredMembersResult,
} from 'src/types/transaction';

interface BranchOption {
  label: string;
  value: number | undefined;
}

interface Props {
  branchOptions: BranchOption[];
  countryScope: 'AR' | 'ES' | undefined;
}

const props = defineProps<Props>();

const $q = useQuasar();
const log = createLogger('VencidosTab');
const api = useTransactionsApi();

const PAGE_SIZE = 50;

const filters = reactive<{
  branchId: number | null;
  search: string | null;
}>({ branchId: null, search: '' });

const items = ref<ExpiredMemberRow[]>([]);
const total = ref(0);
const currentPage = ref(1);
const loading = ref(false);

const hasMore = computed(() => items.value.length < total.value);

// Sin monto (D-06): nombre, teléfono, plan vencido, fecha de vencimiento y
// días transcurridos — es un lead de renovación, no una deuda.
const columns = [
  {
    name: 'miembro',
    label: 'Nombre',
    field: 'memberName',
    align: 'left' as const,
    sortable: false,
  },
  {
    name: 'telefono',
    label: 'Teléfono',
    field: (r: ExpiredMemberRow) => r.memberPhone ?? '—',
    align: 'left' as const,
    sortable: false,
  },
  {
    name: 'plan',
    label: 'Plan vencido',
    field: 'planName',
    align: 'left' as const,
    sortable: false,
  },
  {
    name: 'vencimiento',
    label: 'Fecha de vencimiento',
    field: 'expiryDate',
    align: 'center' as const,
    sortable: false,
  },
  {
    name: 'dias',
    label: 'Días transcurridos',
    field: 'daysOverdue',
    align: 'right' as const,
    sortable: false,
  },
];

function rowKey(r: ExpiredMemberRow): number {
  return r.userId;
}

function currentFilters(): ExpiredMembersFilters {
  return {
    branchId: filters.branchId ?? undefined,
    country: props.countryScope,
    search: filters.search?.trim() ? filters.search.trim() : undefined,
  };
}

// WR-07: request token guards against out-of-order responses (same pattern as
// PorDeudaTab). A filter change fires load(true) while a "Cargar más"
// load(false) may still be in flight; only the latest request may mutate state,
// otherwise the append could mix pages or duplicate rows (row-key collision).
let requestSeq = 0;

async function load(reset = true): Promise<void> {
  const seq = ++requestSeq;
  loading.value = true;
  try {
    const page = reset ? 1 : currentPage.value + 1;
    const res: ExpiredMembersResult = await api.getExpiredMembers({
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
  } catch (err: unknown) {
    if (seq !== requestSeq) return; // stale error — a newer load() superseded it
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Failed to load Vencidos', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

function loadMore(): Promise<void> {
  return load(false);
}

watch(
  () => [filters.branchId, filters.search],
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
