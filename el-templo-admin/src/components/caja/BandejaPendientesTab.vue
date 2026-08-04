<template>
  <div class="q-pa-md">
    <!-- ========================================================== -->
    <!-- Vencido counter banner (D-08/D-09) — only when vencidoCount>0 -->
    <!-- threshold comes from the response payload, never hardcoded.   -->
    <!-- ========================================================== -->
    <q-banner v-if="vencidoCount > 0" dense rounded class="q-pa-sm q-mb-md bg-red-1 text-negative">
      <template #avatar>
        <q-icon name="warning" color="negative" />
      </template>
      &#9888; {{ vencidoCount }} pendientes superan los {{ thresholdDays }} días
    </q-banner>

    <!-- ========================================================== -->
    <!-- Filter row + Excel export -->
    <!-- ========================================================== -->
    <div class="row items-center q-mb-md">
      <q-btn-toggle
        v-model="statusFilter"
        :options="statusOptions"
        toggle-color="primary"
        color="white"
        text-color="grey-8"
        flat
        dense
        no-caps
        @update:model-value="onFilterChange"
      />
      <q-space />
      <!-- Excel only — no dead PDF control (REP-04, Excel-only v1). -->
      <q-btn
        icon="download"
        label="Exportar Excel"
        color="primary"
        outline
        dense
        :loading="exporting"
        @click="onExportBandeja"
      />
    </div>

    <!-- ========================================================== -->
    <!-- Bandeja list — server-side, oldest-first (column sort off) -->
    <!-- ========================================================== -->
    <q-table
      :rows="rows"
      :columns="columns"
      row-key="id"
      :loading="loadingTable"
      :pagination="tablePagination"
      :rows-per-page-options="[20, 50, 100]"
      @request="onTableRequest"
    >
      <!-- Empty states (D-09 copy) -->
      <template #no-data>
        <div class="full-width text-center q-pa-lg text-grey-6">
          <template v-if="statusFilter === 'observados'"> No hay pagos observados. </template>
          <template v-else>
            <div class="text-subtitle1 text-weight-medium">Sin pendientes</div>
            <div class="text-caption">No hay pagos esperando validación. Buen trabajo.</div>
          </template>
        </div>
      </template>

      <!-- Socio (Terracotta clickable link) -->
      <template #body-cell-socio="slotProps">
        <q-td :props="slotProps">
          <span
            v-if="slotProps.row.memberId"
            class="text-weight-medium text-primary cursor-pointer"
            @click="goToMember(slotProps.row.memberId)"
          >
            {{ slotProps.row.memberName }}
          </span>
          <span v-else class="text-weight-medium">{{ slotProps.row.memberName }}</span>
          <!-- COBRO-02: cobro suelto sin plan activo → chip que lleva a la ficha a asignar el plan. -->
          <div v-if="slotProps.row.miscReason === 'sin_plan' && slotProps.row.memberId">
            <q-chip
              clickable
              dense
              color="warning"
              text-color="dark"
              icon="person_add"
              size="sm"
              class="q-mt-xs q-ml-none"
              @click="goToMember(slotProps.row.memberId)"
            >
              Sin plan — asignar
            </q-chip>
          </div>
        </q-td>
      </template>

      <!-- Monto + moneda badge beside -->
      <template #body-cell-monto="slotProps">
        <q-td :props="slotProps">
          <span class="text-weight-bold q-mr-xs">
            {{ formatPrice(slotProps.row.amount, slotProps.row.currency) }}
          </span>
          <q-badge color="grey-3" text-color="grey-8" :label="slotProps.row.currency" />
        </q-td>
      </template>

      <!-- Medio -->
      <template #body-cell-medio="slotProps">
        <q-td :props="slotProps">
          <q-badge
            :color="methodColor(slotProps.row.paymentMethod)"
            :label="methodLabel(slotProps.row.paymentMethod)"
          />
        </q-td>
      </template>

      <!-- Caja -->
      <template #body-cell-caja="slotProps">
        <q-td :props="slotProps">{{ slotProps.row.cashRegisterName }}</q-td>
      </template>

      <!-- Cargado por (text-caption) -->
      <template #body-cell-cargado="slotProps">
        <q-td :props="slotProps" class="text-caption text-grey-7">
          {{ slotProps.row.recorderName }}
        </q-td>
      </template>

      <!-- Antigüedad — gold 1..threshold, warm-red >threshold -->
      <template #body-cell-antiguedad="slotProps">
        <q-td :props="slotProps">
          <span
            class="text-caption"
            :class="slotProps.row.isOverdue ? 'text-negative text-weight-medium' : 'text-warning'"
          >
            hace {{ slotProps.row.ageInDays }} días
          </span>
        </q-td>
      </template>

      <!-- Estado badge (+ vencido badge when overdue) -->
      <template #body-cell-estado="slotProps">
        <q-td :props="slotProps">
          <q-badge
            v-if="slotProps.row.validationStatus === 'observado'"
            color="amber"
            text-color="grey-9"
            label="Observado"
          />
          <q-badge v-else color="warning" label="Pendiente" />
          <q-badge
            v-if="slotProps.row.isOverdue"
            color="negative"
            label="vencido"
            class="q-ml-xs"
          />
        </q-td>
      </template>

      <!-- Acciones: prominent Validar + ⋮ menu -->
      <template #body-cell-acciones="slotProps">
        <q-td :props="slotProps">
          <div class="row items-center justify-end no-wrap q-gutter-xs">
            <!-- COBRO-05: bloqueo del Validar para cobros sin plan activo.
                 El server ya lo rechaza (defensa en profundidad); acá se
                 deshabilita el botón y se redirige al chip "Sin plan — asignar". -->
            <q-btn
              label="Validar"
              color="primary"
              dense
              unelevated
              size="sm"
              :disable="slotProps.row.miscReason === 'sin_plan'"
              :loading="actionLoadingId === slotProps.row.id"
              @click="onValidar(slotProps.row)"
            >
              <q-tooltip v-if="slotProps.row.miscReason === 'sin_plan'">
                Asigná un plan para imputar este cobro
              </q-tooltip>
            </q-btn>
            <q-btn flat dense round icon="more_vert" size="sm">
              <q-menu>
                <q-list style="min-width: 160px">
                  <q-item clickable v-close-popup @click="openObservar(slotProps.row)">
                    <q-item-section avatar><q-icon name="flag" color="amber-8" /></q-item-section>
                    <q-item-section>Observar</q-item-section>
                  </q-item>
                  <q-item clickable v-close-popup @click="openCorregir(slotProps.row)">
                    <q-item-section avatar><q-icon name="edit" /></q-item-section>
                    <q-item-section>Corregir</q-item-section>
                  </q-item>
                  <q-item clickable v-close-popup @click="openAnular(slotProps.row)">
                    <q-item-section avatar><q-icon name="block" color="negative" /></q-item-section>
                    <q-item-section class="text-negative">Anular</q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>
          </div>
        </q-td>
      </template>
    </q-table>

    <!-- ========================================================== -->
    <!-- Validar dialog — CAJA-02/CAJA-03: confirmar/cambiar la caja -->
    <!-- imputada (incl. elegir cuenta banco para transferencias).  -->
    <!-- ========================================================== -->
    <q-dialog v-model="validarDialog">
      <q-card v-if="actionRow" style="width: 480px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">Validar pago de {{ actionRow.memberName }}</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <div class="text-body2 q-mb-md">
            Validar el pago de
            {{ formatPrice(actionRow.amount, actionRow.currency) }} de {{ actionRow.memberName }} e
            imputarlo a la caja seleccionada.
          </div>
          <q-select
            v-model="selectedCajaId"
            :options="cajaOptions"
            :label="cajaSelectLabel"
            outlined
            dense
            emit-value
            map-options
            :hint="cajaOptions.length === 0 ? 'No hay cajas activas para esta moneda' : ''"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" color="grey" v-close-popup />
          <q-btn
            label="Validar"
            color="primary"
            :disable="selectedCajaId === null"
            :loading="dialogLoading"
            @click="submitValidar"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ========================================================== -->
    <!-- Observar dialog -->
    <!-- ========================================================== -->
    <q-dialog v-model="observarDialog">
      <q-card v-if="actionRow" style="width: 480px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">Observar pago de {{ actionRow.memberName }}</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <q-input
            v-model="observarReason"
            type="textarea"
            label="Motivo de observación *"
            autogrow
            outlined
            :rules="[(v) => (v && v.trim().length > 0) || 'Requerido']"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" color="grey" v-close-popup />
          <q-btn
            label="Observar"
            color="amber-8"
            :disable="observarReason.trim().length === 0"
            :loading="dialogLoading"
            @click="submitObservar"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ========================================================== -->
    <!-- Corregir dialog — ONLY amount / paymentMethod / memberId   -->
    <!-- (the 137 correct endpoint accepts no other fields)         -->
    <!-- ========================================================== -->
    <q-dialog v-model="corregirDialog">
      <q-card v-if="actionRow" style="width: 480px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">Corregir pago de {{ actionRow.memberName }}</div>
        </q-card-section>
        <q-card-section class="q-pt-none q-gutter-md">
          <q-input v-model.number="corregir.amount" type="number" label="Monto" outlined dense />
          <q-select
            v-model="corregir.paymentMethod"
            :options="methodSelectOptions"
            label="Método de pago"
            outlined
            dense
            emit-value
            map-options
          />
          <q-input
            v-model.number="corregir.memberId"
            type="number"
            label="ID de socio"
            outlined
            dense
            hint="Solo si el pago se cargó al socio equivocado"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" color="grey" v-close-popup />
          <q-btn
            label="Corregir"
            color="primary"
            :loading="dialogLoading"
            @click="submitCorregir"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ========================================================== -->
    <!-- Anular membership 1-a-1 popup (D-05 / 137 D-10)            -->
    <!-- ========================================================== -->
    <q-dialog v-model="anularDialog">
      <q-card v-if="actionRow" style="width: 480px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">Anular pago de {{ actionRow.memberName }}</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <!-- ALTA-06 (Phase 148): cuando ESTA carga creó un alumno nuevo (PoS
               profe alta), anularla dispara un cascade server-side que desactiva
               la membresía y deja al alumno inactivo. Se advierte ANTES del
               confirm rojo. Para cargas de alumno preexistente (createdMemberName
               null) el bloque no se muestra y la copy queda como hasta hoy. -->
          <q-banner
            v-if="actionRow.createdMemberName"
            dense
            rounded
            class="q-mb-md bg-red-1 text-negative"
          >
            <template #avatar>
              <q-icon name="warning" color="negative" />
            </template>
            Esta carga creó al alumno <strong>{{ actionRow.createdMemberName }}</strong
            >. Al anular, también se desactivará su membresía y el alumno quedará
            <strong>inactivo</strong> (no se elimina). ¿Anular de todos modos?
          </q-banner>
          <div class="text-body2 q-mb-md">
            Anular el pago de
            {{ formatPrice(actionRow.amount, actionRow.currency) }} de {{ actionRow.memberName }}.
            Esta acción deja rastro y no se puede deshacer.
          </div>
          <!-- Membership decision: only when the void touches an active membership
               link. The row carries a member; show the toggle (safer default per
               UI-SPEC). When no member is linked, hide it (plain void). -->
          <div v-if="actionRow.memberId" class="q-mb-md">
            <q-toggle
              v-model="keepMembershipActive"
              label="Mantener la membresía activa"
              color="primary"
            />
            <div class="text-caption text-grey-7 q-ml-md">
              Si la desactivás, el socio pierde el beneficio de este pago.
            </div>
          </div>
          <q-input
            v-model="anularReason"
            type="textarea"
            label="Motivo de anulación *"
            autogrow
            outlined
            :rules="[(v) => (v && v.trim().length > 0) || 'Requerido']"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" color="grey" v-close-popup />
          <q-btn
            label="Anular"
            color="negative"
            :disable="anularReason.trim().length === 0"
            :loading="dialogLoading"
            @click="submitAnular"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type { QTableProps } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { formatPrice } from 'src/utils/format-price';
