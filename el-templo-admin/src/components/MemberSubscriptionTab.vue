<template>
  <div>
    <!-- Loading -->
    <div v-if="loadingSubscription" class="flex flex-center q-pa-lg">
      <q-spinner-dots size="40px" color="primary" />
    </div>

    <template v-else>
      <!-- Outstanding-balance banner. Source: balances cache via
           GET /admin/members/:id/outstanding-concepts (FIFO concepts
           with balance > 0). Surfaces the deudor flag inline so the
           admin does not need to flip to the Finanzas tab to see it. -->
      <q-banner v-if="hasDebt" class="bg-red-1 text-red-10 q-mb-md" dense rounded>
        <template #avatar>
          <q-icon name="error" color="negative" />
        </template>
        <div class="row items-center q-gutter-sm">
          <q-badge color="negative" label="DEUDOR" />
          <div class="text-weight-medium">
            Debe
            <template v-for="(d, i) in debtByCurrency" :key="d.currency">
              <span v-if="i > 0"> · </span>
              {{ formatPrice(d.amount, d.currency) }}
            </template>
          </div>
        </div>
      </q-banner>

      <!-- ========================================== -->
      <!-- Presencial Subscription Card -->
      <!-- ========================================== -->
      <SubscriptionCard
        v-if="presencialSub"
        :subscription="presencialSub"
        :class-usage="classUsage"
        label="Suscripción Presencial"
        @renew="openRenewal(presencialSub!)"
        @change="showChangeDialog = true"
        @change-turnos="openChangeTurnos"
        @edit-start-date="openEditStartDate(presencialSub!)"
        @pause="confirmPause"
        @resume="confirmResume"
        @compensate="openCompensateDialog"
        @cancel="confirmCancel()"
      />

      <!-- Renovación programada (sub scheduled cuando coexiste con la activa).
           Card propio para que el admin pueda cancelarla por separado sin
           tocar la membresía vigente — caso Pomilio. -->
      <SubscriptionCard
        v-if="presencialScheduledSub"
        :subscription="presencialScheduledSub"
        label="Renovación programada"
        @change-turnos="openChangeTurnos"
        @edit-start-date="openEditStartDate(presencialScheduledSub!)"
        @cancel="confirmCancel(presencialScheduledSub!)"
      />

      <!-- Fixed turnos change history -->
      <q-card v-if="presencialSub && scheduleChanges.length > 0" flat bordered class="q-mb-md">
        <q-expansion-item
          icon="history"
          :label="`Historial de cambios de turnos (${scheduleChanges.length})`"
          header-class="text-subtitle2"
          @show="loadScheduleChanges"
        >
          <q-list separator dense>
            <q-item v-for="c in scheduleChanges" :key="c.id">
              <q-item-section avatar>
                <q-icon name="swap_calls" color="primary" />
              </q-item-section>
              <q-item-section>
                <q-item-label>
                  {{ formatTurnosChange(c) }}
                </q-item-label>
                <q-item-label caption>
                  {{ formatDate(c.createdAt) }}
                  <template v-if="c.actorName"> · por {{ c.actorName }}</template>
                  <template v-if="c.reason"> · {{ c.reason }}</template>
                </q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-expansion-item>
      </q-card>

      <!-- No presencial subscription -->
      <q-card v-else-if="!presencialSub" flat bordered class="q-mb-md">
        <q-card-section class="text-center q-pa-lg">
          <div class="text-grey-5 text-italic q-mb-md">Sin suscripción presencial</div>
          <q-btn
            icon="assignment"
            label="Gestionar Plan"
            color="primary"
            @click="showAssignDialog = true"
          />
        </q-card-section>
      </q-card>

      <!-- Online Subscription Card (if exists) -->
      <SubscriptionCard
        v-if="programaSub"
        :subscription="programaSub"
        label="Suscripcion Online"
        show-category-badge
        @renew="openRenewal(programaSub!)"
        @edit-start-date="openEditStartDate(programaSub!)"
        @cancel="confirmCancelPrograma"
      />

      <!-- ========================================== -->
      <!-- Pase de Actividades Especiales (Plan 161) -->
      <!-- ========================================== -->
      <SubscriptionCard
        v-if="especialSub"
        :subscription="especialSub"
        label="Pase de Actividades"
        show-category-badge
        @renew="openRenewal(especialSub!)"
        @edit-start-date="openEditStartDate(especialSub!)"
        @cancel="confirmCancelEspecial"
      />

      <!-- Vender pase de actividades (cuando no hay uno activo) -->
      <q-card v-else flat bordered class="q-mb-md">
        <q-card-section class="row items-center justify-between q-py-sm">
          <div>
            <div class="text-body2 text-weight-medium">Pase de Actividades Especiales</div>
            <div class="text-caption text-grey-7">
              Socio (requiere presencial activo) o Externo — 2 asistencias por mes.
            </div>
          </div>
          <q-btn
            icon="local_activity"
            label="Vender pase"
            color="pink-8"
            outline
            dense
            @click="showAssignEspecialDialog = true"
          />
        </q-card-section>
      </q-card>

      <!-- ========================================== -->
      <!-- Subscription History -->
      <!-- ========================================== -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-subtitle1 text-weight-bold q-mb-sm">Historial de Suscripciones</div>

          <div v-if="loadingHistory" class="flex flex-center q-pa-md">
            <q-spinner-dots size="30px" color="primary" />
          </div>

          <div v-else-if="history.length === 0" class="text-grey-5 text-italic">Sin historial</div>

          <q-list v-else separator>
            <q-item v-for="item in history" :key="item.id">
              <q-item-section avatar>
                <q-icon name="receipt_long" :color="statusColor(item.status)" />
              </q-item-section>
              <q-item-section>
                <q-item-label>
                  {{ item.planName }}
                  <q-badge
                    :color="tierColor(item.planTier)"
                    :label="tierLabel(item.planTier)"
                    class="q-ml-sm"
                  />
                  <q-badge
                    :color="statusColor(item.status)"
                    :label="statusLabel(item.status)"
                    class="q-ml-xs"
                  />
                  <q-badge
                    v-if="item.planCategory !== 'presencial'"
                    :color="categoryColor(item.planCategory)"
                    :label="categoryLabel(item.planCategory)"
                    class="q-ml-xs"
                    outline
                  />
                </q-item-label>
                <q-item-label caption>
                  {{ formatDate(item.startDate) }}
                  <template v-if="item.endDate"> — {{ formatDate(item.endDate) }}</template>
                </q-item-label>
              </q-item-section>
              <q-item-section side>
                <div class="text-weight-medium">
                  {{ formatPrice(item.pricePaid, item.currency ?? 'ARS') }}
                </div>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
      </q-card>
    </template>

    <!-- ========================================== -->
    <!-- Assign Plan Dialog (presencial) -->
    <!-- ========================================== -->
    <AssignPlanDialog
      v-model="showAssignDialog"
      :userId="userId"
      :memberBranchId="memberBranchId"
      :memberBranchName="memberBranchName"
      :boardingPassUsed="memberBoardingPassUsed"
      :memberBranchIsVirtual="memberBranchIsVirtual ?? false"
      :member="member ?? null"
      :branches="branches ?? []"
      @assigned="onAssigned"
    />

    <!-- Change Plan Dialog (presencial — reuses AssignPlanDialog in change mode) -->
    <AssignPlanDialog
      v-model="showChangeDialog"
      :userId="userId"
      :memberBranchId="memberBranchId"
      :memberBranchName="memberBranchName"
      :boardingPassUsed="memberBoardingPassUsed"
      :currentSubEndDate="presencialSub?.endDate ?? null"
      :currentPlanId="presencialSub?.planId ?? null"
      :currentScheduleIds="classUsage?.scheduleIds ?? []"
      :memberBranchIsVirtual="memberBranchIsVirtual ?? false"
      :member="member ?? null"
      :branches="branches ?? []"
      mode="change"
      @assigned="onAssigned"
    />

    <!-- Edit Start Date Dialog -->
    <EditSubscriptionStartDateDialog
      v-model="showEditStartDateDialog"
      :subscription="editStartDateTarget"
      @saved="onStartDateEdited"
    />

    <!-- Change Fixed Schedules Dialog -->
    <ChangeFixedSchedulesDialog
      v-if="presencialSub && classUsage"
      v-model="showChangeTurnosDialog"
      :subscription-id="presencialSub.id"
      :branch-id="memberBranchId"
      :branch-name="memberBranchName"
      :required-count="classUsage.weeklyLimit"
      :current-schedule-ids="classUsage.scheduleIds"
      :allow-partial="classUsage.bookingMode === 'flexible'"
      :multi-branch="classUsage.multiBranch"
      :available-branches="multiBranchOptions"
      @saved="onTurnosChanged"
    />

    <!-- Assign Program Dialog (online only) -->
    <AssignPlanDialog
      v-model="showAssignProgramDialog"
      :userId="userId"
      :memberBranchId="memberBranchId"
      :memberBranchName="memberBranchName"
      :boardingPassUsed="memberBoardingPassUsed"
      category-filter="online"
      @assigned="onAssigned"
    />

    <!-- Assign Especial Pass Dialog (pase de actividades, Plan 161) -->
    <AssignPlanDialog
      v-model="showAssignEspecialDialog"
      :userId="userId"
      :memberBranchId="memberBranchId"
      :memberBranchName="memberBranchName"
      :boardingPassUsed="memberBoardingPassUsed"
      category-filter="especial"
      @assigned="onAssigned"
    />

    <!-- Renewal Dialog -->
    <q-dialog v-model="showRenewalDialog">
      <q-card
        :style="
          renewalEditTurnos ? 'width: 700px; max-width: 95vw' : 'width: 450px; max-width: 95vw'
        "
      >
        <q-card-section>
          <div class="text-h6">Renovar Suscripcion</div>
        </q-card-section>
        <q-separator />
        <q-card-section v-if="renewTarget">
          <q-list dense>
            <q-item>
              <q-item-section>Plan</q-item-section>
              <q-item-section side class="text-weight-medium">{{
                renewTarget.planName
              }}</q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Vencimiento actual</q-item-section>
              <q-item-section side>{{
                renewTarget.endDate ? formatDate(renewTarget.endDate) : '—'
              }}</q-item-section>
            </q-item>
            <q-item v-if="renewalActivationDate">
              <q-item-section>Se activa el</q-item-section>
              <q-item-section side class="text-weight-medium">{{
                renewalActivationDate
              }}</q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Nuevo vencimiento</q-item-section>
              <q-item-section side class="text-weight-bold text-positive">{{
                renewalEndDate
              }}</q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Precio</q-item-section>
              <q-item-section side class="text-weight-bold text-h6">{{
                formatPrice(renewalChargeBase, renewTarget.currency ?? 'ARS')
              }}</q-item-section>
            </q-item>
          </q-list>

          <!-- Fecha de inicio personalizada -->
          <div class="q-mt-md">
            <q-toggle v-model="renewalUseCustomStartDate" label="Modificar fecha de inicio" />
            <template v-if="renewalUseCustomStartDate">
              <q-input
                v-model="renewalStartDate"
                label="Fecha de inicio"
                type="date"
                dense
                outlined
                class="q-mt-xs"
                :min="renewalStartDateMin"
                :max="renewalStartDateMax"
                :error="!!renewalStartDateError"
                :error-message="renewalStartDateError ?? undefined"
              />
              <div class="text-caption text-grey-7 q-mt-xs">
                Permitido entre {{ formatDate(renewalStartDateMin) }} y
                {{ formatDate(renewalStartDateMax) }}.
              </div>
            </template>
          </div>

          <!-- Turnos fijos del nuevo período -->
          <div v-if="renewalSupportsTurnos && classUsage" class="q-mt-md">
            <q-toggle v-model="renewalEditTurnos" label="Modificar turnos" />
            <div v-if="!renewalEditTurnos" class="text-caption text-grey-7 q-mt-xs">
              {{ renewalInheritedTurnosLabel }}
            </div>
            <template v-else>
              <FixedSchedulePicker
                ref="renewalPickerRef"
                v-model="renewalScheduleIds"
                :branch-id="renewTarget.branchId"
                :required-count="classUsage.weeklyLimit"
                :allow-partial="classUsage.bookingMode === 'flexible'"
                :title="
                  classUsage.bookingMode === 'flexible'
                    ? 'Turnos fijos del nuevo período (opcional)'
                    : 'Turnos fijos del nuevo período'
                "
                :branch-name="renewTarget.branchName"
                :multi-branch="classUsage.multiBranch"
                :available-branches="multiBranchOptions"
                class="q-mt-xs"
              />
              <div v-if="renewalTurnosError" class="text-caption text-negative q-mt-xs">
                {{ renewalTurnosError }}
              </div>
            </template>
          </div>

          <!-- Precio personalizado -->
          <div class="q-mt-md">
            <q-toggle v-model="renewalUseOverride" label="Precio personalizado" />
            <template v-if="renewalUseOverride">
              <div class="row q-col-gutter-sm q-mt-xs">
                <div class="col-12 col-sm-4">
                  <q-input
                    v-model.number="renewalOverrideAmount"
                    label="Monto"
                    type="number"
                    dense
                    outlined
                    prefix="$"
                    :min="0"
                  />
                </div>
                <div class="col-12 col-sm-8">
                  <q-input
                    v-model="renewalOverrideReason"
                    label="Razon (requerida)"
                    dense
                    outlined
                  />
                </div>
              </div>
            </template>
          </div>

          <div class="row q-col-gutter-md q-mt-md">
            <div class="col-12 col-sm-6">
              <q-input
                v-model.number="renewalAmountReceived"
                label="Monto recibido"
                type="number"
                dense
                outlined
                prefix="$"
                :max="renewalChargeBase"
                :min="0"
                :disable="renewalChargeBase === 0"
                hint="Por defecto se cobra el total. Modificá si el cobro es parcial o cero."
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-select
                v-model="renewalMethod"
                :options="paymentMethodOptions"
                label="Metodo de pago *"
                dense
                outlined
                emit-value
                map-options
                :disable="renewalChargeBase === 0"
              />
            </div>
          </div>

          <div
            v-if="renewalChargeBase > 0 && renewalAmountReceived !== null"
            class="q-mt-md text-body2"
          >
            <span class="text-weight-medium">Saldo pendiente:</span>
            {{ formatPrice(renewalPendingBalance, renewTarget.currency ?? 'ARS') }}
          </div>

          <q-banner
            v-if="renewalIsPartialCharge"
            dense
            rounded
            class="bg-yellow-1 text-warning q-mt-md"
          >
            <template #avatar>
              <q-icon name="warning" />
            </template>
            La renovacion se confirma con saldo pendiente. El miembro quedara como deudor por
            {{ formatPrice(renewalPendingBalance, renewTarget.currency ?? 'ARS') }}.
          </q-banner>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancelar" color="grey" @click="showRenewalDialog = false" />
          <q-btn
            color="positive"
            label="Confirmar Renovacion"
            icon="check"
            :loading="renewalLoading"
            :disable="
              renewalOverrideInvalid ||
              !!renewalStartDateError ||
              !!renewalTurnosError ||
              renewalAmountReceived === null ||
              renewalAmountReceived < 0 ||
              renewalAmountReceived > renewalChargeBase
            "
            @click="executeRenewal"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Pause Dialog -->
    <q-dialog v-model="showPauseDialog">
      <q-card style="width: 450px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">Pausar Suscripcion</div>
        </q-card-section>
        <q-separator />
        <q-card-section>
          <div class="text-body2 q-mb-md">
            El tiempo pausado se extendera en la fecha de vencimiento cuando se reanude.
          </div>
          <q-banner dense rounded class="bg-warning text-white q-mb-md">
            <template #avatar>
              <q-icon name="warning" />
            </template>
            Todas las reservas futuras de este alumno seran canceladas. Al reanudar la suscripcion
            se regeneraran automaticamente desde sus horarios fijos.
          </q-banner>
          <q-input
            v-model="pauseEndDateInput"
            label="Fecha de reanudacion (opcional)"
            type="date"
            dense
            outlined
            :min="pauseMinDate"
            clearable
          />
          <div class="text-caption text-grey-7 q-mt-xs">
            {{
              pauseEndDateInput
                ? `Se reanudara automaticamente el ${formatDate(pauseEndDateInput)}.`
                : 'Si no eliges fecha, la suscripcion queda pausada hasta que la reanudes manualmente.'
            }}
          </div>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancelar" color="grey" @click="showPauseDialog = false" />
          <q-btn
            color="warning"
            label="Pausar"
            icon="pause"
            :loading="actionLoading"
            @click="executePause"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Compensar días: acredita días no entrenados extendiendo el
         vencimiento. Rango pasado (ausencia que ya ocurrió, donde Pausar
         no sirve) o futuro (congelar días avisados con anticipación —
         se cancelan las reservas fijas de esos días). -->
    <q-dialog v-model="showCompensateDialog">
      <q-card style="width: 450px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">Compensar días</div>
        </q-card-section>
        <q-separator />
        <q-card-section>
          <div class="text-body2 q-mb-md">
            Acredita días que el alumno no entrenó o no va a entrenar (viaje, lesión, vacaciones)
            extendiendo la fecha de vencimiento. El rango puede incluir días pasados y futuros.
          </div>
          <div class="row q-col-gutter-sm q-mb-md">
            <div class="col-6">
              <q-input
                v-model="compensateFromInput"
                label="Desde"
                type="date"
                dense
                outlined
                :min="compensateMinDate"
                :max="compensateMaxDate"
              />
            </div>
            <div class="col-6">
              <q-input
                v-model="compensateToInput"
                label="Hasta"
                type="date"
                dense
                outlined
                :min="compensateFromInput || compensateMinDate"
                :max="compensateMaxDate"
              />
            </div>
          </div>
          <q-input
            v-model="compensateReasonInput"
            label="Motivo"
            type="textarea"
            autogrow
            dense
            outlined
            :rules="[(v) => !!v?.trim() || 'El motivo es obligatorio']"
          />
          <q-banner v-if="compensatePreview" dense rounded class="bg-blue-1 text-blue-10 q-mt-sm">
            <template #avatar>
              <q-icon name="more_time" />
            </template>
            Se acreditan
            <b>{{ compensatePreview.days }} {{ compensatePreview.days === 1 ? 'día' : 'días' }}</b
            >: vencimiento {{ formatDate(compensatePreview.prevEndDate) }} →
            {{ formatDate(compensatePreview.newEndDate) }}
            <template v-if="compensateTouchesFuture">
              <br />
              Se cancelarán las reservas de turnos fijos dentro del rango.
            </template>
          </q-banner>
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancelar" color="grey" @click="showCompensateDialog = false" />
          <q-btn
            color="warning"
            label="Compensar"
            icon="more_time"
            :loading="actionLoading"
            :disable="!compensateValid"
            @click="executeCompensate"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { formatDate } from 'src/utils/format-date';
