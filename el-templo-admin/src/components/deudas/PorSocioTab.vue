<template>
  <div>
    <div class="text-body2 text-grey-7 q-mb-md">
      Buscá al alumno y cobrale exactamente el monto indicado.
    </div>

    <q-input
      v-model="search"
      outlined
      dense
      clearable
      debounce="350"
      placeholder="Buscar por nombre"
      class="q-mb-md"
      style="max-width: 400px"
    >
      <template #prepend>
        <q-icon name="search" />
      </template>
    </q-input>

    <q-banner v-if="error" class="bg-red-1 text-red-9 q-mb-md" dense>
      {{ error }}
    </q-banner>

    <q-table
      :rows="rows"
      :columns="columns"
      row-key="rowKey"
      :loading="loading"
      flat
      bordered
      :rows-per-page-options="[0]"
      hide-pagination
      :no-data-label="noDataLabel"
    >
      <template #body-cell-amount="props">
        <q-td :props="props" class="text-right text-weight-medium">
          {{ formatPrice(props.row.totalAmount, props.row.currency) }}
        </q-td>
      </template>
    </q-table>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { formatPrice } from 'src/utils/format-price';
import { useCoachApi, type CoachOutstandingBalanceRow } from 'src/composables/useCoachApi';
import { createLogger } from 'src/utils/logger';

const log = createLogger('PorSocioTab');
const { loading, error, getOutstandingBalances } = useCoachApi();

const search = ref('');
const rows = ref<Array<CoachOutstandingBalanceRow & { rowKey: string }>>([]);

const columns = [
  {
    name: 'memberName',
    label: 'Nombre',
    field: 'memberName',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'memberPhone',
    label: 'Teléfono',
    field: (r: CoachOutstandingBalanceRow) => r.memberPhone ?? '—',
    align: 'left' as const,
  },
  {
    name: 'amount',
    label: 'Monto a cobrar',
    field: 'totalAmount',
    align: 'right' as const,
    sortable: true,
  },
];

const noDataLabel = computed(() =>
  search.value.trim().length > 0
    ? 'Sin resultados para esta búsqueda'
    : 'No hay deudas activas para cobrar'
);

async function reload() {
  try {
    const params = search.value.trim().length > 0 ? { search: search.value } : {};
    const result = await getOutstandingBalances(params);
    rows.value = result.rows.map((r) => ({
      ...r,
      // q-table needs a stable unique key — same member can appear once per
      // currency, so combine both.
      rowKey: `${r.memberId}-${r.currency}`,
    }));
  } catch (err) {
    log.error('Failed to load coach outstanding balances', err);
  }
}

watch(search, () => {
  void reload();
});

onMounted(() => {
  void reload();
});
</script>
