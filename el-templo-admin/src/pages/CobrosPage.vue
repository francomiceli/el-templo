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

      <!-- Historial de cobros — agrupado por día (fecha en el header, hora por fila).
           El endpoint devuelve los últimos 50 cobros (histórico), no "de hoy". -->
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

      <template v-else>
        <div v-for="group in groupedLoads" :key="group.key" class="q-mb-md">
          <q-item-label
            header
            class="cobros-day-header bg-summary-surface text-body1 text-weight-bold q-py-sm"
          >
            {{ group.label }}
          </q-item-label>
          <q-list bordered separator class="rounded-borders">
            <q-item v-for="ticket in group.rows" :key="ticket.id">
              <q-item-section>
                <q-item-label>{{ ticket.memberName }}</q-item-label>
                <div class="text-subtitle2 text-weight-regular text-grey-7">
                  <q-icon name="schedule" size="xs" class="q-mr-xs" />{{
                    formatTime(ticket.createdAt)
                  }}
                  · {{ ticketConcept(ticket) }}
                </div>
                <div class="q-mt-xs q-gutter-xs">
                  <q-badge
                    :color="methodColor(ticket.paymentMethod)"
                    :label="methodLabel(ticket.paymentMethod)"
                  />
                  <q-badge color="warning" label="Pendiente" />
                  <q-badge
                    v-if="createdNewTicketIds.has(ticket.id)"
                    color="primary"
                    label="Nuevo"
                  />
                </div>
              </q-item-section>
              <q-item-section side top>
                <div class="text-h6">{{ formatPrice(ticket.amount, ticket.currency) }}</div>
              </q-item-section>
            </q-item>
          </q-list>
        </div>
      </template>
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
              <!-- ─── Step 1: Socio ─── -->
              <template v-if="currentStep === 1">
                <div class="text-h5 q-mb-md">Socio</div>

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
                        {{ searchQuery ? 'Sin resultados' : 'Escribí para buscar' }}
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

                <!-- Nuevo alumno: crea un alumno nuevo (mini-form + Sede). -->
                <q-btn
                  v-if="!showNewStudentForm && !selectedMember"
                  outline
                  no-caps
                  color="primary"
                  icon="person_add"
                  label="Nuevo alumno"
                  class="full-width q-mt-sm"
                  @click="onNuevoAlumno"
                />

                <!-- Mini-form alumno nuevo (Nombre/Apellido/DNI + Sede + dedup) -->
                <template v-if="showNewStudentForm">
                  <div class="text-body1 text-weight-bold q-mt-md">Datos del alumno</div>
                  <q-select
                    v-model="sucursalId"
                    :options="branchOptions"
                    option-value="id"
                    option-label="name"
                    emit-value
                    map-options
                    dense
                    outlined
                    label="Sede"
                    class="q-mt-sm"
                    @update:model-value="onSucursalChange"
                  >
                    <template #prepend>
                      <q-icon name="place" color="primary" />
                    </template>
                  </q-select>
                  <q-input
                    v-model="newStudent.firstName"
                    label="Nombre"
                    outlined
                    dense
                    class="q-mt-sm"
                  />
                  <q-input
                    v-model="newStudent.lastName"
                    label="Apellido"
                    outlined
                    dense
                    class="q-mt-sm"
                  />
                  <q-input
                    v-model="newStudent.dni"
                    label="DNI"
                    inputmode="numeric"
                    outlined
                    dense
                    class="q-mt-sm"
                    :loading="dedupChecking"
                    @blur="onDniBlur"
                  />

                  <!-- Dedup por DNI: si matchea, ofrecer cargar sobre el existente -->
                  <q-banner v-if="dedupMatch" dense rounded class="bg-warning text-dark q-mt-sm">
                    <template #avatar>
                      <q-icon name="warning" color="dark" />
                    </template>
                    Ya existe un alumno con ese DNI: {{ dedupMatchName }}. Se cargará sobre ese
                    alumno.
                    <template #action>
                      <q-btn flat dense no-caps label="Usar ese alumno" @click="onUsarExistente" />
                    </template>
                  </q-banner>
                </template>

                <!-- Deuda del socio (POS-01): aviso destacado bajo el socio elegido. -->
                <q-banner
                  v-if="(autocompletar?.outstanding ?? 0) > 0"
                  dense
                  rounded
                  class="bg-warning text-dark q-mt-md"
                >
                  <template #avatar>
                    <q-icon name="warning" color="dark" />
                  </template>
                  Debe
                  {{
                    formatPrice(autocompletar?.outstanding ?? 0, autocompletar?.currency ?? 'ARS')
                  }}
                  <span v-if="autocompletar?.planName"> — Plan {{ autocompletar.planName }}</span>
                </q-banner>
              </template>

              <!-- ─── Step 2: ¿Qué se cobra? ─── -->
              <template v-else-if="currentStep === 2">
                <div class="text-h5 q-mb-md">¿Qué se cobra?</div>

                <!-- Asociación (D-01, sin toggle de modo): 3 opciones como pregunta. -->
                <q-list bordered separator class="rounded-borders q-mb-md">
                  <q-item
                    v-for="opt in associationOptions"
                    :key="opt.value"
                    clickable
                    v-ripple
                    class="q-py-md"
                    :active="mode === opt.value"
                    active-class="bg-primary text-white"
                    @click="onSelectAssociation(opt.value)"
                  >
                    <q-item-section avatar>
                      <q-icon :name="opt.icon" />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>{{ opt.label }}</q-item-label>
                      <div
                        class="text-subtitle2 text-weight-regular"
                        :class="mode === opt.value ? 'text-white' : 'text-grey-7'"
                      >
                        {{ opt.hint }}
                      </div>
                    </q-item-section>
                  </q-item>
                </q-list>

                <!-- (a) Renovar plan vigente -->
                <template v-if="mode === 'renew'">
                  <template v-if="autocompletando">
                    <q-skeleton type="text" />
                    <q-skeleton type="text" />
                  </template>
                  <template v-else-if="autocompletar && !autocompletar.hasRenewable">
                    <div class="text-subtitle2 text-weight-regular text-warning q-mb-xs">
                      Este socio no tiene un plan activo para cobrar.
                    </div>
                    <q-btn
                      flat
                      dense
                      no-caps
                      color="primary"
                      icon="person_add"
                      label="Asignarle un plan"
                      @click="onSelectAssociation('alta')"
                    />
                  </template>
                  <template v-else-if="autocompletar">
                    <q-input
                      :model-value="autocompletar.planName ?? ''"
                      label="Plan vigente"
                      outlined
                      readonly
                    />
                  </template>
                </template>

                <!-- (b) Asignar plan nuevo: grilla por tier + Zero + turnos fixed -->
                <template v-else-if="mode === 'alta'">
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
                            <div
                              class="text-subtitle2 text-weight-regular"
                              :class="selectedPlan?.id === plan.id ? 'text-white' : 'text-grey-7'"
                            >
                              {{ plan.durationDays }} días
                              <template v-if="plan.classesPerWeek">
                                · {{ plan.classesPerWeek }} clases/sem
                              </template>
                              <template v-else> · Ilimitado </template>
                            </div>
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

                    <q-toggle
                      v-model="zeroPrice"
                      label="Precio Zero"
                      color="positive"
                      class="q-mt-sm"
                    />
                  </template>

                  <!-- Turnos: estructurado SOLO para planes fixed -->
                  <template v-if="selectedPlan">
                    <template v-if="selectedPlan.bookingMode === 'fixed'">
                      <div class="text-body1 text-weight-bold q-mt-md q-mb-xs">Turnos fijos</div>
                      <FixedSchedulePicker
                        v-model="scheduleIds"
                        :branch-id="sucursalId ?? 0"
                        :required-count="selectedPlan.classesPerWeek"
                        :allow-partial="false"
                        :multi-branch="selectedPlan.multiBranch"
                        :available-branches="multiBranchOptions"
                      />
                    </template>
                    <div v-else class="text-subtitle2 text-weight-regular text-grey-7 q-mt-sm">
                      Este plan reserva semana a semana — no se eligen turnos ahora.
                    </div>
                  </template>
                </template>

                <!-- (c) Cobro suelto: concepto + Motivo obligatorio -->
                <template v-else-if="mode === 'misc'">
                  <q-input
                    v-model="concepto"
                    type="textarea"
                    autogrow
                    label="Concepto"
                    placeholder="Ej.: clase de recuperación, ajuste, etc."
                    outlined
                  />
                  <q-select
                    v-model="miscReason"
                    :options="miscReasonOptions"
                    emit-value
                    map-options
                    label="Motivo"
                    outlined
                    class="q-mt-sm"
                  />
                </template>
              </template>

              <!-- ─── Step 3: ¿Cómo se paga? ─── -->
              <template v-else-if="currentStep === 3">
                <div class="text-h5 q-mb-md">¿Cómo se paga?</div>

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

                <q-input
                  v-model.number="amount"
                  type="number"
                  inputmode="numeric"
                  label="Monto"
                  outlined
                  class="q-mt-md"
                  :suffix="montoSymbol"
                  :hint="
                    mode === 'alta'
                      ? 'Por defecto se cobra el total. Editá si el cobro es parcial.'
                      : ''
                  "
                />

                <!-- Alta parcial: aviso de deuda remanente -->
                <q-banner
                  v-if="mode === 'alta' && isAltaPartial"
                  dense
                  rounded
                  class="bg-warning text-dark q-mt-sm"
                >
                  <template #avatar>
                    <q-icon name="warning" color="dark" />
                  </template>
                  El alumno quedará deudor por
                  {{ formatPrice(altaPrice - (amount ?? 0), altaCurrency) }}.
                </q-banner>

                <div class="text-subtitle2 text-weight-regular text-grey-7 q-mt-sm">
                  <q-icon name="schedule" size="xs" class="q-mr-xs" />Queda pendiente de validación.
                </div>
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