import { formatPrice } from 'src/utils/format-price';
import {
  extractError,
  isExpectedClientError,
  parseActiveTransactionsBlock,
} from 'src/utils/extract-error';
import { useSubscriptionsApi } from 'src/composables/useSubscriptionsApi';
import {
  PLAN_TIER_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  PLAN_CATEGORY_LABELS,
  PLAN_CATEGORY_COLORS,
  type SubscriptionDetail,
  type SubscriptionHistoryItem,
  type ClassUsageInfo,
  type PlanTier,
  type PlanCategory,
  type SubscriptionStatus,
} from 'src/types/subscription';
import {
  PAYMENT_METHOD_OPTIONS,
  type PaymentMethod,
  type OutstandingConcept,
} from 'src/types/transaction';
import type { MemberProfile, BranchOption } from 'src/types/member';
import AssignPlanDialog from 'src/components/AssignPlanDialog.vue';
import ChangeFixedSchedulesDialog from 'src/components/ChangeFixedSchedulesDialog.vue';
import FixedSchedulePicker from 'src/components/scheduling/FixedSchedulePicker.vue';
import { DAY_SHORT_LABELS, type DayOfWeek } from 'src/types/scheduling';
import EditSubscriptionStartDateDialog from 'src/components/EditSubscriptionStartDateDialog.vue';
import SubscriptionCard from 'src/components/SubscriptionCard.vue';
import type { SubscriptionScheduleChangeEntry } from 'src/types/subscription';

