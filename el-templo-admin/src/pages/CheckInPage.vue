<!--
  "Mi jornada": check-in/check-out del staff con el QR físico de la sede
  (mismo QR que escanean los socios). El staff abre esta página desde el
  celular, escanea al llegar y al irse; al cerrar jornada completa un
  checklist antes de mandar.

  Owner/admin NO fichan desde acá: en su lugar ven el TABLERO de jornadas de
  todas las sedes (en turno ahora, jornadas sin check-out, horas por persona)
  y el "Registro" histórico, ambos con los mismos filtros (país solo owner,
  sede o "Todas", rango de fechas).
-->
<template>
  <q-page class="q-pa-md">
    <!-- ================================================================ -->
    <!-- Mi jornada (todos los roles MENOS owner/admin) -->
    <!-- ================================================================ -->
    <template v-if="!canSeeReport">
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
                <div v-if="openShift.cashCountedAt" class="text-body2 text-positive">
                  Caja cerrada a las {{ formatTime(openShift.cashCountedAt) }}
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
        <!-- Cierre de caja suelto (2026-09-08): contar sin cerrar la jornada. Si
           ya se contó, el check-out no la vuelve a pedir (2026-10-06). El
           profe de actividad (sin plata, 2026-10-06) no cuenta la caja. -->
        <div v-if="openShift && !financeBlind" class="col-12 text-center">
          <q-btn
            flat
            no-caps
            color="primary"
            icon="point_of_sale"
            :label="openShift.cashCountedAt ? 'Volver a contar la caja' : 'Contar la caja ahora'"
            @click="openCajaSuelta"
          />
        </div>
      </div>

      <!-- Scanner compartido entre check-in y check-out -->
      <QrScannerDialog v-model="showScanner" :title="scannerTitle" @scanned="onScanned" />

      <!-- Cierre de caja (2026-09-08): antes del checklist, si hay jornada abierta,
         el profe cuenta el efectivo de la caja de su sede. Se puede saltear. -->
      <CerrarCajaDialog
        v-if="!financeBlind"
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

          <!-- La caja ya se cerró en esta jornada: no se vuelve a pedir, pero se
             puede recontar (2026-10-06). -->
          <q-card-section v-if="openShift?.cashCountedAt" class="q-pt-none">
            <div class="row items-center no-wrap q-gutter-sm">
              <q-icon name="check_circle" color="positive" size="24px" />
              <div class="col text-body2">
                Caja cerrada a las {{ formatTime(openShift.cashCountedAt) }}
              </div>
              <q-btn
                flat
                dense
                no-caps
                color="primary"
                label="Volver a contar"
                :disable="checkingOut"
                @click="recontarCaja"
              />
            </div>
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
                <q-item-label v-if="item.required === false" caption>
                  Recordatorio · no es obligatorio para cerrar
                </q-item-label>
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
    </template>

    <!-- ================================================================ -->
    <!-- Tablero + Registro (solo owner/admin) -->
    <!-- ================================================================ -->
    <template v-if="canSeeReport">
      <div class="text-h5 q-mb-md">Jornadas del staff</div>

      <!-- Filtros compartidos por el tablero y el Registro -->
      <div class="row items-center q-gutter-sm q-mb-md">
        <div v-if="isOwner" class="col-12 col-sm-auto" style="min-width: 180px">
          <q-select
            v-model="selectedCountry"
            :options="countryOptions"
            label="País"
            dense
            outlined
            emit-value
            map-options
            @update:model-value="onCountryChange"
          />
        </div>

        <div class="col-12 col-sm-3">
          <q-select
            v-model="selectedBranchId"
            :options="branchOptions"
            label="Sede"
            dense
            outlined
            emit-value
            map-options
            :loading="loadingBranches"
            @update:model-value="reload"
          />
        </div>

        <div class="col-auto">
          <q-btn-dropdown outline no-caps :label="dateRangeLabel" icon="date_range" dense>
            <q-list dense>
              <q-item
                v-for="preset in datePresets"
                :key="preset.label"
                v-close-popup
                clickable
                @click="applyPreset(preset)"
              >
                <q-item-section>{{ preset.label }}</q-item-section>
              </q-item>
              <q-separator />
              <q-item clickable @click="showCustomRange = !showCustomRange">
                <q-item-section>Personalizado</q-item-section>
                <q-item-section side>
                  <q-icon :name="showCustomRange ? 'expand_less' : 'expand_more'" />
                </q-item-section>
              </q-item>
              <template v-if="showCustomRange">
                <q-item>
                  <q-item-section>
                    <q-input v-model="customFrom" type="date" label="Desde" dense outlined />
                  </q-item-section>
                </q-item>
                <q-item>
                  <q-item-section>
                    <q-input v-model="customTo" type="date" label="Hasta" dense outlined />
                  </q-item-section>
                </q-item>
                <q-item>
                  <q-item-section>
                    <q-btn label="Aplicar" color="primary" dense flat @click="applyCustomRange" />
                  </q-item-section>
                </q-item>
              </template>
            </q-list>
          </q-btn-dropdown>
        </div>
      </div>

      <JornadasDashboard
        :dashboard="dashboard"
        :loading="reportLoading"
        @refresh="reload"
        @force-checkout="openForceCheckout"
      />

      <ForceCheckoutDialog v-model="showForceDialog" :target="forceTarget" @forced="reload" />

      <q-separator class="q-mb-md" />
      <div class="text-h6 q-mb-md">Registro</div>

      <q-table
        :rows="shifts"
        :columns="shiftColumns"
        row-key="id"
        :loading="reportLoading"
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
            <template v-if="!props.row.checkedOutAt">
              <q-chip color="warning" text-color="white" dense>abierta</q-chip>
              <q-btn
                flat
                dense
                no-caps
                size="sm"
                color="negative"
                icon="logout"
                label="Forzar salida"
                @click="openForceCheckout(rowToTarget(props.row))"
              />
            </template>
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
            <q-chip
              v-if="props.row.forcedByName"
              dense
              size="sm"
              color="warning"
              text-color="white"
              icon="gavel"
            >
              Forzado
              <q-tooltip>Por {{ props.row.forcedByName }}: {{ props.row.forcedReason }}</q-tooltip>
            </q-chip>
            <template v-else-if="props.row.checklist">
              <q-chip
                v-for="key in visibleChecklistKeys(props.row.checklist)"
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
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
import {
  useStaffAttendanceApi,
  type StaffAttendanceOpenShift,
  type StaffAttendanceChecklistItem,
  type StaffAttendanceChecklistValues,
  type StaffAttendanceShiftRow,
  type StaffAttendanceDashboard,
  type ForceCheckoutTarget,
} from 'src/composables/useStaffAttendanceApi';
import { useMembersApi } from 'src/composables/useMembersApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import { JORNADA_REPORT_ROLES, isFinanceBlindRole } from 'src/config/templo-config';
import {
  formatTime,
  formatDuration,
  formatShiftDate,
  toLocalIsoDate,
} from 'src/utils/jornada-format';
import QrScannerDialog from 'src/components/QrScannerDialog.vue';
import CerrarCajaDialog from 'src/components/caja/CerrarCajaDialog.vue';
import JornadasDashboard from 'src/components/jornadas/JornadasDashboard.vue';
import ForceCheckoutDialog from 'src/components/jornadas/ForceCheckoutDialog.vue';

