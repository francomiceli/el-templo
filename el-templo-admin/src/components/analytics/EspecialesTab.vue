<!-- Reporte de reparto "Actividades con Aura" (REP-01, Phase 162-06). Asistencias
     del mes a las actividades especiales, separadas por origen socio/externo — insumo
     del reparto manual a los profes, SIN importes (D-04). Suma los KPIs D-05 de
     suscripciones especiales activas por origen. Acento dorado "Aura" (Aged Gold),
     reservado a esta superficie. Naming lock D-01: "Especiales", jamás jerga interna. -->
<template>
  <div>
    <!-- Encabezado + selector de mes + export -->
    <div class="row items-center q-mb-md q-col-gutter-md">
      <div class="col">
        <div class="text-subtitle2 especiales__title">
          <q-icon name="auto_awesome" size="20px" class="q-mr-xs" />
          Asistencias a Especiales — {{ monthLabel }}
        </div>
        <div class="text-caption text-grey-7" style="max-width: 640px">
          Asistencias a las Actividades con Aura del mes, separadas por origen socio / externo.
          Insumo para el reparto manual a los profes.
        </div>
      </div>
      <div class="col-auto">
        <q-select
          :model-value="month"
          :options="monthOptions"
          emit-value
          map-options
          dense
          outlined
          label="Mes"
          style="min-width: 160px"
          @update:model-value="onMonthChange"
        />
      </div>
      <div class="col-auto">
        <q-btn
          outline
          no-caps
          color="warning"
          icon="download"
          label="Exportar"
          :loading="exporting"
          :disable="loading"
          @click="onExport"
        />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="row q-col-gutter-md">
      <div v-for="n in 2" :key="n" class="col-12 col-sm-6 col-md-4">
        <q-card flat bordered>
          <q-card-section>
            <q-skeleton type="text" width="60%" />
            <q-skeleton type="text" width="30%" class="q-mt-sm" />
          </q-card-section>
        </q-card>
      </div>
      <div class="col-12">
        <q-skeleton type="rect" height="180px" class="q-mt-md" />
      </div>
    </div>

    <!-- Data -->
    <template v-else-if="data">
      <!-- KPIs D-05: suscripciones especiales activas por origen -->
      <div class="row q-col-gutter-md q-mb-lg">
        <div class="col-12 col-sm-6 col-md-4">
          <q-card flat bordered class="especiales__kpi">
            <q-card-section>
              <div class="text-h4">{{ data.kpis.sociosActivos }}</div>
              <div class="text-caption text-grey-7">Socios con plan especial activo</div>
            </q-card-section>
          </q-card>
        </div>
        <div class="col-12 col-sm-6 col-md-4">
          <q-card flat bordered class="especiales__kpi">
            <q-card-section>
              <div class="text-h4">{{ data.kpis.externosActivos }}</div>
              <div class="text-caption text-grey-7">Externos con plan especial activo</div>
            </q-card-section>
          </q-card>
        </div>
      </div>

      <!-- Tabla de asistencias por actividad (sin importes) -->
      <q-table
        v-if="data.rows.length"
        flat
        bordered
        :rows="data.rows"
        :columns="columns"
        row-key="activityId"
        hide-pagination
        :pagination="{ rowsPerPage: 0 }"
      >
        <template #bottom-row>
          <q-tr class="text-weight-medium">
            <q-td>Total</q-td>
            <q-td class="text-right">{{ totals.socio }}</q-td>
            <q-td class="text-right">{{ totals.externo }}</q-td>
            <q-td class="text-right">{{ totals.total }}</q-td>
          </q-tr>
        </template>
      </q-table>

      <!-- Empty state -->
      <div v-else class="text-grey-6 q-pa-md text-center">
        No hubo asistencias a actividades especiales en {{ monthLabel }}.
      </div>
    </template>

    <div v-else class="text-grey-6">Sin datos todavía.</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import type { EspecialesReport } from 'src/types/analytics';
import { useAnalyticsApi } from 'src/composables/useAnalyticsApi';
import { extractError } from 'src/utils/extract-error';
import { createLogger } from 'src/utils/logger';

const props = defineProps<{
  data: EspecialesReport | null;
  loading: boolean;
  /** Mes seleccionado, formato YYYY-MM. Manejado por el padre (v-model:month). */
  month: string;
}>();

const emit = defineEmits<{
  (e: 'update:month', value: string): void;
  (e: 'change'): void;
}>();

const q = useQuasar();
const analyticsApi = useAnalyticsApi();
const log = createLogger('EspecialesTab');

const exporting = ref(false);

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function bucketLabel(bucket: string): string {
  const [year, m] = bucket.split('-').map(Number);
  if (!year || !m || m < 1 || m > 12) return bucket;
  return MONTH_NAMES[m - 1] + ' ' + year;
}

const monthLabel = computed(() => bucketLabel(props.month));

// Últimos 12 meses (incluye el mes en curso) como opciones del selector.
const monthOptions = computed(() => {
  const opts: Array<{ label: string; value: string }> = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const dt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const bucket = dt.toISOString().slice(0, 7);
    opts.push({ label: bucketLabel(bucket), value: bucket });
  }
  return opts;
});

const columns = [
  {
    name: 'actividad',
    label: 'Actividad',
    field: 'activityName',
    align: 'left' as const,
    sortable: true,
  },
  {
    name: 'socio',
    label: 'Asistencias socio',
    field: 'socioCount',
    align: 'right' as const,
    sortable: true,
  },
  {
    name: 'externo',
    label: 'Asistencias externo',
    field: 'externoCount',
    align: 'right' as const,
    sortable: true,
  },
  {
    name: 'total',
    label: 'Total',
    field: 'total',
    align: 'right' as const,
    sortable: true,
  },
];

const totals = computed(() => {
  const rows = props.data?.rows ?? [];
  return {
    socio: rows.reduce((sum, r) => sum + r.socioCount, 0),
    externo: rows.reduce((sum, r) => sum + r.externoCount, 0),
    total: rows.reduce((sum, r) => sum + r.total, 0),
  };
});

function onMonthChange(value: string) {
  emit('update:month', value);
  emit('change');
}

async function onExport() {
  exporting.value = true;
  try {
    const blob = await analyticsApi.exportEspeciales(props.month);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'especiales-' + props.month + '.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err: unknown) {
    const message = extractError(err, 'Error exportando Especiales');
    log.error('Error exporting especiales report', { error: message });
    q.notify({ type: 'negative', message });
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped lang="scss">
// Acento "Aura" (Aged Gold #7d6520) — reservado exclusivamente a la superficie de Especiales.
.especiales__title {
  color: #7d6520;
  font-weight: 600;
}
.especiales__kpi .text-h4 {
  color: #7d6520;
}
</style>