const log = createLogger('MemberSubscriptionTab');
const $q = useQuasar();
const subsApi = useSubscriptionsApi();

// =========================================================================
// Props & Emits
// =========================================================================

const props = defineProps<{
  userId: number;
  memberBranchId: number;
  memberBranchName: string;
  memberBoardingPassUsed: boolean;
  // Phase 111 REQ-2: thread the virtual-branch flag down to AssignPlanDialog
  // so it can filter presencial plans and render the convert-CTA banner.
  memberBranchIsVirtual?: boolean;
  // Full member profile + branches list — passed straight through to the
  // stacked MemberFormDialog overlay rendered by AssignPlanDialog when the
  // admin clicks "Editar alumno" from the banner CTA.
  member?: MemberProfile | null;
  branches?: BranchOption[];
  // Outstanding-balance concepts owned by the parent page (single fetch
  // shared with the floating "D" badge on the Suscripcion tab). Passed
  // straight through so this component does not re-fetch on tab mount.
  outstandingConcepts?: OutstandingConcept[];
}>();

const emit = defineEmits<{
  'subscription-changed': [];
}>();

// =========================================================================
// State
// =========================================================================

const allSubscriptions = ref<SubscriptionDetail[]>([]);
const classUsage = ref<ClassUsageInfo | null>(null);
const history = ref<SubscriptionHistoryItem[]>([]);
const loadingSubscription = ref(false);
const loadingHistory = ref(false);
const actionLoading = ref(false);
const showAssignDialog = ref(false);
const showAssignProgramDialog = ref(false);
const showChangeDialog = ref(false);
const showChangeTurnosDialog = ref(false);
const scheduleChanges = ref<SubscriptionScheduleChangeEntry[]>([]);
const loadingScheduleChanges = ref(false);
const showRenewalDialog = ref(false);
const renewTarget = ref<SubscriptionDetail | null>(null);
const renewalMethod = ref<PaymentMethod>('cash');
const renewalLoading = ref(false);
const renewalAmountReceived = ref<number | null>(null);
const renewalUseOverride = ref(false);
const renewalOverrideAmount = ref<number | null>(null);
const renewalOverrideReason = ref('');
// Precio normalizado por el server al renovar (revisión v5.4 WR-04). Cuando el socio
// venía con priceType 'credit_card' y la regla de recargo está OFF, el server normaliza
// a 'regular' → el precio a cobrar (Y) es menor que el pricePaid heredado (X). Guardamos
// Y acá para (a) mostrar la base de cobro correcta en el diálogo (evita el 400 de
// recordAssignmentCharge por amountReceived > chargeBase) y (b) avisar con un alert antes
// de renovar. null = sin normalización (renovación normal).
const renewalNormalizedPrice = ref<number | null>(null);
// Fecha de inicio custom al renovar (hotfix 1708312a). El toggle habilita el date-picker.
const renewalUseCustomStartDate = ref(false);
const renewalStartDate = ref('');
// Turnos del nuevo período (pedido del staff 2026-07-10). Toggle OFF (default)
// = herencia del backend (copia los turnos del período anterior); ON = el
// admin elige el set en el picker y viaja como scheduleIds en el renew.
const renewalEditTurnos = ref(false);
const renewalScheduleIds = ref<number[]>([]);
const renewalPickerRef = ref<InstanceType<typeof FixedSchedulePicker> | null>(null);
const showEditStartDateDialog = ref(false);
const editStartDateTarget = ref<SubscriptionDetail | null>(null);

