<template>
  <q-page class="cobros-page q-pa-md">
    <!-- ════════════ PORTADA (step 0) ════════════ -->
    <div v-if="currentStep === 0" class="cobros-portada">
      <!-- Page title -->
      <div class="text-h5 q-mb-md">Cobros</div>

      <!-- Primary CTA: enter the 4-step flow -->
      <q-btn
        color="primary"
        size="lg"
        no-caps
        unelevated
        icon="add"
        label="Registrar cobro"
        class="cobros-cta q-mb-lg"
        @click="startCobro"
      />

      <!-- Mis cargas de hoy (Task 4 rebuilds this into a day-grouped listado) -->
      <div class="text-subtitle1 q-mb-sm">Mis cargas de hoy</div>

      <div v-if="loadingMyLoads" class="q-gutter-sm">
        <q-skeleton v-for="n in 3" :key="n" type="rect" height="56px" />
      </div>

      <q-card v-else-if="myLoads.length === 0" bordered flat>
        <q-card-section class="text-center text-grey-6 q-py-lg">
          <q-icon name="receipt_long" size="md" class="q-mb-sm" />
          <div class="text-body1">Todavía no registraste cobros</div>
          <div class="text-subtitle2 text-weight-regular text-grey-7">
            Cuando registres un cobro, va a aparecer acá con su fecha y hora.
          </div>
        </q-card-section>
      </q-card>

      <q-list v-else bordered separator class="rounded-borders">
        <q-item v-for="ticket in myLoads" :key="ticket.id">
          <q-item-section>
            <q-item-label>
              <q-icon name="schedule" size="xs" class="q-mr-xs" />{{
                formatTime(ticket.createdAt)
              }}
              · {{ ticket.memberName }}
            </q-item-label>
            <q-item-label class="text-subtitle2 text-weight-regular text-grey-7">{{
              ticketConcept(ticket)
            }}</q-item-label>
            <div class="q-mt-xs q-gutter-xs">
              <q-badge
                :color="methodColor(ticket.paymentMethod)"
                :label="methodLabel(ticket.paymentMethod)"
              />
              <q-badge color="warning" label="Pendiente" />
              <q-badge v-if="createdNewTicketIds.has(ticket.id)" color="primary" label="Nuevo" />
            </div>
          </q-item-section>
          <q-item-section side top>
            <div class="text-h6">{{ formatPrice(ticket.amount, ticket.currency) }}</div>
          </q-item-section>
        </q-item>
      </q-list>
    </div>

    <!-- ════════════ WIZARD (steps 1..4) ════════════ -->
    <div v-else class="cobros-wizard">
      <!-- Progress header on the secondary band -->
      <div class="cobros-progress bg-summary-surface q-px-md q-py-sm">
        <div class="row items-center no-wrap">
          <q-btn flat round dense icon="arrow_back" aria-label="Volver" @click="goBack">
            <span v-if="$q.screen.gt.sm" class="q-ml-xs text-body1">Volver</span>
          </q-btn>

          <!-- Desktop: numbered steps -->
          <div v-if="$q.screen.gt.sm" class="row items-center q-gutter-md q-ml-md">
            <div v-for="(label, i) in STEP_LABELS" :key="i" class="row items-center no-wrap">
              <q-icon v-if="currentStep > i + 1" name="check_circle" color="primary" size="24px" />
              <span
                v-else
                class="cobros-step-num"
                :class="currentStep === i + 1 ? 'is-current' : 'is-future'"
                >{{ i + 1 }}</span
              >
              <span class="q-ml-xs text-body1" :class="stepLabelClass(i + 1)">{{ label }}</span>
            </div>
          </div>

          <!-- Mobile: Paso n de 4 + current label -->
          <div v-else class="col q-ml-sm">
            <div class="text-body1 text-weight-regular">
              Paso {{ currentStep }} de 4 · {{ STEP_LABELS[currentStep - 1] }}
            </div>
          </div>
        </div>

        <q-linear-progress
          v-if="!$q.screen.gt.sm"
          :value="currentStep / 4"
          size="4px"
          color="primary"
          class="q-mt-sm"
        />
      </div>

      <!-- Mobile: compact summary header (socio + running total), tap to expand -->
      <q-expansion-item
        v-if="!$q.screen.gt.sm"
        dense
        class="bg-summary-surface"
        :label="resumenSocio || '—'"
        :caption="formatPrice(amount ?? 0, resumenCurrency)"
      >
        <CobroResumen
          :socio="resumenSocio"
          :que-secobra="resumenQueSecobra"
          :como-paga="resumenComoPaga"
          :total="amount"
          :currency="resumenCurrency"
          :debt-warning="resumenDebtWarning"
        />
      </q-expansion-item>

      <!-- Body -->
      <div
        class="cobros-body q-mt-md"
        :class="$q.screen.gt.sm ? 'row no-wrap cobros-body--desktop' : ''"
      >
        <!-- LEFT: active step body -->
        <div class="cobros-step-col">
          <transition :name="reducedMotion ? 'cobro-fade' : transitionName" mode="out-in">
            <div :key="currentStep" class="cobros-step-body">
              <template v-if="currentStep === 1">
                <div class="text-h5 q-mb-md">Socio</div>
              </template>

              <template v-else-if="currentStep === 2">
                <div class="text-h5 q-mb-md">¿Qué se cobra?</div>
              </template>

              <template v-else-if="currentStep === 3">
                <div class="text-h5 q-mb-md">¿Cómo se paga?</div>
              </template>

              <template v-else-if="currentStep === 4">
                <div class="text-h5 q-mb-md">Resumen</div>
                <CobroResumen
                  :socio="resumenSocio"
                  :que-secobra="resumenQueSecobra"
                  :como-paga="resumenComoPaga"
                  :total="amount"
                  :currency="resumenCurrency"
                  :debt-warning="resumenDebtWarning"
                />
              </template>
            </div>
          </transition>

          <!-- Desktop: inline-bottom action -->
          <div v-if="$q.screen.gt.sm" class="q-mt-lg">
            <q-btn
              color="primary"
              size="lg"
              no-caps
              :label="primaryActionLabel"
              :loading="submitting"
              :disable="primaryActionDisabled"
              @click="onPrimaryAction"
            />
          </div>
        </div>

        <!-- RIGHT: sticky accumulated summary panel (desktop) -->
        <div v-if="$q.screen.gt.sm" class="cobros-summary-col">
          <div class="cobros-summary-panel bg-summary-surface q-pa-lg">
            <div class="text-subtitle2 text-weight-regular text-grey-7 q-mb-sm">Resumen</div>
            <CobroResumen
              :socio="resumenSocio"
              :que-secobra="resumenQueSecobra"
              :como-paga="resumenComoPaga"
              :total="amount"
              :currency="resumenCurrency"
              :debt-warning="resumenDebtWarning"
            />
          </div>
        </div>
      </div>

      <!-- Mobile: sticky action bar -->
      <q-page-sticky v-if="!$q.screen.gt.sm" position="bottom" :offset="[0, 16]" expand>
        <div class="cobros-sticky-action">
          <q-btn
            color="primary"
            size="lg"
            class="full-width"
            no-caps
            :label="primaryActionLabel"
            :loading="submitting"
            :disable="primaryActionDisabled"
            @click="onPrimaryAction"
          />
        </div>
      </q-page-sticky>

      <div v-if="!$q.screen.gt.sm" style="height: 80px"></div>
    </div>

    <!-- Abandon-flow confirmation -->
    <q-dialog v-model="abandonDialog">
      <q-card>
        <q-card-section class="text-body1">
          Si salís ahora, se pierden los datos cargados.
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps color="primary" label="Seguir cargando" @click="cancelAbandon" />
          <q-btn unelevated no-caps color="negative" label="Salir" @click="confirmAbandon" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import { onBeforeRouteLeave } from 'vue-router';
