<template>
  <div>
    <!-- Loading -->
    <div v-if="loading && records.length === 0" class="flex flex-center q-pa-lg">
      <q-spinner-dots size="40px" color="primary" />
    </div>

    <template v-else>
      <q-card flat bordered>
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold q-mb-sm">Historial de Asistencia</div>

          <div v-if="records.length === 0" class="text-grey-5 text-italic">
            Sin registros de asistencia
          </div>

          <q-table
            v-else
            :rows="records"
            :columns="attendanceColumns"
            row-key="id"
            flat
            :loading="loading"
            :pagination="tablePagination"
            :rows-per-page-options="[10, 20, 50]"
            @request="onTableRequest"
          >
            <!-- Fecha column -->
            <template #body-cell-fecha="slotProps">
              <q-td :props="slotProps">
                {{ formatDate(slotProps.row.checkedInAt) }}
              </q-td>
            </template>

            <!-- Sede column -->
            <template #body-cell-sede="slotProps">
              <q-td :props="slotProps">
                {{ slotProps.row.branchName }}
              </q-td>
            </template>

            <!-- Estado column -->
            <template #body-cell-estado="slotProps">
              <q-td :props="slotProps">
                <q-icon name="check_circle" color="positive" size="sm" />
              </q-td>
            </template>

            <!-- Fuente column -->
            <template #body-cell-fuente="slotProps">
              <q-td :props="slotProps">
                <q-badge
                  :color="slotProps.row.source === 'qr' ? 'info' : 'grey-7'"
                  :label="sourceLabels[slotProps.row.source as AttendanceSource]"
                />
              </q-td>
            </template>
          </q-table>
        </q-card-section>
      </q-card>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useAttendanceApi } from 'src/composables/useAttendanceApi';
import { sourceLabels, type AttendanceRecord, type AttendanceSource } from 'src/types/attendance';

const log = createLogger('MemberAttendanceTab');
const attendanceApi = useAttendanceApi();

// =========================================================================
// Props
// =========================================================================

const props = defineProps<{
  userId: number;
}>();

// =========================================================================
// State
// =========================================================================

const records = ref<AttendanceRecord[]>([]);
const loading = ref(false);

const tablePagination = ref({
  page: 1,
  rowsPerPage: 10,
  rowsNumber: 0,
  sortBy: null as string | null,
  descending: false,
});

// =========================================================================
// Table columns
// =========================================================================

const attendanceColumns: QTableProps['columns'] = [
  { name: 'fecha', label: 'Fecha', field: 'checkedInAt', align: 'left', sortable: false },
  { name: 'sede', label: 'Sede', field: 'branchName', align: 'left', sortable: false },
  {
    name: 'estado',
    label: 'Estado',
    field: 'status',
    align: 'center',
    sortable: false,
    style: 'width: 80px',
  },
  {
    name: 'fuente',
    label: 'Fuente',
    field: 'source',
    align: 'center',
    sortable: false,
    style: 'width: 100px',
  },
];

// =========================================================================
// Display helpers
// =========================================================================

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// =========================================================================
// Data loading
// =========================================================================

async function loadAttendance() {
  loading.value = true;
  try {
    const result = await attendanceApi.getMemberAttendance(
      props.userId,
      tablePagination.value.page,
      tablePagination.value.rowsPerPage
    );
    records.value = result.data;
    tablePagination.value.rowsNumber = result.total;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading member attendance', { error: message, userId: props.userId });
  } finally {
    loading.value = false;
  }
}

// =========================================================================
// Table request handler (server-side pagination)
// =========================================================================

function onTableRequest(props: { pagination: { page: number; rowsPerPage: number } }) {
  tablePagination.value.page = props.pagination.page;
  tablePagination.value.rowsPerPage = props.pagination.rowsPerPage;
  loadAttendance();
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadAttendance();
});
</script>