const paymentMethodOptions = PAYMENT_METHOD_OPTIONS;

// =========================================================================
// Computed — split subscriptions
// =========================================================================

// Membresía presencial "vigente" — preferimos active/paused; recién si no hay,
// caemos a la scheduled (alumno que solo tiene una renovación pendiente).
const presencialSub = computed(
  () =>
    allSubscriptions.value.find(
      (s) =>
        (!s.planCategory || s.planCategory === 'presencial') &&
        (s.status === 'active' || s.status === 'paused')
    ) ??
    allSubscriptions.value.find(
      (s) => (!s.planCategory || s.planCategory === 'presencial') && s.status === 'scheduled'
    ) ??
    null
);

// Renovación programada visible como card aparte SOLO cuando ya hay una
// activa/pausada arriba — así el admin puede cancelarla por separado sin
// tocar la membresía vigente (caso Pomilio). Si solo existe la scheduled,
// ya aparece como `presencialSub` arriba.
const presencialScheduledSub = computed(() => {
  const hasActive = allSubscriptions.value.some(
    (s) =>
      (!s.planCategory || s.planCategory === 'presencial') &&
      (s.status === 'active' || s.status === 'paused')
  );
  if (!hasActive) return null;
  return (
    allSubscriptions.value.find(
      (s) => (!s.planCategory || s.planCategory === 'presencial') && s.status === 'scheduled'
    ) ?? null
  );
});

// Aggregated outstanding balance per currency (drives the "Deudor"
// banner). The parent page owns the fetch and passes the list in; if it
// is empty (no debt, or coach role for which the endpoint 403s), the
// banner stays hidden.
const debtByCurrency = computed(() => {
  const map = new Map<string, number>();
  for (const c of props.outstandingConcepts ?? []) {
    if (c.balance > 0) {
      map.set(c.currency, (map.get(c.currency) ?? 0) + c.balance);
    }
  }
  return Array.from(map.entries()).map(([currency, amount]) => ({ currency, amount }));
});

const hasDebt = computed(() => debtByCurrency.value.length > 0);

// Branches the FixedSchedulePicker offers when the active sub's plan is
// multi_branch. Virtual sedes (Templo Online) never host presencial anchors,
// so they're filtered out. The list is already country-scoped at the API
// level via getBranches().
const multiBranchOptions = computed(() =>
  (props.branches ?? []).filter((b) => !b.isVirtual).map((b) => ({ id: b.id, name: b.name }))
);

const programaSub = computed(
  () =>
    allSubscriptions.value.find(
      (s) => s.planCategory && s.planCategory !== 'presencial' && s.planCategory !== 'especial'
    ) ?? null
);

// Pase de actividades especiales (Plan 161). Corre en paralelo a la presencial
// y a los programas online; se muestra en su propio card y se renueva por
// subscriptionId. Preferimos active/paused; si no hay, la scheduled.
const especialSub = computed(
  () =>
    allSubscriptions.value.find(
      (s) => s.planCategory === 'especial' && (s.status === 'active' || s.status === 'paused')
    ) ??
    allSubscriptions.value.find((s) => s.planCategory === 'especial' && s.status === 'scheduled') ??
    null
);

const showAssignEspecialDialog = ref(false);