import { createLogger } from 'src/utils/logger';
import { formatPrice } from 'src/utils/format-price';
import { useMembersApi } from 'src/composables/useMembersApi';
import {
  useFinanceLoadApi,
  type AutocompletarResult,
  type CoachAltaInput,
} from 'src/composables/useFinanceLoadApi';
import { useSubscriptionsApi } from 'src/composables/useSubscriptionsApi';
import { useAuthStore } from 'src/stores/useAuthStore';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_COLORS } from 'src/types/transaction';
import { PLAN_TIER_LABELS } from 'src/types/subscription';
import type { PaymentMethod, TransactionListItem } from 'src/types/transaction';
import type { BranchOption } from 'src/types/member';
import type { DuplicateMatch } from 'src/composables/useMembersApi';
import type { PlanListItem, PlanTier } from 'src/types/subscription';
import FixedSchedulePicker from 'src/components/scheduling/FixedSchedulePicker.vue';
import CobroResumen from 'src/components/caja/CobroResumen.vue';

const log = createLogger('cobros');
const $q = useQuasar();
const membersApi = useMembersApi();
const financeApi = useFinanceLoadApi();
const subsApi = useSubscriptionsApi();
const authStore = useAuthStore();

// El "modo" antiguo pasa a ser la ASOCIACIÓN elegida en el paso 2 (D-01, sin
// toggle de modo). Arranca en null: nada preseleccionado hasta el paso 2.
type Mode = 'renew' | 'misc' | 'alta';
type LoadPaymentMethod = 'cash' | 'transfer' | 'card';