const log = createLogger('CheckInPage');
const $q = useQuasar();
const authStore = useAuthStore();
const attendanceApi = useStaffAttendanceApi();
const membersApi = useMembersApi();

// owner/admin ven el tablero de todas las sedes en vez de "Mi jornada".
const canSeeReport = computed(() => {
  const role = authStore.user?.role;
  return !!role && JORNADA_REPORT_ROLES.includes(role);
});

const isOwner = computed(() => authStore.user?.role === 'owner');

// =========================================================================
// Estado actual ("me")
// =========================================================================

// 2026-10-06: rol ciego a las finanzas (coach_actividad): sin conteo de caja y
// con un checklist de cierre reducido (el server lo manda ya recortado).
const financeBlind = computed(() => isFinanceBlindRole(authStore.user?.role));

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

const CHECKLIST_KEYS = ['cobros', 'espacio', 'lote', 'videos'] as const;
type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

/** Etiquetas cortas para los chips del Registro (el server manda la etiqueta
 *  completa vía `getMe().checklist`, usada en el diálogo de cierre). */
const CHECKLIST_SHORT_LABELS: Record<ChecklistKey, string> = {
  cobros: 'Cobros',
  espacio: 'Espacio',
  lote: 'Lote',
  videos: 'Videos',
};

const showChecklistDialog = ref(false);
const pendingQrToken = ref<string | null>(null);
const checkingOut = ref(false);
const checklistValues = ref<Record<ChecklistKey, boolean>>({
  cobros: false,
  espacio: false,
  lote: false,
  videos: false,
});