// Turnos al renovar: solo para subs presenciales con classUsage cargado (la
// renovación es del mismo plan, así que los límites del plan actual —
// weeklyLimit/bookingMode/multiBranch — aplican tal cual al nuevo período).
// Sin classUsage (p. ej. socio sin sub activa) se cae al comportamiento
// previo: renovar hereda y los turnos se ajustan después con "Cambiar turnos".
const renewalSupportsTurnos = computed(
  () =>
    renewTarget.value !== null &&
    (!renewTarget.value.planCategory || renewTarget.value.planCategory === 'presencial') &&
    classUsage.value !== null
);

// Resumen de lo que hereda la renovación cuando el toggle está apagado.
const renewalInheritedTurnosLabel = computed(() => {
  const slots = classUsage.value?.scheduleSlots ?? [];
  if (slots.length === 0) {
    return 'El período actual no tiene turnos fijos: la renovación arranca sin turnos. Activá "Modificar turnos" para cargarlos ahora.';
  }
  const list = slots
    .map((s) => `${DAY_SHORT_LABELS[s.dayOfWeek as DayOfWeek] ?? s.dayOfWeek} ${s.startTime}`)
    .join(', ');
  return `Se mantienen los turnos actuales: ${list}.`;
});

// Validación del set elegido (espejo de las reglas del backend, para feedback
// inmediato): plan fijo = exactamente weeklyLimit; flexible = hasta weeklyLimit.
const renewalTurnosError = computed(() => {
  if (!renewalEditTurnos.value || !renewalSupportsTurnos.value || !classUsage.value) return null;
  const limit = classUsage.value.weeklyLimit;
  const count = renewalScheduleIds.value.length;
  if (classUsage.value.bookingMode === 'fixed') {
    if (limit !== null && count !== limit) {
      return `Seleccioná exactamente ${limit} turno${limit === 1 ? '' : 's'} (elegiste ${count}).`;
    }
  } else if (limit !== null && count > limit) {
    return `Podés elegir hasta ${limit} turno${limit === 1 ? '' : 's'} (elegiste ${count}).`;
  }
  return null;
});

// Duración del plan en días (derivada del período de la sub actual). Fallback
// defensivo de 30 días si la sub no tiene un endDate coherente.
const renewalDurationDays = computed(() => {
  if (!renewTarget.value?.endDate) return 30;
  const startMs = new Date(renewTarget.value.startDate).getTime();
  const endMs = new Date(renewTarget.value.endDate).getTime();
  const days = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 30;
});

// Fecha de inicio automática: vencimiento actual si la sub sigue vigente, si no hoy.
const renewalAutoStartDate = computed(() => {
  const today = new Date().toISOString().split('T')[0];
  if (!renewTarget.value?.endDate) return today;
  return renewTarget.value.endDate >= today ? renewTarget.value.endDate : today;
});

// Fecha efectiva para el resumen: la custom si el toggle está activo y hay valor,
// si no la automática.
const renewalEffectiveStartDate = computed(() =>
  renewalUseCustomStartDate.value && renewalStartDate.value
    ? renewalStartDate.value
    : renewalAutoStartDate.value
);

// Límites de la fecha custom: no antes del piso automático (evita solapar con la
// sub vigente y el backdating) y hasta 60 días en el futuro (igual que el backend).
const renewalStartDateMin = computed(() => renewalAutoStartDate.value);
const renewalStartDateMax = computed(() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 60);
  return d.toISOString().split('T')[0];
});

const renewalStartDateError = computed<string | null>(() => {
  if (!renewalUseCustomStartDate.value) return null;
  if (!renewalStartDate.value) return 'Ingresá una fecha de inicio';
  if (renewalStartDate.value < renewalStartDateMin.value) {
    return `No puede ser anterior a ${formatDate(renewalStartDateMin.value)}`;
  }
  if (renewalStartDate.value > renewalStartDateMax.value) {
    return `No puede ser posterior a ${formatDate(renewalStartDateMax.value)}`;
  }
  return null;
});

const renewalEndDate = computed(() => {
  if (!renewTarget.value?.endDate) return '—';
  const end = new Date(renewalEffectiveStartDate.value);
  end.setDate(end.getDate() + renewalDurationDays.value);
  return formatDate(end.toISOString().split('T')[0]);
});

// Cuando la renovación arranca en el futuro (sub vigente o fecha custom futura),
// queda encolada — mostramos la fecha en que se activará.
const renewalActivationDate = computed(() => {
  if (!renewTarget.value?.endDate) return null;
  const today = new Date().toISOString().split('T')[0];
  if (renewalEffectiveStartDate.value <= today) return null;
  return formatDate(renewalEffectiveStartDate.value);
});

const renewalChargeBase = computed(() => {
  if (
    renewalUseOverride.value &&
    renewalOverrideAmount.value !== null &&
    renewalOverrideAmount.value >= 0
  ) {
    return renewalOverrideAmount.value;
  }
  // Si el server va a normalizar el precio (credit_card→regular con la regla de recargo
  // OFF), la base de cobro es el precio normalizado (Y), no el pricePaid heredado (X).
  return renewalNormalizedPrice.value ?? renewTarget.value?.pricePaid ?? 0;
});

// El override es válido si está activo, tiene monto >= 0 y una razón no vacía.
const renewalOverrideInvalid = computed(
  () =>
    renewalUseOverride.value &&
    (renewalOverrideAmount.value === null ||
      renewalOverrideAmount.value < 0 ||
      renewalOverrideReason.value.trim() === '')
);

const renewalPendingBalance = computed(() =>
  Math.max(0, renewalChargeBase.value - (renewalAmountReceived.value ?? 0))
);

const renewalIsPartialCharge = computed(
  () =>
    renewalChargeBase.value > 0 &&
    renewalAmountReceived.value !== null &&
    renewalAmountReceived.value < renewalChargeBase.value
);

// =========================================================================
// Display helpers
// =========================================================================

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

function statusLabel(status: SubscriptionStatus): string {
  return STATUS_LABELS[status] ?? status;
}

function statusColor(status: SubscriptionStatus): string {
  return STATUS_COLORS[status] ?? 'grey';
}

function categoryLabel(category: PlanCategory): string {
  return PLAN_CATEGORY_LABELS[category] ?? category;
}

function categoryColor(category: PlanCategory): string {
  return PLAN_CATEGORY_COLORS[category] ?? 'grey';
}

// =========================================================================
// Data loading
// =========================================================================

async function loadSubscriptions() {
  loadingSubscription.value = true;
  try {
    allSubscriptions.value = await subsApi.getMemberSubscriptions(props.userId);
  } catch {
    // Fallback to singular endpoint (backwards compat if API not yet deployed)
    try {
      const single = await subsApi.getMemberSubscription(props.userId);
      allSubscriptions.value = single ? [single] : [];
    } catch (err2: unknown) {
      const message = err2 instanceof Error ? err2.message : 'Error desconocido';
      log.error('Error loading subscriptions', { error: message, userId: props.userId });
    }
  } finally {
    loadingSubscription.value = false;
  }
}

