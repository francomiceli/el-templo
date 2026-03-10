<template>
  <q-page class="q-pa-md">
    <!-- Header -->
    <div class="row items-center q-mb-md">
      <div class="col">
        <div class="text-h5">Asistencia Hoy</div>
        <div class="text-caption text-grey-7">{{ todayFormatted }}</div>
      </div>
      <div class="q-gutter-sm">
        <q-btn
          icon="qr_code_2"
          label="Generar QR"
          color="secondary"
          outline
          :disable="!selectedBranchId"
          @click="onGenerateQr"
        />
        <q-btn icon="add" label="Agregar alumno" color="primary" @click="showManualDialog = true" />
      </div>
    </div>

    <!-- ========================================== -->
    <!-- Branch Selector -->
    <!-- ========================================== -->
    <div class="row q-mb-md">
      <div class="col-12 col-sm-4">
        <q-select
          v-model="selectedBranchId"
          :options="branchOptions"
          label="Sucursal"
          dense
          outlined
          emit-value
          map-options
          :loading="loadingBranches"
          @update:model-value="onBranchChange"
        />
      </div>
    </div>

    <!-- ========================================== -->
    <!-- Today's Attendance Table -->
    <!-- ========================================== -->
    <q-table
      :rows="attendanceList"
      :columns="columns"
      row-key="id"
      :loading="loadingAttendance"
      flat
      bordered
      hide-bottom
      :rows-per-page-options="[0]"
    >
      <!-- Checkbox column -->
      <template #body-cell-seleccionar="slotProps">
        <q-td :props="slotProps">
          <q-checkbox
            v-if="slotProps.row.status === 'registrado'"
            v-model="selectedIds"
            :val="slotProps.row.id"
          />
        </q-td>
      </template>

      <!-- Nombre column -->
      <template #body-cell-nombre="slotProps">
        <q-td :props="slotProps">
          <span
            class="text-weight-medium text-primary cursor-pointer"
            @click="goToMember(slotProps.row.memberId)"
          >
            {{ slotProps.row.memberName }}
          </span>
        </q-td>
      </template>

      <!-- Hora column -->
      <template #body-cell-hora="slotProps">
        <q-td :props="slotProps">
          {{ formatTime(slotProps.row.checkedInAt) }}
        </q-td>
      </template>

      <!-- Fuente column -->
      <template #body-cell-fuente="slotProps">
        <q-td :props="slotProps">
          <q-badge
            :color="slotProps.row.source === 'qr' ? 'info' : 'grey-7'"
            :label="sourceLabels[slotProps.row.source]"
          />
        </q-td>
      </template>

      <!-- Estado column -->
      <template #body-cell-estado="slotProps">
        <q-td :props="slotProps">
          <q-badge
            :color="statusColors[slotProps.row.status]"
            :label="statusLabels[slotProps.row.status]"
          />
        </q-td>
      </template>

      <!-- No data -->
      <template #no-data>
        <div class="full-width text-center q-pa-lg text-grey-5 text-italic">
          <template v-if="!selectedBranchId">
            Selecciona una sucursal para ver la asistencia de hoy
          </template>
          <template v-else> Sin registros de asistencia hoy </template>
        </div>
      </template>
    </q-table>

    <!-- ========================================== -->
    <!-- Confirm Button -->
    <!-- ========================================== -->
    <div v-if="pendingCount > 0" class="q-mt-md row items-center q-gutter-sm">
      <q-btn
        icon="check_circle"
        :label="`Confirmar Asistencia (${selectedIds.length})`"
        color="positive"
        :disable="selectedIds.length === 0"
        :loading="confirmLoading"
        @click="onBatchConfirm"
      />
      <span class="text-caption text-grey-7">
        {{ pendingCount }} pendiente{{ pendingCount === 1 ? '' : 's' }}
      </span>
    </div>

    <!-- ========================================== -->
    <!-- QR Dialog -->
    <!-- ========================================== -->
    <q-dialog v-model="showQrDialog">
      <q-card style="min-width: 350px">
        <q-card-section>
          <div class="text-h6">QR de Asistencia</div>
          <div class="text-caption text-grey-7">{{ qrBranchName }}</div>
        </q-card-section>

        <q-card-section class="flex flex-center q-pa-lg">
          <div v-if="qrLoading" class="flex flex-center q-pa-xl">
            <q-spinner-dots size="40px" color="primary" />
          </div>
          <img
            v-else-if="qrDataUrl"
            :src="qrDataUrl"
            alt="QR Code"
            style="max-width: 300px; width: 100%"
          />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn
            flat
            icon="download"
            label="Descargar"
            color="primary"
            :disable="!qrDataUrl"
            @click="downloadQr"
          />
          <q-btn flat label="Cerrar" color="grey-7" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ========================================== -->
    <!-- Manual Check-in Dialog -->
    <!-- ========================================== -->
    <q-dialog v-model="showManualDialog">
      <q-card style="min-width: 400px">
        <q-card-section>
          <div class="text-h6">Agregar Alumno</div>
          <div class="text-caption text-grey-7">Registrar asistencia manual</div>
        </q-card-section>

        <q-card-section>
          <q-select
            v-model="manualSelectedMember"
            :options="memberSearchResults"
            option-value="id"
            option-label="displayLabel"
            label="Buscar alumno (nombre o DNI)"
            dense
            outlined
            use-input
            clearable
            input-debounce="300"
            :loading="searchingMembers"
            @filter="onMemberSearch"
          >
            <template #no-option>
              <q-item>
                <q-item-section class="text-grey-5 text-italic">
                  {{ memberSearchQuery ? 'Sin resultados' : 'Escribe para buscar' }}
                </q-item-section>
              </q-item>
            </template>
          </q-select>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Cancelar" color="grey-7" v-close-popup />
          <q-btn
            label="Registrar"
            color="primary"
            :disable="!manualSelectedMember"
            :loading="manualLoading"
            @click="onManualCheckIn"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import QRCode from 'qrcode';
