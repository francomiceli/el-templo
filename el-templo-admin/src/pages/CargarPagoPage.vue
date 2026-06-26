<template>
  <q-page class="q-pa-md" style="max-width: 480px; margin: 0 auto">
    <!-- Page title -->
    <div class="text-h5 q-mb-md">Cargar pago</div>

    <!-- Mode toggle: Renovar plan / Cobro suelto -->
    <q-btn-toggle
      v-model="mode"
      spread
      unelevated
      no-caps
      toggle-color="primary"
      class="full-width q-mb-md"
      :options="[
        { label: 'Pago de plan', value: 'renew' },
        { label: 'Cobro suelto', value: 'misc' },
        { label: 'Alta + plan', value: 'alta' },
      ]"
      @update:model-value="onModeChange"
    />

    <!-- ALTA + PLAN: chip Sede al tope (default sede del profe, editable). Solo
         en modo alta; renew/misc usan la sede del socio existente. -->
    <q-select
      v-if="mode === 'alta'"
      v-model="sucursalId"
      :options="branchOptions"
      option-value="id"
      option-label="name"
      emit-value
      map-options
      dense
      outlined
      label="Sede"
      class="q-mb-md"
      @update:model-value="onSucursalChange"
    >
      <template #prepend>
        <q-icon name="place" color="primary" />
      </template>
    </q-select>

    <!-- Form card -->
    <q-card bordered flat class="q-mb-lg">
      <q-card-section class="q-gutter-sm">
        <!-- Socio typeahead -->
        <q-select
          v-model="selectedMember"
          :options="memberSearchResults"
          option-value="id"
          option-label="displayLabel"
          label="Buscar socio (nombre o DNI)"
          outlined
          use-input
          clearable
          input-debounce="300"
          :loading="searchingMembers"
          @filter="onMemberSearch"
          @update:model-value="onMemberSelected"
        >
          <template #no-option>
            <q-item>
              <q-item-section class="text-grey-5 text-italic">
                {{ searchQuery ? 'Sin resultados' : 'Escribe para buscar' }}
              </q-item-section>
            </q-item>
            <!-- ALTA: dar de alta un alumno nuevo cuando no hay match -->
            <q-item v-if="mode === 'alta'" clickable v-ripple @click="onNuevoAlumno">
              <q-item-section avatar>
                <q-icon name="person_add" color="primary" />
              </q-item-section>
              <q-item-section class="text-primary text-weight-bold">
                + Nuevo alumno
              </q-item-section>
            </q-item>
          </template>
          <template #option="scope">
            <q-item v-bind="scope.itemProps">
              <q-item-section>
                <q-item-label>{{ scope.opt.displayLabel }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-badge :color="scope.opt.statusColor" :label="scope.opt.statusLabel" />
              </q-item-section>
            </q-item>
          </template>
        </q-select>

        <!-- Deuda del socio: aviso destacado en AMBOS modos (POS-01). Depende de
             autocompletar.outstanding, no del modo, así que aplica a renew y misc. -->
        <q-banner
          v-if="(autocompletar?.outstanding ?? 0) > 0"
          dense
          rounded
          class="bg-warning text-dark q-mt-sm"
        >
          <template #avatar>
            <q-icon name="warning" color="dark" />
          </template>
          Debe {{ formatPrice(autocompletar?.outstanding ?? 0, autocompletar?.currency ?? 'ARS') }}
          <span v-if="autocompletar?.planName"> — Plan {{ autocompletar.planName }}</span>
        </q-banner>

        <!-- ALTA: mini-form de alumno nuevo (Nombre/Apellido/DNI). Sin email/
             teléfono — gestión los completa al validar. -->
        <template v-if="mode === 'alta' && showNewStudentForm">
          <div class="text-subtitle1 text-weight-bold q-mt-sm">Datos del alumno</div>
          <q-input v-model="newStudent.firstName" label="Nombre" outlined dense />
          <q-input v-model="newStudent.lastName" label="Apellido" outlined dense />
          <q-input
            v-model="newStudent.dni"
            label="DNI"
            inputmode="numeric"
            outlined
            dense
            :loading="dedupChecking"
            @blur="onDniBlur"
          />

          <!-- Dedup por DNI: si matchea, ofrecer cargar sobre el alumno existente -->
          <q-banner v-if="dedupMatch" dense rounded class="bg-warning text-dark q-mt-sm">
            <template #avatar>
              <q-icon name="warning" color="dark" />
            </template>
            Ya existe un alumno con ese DNI: {{ dedupMatchName }}. Se cargará sobre ese alumno.
            <template #action>
              <q-btn flat dense no-caps label="Usar ese alumno" @click="onUsarExistente" />
            </template>
          </q-banner>
        </template>

        <!-- MODE A: Renovar plan -->
        <template v-if="mode === 'renew'">
          <template v-if="selectedMember">
            <q-skeleton v-if="autocompletando" type="text" class="q-mt-sm" />
            <q-skeleton v-if="autocompletando" type="text" />

            <template v-else>
              <!-- No active plan warning -->
              <div
                v-if="autocompletar && !autocompletar.hasRenewable"
                class="text-caption text-warning q-mt-sm"
              >
                Este socio no tiene un plan para cobrar. Usá
                <strong>Cobro suelto</strong>.
              </div>

              <template v-else-if="autocompletar">
                <q-input
                  :model-value="autocompletar.planName ?? ''"
                  label="Plan vigente"
                  outlined
                  readonly
                />
                <q-input
                  v-model.number="amount"
                  type="number"
                  inputmode="numeric"
                  label="Monto"
                  outlined
                  :suffix="currencySymbol"
                />
              </template>
            </template>
          </template>
        </template>

        <!-- MODE B: Cobro suelto -->
        <template v-else>
          <template v-if="selectedMember">
            <q-input
              v-model.number="amount"
              type="number"
              inputmode="numeric"
              label="Monto"
              outlined
              :suffix="currencySymbol"
            />
            <q-input
              v-model="concepto"
              type="textarea"
              autogrow
              label="Concepto"
              placeholder="Ej.: clase de recuperación, ajuste, etc."
              outlined
            />
            <!-- Motivo estructurado del cobro suelto (COBRO-01). Obligatorio. -->
            <q-select
              v-model="miscReason"
              :options="miscReasonOptions"
              emit-value
              map-options
              label="Motivo"
              outlined
            />
          </template>
        </template>

        <!-- Medio de pago -->
        <template v-if="selectedMember && showPaymentMethods">
          <div class="text-subtitle1 q-mt-md q-mb-xs">Medio de pago</div>
          <div class="q-gutter-sm">
            <q-btn
              v-for="opt in paymentOptions"
              :key="opt.value"
              :label="opt.label"
              :icon="opt.icon"
              size="lg"
              class="full-width"
              no-caps
              :color="paymentMethod === opt.value ? 'primary' : undefined"
              :outline="paymentMethod !== opt.value"
              :unelevated="paymentMethod === opt.value"
              @click="paymentMethod = opt.value"
            />
          </div>
          <div class="text-caption text-grey-7 q-mt-sm">
            <q-icon name="schedule" size="xs" class="q-mr-xs" />Queda pendiente de validación.
          </div>
        </template>
      </q-card-section>
    </q-card>

    <!-- Mis cargas de hoy -->
    <div class="text-subtitle1 q-mb-sm">Mis cargas de hoy</div>

    <div v-if="loadingMyLoads" class="q-gutter-sm">
      <q-skeleton v-for="n in 3" :key="n" type="rect" height="56px" />
    </div>

    <q-card v-else-if="myLoads.length === 0" bordered flat>
      <q-card-section class="text-center text-grey-6 q-py-lg">
        <q-icon name="receipt_long" size="md" class="q-mb-sm" />
        <div class="text-body1">Todavía no cargaste pagos hoy</div>
        <div class="text-caption">Cuando registres un cobro, aparecerá acá como ticket.</div>
      </q-card-section>
    </q-card>

    <q-list v-else bordered separator class="rounded-borders">
      <q-item v-for="ticket in myLoads" :key="ticket.id">
        <q-item-section>
          <q-item-label>
            <q-icon name="schedule" size="xs" class="q-mr-xs" />{{
              formatTime(ticket.transactionDate)
            }}
            · {{ ticket.memberName }}
          </q-item-label>
          <q-item-label caption>{{ ticketConcept(ticket) }}</q-item-label>
          <div class="q-mt-xs q-gutter-xs">
            <q-badge
              :color="methodColor(ticket.paymentMethod)"
              :label="methodLabel(ticket.paymentMethod)"
            />
            <q-badge color="warning" label="Pendiente" />
          </div>
        </q-item-section>
        <q-item-section side top>
          <div class="text-h6">{{ formatPrice(ticket.amount, ticket.currency) }}</div>
        </q-item-section>
      </q-item>
    </q-list>

    <!-- Bottom safe-area padding above the sticky bar -->
    <div class="q-pb-xl" style="height: 80px"></div>

    <!-- Sticky Confirmar bar -->
    <q-page-sticky position="bottom" :offset="[0, 16]" expand>
      <div style="width: 100%; max-width: 480px; padding: 0 16px">
        <q-btn
          color="primary"
          size="lg"
          class="full-width"
          no-caps
          :label="confirmarLabel"
          :loading="submitting"
          :disable="!canConfirm || submitting"
          @click="onConfirm"
        />
      </div>
    </q-page-sticky>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { formatPrice } from 'src/utils/format-price';
import { useMembersApi } from 'src/composables/useMembersApi';
import { useFinanceLoadApi, type AutocompletarResult } from 'src/composables/useFinanceLoadApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_COLORS } from 'src/types/transaction';
import type { PaymentMethod, TransactionListItem } from 'src/types/transaction';
import type { BranchOption } from 'src/types/member';
import type { DuplicateMatch } from 'src/composables/useMembersApi';

const log = createLogger('cargar-pago');
const $q = useQuasar();
const membersApi = useMembersApi();
const financeApi = useFinanceLoadApi();
const authStore = useAuthStore();

type Mode = 'renew' | 'misc' | 'alta';
type LoadPaymentMethod = 'cash' | 'transfer' | 'card';

interface MemberSearchOption {
  id: number;
  displayLabel: string;
  statusLabel: string;
  statusColor: string;
}

// ─── Form state ───────────────────────────────────────────────────────────
const mode = ref<Mode>('renew');
const selectedMember = ref<MemberSearchOption | null>(null);
const amount = ref<number | null>(null);
const concepto = ref('');
const paymentMethod = ref<LoadPaymentMethod | null>(null);
// COBRO-01: motivo estructurado del cobro suelto. Default 'sin_plan' (el caso
// operativo principal). Se persiste como columna misc_reason, no en notes.
type MiscReason = 'sin_plan' | 'otro';
const miscReason = ref<MiscReason | null>('sin_plan');
const miscReasonOptions: Array<{ label: string; value: MiscReason }> = [
  { label: 'Sin plan activo', value: 'sin_plan' },
  { label: 'Otro', value: 'otro' },
];

// ─── Alta + plan (Mode C) ─────────────────────────────────────────────────
// Sede elegida del socio (default = sede del profe, editable a sus sedes).
const sucursalId = ref<number | null>(authStore.user?.branchId ?? null);
const branchOptions = ref<BranchOption[]>([]);
// Mini-form de alumno nuevo: visible al tocar "+ Nuevo alumno"; se colapsa al
// elegir un socio existente (typeahead o dedup).
const showNewStudentForm = ref(false);
const newStudent = ref<{ firstName: string; lastName: string; dni: string }>({
  firstName: '',
  lastName: '',
  dni: '',
});
// Dedup por DNI on-blur (≥7 dígitos). El server es la autoridad en Confirmar.
const dedupMatch = ref<DuplicateMatch | null>(null);
const dedupChecking = ref(false);

// ─── Typeahead state ──────────────────────────────────────────────────────
const memberSearchResults = ref<MemberSearchOption[]>([]);
const searchQuery = ref('');
const searchingMembers = ref(false);

// ─── Autocompletar (Mode A) ───────────────────────────────────────────────
const autocompletar = ref<AutocompletarResult | null>(null);
const autocompletando = ref(false);

// ─── Mis cargas ───────────────────────────────────────────────────────────
const myLoads = ref<TransactionListItem[]>([]);
const loadingMyLoads = ref(false);

// ─── Submit / idempotency ─────────────────────────────────────────────────
const submitting = ref(false);
// One key per confirmation ATTEMPT (D-09). Generated lazily on the first tap of
// Confirmar for the current form state, reused across retries of that same
// attempt, and regenerated only after an acknowledged success (form reset).
const currentIdempotencyKey = ref<string | null>(null);

const paymentOptions: Array<{ label: string; value: LoadPaymentMethod; icon: string }> = [
  { label: 'Efectivo', value: 'cash', icon: 'payments' },
  { label: 'Transferencia', value: 'transfer', icon: 'swap_horiz' },
  { label: 'Tarjeta', value: 'card', icon: 'credit_card' },
];

const currencySymbol = computed(() => (autocompletar.value?.currency === 'EUR' ? '€' : '$'));

// Payment buttons only render once the per-mode required fields are present, so
// the coach picks a method right before confirming.
const showPaymentMethods = computed(() => {
  if (mode.value === 'renew') {
    return !autocompletando.value && autocompletar.value?.hasRenewable === true;
  }
  return true;
});

const canConfirm = computed(() => {
  if (!selectedMember.value || !paymentMethod.value) return false;
  if (!amount.value || amount.value <= 0) return false;
  if (mode.value === 'renew') {
    return autocompletar.value?.hasRenewable === true;
  }
  // misc: concepto libre + motivo estructurado obligatorio (COBRO-01).
  return concepto.value.trim().length > 0 && miscReason.value != null;
});

const confirmarLabel = computed(() => {
  if (amount.value && amount.value > 0) {
    const cur = autocompletar.value?.currency ?? 'ARS';
    return `Confirmar · ${formatPrice(amount.value, cur)}`;
  }
  return 'Confirmar';
});

// ─── Alta helpers ─────────────────────────────────────────────────────────
const dedupMatchName = computed(() => {
  const m = dedupMatch.value;
  if (!m) return '';
  return `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || `#${m.id}`;
});

async function loadBranches() {
  try {
    branchOptions.value = await membersApi.getBranches();
    // Default a la sede del profe si está dentro de las accesibles; si no, la 1ª.
    if (sucursalId.value == null || !branchOptions.value.some((b) => b.id === sucursalId.value)) {
      sucursalId.value = branchOptions.value[0]?.id ?? sucursalId.value;
    }
  } catch (err: unknown) {
    log.error('Error cargando sucursales', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function resetAltaFields() {
  showNewStudentForm.value = false;
  newStudent.value = { firstName: '', lastName: '', dni: '' };
  dedupMatch.value = null;
  dedupChecking.value = false;
}

function onNuevoAlumno() {
  // Revelar el mini-form y limpiar el typeahead (es un alumno nuevo, no existente).
  selectedMember.value = null;
  resetChargeFields();
  showNewStudentForm.value = true;
  dedupMatch.value = null;
}

async function onDniBlur() {
  const dni = newStudent.value.dni.trim();
  dedupMatch.value = null;
  if (dni.length < 7) return;
  dedupChecking.value = true;
  try {
    const { matches } = await membersApi.checkDuplicates({ dni });
    const dniMatch = matches.find((m) => m.matchedField === 'dni' && !m.deletedAt);
    dedupMatch.value = dniMatch ?? null;
  } catch (err: unknown) {
    log.error('Error verificando DNI', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    dedupChecking.value = false;
  }
}

function onUsarExistente() {
  const m = dedupMatch.value;
  if (!m) return;
  // Colapsar el mini-form y seleccionar el alumno existente.
  selectedMember.value = {
    id: m.id,
    displayLabel: dedupMatchName.value,
    statusLabel: m.status ?? 'Sin plan',
    statusColor: 'grey',
  };
  resetAltaFields();
}

function onSucursalChange() {
  // Cambiar la sede limpia el plan elegido + turnos (catálogo/picker por sede).
  // Task 3 cablea la recarga de planes; acá sólo se reinicia la idempotencia.
  currentIdempotencyKey.value = null;
}

// ─── Typeahead ────────────────────────────────────────────────────────────
function onMemberSearch(val: string, update: (fn: () => void) => void, _abort: () => void) {
  searchQuery.value = val;
  if (!val || val.length < 2) {
    update(() => {
      memberSearchResults.value = [];
    });
    return;
  }
  searchingMembers.value = true;
  membersApi
    .searchMembers(val, 15)
    .then((members) => {
      update(() => {
        memberSearchResults.value = members.map((m) => {
          let statusLabel = 'Sin plan';
          let statusColor = 'grey';
          if (m.planName) {
            if (m.status === 'activo') {
              statusLabel = 'Activa';
              statusColor = 'positive';
            } else {
              statusLabel = 'Inactiva';
              statusColor = 'negative';
            }
          }
          return {
            id: m.id,
            displayLabel:
              `${m.firstName ?? ''} ${m.lastName ?? ''}${m.dni ? ` (${m.dni})` : ''}`.trim(),
            statusLabel,
            statusColor,
          };
        });
      });
    })
    .catch((err: unknown) => {
      log.error('Error buscando socios', {
        error: err instanceof Error ? err.message : String(err),
      });
      update(() => {
        memberSearchResults.value = [];
      });
    })
    .finally(() => {
      searchingMembers.value = false;
    });
}

// ─── Selection / mode ─────────────────────────────────────────────────────
function resetChargeFields() {
  amount.value = null;
  concepto.value = '';
  miscReason.value = 'sin_plan';
  autocompletar.value = null;
  // A deliberate change of target = a new charge → new idempotency key.
  currentIdempotencyKey.value = null;
}

async function onMemberSelected() {
  resetChargeFields();
  // Elegir un socio existente colapsa el mini-form de alumno nuevo (alta).
  resetAltaFields();
  if (!selectedMember.value) return;
  // POS-01: load autocompletar in BOTH modes. In renew it pre-fills the amount;
  // in misc it only feeds the deuda banner (no amount pre-fill).
  await loadAutocompletar(selectedMember.value.id);
}

function onModeChange() {
  // A5 (UI-SPEC): preserve socio + method, clear amount/concept/motivo/plan.
  resetChargeFields();
  // Switching OUT of (or INTO) alta clears the new-student mini-form (UI-SPEC).
  resetAltaFields();
  // Al entrar a alta, asegurar el catálogo de sedes para el chip Sede.
  if (mode.value === 'alta' && branchOptions.value.length === 0) {
    void loadBranches();
  }
  // POS-01: reload autocompletar in BOTH modes so the deuda banner survives the
  // mode switch (in misc it is informativo: no amount pre-fill, no block).
  if (selectedMember.value) {
    void loadAutocompletar(selectedMember.value.id);
  }
}

async function loadAutocompletar(userId: number) {
  autocompletando.value = true;
  try {
    const res = await financeApi.getAutocompletar(userId);
    autocompletar.value = res;
    // Pre-fill the amount ONLY in renew mode; the cobro suelto amount is
    // independent and the autocompletar load there is purely for the banner.
    if (mode.value === 'renew' && res.hasRenewable && res.amount != null) {
      amount.value = res.amount;
    }
  } catch (err: unknown) {
    log.error('Error en autocompletar', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'No se pudo cargar el plan del socio.' });
  } finally {
    autocompletando.value = false;
  }
}

// ─── Confirmar (idempotent submit) ────────────────────────────────────────
async function onConfirm() {
  if (!canConfirm.value || !selectedMember.value || !paymentMethod.value || !amount.value) {
    return;
  }
  // In misc mode the motivo is obligatorio (canConfirm guards it); narrow here.
  if (mode.value === 'misc' && miscReason.value == null) {
    return;
  }
  // Generate the idempotency key once per attempt; reuse on retry.
  if (!currentIdempotencyKey.value) {
    currentIdempotencyKey.value = crypto.randomUUID();
  }
  const idempotencyKey = currentIdempotencyKey.value;

  submitting.value = true;
  try {
    if (mode.value === 'renew') {
      await financeApi.payPlan({
        userId: selectedMember.value.id,
        amountReceived: amount.value,
        paymentMethod: paymentMethod.value,
        idempotencyKey,
      });
    } else {
      await financeApi.miscCharge({
        memberId: selectedMember.value.id,
        amount: amount.value,
        concepto: concepto.value.trim(),
        paymentMethod: paymentMethod.value,
        currency: autocompletar.value?.currency ?? 'ARS',
        idempotencyKey,
        miscReason: miscReason.value ?? 'sin_plan',
      });
    }
    $q.notify({ type: 'positive', message: 'Pago cargado — pendiente de validación' });
    // Re-fetch the coach's own loads: the server is the source of truth and an
    // idempotent no-op replay returns the existing ticket, so this de-dupes
    // automatically (no duplicate row from a double-tap that slipped past disable).
    await refreshMyLoads();
    resetForm();
  } catch (err: unknown) {
    // Retry re-uses the SAME key, so a load that actually succeeded server-side
    // before a timeout is a safe idempotent no-op on the next tap.
    log.error('Error cargando pago', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'No se pudo cargar el pago. Reintentá.' });
  } finally {
    // Re-enable Confirmar (double-submit guard lifts) so retry is possible.
    submitting.value = false;
  }
}

function resetForm() {
  selectedMember.value = null;
  resetChargeFields();
  resetAltaFields();
  paymentMethod.value = null;
  memberSearchResults.value = [];
  searchQuery.value = '';
}

// ─── Mis cargas list ──────────────────────────────────────────────────────
async function refreshMyLoads() {
  loadingMyLoads.value = true;
  try {
    const result = await financeApi.listMyLoads();
    myLoads.value = result.rows;
  } catch (err: unknown) {
    log.error('Error cargando mis cargas', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    loadingMyLoads.value = false;
  }
}

function ticketConcept(ticket: TransactionListItem): string {
  if (ticket.kind === 'advance_payment') {
    return ticket.notes ?? 'Cobro suelto';
  }
  // Both a renovación (plan_charge) and a saldo de deuda (debt_settlement) are
  // surfaced to the profe under the single "Pago de plan" action.
  return 'Pago de plan';
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function methodLabel(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

function methodColor(method: PaymentMethod): string {
  return PAYMENT_METHOD_COLORS[method] ?? 'grey';
}

// Initial load of today's tickets.
void refreshMyLoads();
// Pre-cargar las sedes accesibles para el chip Sede del modo alta.
void loadBranches();
</script>