async function loadHistory() {
  loadingHistory.value = true;
  try {
    history.value = await subsApi.getMemberSubscriptionHistory(props.userId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading subscription history', { error: message, userId: props.userId });
  } finally {
    loadingHistory.value = false;
  }
}

async function loadClassUsage() {
  try {
    classUsage.value = await subsApi.getClassUsage(props.userId);
  } catch (err: unknown) {
    classUsage.value = null;
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.warn('Error loading class usage', { error: message, userId: props.userId });
  }
}

async function refreshAll() {
  await Promise.all([loadSubscriptions(), loadHistory(), loadClassUsage()]);
  await loadScheduleChanges();
}

// =========================================================================
// Lifecycle Actions
// =========================================================================

function openRenewal(sub: SubscriptionDetail) {
  renewTarget.value = sub;
  renewalAmountReceived.value = sub.pricePaid ?? 0;
  renewalUseOverride.value = false;
  renewalOverrideAmount.value = null;
  renewalOverrideReason.value = '';
  renewalNormalizedPrice.value = null;
  renewalUseCustomStartDate.value = false;
  // Pre-cargamos la fecha automática para que, al activar el toggle, el picker
  // arranque en el valor que el sistema usaría por defecto.
  renewalStartDate.value = renewalAutoStartDate.value;
  // Turnos: el picker arranca prellenado con los del período actual (lo que
  // la renovación heredaría), así "modificar" es ajustar, no rearmar de cero.
  renewalEditTurnos.value = false;
  renewalScheduleIds.value = [...(classUsage.value?.scheduleIds ?? [])];
  showRenewalDialog.value = true;
  // Detectar normalización de recargo de tarjeta (revisión v5.4 WR-04): si el socio
  // venía con 'credit_card', le preguntamos al server el precio real que cobraría la
  // renovación. Si difiere del pricePaid heredado, guardamos Y para reflejarlo en la
  // base de cobro y avisar antes de confirmar. Fire-and-forget: no bloquea el diálogo.
  if (sub.priceTypeApplied === 'credit_card') {
    void detectRenewalNormalization(sub);
  }
}

// Pregunta al server (única autoridad de precio vía resolvePriceType) qué cobraría la
// renovación con priceType 'credit_card'. Con la regla de recargo OFF el server devuelve
// el precio regular normalizado (Y) < pricePaid heredado (X); lo guardamos para el alert
// y la base de cobro. Con la regla ON (El Templo) Y === X → no dispara nada.
async function detectRenewalNormalization(sub: SubscriptionDetail) {
  try {
    const preview = await subsApi.getPricingPreview(props.userId, sub.planId, 'credit_card');
    // Guard anti-race: el diálogo podría haberse cerrado o cambiado de target.
    if (renewTarget.value?.id !== sub.id) return;
    if (preview.finalPrice !== (sub.pricePaid ?? 0)) {
      renewalNormalizedPrice.value = preview.finalPrice;
    }
  } catch (err: unknown) {
    // Si el preview falla no bloqueamos la renovación; el server sigue siendo la autoridad.
    log.warn('No se pudo previsualizar la normalización de precio en renovación', {
      error: extractError(err, 'preview failed'),
    });
  }
}

// Al cambiar el precio a cobrar (override on/off o monto), por defecto se
// cobra el total. El admin luego puede ajustar a un cobro parcial.
watch(renewalChargeBase, (base) => {
  renewalAmountReceived.value = base;
});

function openEditStartDate(sub: SubscriptionDetail) {
  editStartDateTarget.value = sub;
  showEditStartDateDialog.value = true;
}

function onStartDateEdited() {
  refreshAll();
  emit('subscription-changed');
}

async function executeRenewal() {
  // Aviso de normalización (revisión v5.4 WR-04): si el precio se normaliza por el
  // recargo de tarjeta, confirmamos con el usuario antes de renovar, mostrando X→Y.
  // El override manual salta la normalización en el server, así que no avisamos ahí.
  if (renewalNormalizedPrice.value !== null && !renewalUseOverride.value && renewTarget.value) {
    const currency = renewTarget.value.currency ?? 'ARS';
    const from = formatPrice(renewTarget.value.pricePaid ?? 0, currency);
    const to = formatPrice(renewalNormalizedPrice.value, currency);
    $q.dialog({
      title: 'El precio cambia al renovar',
      message:
        'Este socio venía con recargo de tarjeta. Con la regla de recargo apagada, al ' +
        `renovar se normaliza a precio regular: de ${from} a ${to}. ¿Renovar de todos modos?`,
      cancel: { label: 'Cancelar', flat: true },
      ok: { label: 'Renovar', color: 'primary' },
      persistent: true,
    }).onOk(() => {
      void performRenewal();
    });
    return;
  }
  await performRenewal();
}

async function performRenewal() {
  renewalLoading.value = true;
  try {
    // Si el cobro es 0, omitimos el campo amountReceived; sino enviamos el valor.
    // Backend hace `amountReceived ?? chargeBase` (default = full).
    await subsApi.renewSubscription(props.userId, {
      paymentMethod: renewalMethod.value,
      // Discriminador explícito (Plan 161-02): renovamos exactamente la sub que
      // el admin abrió. Inequívoco cuando coexisten presencial + pase especial;
      // el backend valida ownership y, sin él, caería a la selección active-first.
      ...(renewTarget.value ? { subscriptionId: renewTarget.value.id } : {}),
      amountReceived:
        renewalChargeBase.value === 0 ? undefined : (renewalAmountReceived.value ?? undefined),
      ...(renewalUseOverride.value && renewalOverrideAmount.value !== null
        ? {
            priceOverrideAmount: renewalOverrideAmount.value,
            priceOverrideReason: renewalOverrideReason.value.trim(),
          }
        : {}),
      // Solo enviamos startDate si el admin lo modificó explícitamente; si no,
      // el backend deriva la fecha automáticamente (comportamiento previo).
      ...(renewalUseCustomStartDate.value && renewalStartDate.value
        ? { startDate: renewalStartDate.value }
        : {}),
      // Turnos: solo si el admin activó "Modificar turnos". Omitido → el
      // backend copia los turnos del período anterior (comportamiento previo).
      ...(renewalEditTurnos.value && renewalSupportsTurnos.value
        ? {
            scheduleIds: renewalScheduleIds.value,
            ...(() => {
              const startDates = renewalPickerRef.value?.getStartDates() ?? {};
              return Object.keys(startDates).length > 0 ? { scheduleStartDates: startDates } : {};
            })(),
          }
        : {}),
    });
    $q.notify({ type: 'positive', message: 'Suscripcion renovada correctamente' });
    showRenewalDialog.value = false;
    renewTarget.value = null;
    renewalMethod.value = 'cash';
    renewalAmountReceived.value = null;
    renewalUseOverride.value = false;
    renewalOverrideAmount.value = null;
    renewalOverrideReason.value = '';
    renewalNormalizedPrice.value = null;
    renewalUseCustomStartDate.value = false;
    renewalStartDate.value = '';
    renewalEditTurnos.value = false;
    renewalScheduleIds.value = [];
    refreshAll();
    emit('subscription-changed');
  } catch (err: unknown) {
    const message = extractError(err, 'Error renovando suscripcion');
    if (isExpectedClientError(err)) {
      log.warn('Renewal rejected by server', { error: message });
    } else {
      log.error('Error renewing subscription', { error: message });
    }
    $q.notify({ type: 'negative', message, timeout: 5000 });
  } finally {
    renewalLoading.value = false;
  }
}

const showPauseDialog = ref(false);
const pauseEndDateInput = ref<string | null>(null);
const pauseMinDate = computed(() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
});