import { createLogger } from 'src/utils/logger';
import { useAttendanceApi } from 'src/composables/useAttendanceApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import {
  statusLabels,
  statusColors,
  sourceLabels,
  type AttendanceRecord,
} from 'src/types/attendance';
import type { BranchOption } from 'src/types/member';

const log = createLogger('AsistenciaHoyPage');
const $q = useQuasar();
const router = useRouter();

// =========================================================================
// State
// =========================================================================

const selectedBranchId = ref<number | null>(null);
const attendanceList = ref<AttendanceRecord[]>([]);
const selectedIds = ref<number[]>([]);
const loadingBranches = ref(false);
const loadingAttendance = ref(false);
const confirmLoading = ref(false);

// QR dialog
const showQrDialog = ref(false);
const qrDataUrl = ref<string | null>(null);
const qrBranchName = ref('');
const qrLoading = ref(false);

// Manual dialog
const showManualDialog = ref(false);
const manualSelectedMember = ref<{ id: number; displayLabel: string } | null>(null);
const memberSearchResults = ref<Array<{ id: number; displayLabel: string }>>([]);
const searchingMembers = ref(false);
const manualLoading = ref(false);
const memberSearchQuery = ref('');

// Branch options
const branchOptions = ref<Array<{ label: string; value: number }>>([]);

// Polling
let pollInterval: ReturnType<typeof setInterval> | null = null;

// =========================================================================
// Computed
// =========================================================================

const todayFormatted = computed(() => {
  return new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
});

const pendingCount = computed(() => {
  return attendanceList.value.filter((r) => r.status === 'registrado').length;
});

// =========================================================================
// Table columns
// =========================================================================

const columns: QTableProps['columns'] = [
  {
    name: 'seleccionar',
    label: '',
    field: 'id',
    align: 'center',
    sortable: false,
    style: 'width: 50px',
  },
  { name: 'nombre', label: 'Nombre', field: 'memberName', align: 'left', sortable: false },
  { name: 'hora', label: 'Hora', field: 'checkedInAt', align: 'left', sortable: false },
  {
    name: 'fuente',
    label: 'Fuente',
    field: 'source',
    align: 'center',
    sortable: false,
    style: 'width: 100px',
  },
  {
    name: 'estado',
    label: 'Estado',
    field: 'status',
    align: 'center',
    sortable: false,
    style: 'width: 120px',
  },
];

// =========================================================================
// Display helpers
// =========================================================================

function formatTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleTimeString('es-AR', {
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

async function loadBranches() {
  loadingBranches.value = true;
  try {
    const membersApi = useMembersApi();
    const branches: BranchOption[] = await membersApi.getBranches();
    branchOptions.value = branches.map((b) => ({ label: b.name, value: b.id }));
    // Auto-select first branch if only one
    if (branchOptions.value.length === 1) {
      selectedBranchId.value = branchOptions.value[0].value;
      loadTodayAttendance();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading branches', { error: message });
  } finally {
    loadingBranches.value = false;
  }
}

async function loadTodayAttendance() {
  if (!selectedBranchId.value) return;
  loadingAttendance.value = true;
  try {
    const attendanceApi = useAttendanceApi();
    attendanceList.value = await attendanceApi.getTodayAttendance(selectedBranchId.value);
    // Auto-select all registrado records
    selectedIds.value = attendanceList.value
      .filter((r) => r.status === 'registrado')
      .map((r) => r.id);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading today attendance', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando asistencia' });
  } finally {
    loadingAttendance.value = false;
  }
}

// =========================================================================
// Branch change
// =========================================================================

function onBranchChange() {
  attendanceList.value = [];
  selectedIds.value = [];
  loadTodayAttendance();
}

// =========================================================================
// Batch confirm
// =========================================================================

async function onBatchConfirm() {
  if (selectedIds.value.length === 0) return;
  confirmLoading.value = true;
  try {
    const attendanceApi = useAttendanceApi();
    const result = await attendanceApi.batchConfirm(selectedIds.value);
    $q.notify({
      type: 'positive',
      message: `${result.confirmed} asistencia${result.confirmed === 1 ? '' : 's'} confirmada${result.confirmed === 1 ? '' : 's'}`,
    });
    loadTodayAttendance();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error confirming attendance', { error: message });
    $q.notify({ type: 'negative', message: 'Error confirmando asistencia' });
  } finally {
    confirmLoading.value = false;
  }
}

// =========================================================================
// QR Generation
// =========================================================================

async function onGenerateQr() {
  if (!selectedBranchId.value) return;
  showQrDialog.value = true;
  qrLoading.value = true;
  qrDataUrl.value = null;

  try {
    const attendanceApi = useAttendanceApi();
    const qrResponse = await attendanceApi.generateQr(selectedBranchId.value);
    qrBranchName.value = qrResponse.branchName;

    // Generate QR code image from the token string
    qrDataUrl.value = await QRCode.toDataURL(qrResponse.token, {
      width: 600,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error generating QR', { error: message });
    $q.notify({ type: 'negative', message: 'Error generando codigo QR' });
    showQrDialog.value = false;
  } finally {
    qrLoading.value = false;
  }
}

function downloadQr() {
  if (!qrDataUrl.value) return;
  const link = document.createElement('a');
  link.download = `qr-asistencia-${qrBranchName.value.toLowerCase().replace(/\s+/g, '-')}.png`;
  link.href = qrDataUrl.value;
  link.click();
}

// =========================================================================
// Manual Check-in
// =========================================================================

function onMemberSearch(val: string, update: (fn: () => void) => void, abort: () => void) {
  memberSearchQuery.value = val;
  if (!val || val.length < 2) {
    update(() => {
      memberSearchResults.value = [];
    });
    return;
  }

  if (!selectedBranchId.value) {
    abort();
    return;
  }

  searchingMembers.value = true;
  const membersApi = useMembersApi();
  membersApi
    .getMembers({ search: val, limit: 10 })
    .then((result) => {
      update(() => {
        memberSearchResults.value = result.members.map((m) => ({
          id: m.id,
          displayLabel: `${m.firstName} ${m.lastName}${m.dni ? ` (${m.dni})` : ''}`,
        }));
      });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error searching members', { error: message });
      update(() => {
        memberSearchResults.value = [];
      });
    })
    .finally(() => {
      searchingMembers.value = false;
    });
}

async function onManualCheckIn() {
  if (!manualSelectedMember.value || !selectedBranchId.value) return;
  manualLoading.value = true;
  try {
    const attendanceApi = useAttendanceApi();
    await attendanceApi.manualCheckIn(manualSelectedMember.value.id, selectedBranchId.value);
    $q.notify({ type: 'positive', message: 'Asistencia registrada' });
    showManualDialog.value = false;
    manualSelectedMember.value = null;
    memberSearchResults.value = [];
    loadTodayAttendance();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error manual check-in', { error: message });
    $q.notify({ type: 'negative', message: 'Error registrando asistencia' });
  } finally {
    manualLoading.value = false;
  }
}

// =========================================================================
// Navigation
// =========================================================================

function goToMember(memberId: number) {
  router.push(`/alumnos/${memberId}`);
}

// =========================================================================
// Polling (auto-refresh every 30s)
// =========================================================================

function startPolling() {
  pollInterval = setInterval(() => {
    if (selectedBranchId.value) {
      loadTodayAttendance();
    }
  }, 30_000);
}

function stopPolling() {
  if (pollInterval !== null) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadBranches();
  startPolling();
});

onUnmounted(() => {
  stopPolling();
});
</script>
