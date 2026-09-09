<!--
  "Mi jornada": check-in/check-out del staff con el QR físico de la sede
  (mismo QR que escanean los socios). El staff abre esta página desde el
  celular, escanea al llegar y al irse; al cerrar jornada completa un
  checklist antes de mandar. Owner/admin ven además "Registro": el
  historial de jornadas por sede y fechas de todo el staff.
-->
<template>
  <q-page class="q-pa-md">
    <div class="text-h5 q-mb-md">Mi jornada</div>

    <!-- ================================================================ -->
    <!-- Estado actual -->
    <!-- ================================================================ -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section>
        <div v-if="meLoading" class="row items-center q-gutter-sm">
          <q-spinner color="primary" size="24px" />
          <span class="text-body1">Cargando estado…</span>
        </div>
        <template v-else>
          <div v-if="openShift" class="row items-center q-gutter-sm">
            <q-icon name="schedule" color="positive" size="32px" />
            <div>
              <div class="text-h6">Jornada abierta en {{ openShift.branchName }}</div>
              <div class="text-body2 text-grey-7">
                Desde las {{ formatTime(openShift.checkedInAt) }}
              </div>
            </div>
          </div>
          <div v-else class="row items-center q-gutter-sm">
            <q-icon name="schedule" color="grey-6" size="32px" />
            <div class="text-h6 text-grey-7">Sin jornada abierta</div>
          </div>
        </template>
      </q-card-section>
    </q-card>

    <!-- ================================================================ -->
    <!-- Botonera -->
    <!-- ================================================================ -->
    <div class="row q-col-gutter-md q-mb-lg">
      <div class="col-12 col-sm-6">
        <q-btn
          size="xl"
          color="positive"
          icon="login"
          label="CHECK IN"
          class="full-width"
          :disable="!!openShift || meLoading"
          @click="startCheckIn"
        />
      </div>
      <div class="col-12 col-sm-6">
        <q-btn
          size="xl"
          color="negative"
          icon="logout"
          label="CHECK OUT"
          class="full-width"
          :disable="!openShift || meLoading"
          @click="startCheckOut"
        />
      </div>
      <!-- Cierre de caja suelto (2026-09-08): contar sin cerrar la jornada. -->
      <div v-if="openShift" class="col-12 text-center">
        <q-btn
          flat
          no-caps
          color="primary"
          icon="point_of_sale"
          label="Contar la caja ahora"
          @click="openCajaSuelta"
        />
      </div>
    </div>

    <!-- Scanner compartido entre check-in y check-out -->
    <QrScannerDialog v-model="showScanner" :title="scannerTitle" @scanned="onScanned" />

    <!-- Cierre de caja (2026-09-08): antes del checklist, si hay jornada abierta,
         el profe cuenta el efectivo de la caja de su sede. Se puede saltear. -->
    <CerrarCajaDialog
      v-model="showCajaDialog"
      mode="coach"
      :branch-id="openShift?.branchId"
      :staff-shift-id="openShift?.id"
      @registered="onCajaDone"
      @skipped="onCajaDone"
    />

    <!-- ================================================================ -->
    <!-- Checklist de cierre (previo a mandar el check-out) -->
    <!-- ================================================================ -->
    <q-dialog v-model="showChecklistDialog" persistent>
      <q-card style="min-width: 340px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">Antes de cerrar tu jornada</div>
        </q-card-section>

        <q-list separator>
          <q-item
            v-for="item in checklistItems"
            :key="item.key"
            v-ripple
            clickable
            @click="toggleChecklistItem(item.key)"
          >
            <q-item-section avatar>
              <q-checkbox v-model="checklistValues[item.key]" size="lg" @click.stop />
            </q-item-section>
            <q-item-section>
              <q-item-label class="text-body1">{{ item.label }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancelar" :disable="checkingOut" @click="cancelCheckOut" />
          <q-btn
            size="lg"
            color="primary"
            label="Cerrar jornada"
            :loading="checkingOut"
            :disable="!allChecklistChecked"
            @click="confirmCheckOut"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ================================================================ -->
    <!-- Registro (solo owner/admin) -->
    <!-- ================================================================ -->
    <template v-if="canSeeReport">
      <q-separator class="q-mb-md" />
      <div class="text-h6 q-mb-md">Registro</div>

      <div class="row items-end q-col-gutter-sm q-mb-md">
        <div class="col-12 col-sm-4">
          <q-select
            v-model="reportBranchId"
            :options="branchOptions"
            option-label="name"
            option-value="id"
            emit-value
            map-options
            label="Sede"
            dense
            outlined
            :loading="loadingBranches"
          />
        </div>
        <div class="col-6 col-sm-3">
          <q-input v-model="reportFrom" type="date" label="Desde" dense outlined />
        </div>
        <div class="col-6 col-sm-3">
          <q-input v-model="reportTo" type="date" label="Hasta" dense outlined />
        </div>
        <div class="col-12 col-sm-2">
          <q-btn
            color="primary"
            label="Buscar"
            icon="search"
            class="full-width"
            :loading="shiftsLoading"
            @click="loadShifts"
          />
        </div>
      </div>

      <q-table
        :rows="shifts"
        :columns="shiftColumns"
        row-key="id"
        :loading="shiftsLoading"
        :pagination="{ rowsPerPage: 50 }"
        :rows-per-page-options="[20, 50, 100]"
        flat
        bordered
      >
        <template #no-data>
          <div class="full-width text-center text-grey-7 q-pa-md">Sin jornadas en el rango.</div>
        </template>

        <template #body-cell-shiftDate="props">
          <q-td :props="props">{{ formatShiftDate(props.row.shiftDate) }}</q-td>
        </template>

        <template #body-cell-checkedInAt="props">
          <q-td :props="props">{{ formatTime(props.row.checkedInAt) }}</q-td>
        </template>

        <template #body-cell-checkedOutAt="props">
          <q-td :props="props">
            <q-chip v-if="!props.row.checkedOutAt" color="warning" text-color="white" dense
              >abierta</q-chip
            >
            <span v-else>{{ formatTime(props.row.checkedOutAt) }}</span>
          </q-td>
        </template>

        <template #body-cell-durationMinutes="props">
          <q-td :props="props">
            <span v-if="props.row.durationMinutes === null" class="text-grey-5">—</span>
            <span v-else>{{ formatDuration(props.row.durationMinutes) }}</span>
          </q-td>
        </template>

        <template #body-cell-checklist="props">
          <q-td :props="props">
            <template v-if="props.row.checklist">
              <q-chip
                v-for="key in CHECKLIST_KEYS"
                :key="key"
                dense
                size="sm"
                :color="props.row.checklist[key] ? 'positive' : 'grey-4'"
                :text-color="props.row.checklist[key] ? 'white' : 'grey-8'"
                class="q-mr-xs"
              >
                {{ props.row.checklist[key] ? '✓' : '' }} {{ CHECKLIST_SHORT_LABELS[key] }}
              </q-chip>
            </template>
            <span v-else class="text-grey-5">—</span>
          </q-td>
        </template>
      </q-table>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar, type QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { extractError } from 'src/utils/extract-error';
import {
  useStaffAttendanceApi,
  type StaffAttendanceOpenShift,
  type StaffAttendanceChecklistItem,
  type StaffAttendanceChecklistValues,
  type StaffAttendanceShiftRow,
} from 'src/composables/useStaffAttendanceApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import { JORNADA_REPORT_ROLES } from 'src/config/templo-config';
import type { BranchOption } from 'src/types/member';
import QrScannerDialog from 'src/components/QrScannerDialog.vue';
import CerrarCajaDialog from 'src/components/caja/CerrarCajaDialog.vue';

const log = createLogger('CheckInPage');
const $q = useQuasar();
const authStore = useAuthStore();
const attendanceApi = useStaffAttendanceApi();
const membersApi = useMembersApi();

// =========================================================================
// Estado actual ("me")
// =========================================================================

const meLoading = ref(true);
const openShift = ref<StaffAttendanceOpenShift | null>(null);
const checklistItems = ref<StaffAttendanceChecklistItem[]>([]);

/** Trae estado + ítems del checklist del server (la lista depende del día EN
 *  LA SEDE: el lote del posnet solo mié/sáb). */
async function fetchMe() {
  const me = await attendanceApi.getMe();
  openShift.value = me.open;
  checklistItems.value = me.checklist;
}

async function loadMe() {
  meLoading.value = true;
  try {
    await fetchMe();
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo cargar el estado de tu jornada');
    log.error('Error cargando estado de jornada', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    meLoading.value = false;
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${m}min`;
}

// =========================================================================
// Scanner compartido (check-in / check-out)
// =========================================================================

type ScannerMode = 'checkin' | 'checkout';

const showScanner = ref(false);
const scannerMode = ref<ScannerMode>('checkin');
const scannerTitle = computed(() =>
  scannerMode.value === 'checkin'
    ? 'Check-in — Escaneá el QR de la sede'
    : 'Check-out — Escaneá el QR de la sede'
);

function startCheckIn() {
  scannerMode.value = 'checkin';
  showScanner.value = true;
}

function startCheckOut() {
  scannerMode.value = 'checkout';
  showScanner.value = true;
}

function onScanned(text: string) {
  if (scannerMode.value === 'checkin') {
    void performCheckIn(text);
  } else {
    void openChecklistDialog(text);
  }
}

async function performCheckIn(qrToken: string) {
  try {
    const shift = await attendanceApi.checkIn(qrToken);
    $q.notify({
      type: 'positive',
      message: `Check-in en ${shift.branchName} a las ${formatTime(shift.checkedInAt)}`,
    });
    log.info('Check-in registrado', { branchId: shift.branchId });
    await loadMe();
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo registrar el check-in');
    log.warn('Check-in fallido', { error: message });
    $q.notify({ type: 'negative', message });
  }
}

// =========================================================================
// Checklist de cierre + check-out
// =========================================================================

const CHECKLIST_KEYS = ['cobros', 'espacio', 'lote'] as const;
type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

/** Etiquetas cortas para los chips del Registro (el server manda la etiqueta
 *  completa vía `getMe().checklist`, usada en el diálogo de cierre). */
const CHECKLIST_SHORT_LABELS: Record<ChecklistKey, string> = {
  cobros: 'Cobros',
  espacio: 'Espacio',
  lote: 'Lote',
};

const showChecklistDialog = ref(false);
const pendingQrToken = ref<string | null>(null);
const checkingOut = ref(false);
const checklistValues = ref<Record<ChecklistKey, boolean>>({
  cobros: false,
  espacio: false,
  lote: false,
});

// Solo los ítems que el server ofrece hoy (lote: mié/sáb) tienen que estar tildados.
const allChecklistChecked = computed(() =>
  checklistItems.value.every((item) => checklistValues.value[item.key])
);

// Cierre de caja (2026-09-08): el QR ya validó que el profe está cerrando su
// jornada; antes del checklist se le pide contar la caja de la sede. Cancelar
// o saltear el conteo no cancela el check-out: sigue al checklist.
const showCajaDialog = ref(false);

async function openChecklistDialog(qrToken: string) {
  pendingQrToken.value = qrToken;
  checklistValues.value = { cobros: false, espacio: false, lote: false };
  // La lista de ítems se cargó al abrir la página, que puede haber quedado
  // abierta desde otro día (incidente 2026-09-09: página del martes, cierre
  // del miércoles → el server exigía el lote y el diálogo no lo ofrecía). Se
  // refresca acá, al momento de cerrar; si falla, se sigue con la que hay.
  try {
    await fetchMe();
  } catch (err: unknown) {
    log.warn('No se pudo refrescar el checklist antes del check-out', {
      error: extractError(err, 'Error desconocido'),
    });
  }
  if (openShift.value) {
    showCajaDialog.value = true;
  } else {
    showChecklistDialog.value = true;
  }
}

function onCajaDone() {
  if (pendingQrToken.value) showChecklistDialog.value = true;
}

// Conteo suelto (sin check-out): mismo diálogo, sin QR pendiente → al cerrar
// no sigue al checklist.
function openCajaSuelta() {
  pendingQrToken.value = null;
  showCajaDialog.value = true;
}

function toggleChecklistItem(key: string) {
  if (!CHECKLIST_KEYS.includes(key as ChecklistKey)) return;
  const k = key as ChecklistKey;
  checklistValues.value[k] = !checklistValues.value[k];
}

function cancelCheckOut() {
  // El QR escaneado se descarta: cancelar no manda nada al server.
  pendingQrToken.value = null;
  showChecklistDialog.value = false;
}

async function confirmCheckOut() {
  if (!pendingQrToken.value || !allChecklistChecked.value) return;
  checkingOut.value = true;
  try {
    const checklist: StaffAttendanceChecklistValues = {
      cobros: checklistValues.value.cobros,
      espacio: checklistValues.value.espacio,
      // Solo si hoy aplica (mié/sáb): si no está en la lista, no se manda.
      ...(checklistItems.value.some((i) => i.key === 'lote')
        ? { lote: checklistValues.value.lote }
        : {}),
    };
    const shift = await attendanceApi.checkOut(pendingQrToken.value, checklist);
    $q.notify({
      type: 'positive',
      message: `Jornada cerrada · ${formatDuration(shift.durationMinutes)}`,
    });
    log.info('Check-out registrado', {
      branchId: shift.branchId,
      durationMinutes: shift.durationMinutes,
    });
    showChecklistDialog.value = false;
    pendingQrToken.value = null;
    await loadMe();
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo registrar el check-out');
    log.warn('Check-out fallido', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    checkingOut.value = false;
  }
}

// =========================================================================
// Registro (solo owner/admin)
// =========================================================================

const canSeeReport = computed(() => {
  const role = authStore.user?.role;
  return !!role && JORNADA_REPORT_ROLES.includes(role);
});

const branchOptions = ref<BranchOption[]>([]);
const loadingBranches = ref(false);
const reportBranchId = ref<number | undefined>(undefined);

function monthStartIso(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function todayIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const today = new Date();
const reportFrom = ref(monthStartIso(today));
const reportTo = ref(todayIso(today));

const shifts = ref<StaffAttendanceShiftRow[]>([]);
const shiftsLoading = ref(false);

const shiftColumns: QTableProps['columns'] = [
  { name: 'userName', label: 'Profe', field: 'userName', align: 'left', sortable: true },
  { name: 'branchName', label: 'Sede', field: 'branchName', align: 'left', sortable: true },
  { name: 'shiftDate', label: 'Fecha', field: 'shiftDate', align: 'left', sortable: true },
  { name: 'checkedInAt', label: 'Entrada', field: 'checkedInAt', align: 'center' },
  { name: 'checkedOutAt', label: 'Salida', field: 'checkedOutAt', align: 'center' },
  { name: 'durationMinutes', label: 'Duración', field: 'durationMinutes', align: 'center' },
  { name: 'checklist', label: 'Checklist', field: 'checklist', align: 'left' },
];

function formatShiftDate(dateStr: string): string {
  // Split manual (no `new Date(dateStr)`): una fecha "YYYY-MM-DD" pura no
  // debe pasar por conversión de timezone del navegador.
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

async function fetchBranches() {
  loadingBranches.value = true;
  try {
    const branches = await membersApi.getBranches();
    branchOptions.value = branches.filter((b) => !b.isVirtual);
    const homeBranchId = authStore.user?.branchId;
    if (homeBranchId && branchOptions.value.some((b) => b.id === homeBranchId)) {
      reportBranchId.value = homeBranchId;
    } else {
      reportBranchId.value = branchOptions.value[0]?.id;
    }
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando sucursales');
    log.error('Error cargando sucursales', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    loadingBranches.value = false;
  }
}

async function loadShifts() {
  if (!reportBranchId.value) return;
  shiftsLoading.value = true;
  try {
    shifts.value = await attendanceApi.getShifts({
      branchId: reportBranchId.value,
      from: reportFrom.value,
      to: reportTo.value,
    });
  } catch (err: unknown) {
    const message = extractError(err, 'No se pudo cargar el registro de jornadas');
    log.error('Error cargando registro de jornadas', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    shiftsLoading.value = false;
  }
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  void loadMe();
  if (canSeeReport.value) {
    void fetchBranches().then(() => loadShifts());
  }
});
</script>