interface MemberSearchOption {
  id: number;
  displayLabel: string;
  statusLabel: string;
  statusColor: string;
}

// ─── Wizard step state ──────────────────────────────────────────────────────
// 0 = portada, 1 = Socio, 2 = ¿Qué se cobra?, 3 = ¿Cómo se paga?, 4 = Resumen.
const currentStep = ref(0);
const slideDir = ref<'forward' | 'back'>('forward');
const STEP_LABELS = ['Socio', '¿Qué se cobra?', '¿Cómo se paga?', 'Resumen'];

const transitionName = computed(() =>
  slideDir.value === 'forward' ? 'cobro-slide-forward' : 'cobro-slide-back'
);
// prefers-reduced-motion → plain fade instead of the horizontal slide.
const reducedMotion = ref(
  typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

// ─── Form state ───────────────────────────────────────────────────────────
const mode = ref<Mode | null>(null);
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
function miscReasonLabel(value: MiscReason): string {
  return miscReasonOptions.find((o) => o.value === value)?.label ?? value;
}

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

// Plan grid (por sede) + selección + Zero + turnos fijos (solo planes fixed).
const plans = ref<PlanListItem[]>([]);
const loadingPlans = ref(false);
const selectedPlan = ref<PlanListItem | null>(null);
const zeroPrice = ref(false);
const scheduleIds = ref<number[]>([]);
// IDs de los tickets que ESTA alta creó-nuevo → chip "Nuevo" tras el re-fetch.
const createdNewTicketIds = ref<Set<number>>(new Set());

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

// ─── Accumulated summary (shared CobroResumen: desktop panel + step 4) ──────
const resumenSocio = computed<string | null>(() => {
  if (selectedMember.value) return selectedMember.value.displayLabel;
  if (showNewStudentForm.value) {
    const name = `${newStudent.value.firstName} ${newStudent.value.lastName}`.trim();
    return name || null;
  }
  return null;
});
const resumenQueSecobra = computed<string | null>(() => {
  if (mode.value === 'renew') return autocompletar.value?.planName ?? null;
  if (mode.value === 'alta') return selectedPlan.value?.name ?? null;
  if (mode.value === 'misc') {
    return concepto.value.trim() || (miscReason.value ? miscReasonLabel(miscReason.value) : null);
  }
  return null;
});
const resumenComoPaga = computed<string | null>(() => {
  if (!paymentMethod.value) return null;
  return paymentOptions.find((o) => o.value === paymentMethod.value)?.label ?? null;
});
const resumenCurrency = computed(() =>
  mode.value === 'alta' ? altaCurrency.value : (autocompletar.value?.currency ?? 'ARS')
);
const resumenDebtWarning = computed<string | null>(() => {
  const out = autocompletar.value?.outstanding ?? 0;
  if (out <= 0) return null;
  return `Debe ${formatPrice(out, autocompletar.value?.currency ?? 'ARS')}`;
});

// Payment buttons only render once the per-mode required fields are present, so
// the coach picks a method right before confirming.
const showPaymentMethods = computed(() => {
  if (mode.value === 'renew') {
    return !autocompletando.value && autocompletar.value?.hasRenewable === true;
  }
  if (mode.value === 'alta') {
    return selectedPlan.value != null;
  }
  return true;
});

const canConfirm = computed(() => {
  if (!paymentMethod.value) return false;
  if (!amount.value || amount.value <= 0) return false;

  if (mode.value === 'alta') {
    const hasAlumno = selectedMember.value != null || newStudentValid.value;
    if (!hasAlumno || sucursalId.value == null || !selectedPlan.value) return false;
    if (selectedPlan.value.bookingMode === 'fixed') {
      return scheduleIds.value.length === (selectedPlan.value.classesPerWeek ?? 0);
    }
    return true;
  }

  if (!selectedMember.value) return false;
  if (mode.value === 'renew') {
    return autocompletar.value?.hasRenewable === true;
  }
  if (mode.value === 'misc') {
    return concepto.value.trim().length > 0 && miscReason.value != null;
  }
  return false;
});

const confirmarLabel = computed(() => {
  if (amount.value && amount.value > 0) {
    const cur =
      mode.value === 'alta' ? altaCurrency.value : (autocompletar.value?.currency ?? 'ARS');
    return `Confirmar · ${formatPrice(amount.value, cur)}`;
  }
  return 'Confirmar';
});

// ─── Per-step gating + primary action ──────────────────────────────────────
const canContinueStep = computed(() => {
  switch (currentStep.value) {
    case 1:
      return selectedMember.value != null || newStudentValid.value;
    case 2:
      if (mode.value === 'renew') return autocompletar.value?.hasRenewable === true;
      if (mode.value === 'alta') {
        if (!selectedPlan.value) return false;
        if (selectedPlan.value.bookingMode === 'fixed') {
          return scheduleIds.value.length === (selectedPlan.value.classesPerWeek ?? 0);
        }
        return true;
      }
      if (mode.value === 'misc') {
        return concepto.value.trim().length > 0 && miscReason.value != null;
      }
      return false;
    case 3:
      return paymentMethod.value != null && !!amount.value && amount.value > 0;
    default:
      return false;
  }
});

const primaryActionLabel = computed(() =>
  currentStep.value >= 4 ? confirmarLabel.value : 'Continuar'
);
const primaryActionDisabled = computed(() =>
  currentStep.value >= 4 ? !canConfirm.value || submitting.value : !canContinueStep.value
);
function onPrimaryAction() {
  if (currentStep.value >= 4) {
    void onConfirm();
  } else {
    goNext();
  }
}

// ─── Wizard navigation + abandon guard ──────────────────────────────────────
const formHasData = computed(
  () =>
    selectedMember.value != null ||
    showNewStudentForm.value ||
    !!amount.value ||
    concepto.value.trim().length > 0 ||
    selectedPlan.value != null ||
    paymentMethod.value != null ||
    mode.value != null
);

const abandonDialog = ref(false);
let onAbandonConfirm: (() => void) | null = null;
let onAbandonCancel: (() => void) | null = null;

function openAbandon(confirmFn: () => void, cancelFn: () => void) {
  onAbandonConfirm = confirmFn;
  onAbandonCancel = cancelFn;
  abandonDialog.value = true;
}
function confirmAbandon() {
  abandonDialog.value = false;
  const fn = onAbandonConfirm;
  onAbandonConfirm = null;
  onAbandonCancel = null;
  fn?.();
}
function cancelAbandon() {
  abandonDialog.value = false;
  const fn = onAbandonCancel;
  onAbandonConfirm = null;
  onAbandonCancel = null;
  fn?.();
}

function startCobro() {
  slideDir.value = 'forward';
  currentStep.value = 1;
}
function goNext() {
  if (currentStep.value >= 4) return;
  slideDir.value = 'forward';
  currentStep.value += 1;
}
function goBack() {
  if (currentStep.value <= 1) {
    if (formHasData.value) {
      openAbandon(
        () => resetToPortada(),
        () => {}
      );
    } else {
      resetToPortada();
    }
    return;
  }
  slideDir.value = 'back';
  currentStep.value -= 1;
}
function resetToPortada() {
  resetForm();
  mode.value = null;
  slideDir.value = 'back';
  currentStep.value = 0;
}

// Guard browser/route navigation away from a wizard mid-flow with data.
onBeforeRouteLeave((_to, _from, next) => {
  if (currentStep.value >= 1 && formHasData.value) {
    openAbandon(
      () => next(),
      () => next(false)
    );
  } else {
    next();
  }
});

// ─── Progress-header helpers ────────────────────────────────────────────────
function stepLabelClass(n: number): string {
  if (currentStep.value === n) return 'text-primary';
  if (currentStep.value > n) return 'text-grey-8';
  return 'text-grey-6';
}

// ─── Alta helpers ─────────────────────────────────────────────────────────
const dedupMatchName = computed(() => {
  const m = dedupMatch.value;
  if (!m) return '';
  return `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim() || `#${m.id}`;
});

async function loadBranches() {
  try {
    branchOptions.value = await membersApi.getBranches();
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
  selectedPlan.value = null;
  zeroPrice.value = false;
  scheduleIds.value = [];
}

function onNuevoAlumno() {
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
  selectedMember.value = {
    id: m.id,
    displayLabel: dedupMatchName.value,
    statusLabel: m.status ?? 'Sin plan',
    statusColor: 'grey',
  };
  resetAltaFields();
}

function onSucursalChange() {
  selectedPlan.value = null;
  scheduleIds.value = [];
  currentIdempotencyKey.value = null;
  void loadAltaPlans();
}

// ─── Alta: plan grid + precio + turnos ────────────────────────────────────
const hasAlumnoContext = computed(
  () => selectedMember.value != null || (mode.value === 'alta' && showNewStudentForm.value)
);

const newStudentValid = computed(
  () =>
    showNewStudentForm.value &&
    newStudent.value.firstName.trim().length > 0 &&
    newStudent.value.lastName.trim().length > 0 &&
    newStudent.value.dni.trim().length >= 7
);

interface TierGroup {
  tier: PlanTier;
  plans: PlanListItem[];
}

const plansByTier = computed((): TierGroup[] => {
  const tierOrder: PlanTier[] = ['flex', 'foundation', 'performance', 'other'];
  const groups: TierGroup[] = [];
  for (const tier of tierOrder) {
    const tierPlans = plans.value.filter((p) => p.planTier === tier);
    if (tierPlans.length > 0) groups.push({ tier, plans: tierPlans });
  }
  return groups;
});

const multiBranchOptions = computed(() =>
  branchOptions.value.filter((b) => !b.isVirtual).map((b) => ({ id: b.id, name: b.name }))
);

const altaCurrency = computed(() => selectedPlan.value?.currency ?? 'ARS');
const altaCurrencySymbol = computed(() => (altaCurrency.value === 'EUR' ? '€' : '$'));

function getBasePriceFor(plan: PlanListItem, method: LoadPaymentMethod, zero: boolean): number {
  if (method === 'card') return plan.priceCreditCard ?? plan.priceRegular;
  return zero ? plan.priceZero : plan.priceRegular;
}

const altaPrice = computed(() => {
  if (!selectedPlan.value || !paymentMethod.value) return 0;
  return getBasePriceFor(selectedPlan.value, paymentMethod.value, zeroPrice.value);
});

const isAltaPartial = computed(
  () => altaPrice.value > 0 && amount.value != null && amount.value < altaPrice.value
);

function tierLabel(tier: PlanTier): string {
  return PLAN_TIER_LABELS[tier] ?? tier;
}

function tierColor(tier: PlanTier): string {
  const colors: Record<PlanTier, string> = {
    flex: 'blue',
    foundation: 'teal',
    performance: 'deep-purple',
    other: 'grey',
  };
  return colors[tier] ?? 'grey';
}

function selectPlan(plan: PlanListItem) {
  selectedPlan.value = plan;
  scheduleIds.value = [];
}

async function loadAltaPlans() {
  if (sucursalId.value == null) {
    plans.value = [];
    return;
  }
  loadingPlans.value = true;
  try {
    plans.value = await subsApi.getPlans(true, { branchId: sucursalId.value });
  } catch (err: unknown) {
    log.error('Error cargando planes', {
      error: err instanceof Error ? err.message : String(err),
    });
    plans.value = [];
  } finally {
    loadingPlans.value = false;
  }
}

// Monto autocalculado: plan × medio de pago × Zero. Editable después a mano.
watch([selectedPlan, paymentMethod, zeroPrice], () => {
  if (mode.value !== 'alta') return;
  if (selectedPlan.value && paymentMethod.value) {
    amount.value = altaPrice.value;
  }
});

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
  resetAltaFields();
  if (!selectedMember.value) return;
  await loadAutocompletar(selectedMember.value.id);
}

async function loadAutocompletar(userId: number) {
  autocompletando.value = true;
  try {
    const res = await financeApi.getAutocompletar(userId);
    autocompletar.value = res;
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
  if (!mode.value) return;
  if (!canConfirm.value || !paymentMethod.value || !amount.value) {
    return;
  }
  if (mode.value !== 'alta' && !selectedMember.value) {
    return;
  }
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
        userId: selectedMember.value!.id,
        amountReceived: amount.value,
        paymentMethod: paymentMethod.value,
        idempotencyKey,
      });
    } else if (mode.value === 'misc') {
      await financeApi.miscCharge({
        memberId: selectedMember.value!.id,
        amount: amount.value,
        concepto: concepto.value.trim(),
        paymentMethod: paymentMethod.value,
        currency: autocompletar.value?.currency ?? 'ARS',
        idempotencyKey,
        miscReason: miscReason.value ?? 'sin_plan',
      });
    } else {
      // ALTA + plan: alumno existente (userId) XOR alumno nuevo (firstName+...).
      if (sucursalId.value == null || !selectedPlan.value) return;
      const alumno = selectedMember.value
        ? { userId: selectedMember.value.id }
        : {
            firstName: newStudent.value.firstName.trim(),
            lastName: newStudent.value.lastName.trim(),
            dni: newStudent.value.dni.trim(),
          };
      const body: CoachAltaInput = {
        ...alumno,
        branchId: sucursalId.value,
        planId: selectedPlan.value.id,
        zero: zeroPrice.value,
        paymentMethod: paymentMethod.value,
        amountReceived: amount.value,
        idempotencyKey,
        ...(selectedPlan.value.bookingMode === 'fixed' ? { scheduleIds: scheduleIds.value } : {}),
      };
      const resp = await financeApi.altaConPlan(body);
      if (resp.createdNew && resp.transaction) {
        createdNewTicketIds.value = new Set(createdNewTicketIds.value).add(resp.transaction.id);
      }
    }
    const successMsg =
      mode.value === 'alta'
        ? 'Alumno y plan cargados — pendiente de validación'
        : 'Cobro registrado — pendiente de validación';
    $q.notify({ type: 'positive', message: successMsg });
    await refreshMyLoads();
    resetForm();
    resetToPortada();
  } catch (err: unknown) {
    // Retry re-uses the SAME key, so a load that actually succeeded server-side
    // before a timeout is a safe idempotent no-op on the next tap.
    log.error('Error registrando cobro', {
      error: err instanceof Error ? err.message : String(err),
    });
    $q.notify({ type: 'negative', message: 'No se pudo registrar el cobro. Reintentá.' });
  } finally {
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

// Initial load of the coach's recent loads for the portada listado.
void refreshMyLoads();
// Pre-cargar las sedes accesibles para el selector de Sede del alta.
void loadBranches();
</script>

<style scoped lang="scss">
.cobros-cta {
  display: block;
  width: 100%;
  max-width: 560px;
}

.cobros-body--desktop {
  gap: 32px; // xl column gap
  align-items: flex-start;
}

.cobros-step-col {
  flex: 1 1 auto;
  width: 100%;
  max-width: 560px;
}

.cobros-summary-col {
  flex: 0 0 320px;
  width: 320px;
}

.cobros-summary-panel {
  position: sticky;
  top: 88px;
  border-radius: 8px;
}

.cobros-progress {
  border-radius: 8px;
}

.cobros-sticky-action {
  width: 100%;
  max-width: 560px;
  padding: 0 16px;
}

.cobros-step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 14px;

  &.is-current {
    background: var(--q-primary);
    color: white;
  }

  &.is-future {
    color: inherit;
    opacity: 0.55;
    border: 1px solid currentColor;
  }
}

