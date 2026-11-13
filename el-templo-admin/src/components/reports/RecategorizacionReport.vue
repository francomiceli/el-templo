<!--
  Recategorización multisucursal (Reportes).
  Banner: cuándo corre el próximo cron y cuántos alumnos se reasignarían si el
  cálculo se hiciera HOY (simulado, read-only).
  Histórico: los eventos de cada corrida mensual agrupados por mes, con de qué
  sede a cuál se movió cada alumno y cuánto entrenó en la sede destino.
-->
<template>
  <div class="recategorizacion-report">
    <q-banner v-if="loading" class="bg-grey-2 rounded-borders">
      <template #avatar>
        <q-spinner color="primary" size="24px" />
      </template>
      Calculando la simulación…
    </q-banner>

    <q-banner v-else-if="errorMsg" class="bg-red-1 text-negative rounded-borders">
      <template #avatar>
        <q-icon name="error_outline" color="negative" />
      </template>
      {{ errorMsg }}
      <template #action>
        <q-btn flat color="negative" label="Reintentar" @click="load" />
      </template>
    </q-banner>

    <q-banner
      v-else-if="preview"
      class="rounded-borders"
      :class="preview.wouldReassign > 0 ? 'bg-orange-1' : 'bg-green-1'"
    >
      <template #avatar>
        <q-icon
          :name="preview.wouldReassign > 0 ? 'sync_alt' : 'check_circle'"
          :color="preview.wouldReassign > 0 ? 'orange-9' : 'positive'"
          size="28px"
        />
      </template>

      <div class="text-body1">
        <template v-if="preview.wouldReassign > 0">
          En <strong>{{ preview.daysUntil }}</strong>
          {{ preview.daysUntil === 1 ? 'día' : 'días' }} (el <strong>{{ nextRunLabel }}</strong
          >) se recategorizarían
          <strong>{{ preview.wouldReassign }}</strong>
          {{ preview.wouldReassign === 1 ? 'alumno' : 'alumnos' }} a la sede donde más entrenan.
        </template>
        <template v-else>
          No hay alumnos para recategorizar hoy. El próximo chequeo corre el
          <strong>{{ nextRunLabel }}</strong
          >.
        </template>
      </div>
      <div class="text-caption text-grey-8 q-mt-xs">
        Simulado como si el cambio fuese hoy sobre {{ preview.candidates }}
        {{ preview.candidates === 1 ? 'alumno multisucursal' : 'alumnos multisucursal' }}. Se
        recalcula al abrir.
      </div>

      <template #action>
        <q-btn flat dense icon="refresh" label="Recalcular" @click="load" />
      </template>
    </q-banner>

    <!-- ============================================================== -->
    <!-- Histórico mensual de recategorizaciones                         -->
    <!-- ============================================================== -->
    <div class="q-mt-lg">
      <div class="row items-start no-wrap q-mb-sm">
        <div class="col">
          <div class="text-subtitle1 text-weight-medium text-accent">Histórico</div>
          <div class="text-caption text-grey-7">
            Últimos 12 meses. Cada corrida mueve a los alumnos multisucursal a la sede donde más
            entrenaron en los 30 días previos.
          </div>
        </div>
        <div v-if="groups.length > 0" class="col-auto q-ml-md">
          <q-btn
            outline
            dense
            no-caps
            color="primary"
            icon="download"
            label="Descargar Excel"
            :loading="exportingKey === TOTAL_KEY"
            :disable="exportingKey !== null"
            data-test="export-total"
            @click="onExport()"
          >
            <q-tooltip>Descarga el total del período y una hoja por mes</q-tooltip>
          </q-btn>
        </div>
      </div>

      <q-banner v-if="historyLoading" class="bg-grey-2 rounded-borders">
        <template #avatar>
          <q-spinner color="primary" size="24px" />
        </template>
        Cargando el histórico…
      </q-banner>

      <q-banner
        v-else-if="historyError"
        class="bg-red-1 text-negative rounded-borders"
        data-test="history-error"
      >
        <template #avatar>
          <q-icon name="error_outline" color="negative" />
        </template>
        {{ historyError }}
        <template #action>
          <q-btn flat color="negative" label="Reintentar" @click="loadHistory" />
        </template>
      </q-banner>

      <q-banner
        v-else-if="groups.length === 0"
        class="bg-grey-2 text-grey-8 rounded-borders"
        data-test="history-empty"
      >
        <template #avatar>
          <q-icon name="history" color="secondary" />
        </template>
        Todavía no hubo recategorizaciones.
      </q-banner>

      <div v-else class="column q-gutter-y-sm">
        <q-expansion-item
          v-for="(group, index) in groups"
          :key="group.key"
          :default-opened="index === 0"
          class="history-month rounded-borders"
          header-class="text-weight-medium text-accent"
          expand-separator
        >
          <template #header>
            <q-item-section>
              {{ group.label }} · {{ studentsCountLabel(group.rows.length) }}
            </q-item-section>
            <q-item-section side>
              <!-- .stop: el clic descarga, no abre ni cierra el mes. -->
              <q-btn
                flat
                round
                dense
                size="sm"
                color="primary"
                icon="download"
                :loading="exportingKey === group.key"
                :disable="exportingKey !== null"
                :data-test="`export-month-${group.key}`"
                :aria-label="`Descargar Excel de ${group.label}`"
                @click.stop="onExport(group.key)"
              >
                <q-tooltip>Descargar Excel de {{ group.label }}</q-tooltip>
              </q-btn>
            </q-item-section>
          </template>

          <q-markup-table flat dense separator="horizontal" class="history-table">
            <thead>
              <tr>
                <th class="text-left">Alumno</th>
                <th class="text-left">De</th>
                <th class="text-left">A</th>
                <th class="text-left">Asistencias en destino</th>
                <th class="text-left">Fecha</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in group.rows" :key="row.id">
                <td class="text-left">
                  <router-link :to="`/alumnos/${row.memberId}`" class="member-link">
                    {{ row.memberName }}
                  </router-link>
                </td>
                <td class="text-left">
                  <span v-if="row.fromBranchName" class="text-no-wrap">{{
                    row.fromBranchName
                  }}</span>
                  <span v-else class="text-grey-6">Sin dato</span>
                  <q-icon
                    v-if="row.source === 'backfill'"
                    name="history"
                    size="16px"
                    color="grey-6"
                    class="q-ml-xs"
                    :data-test="`backfill-${row.id}`"
                  >
                    <q-tooltip>Sede de origen reconstruida con el último cobro</q-tooltip>
                  </q-icon>
                </td>
                <td class="text-left text-no-wrap">{{ row.toBranchName }}</td>
                <td class="text-left text-no-wrap">
                  {{ formatAttendanceRatio(row.toBranchAttendances, row.totalAttendances) }}
                </td>
                <td class="text-left text-no-wrap">
                  {{ formatReassignmentDay(row.reassignedAt) }}
                </td>
              </tr>
            </tbody>
          </q-markup-table>
        </q-expansion-item>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { useReportsApi } from 'src/composables/useReportsApi';
