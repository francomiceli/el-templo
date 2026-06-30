<template>
  <q-page class="q-pa-md" style="max-width: 480px; margin: 0 auto">
    <!-- Page title -->
    <div class="text-h5 q-mb-md">Pagos</div>

    <!-- Mode toggle: Pago de plan / Alta + plan / Cobro suelto -->
    <q-btn-toggle
      v-model="mode"
      spread
      unelevated
      no-caps
      toggle-color="primary"
      class="full-width q-mb-md"
      :options="[
        { label: 'Pago de plan', value: 'renew' },
        { label: 'Alta + plan', value: 'alta' },
        { label: 'Cobro suelto', value: 'misc' },
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

        <!-- ALTA: el camino primario es dar de alta un alumno NUEVO. El buscador
             de arriba queda para asignarle un plan a un socio que YA existe (ej.
             un socio sin plan derivado desde "Pago de plan"). Antes este botón
             estaba escondido dentro del dropdown del buscador. -->
        <q-btn
          v-if="mode === 'alta' && !showNewStudentForm && !selectedMember"
          outline
          no-caps
          color="primary"
          icon="person_add"
          label="Nuevo alumno"
          class="full-width q-mt-sm"
          @click="onNuevoAlumno"
        />

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
              <!-- Sin plan para cobrar → el lugar correcto es "Alta + plan" (que
                   asigna un plan), NO "Cobro suelto" (cargo misceláneo sin plan).
                   El botón cambia de modo conservando el socio ya elegido. -->
              <div v-if="autocompletar && !autocompletar.hasRenewable" class="q-mt-sm">
                <div class="text-caption text-warning">
                  Este socio no tiene un plan activo para cobrar.
                </div>
                <q-btn
                  flat
                  dense
                  no-caps
                  color="primary"
                  icon="person_add"
                  label="Asignarle un plan (Alta + plan)"
                  class="q-mt-xs"
                  @click="altaParaSocioExistente"
                />
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
        <template v-else-if="mode === 'misc'">
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

        <!-- MODE C: Alta + plan — grilla de planes por tier + Zero + turnos fixed -->
        <template v-else-if="mode === 'alta' && hasAlumnoContext">
          <div class="text-subtitle1 text-weight-bold q-mt-md">Plan</div>

          <div v-if="loadingPlans" class="q-gutter-sm">
            <q-skeleton v-for="n in 3" :key="n" type="rect" height="56px" />
          </div>
          <div
            v-else-if="plansByTier.length === 0"
            class="text-grey-5 text-italic q-pa-md text-center"
          >
            No hay planes activos para esta sede.
          </div>
          <template v-else>
            <div v-for="tier in plansByTier" :key="tier.tier" class="q-mb-sm">
              <q-badge
                :color="tierColor(tier.tier)"
                :label="tierLabel(tier.tier)"
                class="q-mb-xs"
              />
              <q-list bordered separator class="rounded-borders">
                <q-item
                  v-for="plan in tier.plans"
                  :key="plan.id"
                  clickable
                  v-ripple
                  class="q-py-md"
                  :active="selectedPlan?.id === plan.id"
                  active-class="bg-primary text-white"
                  @click="selectPlan(plan)"
                >
                  <q-item-section>
                    <q-item-label>{{ plan.name }}</q-item-label>
                    <q-item-label caption :class="selectedPlan?.id === plan.id ? 'text-white' : ''">
                      {{ plan.durationDays }} días
                      <template v-if="plan.classesPerWeek">
                        · {{ plan.classesPerWeek }} clases/sem
                      </template>
                      <template v-else> · Ilimitado </template>
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <div
                      class="text-weight-bold"
                      :class="selectedPlan?.id === plan.id ? 'text-white' : ''"
                    >
                      {{ formatPrice(plan.priceRegular, plan.currency) }}
                    </div>
                  </q-item-section>
                </q-item>
              </q-list>
            </div>

            <!-- Toggle Precio Zero (regular ↔ zero) -->
            <q-toggle v-model="zeroPrice" label="Precio Zero" color="positive" class="q-mt-sm" />
          </template>

          <!-- Turnos: estructurado SOLO para planes fixed; flexible = caption -->
          <template v-if="selectedPlan">
            <template v-if="selectedPlan.bookingMode === 'fixed'">
              <div class="text-subtitle1 text-weight-bold q-mt-md q-mb-xs">Turnos fijos</div>
              <FixedSchedulePicker
                v-model="scheduleIds"
                :branch-id="sucursalId ?? 0"
                :required-count="selectedPlan.classesPerWeek"
                :allow-partial="false"
                :multi-branch="selectedPlan.multiBranch"
                :available-branches="multiBranchOptions"
              />
            </template>
            <div v-else class="text-caption text-grey-7 q-mt-sm">
              Este plan reserva semana a semana — no se eligen turnos ahora.
            </div>
          </template>
        </template>

        <!-- Medio de pago -->
        <template v-if="hasAlumnoContext && showPaymentMethods">
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

          <!-- ALTA: Monto autocalculado (editable) + banner deuda (parcial) -->
          <template v-if="mode === 'alta' && selectedPlan && paymentMethod">
            <q-input
              v-model.number="amount"
              type="number"
              inputmode="numeric"
              label="Monto"
              outlined
              class="q-mt-sm"
              :suffix="altaCurrencySymbol"
              hint="Por defecto se cobra el total. Editá si el cobro es parcial."
            />
            <q-banner v-if="isAltaPartial" dense rounded class="bg-warning text-dark q-mt-sm">
              <template #avatar>
                <q-icon name="warning" color="dark" />
              </template>
              El alumno quedará deudor por
              {{ formatPrice(altaPrice - (amount ?? 0), altaCurrency) }}.
            </q-banner>
          </template>

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
            <q-icon name="schedule" size="xs" class="q-mr-xs" />{{ formatTime(ticket.createdAt) }} ·
            {{ ticket.memberName }}
          </q-item-label>
          <q-item-label caption>{{ ticketConcept(ticket) }}</q-item-label>
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
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
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