// Step transitions — 200ms ease-out horizontal slide.
.cobro-slide-forward-enter-active,
.cobro-slide-forward-leave-active,
.cobro-slide-back-enter-active,
.cobro-slide-back-leave-active {
  transition:
    transform 200ms ease-out,
    opacity 200ms ease-out;
}
.cobro-slide-forward-enter-from {
  transform: translateX(24px);
  opacity: 0;
}
.cobro-slide-forward-leave-to {
  transform: translateX(-24px);
  opacity: 0;
}
.cobro-slide-back-enter-from {
  transform: translateX(-24px);
  opacity: 0;
}
.cobro-slide-back-leave-to {
  transform: translateX(24px);
  opacity: 0;
}

.cobro-fade-enter-active,
.cobro-fade-leave-active {
  transition: opacity 150ms ease-out;
}
.cobro-fade-enter-from,
.cobro-fade-leave-to {
  opacity: 0;
}

// Respect reduced-motion: no horizontal travel, plain fade.
@media (prefers-reduced-motion: reduce) {
  .cobro-slide-forward-enter-active,
  .cobro-slide-forward-leave-active,
  .cobro-slide-back-enter-active,
  .cobro-slide-back-leave-active {
    transition: opacity 120ms ease-out;
  }
  .cobro-slide-forward-enter-from,
  .cobro-slide-forward-leave-to,
  .cobro-slide-back-enter-from,
  .cobro-slide-back-leave-to {
    transform: none;
  }
}
</style>