import type {
  MultibranchReassignmentPreview,
  MultibranchReassignmentRow,
} from 'src/composables/useReportsApi';
import {
  formatAttendanceRatio,
  formatReassignmentDay,
  groupReassignmentsByMonth,
  reassignmentsExportFilename,
  studentsCountLabel,
} from 'src/utils/recategorizacion-historico';
import { downloadBlob } from 'src/utils/download-blob';
import { createLogger } from 'src/utils/logger';

const log = createLogger('RecategorizacionReport');
const $q = useQuasar();
const {
  getMultibranchReassignmentPreview,
  getMultibranchReassignments,
  exportMultibranchReassignments,
} = useReportsApi();

/** Ventana del histórico: la pantalla y el Excel piden el mismo período. */
const HISTORY_MONTHS = 12;
const TOTAL_KEY = 'total';

const preview = ref<MultibranchReassignmentPreview | null>(null);
const loading = ref(false);
const errorMsg = ref<string | null>(null);

const history = ref<MultibranchReassignmentRow[]>([]);
const historyLoading = ref(false);
const historyError = ref<string | null>(null);
const groups = computed(() => groupReassignmentsByMonth(history.value));

const nextRunLabel = computed(() => {
  if (!preview.value) return '';
  const d = new Date(preview.value.nextRunAt);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
});

async function load(): Promise<void> {
  loading.value = true;
  errorMsg.value = null;
  try {
    preview.value = await getMultibranchReassignmentPreview();
  } catch (err: unknown) {
    errorMsg.value = 'No pudimos calcular la recategorización. Reintentá en un momento.';
    log.error('Failed to load reassignment preview', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    loading.value = false;
  }
}

async function loadHistory(): Promise<void> {
  historyLoading.value = true;
  historyError.value = null;
  try {
    history.value = await getMultibranchReassignments(HISTORY_MONTHS);
  } catch (err: unknown) {
    historyError.value = 'No pudimos cargar el histórico. Reintentá en un momento.';
    log.error('Failed to load reassignment history', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    historyLoading.value = false;
  }
}

/** Qué descarga está en curso (`'total'` o la clave `AAAA-MM` de un mes). */
const exportingKey = ref<string | null>(null);

/** Sin `monthKey`: el total del período mostrado (hoja Total + una por mes). */
async function onExport(monthKey?: string): Promise<void> {
  exportingKey.value = monthKey ?? TOTAL_KEY;
  try {
    const blob = await exportMultibranchReassignments(HISTORY_MONTHS, monthKey);
    downloadBlob(blob, reassignmentsExportFilename(monthKey));
    $q.notify({ type: 'positive', message: 'Excel exportado' });
  } catch (err: unknown) {
    log.error('Failed to export reassignment history', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'No se pudo exportar el Excel' });
  } finally {
    exportingKey.value = null;
  }
}

onMounted(() => {
  void load();
  void loadHistory();
});
</script>

<style scoped>
.history-month {
  border: 1px solid rgba(61, 55, 50, 0.15);
}

.history-table {
  background: transparent;
}

.member-link {
  color: var(--q-primary);
  text-decoration: none;
  font-weight: 500;
}

.member-link:hover {
  text-decoration: underline;
}
</style>