const log = createLogger('pagos');
const $q = useQuasar();
const membersApi = useMembersApi();
const financeApi = useFinanceLoadApi();
const subsApi = useSubscriptionsApi();
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

// Payment buttons only render once the per-mode required fields are present, so
// the coach picks a method right before confirming.
const showPaymentMethods = computed(() => {
  if (mode.value === 'renew') {
    return !autocompletando.value && autocompletar.value?.hasRenewable === true;
  }
  if (mode.value === 'alta') {
    // El medio de pago (y el monto) aparecen una vez elegido el plan.
    return selectedPlan.value != null;
  }
  return true;
});

const canConfirm = computed(() => {
  if (!paymentMethod.value) return false;
  if (!amount.value || amount.value <= 0) return false;

  if (mode.value === 'alta') {
    // Alumno existente OR alumno nuevo válido (nombre+apellido+DNI).
    const hasAlumno = selectedMember.value != null || newStudentValid.value;
    if (!hasAlumno || sucursalId.value == null || !selectedPlan.value) return false;
    // Planes fixed exigen exactamente classesPerWeek turnos.
    if (selectedPlan.value.bookingMode === 'fixed') {
      return scheduleIds.value.length === (selectedPlan.value.classesPerWeek ?? 0);
    }
    return true;
  }

  if (!selectedMember.value) return false;
  if (mode.value === 'renew') {
    return autocompletar.value?.hasRenewable === true;
  }
  // misc: concepto libre + motivo estructurado obligatorio (COBRO-01).
  return concepto.value.trim().length > 0 && miscReason.value != null;
});

const confirmarLabel = computed(() => {
  if (amount.value && amount.value > 0) {
    const cur =
      mode.value === 'alta' ? altaCurrency.value : (autocompletar.value?.currency ?? 'ARS');
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
  selectedPlan.value = null;
  zeroPrice.value = false;
  scheduleIds.value = [];
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
  // Cambiar la sede limpia el plan elegido + turnos (catálogo/picker por sede)
  // y recarga el catálogo de planes de esa sede.
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
  // Turnos dependen del plan: reiniciar la selección al cambiar de plan.
  scheduleIds.value = [];
  // El precio se re-deriva del plan × medio × Zero (watcher debajo).
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
  // Elegir un socio existente colapsa el mini-form de alumno nuevo (alta).
  resetAltaFields();
  if (!selectedMember.value) return;
  // POS-01: load autocompletar in BOTH modes. In renew it pre-fills the amount;
  // in misc it only feeds the deuda banner (no amount pre-fill).
  await loadAutocompletar(selectedMember.value.id);
}

function altaParaSocioExistente() {
  // Desde "Pago de plan" cuando el socio NO tiene plan: pasar a "Alta + plan"
  // conservando el socio elegido para asignarle su primer plan. onModeChange no
  // toca selectedMember, así que el socio viaja al nuevo modo (y recarga catálogo
  // de sedes/planes + autocompletar). NO es "Cobro suelto" — ese no asigna plan.
  mode.value = 'alta';
  onModeChange();
}

function onModeChange() {
  // A5 (UI-SPEC): preserve socio + method, clear amount/concept/motivo/plan.
  resetChargeFields();
  // Switching OUT of (or INTO) alta clears the new-student mini-form (UI-SPEC).
  resetAltaFields();
  // Al entrar a alta, asegurar el catálogo de sedes + planes de la sede actual.
  if (mode.value === 'alta') {
    if (branchOptions.value.length === 0) void loadBranches();
    void loadAltaPlans();
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
  if (!canConfirm.value || !paymentMethod.value || !amount.value) {
    return;
  }
  // renew/misc exigen un socio existente; alta puede crear uno nuevo.
  if (mode.value !== 'alta' && !selectedMember.value) {
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
      // Marcar el ticket creado-nuevo para el chip "Nuevo" (sobrevive al re-fetch).
      if (resp.createdNew && resp.transaction) {
        createdNewTicketIds.value = new Set(createdNewTicketIds.value).add(resp.transaction.id);
      }
    }
    const successMsg =
      mode.value === 'alta'
        ? 'Alumno y plan cargados — pendiente de validación'
        : 'Pago cargado — pendiente de validación';
    $q.notify({ type: 'positive', message: successMsg });
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
    const errorMsg =
      mode.value === 'alta'
        ? 'No se pudo cargar. Reintentá.'
        : 'No se pudo cargar el pago. Reintentá.';
    $q.notify({ type: 'negative', message: errorMsg });
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