import { useTransactionsApi } from 'src/composables/useTransactionsApi';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_COLORS,
  PAYMENT_METHOD_FILTER_OPTIONS,
  type PaymentMethod,
  type PendingTrayItem,
  type PendingTrayParams,
  type CorrectedFields,
  type CajaSaldoRow,
  type CashBalancesParams,
} from 'src/types/transaction';

// =========================================================================
// Props — shared selectedCountry / isOwner from the CajaPage hub.
// =========================================================================

const props = defineProps<{
  selectedCountry: 'AR' | 'ES';
  isOwner: boolean;
}>();

// Emit the live vencido count up to the hub so the Pendientes tab floating
// badge stays visible from the other tabs (D-08).
const emit = defineEmits<{ (e: 'update:vencido-count', count: number): void }>();

const log = createLogger('BandejaPendientesTab');
const $q = useQuasar();
const router = useRouter();
const transactionsApi = useTransactionsApi();

// =========================================================================
// State
// =========================================================================

const rows = ref<PendingTrayItem[]>([]);
const loadingTable = ref(false);
const exporting = ref(false);
// thresholdDays comes from the bandeja response (D-08) — never hardcoded.
const thresholdDays = ref(3);
const vencidoCount = ref(0);
const actionLoadingId = ref<number | null>(null);
// CAJA-02/CAJA-03: cajas activas (firme + pendiente) — fuente de las opciones
// del selector de caja al validar. Se cargan una vez por país.
const cashRegisters = ref<CajaSaldoRow[]>([]);