// Step-2 associations (D-01, replaces the old mode toggle). Selecting one sets
// `mode` and drives which endpoint the confirm dispatches.
const associationOptions: Array<{ value: Mode; label: string; hint: string; icon: string }> = [
  {
    value: 'renew',
    label: 'Renovar plan vigente',
    hint: 'Cobrar la renovación del plan activo',
    icon: 'autorenew',
  },
  {
    value: 'alta',
    label: 'Asignar plan nuevo',
    hint: 'Elegir un plan del catálogo',
    icon: 'add_card',
  },
  { value: 'misc', label: 'Cobro suelto', hint: 'Un cobro sin plan, con motivo', icon: 'receipt' },
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
// Monto suffix: alta usa la moneda del plan; renew/misc la del socio.
const montoSymbol = computed(() =>
  mode.value === 'alta' ? altaCurrencySymbol.value : currencySymbol.value
);

// Selecting a step-2 association: set the mode and (re)load its dependencies.
// Preserves the socio + debt (autocompletar), clears the per-charge fields and
// the idempotency key (deliberate target change → new attempt).
function onSelectAssociation(m: Mode) {
  if (mode.value === m) return;
  mode.value = m;
  amount.value = null;
  concepto.value = '';
  miscReason.value = 'sin_plan';
  selectedPlan.value = null;
  zeroPrice.value = false;
  scheduleIds.value = [];
  currentIdempotencyKey.value = null;
  if (m === 'alta') {
    if (branchOptions.value.length === 0) void loadBranches();
    void loadAltaPlans();
  }
  if (m === 'renew' && autocompletar.value?.hasRenewable && autocompletar.value.amount != null) {
    amount.value = autocompletar.value.amount;
  }
}

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

// ─── Listado agrupado por día (COBRO-03) ────────────────────────────────────
interface LoadDayGroup {
  key: string;
  label: string;
  rows: TransactionListItem[];
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayKey(d: Date): string {
  if (Number.isNaN(d.getTime())) return 'invalid';
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(d: Date): string {
  if (Number.isNaN(d.getTime())) return '—';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return 'Hoy';
  if (sameDay(d, yesterday)) return 'Ayer';
  // p.ej. "mar 1 jul" (es-AR). Se limpian los puntos de las abreviaturas.
  return d
    .toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\./g, '');
}

// myLoads ya viene ordenado por recencia; el grouping preserva ese orden.
const groupedLoads = computed<LoadDayGroup[]>(() => {
  const groups: LoadDayGroup[] = [];
  const byKey = new Map<string, LoadDayGroup>();
  for (const t of myLoads.value) {
    const d = new Date(t.createdAt);
    const key = dayKey(d);
    let g = byKey.get(key);
    if (!g) {
      g = { key, label: dayLabel(d), rows: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.rows.push(t);
  }
  return groups;
});

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

.cobros-day-header {
  position: sticky;
  top: 0;
  z-index: 1;
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
