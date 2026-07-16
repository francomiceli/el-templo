<!-- Tab "Sugerencias" de Feedback (ex PropuestasPage, brief 2026-07-15): cada
     fila es una sugerencia de texto libre enviada por un socio desde la app.
     Los filtros fecha/sucursal llegan por prop desde FeedbackPage; acá quedan
     la palabra clave y el export xlsx con los filtros aplicados (el export se
     baja periódicamente y se procesa con IA para detectar temas repetidos). -->
<template>
  <div>
    <!-- Palabra clave (busca dentro del texto de la sugerencia, p. ej.
         "paralelas" para agrupar pedidos del mismo tema) + export. -->
    <div class="row q-gutter-sm q-mb-md items-center">
      <q-input
        v-model="keywordInput"
        label="Palabra clave"
        outlined
        dense
        clearable
        debounce="400"
        class="col-12 col-sm-4"
      >
        <template #prepend>
          <q-icon name="search" />
        </template>
      </q-input>
      <q-space />
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

    <q-banner v-if="error" class="bg-red-1 text-red-9 q-mb-md" dense>
      {{ error }}
    </q-banner>

    <!-- Empty state -->
    <div v-if="!loading && rows.length === 0" class="text-center q-pa-xl text-grey-7">
      <q-icon name="emoji_objects" size="48px" color="grey-5" class="q-mb-md" />
      <div class="text-h6 text-weight-medium">
        {{ hasActiveFilters ? 'Sin resultados para estos filtros' : 'Todavía no hay sugerencias' }}
      </div>
      <div class="text-body2 q-mt-sm" style="max-width: 480px; margin: 0 auto">
        {{
          hasActiveFilters
            ? 'Probá ampliar el rango de fechas o cambiar la palabra clave.'
            : 'Cuando los socios envíen sugerencias desde la app, van a aparecer acá.'
        }}
      </div>
    </div>

    <template v-else>
      <div class="row items-center q-mb-sm">
        <div class="text-subtitle1 text-weight-medium col">Sugerencias</div>
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
        no-data-label="Sin sugerencias"
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  useImprovementProposalsApi,
  type AdminProposalRow,
  type AdminProposalsFilters,
} from 'src/composables/useImprovementProposalsApi';
import { createLogger } from 'src/utils/logger';
import type { FeedbackFilters } from 'src/components/feedback/feedback-filters';

const props = defineProps<{ filters: FeedbackFilters }>();

const log = createLogger('FeedbackSugerenciasTab');
const $q = useQuasar();
const { loading, error, getProposals, exportProposals } = useImprovementProposalsApi();

const PAGE_SIZE = 50;

// La keyword va aparte con debounce: evita un request por tecla.
const keywordInput = ref<string | null>(null);

const rows = ref<AdminProposalRow[]>([]);
const total = ref(0);
const currentPage = ref(1);
const exporting = ref(false);

const hasMore = computed(() => rows.value.length < total.value);
const hasActiveFilters = computed(
  () =>
    props.filters.dateFrom !== null ||
    props.filters.dateTo !== null ||
    props.filters.branchId !== null ||
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
    label: 'Sugerencia',
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
    dateFrom: props.filters.dateFrom ?? undefined,
    dateTo: props.filters.dateTo ?? undefined,
    branchId: props.filters.branchId ?? undefined,
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
    a.download = `sugerencias-${today}.xlsx`;
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

watch(
  () => [props.filters.dateFrom, props.filters.dateTo, props.filters.branchId, keywordInput.value],
  () => {
    void load(true);
  }
);

onMounted(() => {
  void load(true);
});
</script>