const statusFilter = ref<'pendientes' | 'observados' | 'todos'>('pendientes');
const statusOptions = [
  { label: 'Pendientes', value: 'pendientes' },
  { label: 'Observados', value: 'observados' },
  { label: 'Todos', value: 'todos' },
];

const tablePagination = ref({
  page: 1,
  rowsPerPage: 20,
  rowsNumber: 0,
  sortBy: null as string | null,
  descending: false,
});

const methodSelectOptions = PAYMENT_METHOD_FILTER_OPTIONS;

// =========================================================================
// Columns — oldest-first server-enforced, column sorting disabled.
// =========================================================================

const columns: QTableProps['columns'] = [
  { name: 'socio', label: 'Socio', field: 'memberName', align: 'left', sortable: false },
  { name: 'monto', label: 'Monto', field: 'amount', align: 'left', sortable: false },
  { name: 'medio', label: 'Medio', field: 'paymentMethod', align: 'left', sortable: false },
  { name: 'caja', label: 'Caja', field: 'cashRegisterName', align: 'left', sortable: false },
  { name: 'cargado', label: 'Cargado por', field: 'recorderName', align: 'left', sortable: false },
  { name: 'antiguedad', label: 'Antigüedad', field: 'ageInDays', align: 'left', sortable: false },
  { name: 'estado', label: 'Estado', field: 'validationStatus', align: 'left', sortable: false },
  {
    name: 'acciones',
    label: '',
    field: 'id',
    align: 'right',
    sortable: false,
    style: 'width: 160px',
  },
];

