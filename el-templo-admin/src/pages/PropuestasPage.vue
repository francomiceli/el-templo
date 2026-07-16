<!-- Propuestas de mejora (brief 2026-07-15): cada fila es una propuesta de
     texto libre enviada por un socio desde la app. Filtros fecha/sucursal/
     palabra clave + export xlsx con los filtros aplicados (el export se baja
     periódicamente y se procesa con IA para detectar temas repetidos). -->
<template>
  <q-page padding>
    <div class="row items-center justify-between q-mb-md">
      <div class="text-h5">Propuestas de mejora</div>
      <div class="row q-gutter-sm">
        <q-btn
          outline
          color="primary"
          icon="download"
          label="Exportar"
          no-caps
          :loading="exporting"
          :disable="loading"
          @click="onExport"
        />
        <q-btn flat round dense icon="refresh" :loading="loading" @click="reload" />
      </div>
    </div>

    <!-- Filtros: rango de fechas (sobre la fecha de envío) + sucursal +
         palabra clave (busca dentro del texto de la propuesta, p. ej.
         "paralelas" para agrupar pedidos del mismo tema). -->
    <div class="row q-gutter-sm q-mb-md items-center">
      <q-input
        v-model="filters.dateFrom"
        type="date"
        label="Desde"
        outlined
        dense
        clearable
        class="col-6 col-sm-2"
      />
      <q-input
        v-model="filters.dateTo"
        type="date"
        label="Hasta"
        outlined
        dense
        clearable
        class="col-6 col-sm-2"
      />
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
        v-model="keywordInput"
        label="Palabra clave"
        outlined
        dense
        clearable
        debounce="400"
        class="col-12 col-sm-3"
      >
        <template #prepend>
          <q-icon name="search" />
        </template>
      </q-input>
    </div>

    <q-banner v-if="error" class="bg-red-1 text-red-9 q-mb-md" dense>
      {{ error }}
    </q-banner>

    <!-- Empty state -->
    <div v-if="!loading && rows.length === 0" class="text-center q-pa-xl text-grey-7">
      <q-icon name="emoji_objects" size="48px" color="grey-5" class="q-mb-md" />
      <div class="text-h6 text-weight-medium">
        {{ hasActiveFilters ? 'Sin resultados para estos filtros' : 'Todavía no hay propuestas' }}
      </div>
      <div class="text-body2 q-mt-sm" style="max-width: 480px; margin: 0 auto">
        {{
          hasActiveFilters
            ? 'Probá ampliar el rango de fechas o cambiar la palabra clave.'
            : 'Cuando los socios envíen propuestas de mejora desde la app, van a aparecer acá.'
        }}
      </div>
    </div>

    <template v-else>
      <div class="row items-center q-mb-sm">
        <div class="text-subtitle1 text-weight-medium col">Propuestas</div>
        <div class="text-caption text-grey-7 col-auto">{{ rows.length }} de {{ total }}</div>
      </div>

      <q-table
        :rows="rows"
        :columns="columns"
        row-key="id"
        :loading="loading"
        flat
        bordered
        wrap-cells
        :rows-per-page-options="[0]"
        hide-pagination
        no-data-label="Sin propuestas"
      >
        <template #body-cell-proposal="props">
          <q-td :props="props" style="max-width: 520px; white-space: pre-line">
            {{ props.row.proposal }}
          </q-td>
        </template>
      </q-table>

      <div v-if="hasMore" class="row justify-center q-mt-md">
        <q-btn label="Cargar más" color="primary" flat :loading="loading" @click="loadMore" />
      </div>
    </template>

    <q-inner-loading :showing="loading && rows.length === 0">
      <q-spinner-dots size="40px" color="primary" />
    </q-inner-loading>
  </q-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  useImprovementProposalsApi,
  type AdminProposalRow,
  type AdminProposalsFilters,
} from 'src/composables/useImprovementProposalsApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import { createLogger } from 'src/utils/logger';
import type { BranchOption } from 'src/types/member';

const log = createLogger('PropuestasPage');
const $q = useQuasar();
const { loading, error, getProposals, exportProposals } = useImprovementProposalsApi();
const membersApi = useMembersApi();

const PAGE_SIZE = 50;

const filters = reactive<{
  dateFrom: string | null;
  dateTo: string | null;
  branchId: number | null;
}>({ dateFrom: null, dateTo: null, branchId: null });

// La keyword va aparte con debounce: evita un request por tecla.
const keywordInput = ref<string | null>(null);

const rows = ref<AdminProposalRow[]>([]);
const total = ref(0);
const currentPage = ref(1);
const exporting = ref(false);
const branchOptions = ref<Array<{ label: string; value: number }>>([]);

const hasMore = computed(() => rows.value.length < total.value);
const hasActiveFilters = computed(
  () =>
    filters.dateFrom !== null ||
    filters.dateTo !== null ||
    filters.branchId !== null ||
    Boolean(keywordInput.value?.trim())
);

const columns = [
  {
    name: 'memberName',
    label: 'Socio',
    field: 'memberName',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'branchName',
    label: 'Sucursal',
    field: 'branchName',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'createdAt',
    label: 'Fecha y hora',
    field: 'createdAt',
    align: 'left' as const,
    sortable: true,
    format: (v: string) => formatDateTime(v),
  },
  {
    name: 'proposal',
    label: 'Propuesta',
    field: 'proposal',
    align: 'left' as const,
  },
];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function currentFilters(): Omit<AdminProposalsFilters, 'page' | 'limit'> {
  const keyword = keywordInput.value?.trim();
  return {
    dateFrom: filters.dateFrom ?? undefined,
    dateTo: filters.dateTo ?? undefined,
    branchId: filters.branchId ?? undefined,
    q: keyword || undefined,
  };
}

// Request token: un cambio de filtros dispara load(true) mientras un
// "Cargar más" puede estar en vuelo — solo la última respuesta muta estado.
let requestSeq = 0;

async function load(reset = true): Promise<void> {
  const seq = ++requestSeq;
  try {
    const page = reset ? 1 : currentPage.value + 1;
    const result = await getProposals({
      ...currentFilters(),
      page,
      limit: PAGE_SIZE,
    });
    if (seq !== requestSeq) return;
    if (reset) {
      rows.value = result.rows;
    } else {
      rows.value.push(...result.rows);
    }
    currentPage.value = result.page;
    total.value = result.total;
  } catch (err: unknown) {
    if (seq !== requestSeq) return;
    log.error('Failed to load proposals', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function reload(): Promise<void> {
  return load(true);
}

function loadMore(): Promise<void> {
  return load(false);
}

async function onExport(): Promise<void> {
  exporting.value = true;
  try {
    const blob = await exportProposals(currentFilters());
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().split('T')[0];
    a.download = `propuestas-mejora-${today}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    $q.notify({ type: 'positive', message: 'Exportación completada' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error exporting proposals', { error: message });
    $q.notify({ type: 'negative', message: 'Error al exportar' });
  } finally {
    exporting.value = false;
  }
}

async function fetchBranches(): Promise<void> {
  try {
    const branches = await membersApi.getBranches();
    branchOptions.value = branches.map((b: BranchOption) => ({ label: b.name, value: b.id }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching branches', { error: message });
  }
}

watch(
  () => [filters.dateFrom, filters.dateTo, filters.branchId, keywordInput.value],
  () => {
    void load(true);
  }
);

onMounted(() => {
  void fetchBranches();
  void load(true);
});
</script>