function confirmPause() {
  pauseEndDateInput.value = null;
  showPauseDialog.value = true;
}

async function executePause() {
  actionLoading.value = true;
  try {
    await subsApi.pauseSubscription(props.userId, pauseEndDateInput.value || undefined);
    $q.notify({
      type: 'positive',
      message: pauseEndDateInput.value
        ? 'Suscripcion pausada (reanuda automatica programada)'
        : 'Suscripcion pausada',
    });
    emit('subscription-changed');
    refreshAll();
    showPauseDialog.value = false;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error pausing subscription', { error: message });
    $q.notify({ type: 'negative', message: 'Error pausando suscripcion' });
  } finally {
    actionLoading.value = false;
  }
}

// ─── Compensar días (pausa retroactiva) ──────────────────────────────────

const showCompensateDialog = ref(false);
const compensateFromInput = ref<string | null>(null);
const compensateToInput = ref<string | null>(null);
const compensateReasonInput = ref('');

// El rango debe estar dentro del período de la sub (pasado, futuro o mixto).
const compensateMaxDate = computed(() => presencialSub.value?.endDate ?? undefined);
const compensateMinDate = computed(() => presencialSub.value?.startDate ?? undefined);

// Si el rango toca días futuros, las reservas fijas de esos días se cancelan.
const compensateTouchesFuture = computed(() => {
  const to = compensateToInput.value;
  if (!to) return false;
  return to >= new Date().toISOString().split('T')[0];
});

const compensatePreview = computed(() => {
  const sub = presencialSub.value;
  const from = compensateFromInput.value;
  const to = compensateToInput.value;
  if (!sub?.endDate || !from || !to || from > to) return null;
  const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
  const end = new Date(sub.endDate);
  end.setDate(end.getDate() + days);
  return {
    days,
    prevEndDate: sub.endDate,
    newEndDate: end.toISOString().split('T')[0],
  };
});

const compensateValid = computed(
  () =>
    compensatePreview.value !== null &&
    compensateToInput.value !== null &&
    compensateMaxDate.value !== undefined &&
    compensateToInput.value <= compensateMaxDate.value &&
    compensateReasonInput.value.trim() !== ''
);

function openCompensateDialog() {
  compensateFromInput.value = null;
  compensateToInput.value = null;
  compensateReasonInput.value = '';
  showCompensateDialog.value = true;
}

async function executeCompensate() {
  const sub = presencialSub.value;
  if (!sub || !compensateFromInput.value || !compensateToInput.value) return;
  actionLoading.value = true;
  try {
    await subsApi.compensateDays(sub.id, {
      fromDate: compensateFromInput.value,
      toDate: compensateToInput.value,
      reason: compensateReasonInput.value.trim(),
    });
    const days = compensatePreview.value?.days ?? 0;
    $q.notify({
      type: 'positive',
      message: `Se acreditaron ${days} ${days === 1 ? 'día' : 'días'} al vencimiento`,
    });
    emit('subscription-changed');
    refreshAll();
    showCompensateDialog.value = false;
  } catch (err: unknown) {
    // Los 400 traen mensajes accionables (asistencias en rango, renovación
    // programada) — se muestran tal cual en vez de un genérico.
    const message = extractError(err, 'Error compensando días');
    if (isExpectedClientError(err)) {
      log.warn('Compensate days rejected by server', { error: message });
    } else {
      log.error('Error compensating days', { error: message });
    }
    $q.notify({ type: 'negative', message, timeout: 5000 });
  } finally {
    actionLoading.value = false;
  }
}

function confirmResume() {
  $q.dialog({
    title: 'Reanudar suscripcion',
    message: 'Reanudar la suscripcion? La fecha de vencimiento se extendera por el tiempo pausado.',
    cancel: { flat: true, label: 'No' },
    ok: { color: 'positive', label: 'Reanudar' },
  }).onOk(async () => {
    actionLoading.value = true;
    try {
      await subsApi.resumeSubscription(props.userId);
      $q.notify({ type: 'positive', message: 'Suscripcion reanudada' });
      emit('subscription-changed');
      refreshAll();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error resuming subscription', { error: message });
      $q.notify({ type: 'negative', message: 'Error reanudando suscripcion' });
    } finally {
      actionLoading.value = false;
    }
  });
}