// =========================================================================
// Display helpers
// =========================================================================

function methodLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

function methodColor(method: PaymentMethod): string {
  return PAYMENT_METHOD_COLORS[method] ?? 'grey';
}

function goToMember(memberId: number) {
  router.push(`/alumnos/${memberId}`);
}

// =========================================================================
// Data loading
// =========================================================================

async function loadBandeja() {
  loadingTable.value = true;
  try {
    const params: PendingTrayParams = {
      status: statusFilter.value,
      country: props.isOwner ? props.selectedCountry : undefined,
      page: tablePagination.value.page,
      limit: tablePagination.value.rowsPerPage,
    };
    const result = await transactionsApi.getPendingTray(params);
    rows.value = result.rows;
    tablePagination.value.rowsNumber = result.total;
    thresholdDays.value = result.thresholdDays;
    vencidoCount.value = result.rows.filter((r) => r.isOverdue).length;
    emit('update:vencido-count', vencidoCount.value);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading bandeja', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando bandeja' });
  } finally {
    loadingTable.value = false;
  }
}

function onFilterChange() {
  tablePagination.value.page = 1;
  loadBandeja();
}

function onTableRequest(tableProps: { pagination: { page: number; rowsPerPage: number } }) {
  tablePagination.value.page = tableProps.pagination.page;
  tablePagination.value.rowsPerPage = tableProps.pagination.rowsPerPage;
  loadBandeja();
}

