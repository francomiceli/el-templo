<template>
  <div v-if="props.loading" class="q-pa-md">
    <q-skeleton type="rect" height="300px" class="q-mb-md" />
    <q-skeleton type="rect" height="200px" />
  </div>
  <div v-else-if="!props.data" class="text-center q-pa-xl text-grey-5 text-italic">
    No hay datos para el periodo seleccionado
  </div>
  <template v-else>
    <!-- Check-in low-adoption warning banner per sede (D-04) -->
    <q-banner
      v-for="row in lowAdoptionBranches"
      :key="row.branchId"
      dense
      rounded
      class="bg-orange-2 text-orange-10 q-mb-md"
    >
      <template #avatar>
        <q-icon name="warning" color="orange-9" />
      </template>
      Adopción de check-in baja en {{ row.branchName }}: los datos de frecuencia de esta sede pueden
      no ser confiables.
    </q-banner>

    <!-- Bandas de frecuencia (Doughnut) -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div class="text-subtitle2 q-mb-sm">Bandas de frecuencia</div>
        <div style="height: 300px; position: relative">
          <Doughnut :data="distributionData" :options="doughnutChartOptions" />
        </div>
      </q-card-section>
    </q-card>

    <!-- Lista accionable "enfriándose" (D-04 / D-13 / D-14) -->
    <q-card flat bordered>
      <q-card-section>
        <div class="row items-center justify-between q-mb-sm">
          <div class="text-subtitle2">Miembros enfriándose</div>
          <q-btn
            color="primary"
            icon="download"
            label="Exportar CSV"
            outline
            dense
            :disable="props.data.coolingDown.length === 0"
            @click="onExport"
          />
        </div>
        <q-table
          v-if="props.data.coolingDown.length > 0"
          :rows="props.data.coolingDown"
          :columns="coolingColumns"
          row-key="userId"
          flat
          dense
          :pagination="{ rowsPerPage: 10 }"
        >
          <template #body-cell-nombre="slotProps">
            <q-td :props="slotProps">
              <router-link
                :to="`/alumnos/${slotProps.row.userId}`"
                class="text-primary text-weight-medium no-underline"
              >
                {{ slotProps.row.name }}
              </router-link>
            </q-td>
          </template>
          <template #body-cell-telefono="slotProps">
            <q-td :props="slotProps">
              <a
                v-if="slotProps.row.phone"
                :href="`tel:${slotProps.row.phone}`"
                class="text-primary"
              >
                {{ slotProps.row.phone }}
              </a>
              <span v-else class="text-grey-5">—</span>
            </q-td>
          </template>
          <template #body-cell-banda="slotProps">
            <q-td :props="slotProps">
              {{ bandLabel(slotProps.row.currentBand) }}
              <q-icon name="arrow_back" size="xs" class="q-mx-xs text-grey-6" />
              {{ bandLabel(slotProps.row.priorBand) }}
            </q-td>
          </template>
          <template #body-cell-variacion="slotProps">
            <q-td :props="slotProps">
              <span v-if="slotProps.row.pctVariacion !== null" class="text-negative">
                {{ slotProps.row.pctVariacion.toFixed(0) }}%
              </span>
              <span v-else class="text-grey-5">—</span>
            </q-td>
          </template>
        </q-table>
        <div v-else class="text-center q-pa-md text-grey-5 text-italic">
          No hay miembros enfriándose en este periodo
        </div>
      </q-card-section>
    </q-card>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useQuasar } from 'quasar';
import { Chart as ChartJS, ArcElement, Title, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'vue-chartjs';
import { chartColors } from 'src/utils/chart-colors';
import { createLogger } from 'src/utils/logger';
import type {
  FrequencyAnalytics,
  FrequencyBand,
  FrequencyCoolingRow,
  CheckInAdoptionRow,
} from 'src/types/analytics';

// -- Register Chart.js components ----------------------------------------

ChartJS.register(ArcElement, Title, Tooltip, Legend);

// -- Props ---------------------------------------------------------------

const props = defineProps<{
  data: FrequencyAnalytics | null;
  loading: boolean;
}>();

const $q = useQuasar();
const log = createLogger('FrecuenciaTab');

// -- Band labels ---------------------------------------------------------

const BAND_LABELS: Record<FrequencyBand, string> = {
  inactivo: 'Inactivo',
  bajo: 'Bajo',
  medio: 'Medio',
  alto: 'Alto',
};

function bandLabel(band: FrequencyBand): string {
  return BAND_LABELS[band];
}

// -- Bandas distribution (Doughnut) --------------------------------------

const distributionData = computed(() => {
  const dist = props.data?.distribution ?? [];
  return {
    labels: dist.map((d) => bandLabel(d.band)),
    datasets: [
      {
        data: dist.map((d) => d.count.nominal),
        backgroundColor: dist.map((_, i) => chartColors[i % chartColors.length]),
      },
    ],
  };
});

const doughnutChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'right' as const, labels: { boxWidth: 12 } },
  },
};

// -- Check-in adoption warnings (ratio < 0.5) ----------------------------

const lowAdoptionBranches = computed<CheckInAdoptionRow[]>(() =>
  (props.data?.checkInAdoption ?? []).filter((r) => r.ratio < 0.5)
);

// -- Cooling-down table columns ------------------------------------------

const coolingColumns = [
  { name: 'nombre', label: 'Nombre', field: 'name', align: 'left' as const, sortable: true },
  { name: 'telefono', label: 'Teléfono', field: 'phone', align: 'left' as const },
  {
    name: 'banda',
    label: 'Banda actual ← previa',
    field: 'currentBand',
    align: 'left' as const,
  },
  {
    name: 'variacion',
    label: '% variación',
    field: 'pctVariacion',
    align: 'right' as const,
    sortable: true,
  },
];

// -- CSV export (client-side, D-14) --------------------------------------

/**
 * Escape one CSV field: neutralize spreadsheet formula injection (a leading
 * =,+,-,@ is prefixed with a single quote so Excel/Sheets do not execute it),
 * then wrap in double quotes and escape embedded quotes (RFC-4180). Newlines
 * survive inside the quoting.
 */
function csvField(value: string): string {
  let v = value;
  if (/^[=+\-@]/.test(v)) {
    v = `'${v}`;
  }
  return `"${v.replace(/"/g, '""')}"`;
}

function coolingToCsv(rows: FrequencyCoolingRow[]): string {
  const header = ['Nombre', 'Teléfono', 'Banda actual', 'Banda previa', '% variación'];
  const lines = [header.map(csvField).join(',')];
  for (const row of rows) {
    const variacion = row.pctVariacion === null ? '' : `${row.pctVariacion.toFixed(0)}%`;
    lines.push(
      [
        csvField(row.name),
        csvField(row.phone ?? ''),
        csvField(bandLabel(row.currentBand)),
        csvField(bandLabel(row.priorBand)),
        csvField(variacion),
      ].join(',')
    );
  }
  return lines.join('\r\n');
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

function onExport(): void {
  try {
    const rows = props.data?.coolingDown ?? [];
    if (rows.length === 0) return;
    const csv = coolingToCsv(rows);
    // Prepend a UTF-8 BOM so Excel renders accented names correctly.
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
    const today = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `frecuencia-enfriandose-${today}.csv`);
    $q.notify({ type: 'positive', message: 'Exportación completada', timeout: 1500 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al exportar';
    log.error('Failed to export cooling-down CSV', { error: message });
    $q.notify({ type: 'negative', message: 'Error al exportar' });
  }
}
</script>