// Solo los ítems OBLIGATORIOS que el server ofrece hoy (lote: mié/sáb) tienen
// que estar tildados; los recordatorios (`required: false`, p. ej. videos de
// los profes) no bloquean el cierre.
const allChecklistChecked = computed(() =>
  checklistItems.value
    .filter((item) => item.required !== false)
    .every((item) => checklistValues.value[item.key])
);

// Cierre de caja (2026-09-08): el QR ya validó que el profe está cerrando su
// jornada; antes del checklist se le pide contar la caja de la sede. Cancelar
// o saltear el conteo no cancela el check-out: sigue al checklist.
// 2026-10-06: si la jornada ya tiene un cierre de caja (p. ej. "Contar la caja
// ahora" desde lejos del QR), no se vuelve a pedir: va directo al checklist,
// que muestra la hora del cierre y permite recontar.
const showCajaDialog = ref(false);

async function openChecklistDialog(qrToken: string) {
  pendingQrToken.value = qrToken;
  checklistValues.value = { cobros: false, espacio: false, lote: false, videos: false };
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
  if (openShift.value && !financeBlind.value && !openShift.value.cashCountedAt) {
    showCajaDialog.value = true;
  } else {
    showChecklistDialog.value = true;
  }
}

function onCajaDone() {
  if (pendingQrToken.value) showChecklistDialog.value = true;
  void refreshCashCounted();
}

// Refresca `cashCountedAt` (si se registró un cierre). Si falla, solo queda
// desactualizada la hora mostrada: el próximo check-out pedirá la caja.
async function refreshCashCounted() {
  try {
    await fetchMe();
  } catch (err: unknown) {
    log.warn('No se pudo refrescar la jornada tras el cierre de caja', {
      error: extractError(err, 'Error desconocido'),
    });
  }
}