// =========================================================================
// Cajas activas — opciones del selector de caja al validar.
// =========================================================================

async function loadCashRegisters() {
  try {
    const params: CashBalancesParams = {
      country: props.isOwner ? props.selectedCountry : undefined,
    };
    cashRegisters.value = await transactionsApi.getCashRegisterBalances(params);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading cash registers', { error: message });
  }
}

// =========================================================================
// Validar — dialog con selector de caja → validate(cashRegisterId) → refresh.
// CAJA-02/CAJA-03: gestión confirma o cambia la caja imputada (incl. cuenta
// banco para transferencias). COBRO-05: bloqueado para miscReason='sin_plan'.
// =========================================================================

const validarDialog = ref(false);
const selectedCajaId = ref<number | null>(null);

// Opciones filtradas por la moneda de la fila y acotadas por el medio de pago:
// transferencia/tarjeta → cuentas banco (Galicia / Mercado Pago); efectivo →
// cajas de efectivo; otros medios → todas las cajas de esa moneda. El backend
// (plan 02) valida coherencia igual (defensa en profundidad).
const cajaOptions = computed<Array<{ label: string; value: number }>>(() => {
  const row = actionRow.value;
  if (!row) return [];
  return cashRegisters.value
    .filter((c) => c.currency === row.currency)
    .filter((c) => {
      if (
        row.paymentMethod === 'transfer' ||
        row.paymentMethod === 'card' ||
        row.paymentMethod === 'direct_debit'
      ) {
        return c.type === 'banco';
      }
      if (row.paymentMethod === 'cash') return c.type === 'efectivo';
      return true;
    })
    .map((c) => ({ label: c.name, value: c.cashRegisterId }));
});

const cajaSelectLabel = computed(() => {
  const method = actionRow.value?.paymentMethod;
  return method === 'transfer' || method === 'direct_debit' ? 'Cuenta banco' : 'Caja';
});

function onValidar(row: PendingTrayItem) {
  // COBRO-05 guard — el botón ya está :disable para sin_plan; esto es la
  // segunda barrera por si el evento se dispara igual (defensa en profundidad).
  if (row.miscReason === 'sin_plan') return;
  actionRow.value = row;
  // Pre-seleccionar la caja sugerida si está entre las opciones de la moneda.
  selectedCajaId.value = row.cashRegisterId;
  validarDialog.value = true;
}

async function submitValidar() {
  if (!actionRow.value || selectedCajaId.value === null) return;
  const row = actionRow.value;
  actionLoadingId.value = row.id;
  dialogLoading.value = true;
  try {
    await transactionsApi.validateTransaction(row.id, selectedCajaId.value);
    $q.notify({ type: 'positive', message: 'Pago validado' });
    validarDialog.value = false;
    await loadBandeja();
  } catch {
    // Surface the backend 400 message (moneda incoherente / sin_plan) — el
    // composable ya extrajo el mensaje del server en transactionsApi.error.
    const message = transactionsApi.error.value ?? 'Error al validar el pago';
    log.error('Error validating transaction', { error: message });
    $q.notify({ type: 'negative', message });
  } finally {
    actionLoadingId.value = null;
    dialogLoading.value = false;
  }
}

// =========================================================================
// Shared dialog state
// =========================================================================

const actionRow = ref<PendingTrayItem | null>(null);
const dialogLoading = ref(false);

// -- Observar --
const observarDialog = ref(false);
const observarReason = ref('');

function openObservar(row: PendingTrayItem) {
  actionRow.value = row;
  observarReason.value = '';
  observarDialog.value = true;
}