// Sin `target` cancela la sub vigente (presencialSub) — comportamiento
// histórico. Con `target` cancela esa sub específica (caso típico: la
// renovación programada como card aparte, donde no queremos tocar la
// membresía activa).
function confirmCancel(target?: SubscriptionDetail | null) {
  const sub = target ?? presencialSub.value;
  if (!sub) return;
  const isScheduled = sub.status === 'scheduled';

  const scheduledMessage = `
      <div class="q-mb-sm">Vas a cancelar <b>solo la renovación programada</b>. La membresía actual no se toca.</div>
      <ul class="q-mt-none q-mb-sm" style="padding-left: 20px;">
        <li><b>Borrar la deuda pendiente</b> de la renovación en Finanzas (queda en 0).</li>
        <li>Conservar cualquier <b>saldo a favor</b> que el alumno tenga por esta sub.</li>
      </ul>
      <div class="q-mt-sm text-caption text-grey-7">
        Si la renovación tiene cobros activos, primero anulalos desde Detalle Financiero — esta acción se bloqueará hasta entonces.
      </div>
    `;

  const activeMessage = `
      <div class="q-mb-sm">Esta acción <b>no se puede deshacer</b>. Vas a:</div>
      <ul class="q-mt-none q-mb-sm" style="padding-left: 20px;">
        <li>Cancelar todas las <b>reservas futuras</b> de esta suscripción.</li>
        <li>Cancelar también cualquier <b>suscripción programada</b> a continuación.</li>
        <li><b>Borrar la deuda pendiente</b> de esta suscripción en Finanzas (queda saldada en 0).</li>
        <li>Conservar cualquier <b>saldo a favor</b> que el alumno tenga por esta sub.</li>
      </ul>
      <div class="q-mt-sm text-caption text-grey-7">
        Si esta sub tiene cobros activos, primero anulalos desde Detalle Financiero — esta acción se bloqueará hasta entonces.
      </div>
    `;

  $q.dialog({
    title: isScheduled ? 'Cancelar renovación programada' : 'Cancelar suscripción presencial',
    html: true,
    message: isScheduled ? scheduledMessage : activeMessage,
    prompt: {
      model: '',
      type: 'textarea',
      label: 'Notas (opcional)',
    },
    cancel: { flat: true, label: 'Volver' },
    ok: {
      color: 'negative',
      label: isScheduled ? 'Cancelar renovación' : 'Cancelar suscripción',
    },
  }).onOk(async (notes: string) => {
    actionLoading.value = true;
    try {
      await subsApi.cancelSubscription(props.userId, notes.trim() || undefined, sub.id);
      $q.notify({
        type: 'positive',
        message: isScheduled ? 'Renovación cancelada' : 'Suscripcion cancelada',
      });
      emit('subscription-changed');
      refreshAll();
    } catch (err: unknown) {
      // Phase 111 REQ-3: backend refuses cancel when the sub has non-voided
      // charge transactions. Surface the actionable message instead of the
      // generic one so the admin knows to anular in Detalle Financiero first.
      const block = parseActiveTransactionsBlock(err, 'cancelar');
      if (block) {
        log.warn('Cancel blocked: active transactions', {
          userId: props.userId,
          count: block.count,
        });
        $q.notify({
          type: 'warning',
          message: block.message,
          timeout: 8000,
          multiLine: true,
          actions: [{ label: 'Entendido', color: 'white' }],
        });
        return;
      }
      const message = extractError(
        err,
        isScheduled ? 'Error cancelando renovación' : 'Error cancelando suscripcion'
      );
      if (isExpectedClientError(err)) {
        log.warn('Cancel subscription rejected', { error: message });
      } else {
        log.error('Error cancelling subscription', { error: message });
      }
      $q.notify({ type: 'negative', message });
    } finally {
      actionLoading.value = false;
    }
  });
}

function confirmCancelPrograma() {
  $q.dialog({
    title: 'Cancelar programa online',
    message: 'Cancelar el programa? Esta accion no se puede deshacer.',
    prompt: {
      model: '',
      type: 'textarea',
      label: 'Notas (opcional)',
    },
    cancel: { flat: true, label: 'Volver' },
    ok: { color: 'negative', label: 'Cancelar programa' },
  }).onOk(async (notes: string) => {
    actionLoading.value = true;
    try {
      await subsApi.cancelSubscription(props.userId, notes.trim() || undefined);
      $q.notify({ type: 'positive', message: 'Programa cancelado' });
      emit('subscription-changed');
      refreshAll();
    } catch (err: unknown) {
      // Phase 111 REQ-3: same active-transactions guard applies to programs.
      const block = parseActiveTransactionsBlock(err, 'cancelar');
      if (block) {
        log.warn('Cancel program blocked: active transactions', {
          userId: props.userId,
          count: block.count,
        });
        $q.notify({
          type: 'warning',
          message: block.message,
          timeout: 8000,
          multiLine: true,
          actions: [{ label: 'Entendido', color: 'white' }],
        });
        return;
      }
      const message = extractError(err, 'Error cancelando programa');
      if (isExpectedClientError(err)) {
        log.warn('Cancel program rejected', { error: message });
      } else {
        log.error('Error cancelling program subscription', { error: message });
      }
      $q.notify({ type: 'negative', message });
    } finally {
      actionLoading.value = false;
    }
  });
}

function confirmCancelEspecial() {
  const sub = especialSub.value;
  if (!sub) return;
  $q.dialog({
    title: 'Cancelar pase de actividades',
    message: 'Cancelar el pase? Esta accion no se puede deshacer.',
    prompt: {
      model: '',
      type: 'textarea',
      label: 'Notas (opcional)',
    },
    cancel: { flat: true, label: 'Volver' },
    ok: { color: 'negative', label: 'Cancelar pase' },
  }).onOk(async (notes: string) => {
    actionLoading.value = true;
    try {
      // subscriptionId explícito: el pase corre en paralelo a la presencial, así
      // que sin él la cancelación caería a la selección active-first equivocada.
      await subsApi.cancelSubscription(props.userId, notes.trim() || undefined, sub.id);
      $q.notify({ type: 'positive', message: 'Pase cancelado' });
      emit('subscription-changed');
      refreshAll();
    } catch (err: unknown) {
      const block = parseActiveTransactionsBlock(err, 'cancelar');
      if (block) {
        log.warn('Cancel especial blocked: active transactions', {
          userId: props.userId,
          count: block.count,
        });
        $q.notify({
          type: 'warning',
          message: block.message,
          timeout: 8000,
          multiLine: true,
          actions: [{ label: 'Entendido', color: 'white' }],
        });
        return;
      }
      const message = extractError(err, 'Error cancelando pase');
      if (isExpectedClientError(err)) {
        log.warn('Cancel especial rejected', { error: message });
      } else {
        log.error('Error cancelling especial subscription', { error: message });
      }
      $q.notify({ type: 'negative', message });
    } finally {
      actionLoading.value = false;
    }
  });
}

// =========================================================================
// Assign dialog callback
// =========================================================================

function onAssigned() {
  refreshAll();
  emit('subscription-changed');
}

function openChangeTurnos() {
  showChangeTurnosDialog.value = true;
}

async function onTurnosChanged() {
  await Promise.all([loadSubscriptions(), loadClassUsage(), loadScheduleChanges()]);
  emit('subscription-changed');
}

async function loadScheduleChanges() {
  if (!presencialSub.value) {
    scheduleChanges.value = [];
    return;
  }
  loadingScheduleChanges.value = true;
  try {
    scheduleChanges.value = await subsApi.listScheduleChanges(presencialSub.value.id);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading schedule changes', { error: message });
  } finally {
    loadingScheduleChanges.value = false;
  }
}

function formatTurnosChange(entry: SubscriptionScheduleChangeEntry): string {
  const slotsById = new Map<number, string>();
  for (const slot of classUsage.value?.scheduleSlots ?? []) {
    slotsById.set(slot.id, `${dayShort(slot.dayOfWeek)} ${slot.startTime.slice(0, 5)}`);
  }
  const fmt = (ids: number[]): string => ids.map((id) => slotsById.get(id) ?? `#${id}`).join(', ');
  return `${fmt(entry.oldScheduleIds)} → ${fmt(entry.newScheduleIds)}`;
}

function dayShort(dow: number): string {
  const labels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const idx = dow === 7 ? 0 : dow;
  return labels[idx] ?? '';
}

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  refreshAll();
});
</script>