// Desde el checklist: el QR pendiente se conserva, así que al cerrar el
// diálogo de caja (`onCajaDone`) vuelve al checklist con lo ya tildado.
function recontarCaja() {
  showChecklistDialog.value = false;
  showCajaDialog.value = true;
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
      // Solo si está en la lista del server (un rol sin plata no la tiene).
      ...(checklistItems.value.some((i) => i.key === 'cobros')
        ? { cobros: checklistValues.value.cobros }
        : {}),
      espacio: checklistValues.value.espacio,
      // Solo si hoy aplica (mié/sáb): si no está en la lista, no se manda.
      ...(checklistItems.value.some((i) => i.key === 'lote')
        ? { lote: checklistValues.value.lote }
        : {}),
      // Recordatorio de los profes (`coach`): si el server no lo ofrece, no se manda.
      ...(checklistItems.value.some((i) => i.key === 'videos')
        ? { videos: checklistValues.value.videos }
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
// Tablero + Registro (solo owner/admin)
// =========================================================================

/** Tope del API para `from..to` (días, inclusive). */
const MAX_RANGE_DAYS = 62;

// -- País (solo owner; admin queda siempre en su país por el API) ---------

const countryOptions = [
  { label: 'Todos', value: undefined },
  { label: 'Argentina', value: 'AR' as const },
  { label: 'España', value: 'ES' as const },
];
const selectedCountry = ref<'AR' | 'ES' | undefined>(undefined);

// -- Sede -----------------------------------------------------------------

const ALL_BRANCHES_OPTION = { label: 'Todas las sedes', value: undefined };
const branchOptions = ref<Array<{ label: string; value: number | undefined }>>([
  ALL_BRANCHES_OPTION,
]);
const selectedBranchId = ref<number | undefined>(undefined);
const loadingBranches = ref(false);

// -- Rango de fechas ------------------------------------------------------

interface DatePreset {
  label: string;
  getRange: () => { from: string; to: string };
}

const datePresets: DatePreset[] = [
  {
    label: 'Hoy',
    getRange: () => {
      const iso = toLocalIsoDate(new Date());
      return { from: iso, to: iso };
    },
  },
  {
    label: 'Esta semana',
    getRange: () => {
      // Lunes a domingo.
      const d = new Date();
      const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
      const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
      return { from: toLocalIsoDate(monday), to: toLocalIsoDate(sunday) };
    },
  },
  {
    label: 'Este mes',
    getRange: () => {
      const d = new Date();
      return {
        from: toLocalIsoDate(new Date(d.getFullYear(), d.getMonth(), 1)),
        to: toLocalIsoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
      };
    },
  },
  {
    label: 'Mes pasado',
    getRange: () => {
      const d = new Date();
      return {
        from: toLocalIsoDate(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
        to: toLocalIsoDate(new Date(d.getFullYear(), d.getMonth(), 0)),
      };
    },
  },
];

const DEFAULT_PRESET_LABEL = 'Este mes';
const initialRange = datePresets.find((p) => p.label === DEFAULT_PRESET_LABEL)!.getRange();
const reportFrom = ref(initialRange.from);
const reportTo = ref(initialRange.to);
const activePresetLabel = ref(DEFAULT_PRESET_LABEL);
const showCustomRange = ref(false);
const customFrom = ref(initialRange.from);
const customTo = ref(initialRange.to);

const dateRangeLabel = computed(
  () =>
    activePresetLabel.value ||
    `${formatShiftDate(reportFrom.value)} - ${formatShiftDate(reportTo.value)}`
);

/** Mensaje de error del rango, o `null` si es válido (≤ 62 días, desde ≤ hasta). */
function rangeError(from: string, to: string): string | null {
  if (!from || !to) return 'Completá las fechas Desde y Hasta';
  const fromMs = new Date(`${from}T12:00:00Z`).getTime();
  const toMs = new Date(`${to}T12:00:00Z`).getTime();
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return 'Rango de fechas inválido';
  if (toMs < fromMs) return 'La fecha Hasta no puede ser anterior a Desde';
  const days = Math.round((toMs - fromMs) / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) return `El rango máximo es de ${MAX_RANGE_DAYS} días`;
  return null;
}

function applyPreset(preset: DatePreset) {
  const range = preset.getRange();
  reportFrom.value = range.from;
  reportTo.value = range.to;
  activePresetLabel.value = preset.label;
  showCustomRange.value = false;
  void reload();
}

function applyCustomRange() {
  const invalid = rangeError(customFrom.value, customTo.value);
  if (invalid) {
    $q.notify({ type: 'negative', message: invalid });
    return;
  }
  reportFrom.value = customFrom.value;
  reportTo.value = customTo.value;
  activePresetLabel.value = '';
  showCustomRange.value = false;
  void reload();
}

// -- Datos ----------------------------------------------------------------

const dashboard = ref<StaffAttendanceDashboard | null>(null);
const shifts = ref<StaffAttendanceShiftRow[]>([]);
const reportLoading = ref(false);

const shiftColumns: QTableProps['columns'] = [
  { name: 'userName', label: 'Profe', field: 'userName', align: 'left', sortable: true },
  { name: 'branchName', label: 'Sede', field: 'branchName', align: 'left', sortable: true },
  { name: 'shiftDate', label: 'Fecha', field: 'shiftDate', align: 'left', sortable: true },
  { name: 'checkedInAt', label: 'Entrada', field: 'checkedInAt', align: 'center' },
  { name: 'checkedOutAt', label: 'Salida', field: 'checkedOutAt', align: 'center' },
  { name: 'durationMinutes', label: 'Duración', field: 'durationMinutes', align: 'center' },
  { name: 'checklist', label: 'Checklist', field: 'checklist', align: 'left' },
];

/** Claves del checklist a pintar en el Registro: `cobros: null` = la jornada era
 *  de un rol sin plata (coach_actividad), no se muestra el chip. Idem `videos`
 *  null/ausente: no era profe (`coach`) o la jornada es anterior al ítem. */
function visibleChecklistKeys(checklist: StaffAttendanceChecklistValues): ChecklistKey[] {
  return CHECKLIST_KEYS.filter(
    (key) =>
      !(key === 'cobros' && checklist.cobros == null) &&
      !(key === 'videos' && checklist.videos == null)
  );
}

async function fetchBranches() {
  loadingBranches.value = true;
  try {
    const branches = await membersApi.getBranches({
      country: isOwner.value ? selectedCountry.value : undefined,
    });
    branchOptions.value = [
      ALL_BRANCHES_OPTION,
      ...branches.filter((b) => !b.isVirtual).map((b) => ({ label: b.name, value: b.id })),
    ];
    // Si la sede elegida quedó fuera del país seleccionado, volver a "Todas".
    if (
      selectedBranchId.value !== undefined &&
      !branchOptions.value.some((o) => o.value === selectedBranchId.value)
    ) {
      selectedBranchId.value = undefined;
    }
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando sucursales');
    if (!isExpectedClientError(err)) log.error('Error cargando sucursales', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    loadingBranches.value = false;
  }
}

async function onCountryChange() {
  await fetchBranches();
  await reload();
}

// -- Forzar salida (jornada abierta de otra persona) ------------------------

const showForceDialog = ref(false);
const forceTarget = ref<ForceCheckoutTarget | null>(null);

function openForceCheckout(target: ForceCheckoutTarget) {
  forceTarget.value = target;
  showForceDialog.value = true;
}

function rowToTarget(row: StaffAttendanceShiftRow): ForceCheckoutTarget {
  return {
    shiftId: row.id,
    userName: row.userName,
    branchName: row.branchName,
    checkedInAt: row.checkedInAt,
    shiftDate: row.shiftDate,
  };
}

// Descarta respuestas de una recarga vieja si el usuario cambió los filtros
// mientras volaba el request.
let reloadSeq = 0;

/** Recarga tablero + Registro con los MISMOS filtros (un solo punto de entrada). */
async function reload() {
  const invalid = rangeError(reportFrom.value, reportTo.value);
  if (invalid) {
    $q.notify({ type: 'negative', message: invalid });
    return;
  }
  const seq = ++reloadSeq;
  reportLoading.value = true;
  const params = {
    branchId: selectedBranchId.value,
    country: isOwner.value ? selectedCountry.value : undefined,
    from: reportFrom.value,
    to: reportTo.value,
  };
  try {
    const [dash, rows] = await Promise.all([
      attendanceApi.getDashboard(params),
      attendanceApi.getShifts(params),
    ]);
    if (seq !== reloadSeq) return;
    dashboard.value = dash;
    shifts.value = rows;
  } catch (err: unknown) {
    if (seq !== reloadSeq) return;
    const message = extractError(err, 'No se pudo cargar el tablero de jornadas');
    if (!isExpectedClientError(err)) log.error('Error cargando jornadas', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    if (seq === reloadSeq) reportLoading.value = false;
  }
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  if (canSeeReport.value) {
    // owner/admin no ven "Mi jornada": ni siquiera se consulta /me.
    void fetchBranches().then(() => reload());
  } else {
    void loadMe();
  }
});
</script>