async function submitObservar() {
  if (!actionRow.value || observarReason.value.trim().length === 0) return;
  dialogLoading.value = true;
  try {
    await transactionsApi.observeTransaction(actionRow.value.id, observarReason.value.trim());
    $q.notify({ type: 'positive', message: 'Pago observado' });
    observarDialog.value = false;
    await loadBandeja();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error observing transaction', { error: message });
    $q.notify({ type: 'negative', message: 'Error al observar el pago' });
  } finally {
    dialogLoading.value = false;
  }
}

// -- Corregir (ONLY amount / paymentMethod / memberId) --
const corregirDialog = ref(false);
const corregir = reactive<{
  amount: number | null;
  paymentMethod: PaymentMethod | null;
  memberId: number | null;
}>({ amount: null, paymentMethod: null, memberId: null });

function openCorregir(row: PendingTrayItem) {
  actionRow.value = row;
  corregir.amount = row.amount;
  corregir.paymentMethod = row.paymentMethod;
  corregir.memberId = row.memberId;
  corregirDialog.value = true;
}

async function submitCorregir() {
  if (!actionRow.value) return;
  const row = actionRow.value;
  // Send only the fields that actually changed — the 137 endpoint accepts
  // a subset of amount / paymentMethod / memberId (no cashRegister / notes).
  const correctedFields: CorrectedFields = {};
  if (corregir.amount !== null && corregir.amount !== row.amount) {
    correctedFields.amount = corregir.amount;
  }
  if (corregir.paymentMethod !== null && corregir.paymentMethod !== row.paymentMethod) {
    correctedFields.paymentMethod = corregir.paymentMethod;
  }
  if (corregir.memberId !== null && corregir.memberId !== row.memberId) {
    correctedFields.memberId = corregir.memberId;
  }
  if (Object.keys(correctedFields).length === 0) {
    $q.notify({ type: 'info', message: 'No hay cambios para corregir' });
    return;
  }
  dialogLoading.value = true;
  try {
    await transactionsApi.correctTransaction(row.id, correctedFields);
    $q.notify({ type: 'positive', message: 'Pago corregido' });
    corregirDialog.value = false;
    await loadBandeja();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error correcting transaction', { error: message });
    $q.notify({ type: 'negative', message: 'Error al corregir el pago' });
  } finally {
    dialogLoading.value = false;
  }
}

// -- Anular (membership 1-a-1 popup) --
const anularDialog = ref(false);
const anularReason = ref('');
const keepMembershipActive = ref(true); // LOCKED default ON (D-05 / 137 D-10)

function openAnular(row: PendingTrayItem) {
  actionRow.value = row;
  anularReason.value = '';
  keepMembershipActive.value = true;
  anularDialog.value = true;
}

async function submitAnular() {
  if (!actionRow.value || anularReason.value.trim().length === 0) return;
  const row = actionRow.value;
  dialogLoading.value = true;
  try {
    // Thread keepMembershipActive only when the void touches a member link;
    // a member-less row does a plain void (no membership decision).
    if (row.memberId) {
      await transactionsApi.voidTransaction(
        row.id,
        anularReason.value.trim(),
        keepMembershipActive.value
      );
    } else {
      await transactionsApi.voidTransaction(row.id, anularReason.value.trim());
    }
    $q.notify({ type: 'positive', message: 'Pago anulado' });
    anularDialog.value = false;
    await loadBandeja();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error voiding transaction', { error: message });
    $q.notify({ type: 'negative', message: 'Error al anular el pago' });
  } finally {
    dialogLoading.value = false;
  }
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  loadBandeja();
  loadCashRegisters();
});

// Component-level onUnmounted is allowed (the rule forbids onUnmounted INSIDE
// the composable, not in the SFC). Drives the composable cleanup().
onUnmounted(() => {
  transactionsApi.cleanup();
});

// Re-fetch when the hub switches country (owner AR/ES).
watch(
  () => props.selectedCountry,
  () => {
    tablePagination.value.page = 1;
    loadBandeja();
    loadCashRegisters();
  }
);
</script>
