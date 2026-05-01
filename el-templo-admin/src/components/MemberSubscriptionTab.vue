<template>
  <div>
    <!-- Loading -->
    <div v-if="loadingSubscription" class="flex flex-center q-pa-lg">
      <q-spinner-dots size="40px" color="primary" />
    </div>

    <template v-else>
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
        @cancel="confirmCancel"
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
      v-if="presencialSub && classUsage?.weeklyLimit"
      v-model="showChangeTurnosDialog"
      :subscription-id="presencialSub.id"
      :branch-id="memberBranchId"
      :branch-name="memberBranchName"
      :required-count="classUsage.weeklyLimit"
      :current-schedule-ids="classUsage.scheduleIds"
      :allow-partial="classUsage.bookingMode === 'flexible'"
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

    <!-- Renewal Dialog -->
    <q-dialog v-model="showRenewalDialog">
      <q-card style="width: 450px; max-width: 95vw">
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
                formatPrice(renewTarget.pricePaid, renewTarget.currency ?? 'ARS')
              }}</q-item-section>
            </q-item>
          </q-list>

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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { formatDate } from 'src/utils/format-date';
import { formatPrice } from 'src/utils/format-price';
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
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
import { PAYMENT_METHOD_OPTIONS, type PaymentMethod } from 'src/types/transaction';
import type { MemberProfile, BranchOption } from 'src/types/member';
import AssignPlanDialog from 'src/components/AssignPlanDialog.vue';
import ChangeFixedSchedulesDialog from 'src/components/ChangeFixedSchedulesDialog.vue';
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
const showEditStartDateDialog = ref(false);
const editStartDateTarget = ref<SubscriptionDetail | null>(null);

const paymentMethodOptions = PAYMENT_METHOD_OPTIONS;

// =========================================================================
// Computed — split subscriptions
// =========================================================================

const presencialSub = computed(
  () =>
    allSubscriptions.value.find((s) => !s.planCategory || s.planCategory === 'presencial') ?? null
);

const programaSub = computed(
  () =>
    allSubscriptions.value.find((s) => s.planCategory && s.planCategory !== 'presencial') ?? null
);

const renewalEndDate = computed(() => {
  if (!renewTarget.value?.endDate) return '—';
  const startMs = new Date(renewTarget.value.startDate).getTime();
  const endMs = new Date(renewTarget.value.endDate).getTime();
  const durationMs = endMs - startMs;
  const durationDays = Math.round(durationMs / (1000 * 60 * 60 * 24));
  const today = new Date().toISOString().split('T')[0];
  const renewStart = renewTarget.value.endDate >= today ? renewTarget.value.endDate : today;
  const end = new Date(renewStart);
  end.setDate(end.getDate() + (durationDays > 0 ? durationDays : 30));
  return formatDate(end.toISOString().split('T')[0]);
});

// When the current sub hasn't expired yet, the renewal is queued — show its activation date.
const renewalActivationDate = computed(() => {
  if (!renewTarget.value?.endDate) return null;
  const today = new Date().toISOString().split('T')[0];
  if (renewTarget.value.endDate < today) return null;
  return formatDate(renewTarget.value.endDate);
});

const renewalChargeBase = computed(() => renewTarget.value?.pricePaid ?? 0);

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
  showRenewalDialog.value = true;
}

function openEditStartDate(sub: SubscriptionDetail) {
  editStartDateTarget.value = sub;
  showEditStartDateDialog.value = true;
}

function onStartDateEdited() {
  refreshAll();
  emit('subscription-changed');
}

async function executeRenewal() {
  renewalLoading.value = true;
  try {
    // Si el cobro es 0, omitimos el campo amountReceived; sino enviamos el valor.
    // Backend hace `amountReceived ?? chargeBase` (default = full).
    await subsApi.renewSubscription(props.userId, {
      paymentMethod: renewalMethod.value,
      amountReceived:
        renewalChargeBase.value === 0 ? undefined : (renewalAmountReceived.value ?? undefined),
    });
    $q.notify({ type: 'positive', message: 'Suscripcion renovada correctamente' });
    showRenewalDialog.value = false;
    renewTarget.value = null;
    renewalMethod.value = 'cash';
    renewalAmountReceived.value = null;
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

function confirmCancel() {
  $q.dialog({
    title: 'Cancelar suscripcion presencial',
    message:
      'Cancelar la suscripcion? Todas las reservas futuras seran canceladas y el alumno debera crear nuevas reservas si vuelve. Esta accion no se puede deshacer.',
    prompt: {
      model: '',
      type: 'textarea',
      label: 'Notas (opcional)',
    },
    cancel: { flat: true, label: 'Volver' },
    ok: { color: 'negative', label: 'Cancelar suscripcion' },
  }).onOk(async (notes: string) => {
    actionLoading.value = true;
    try {
      await subsApi.cancelSubscription(props.userId, notes.trim() || undefined);
      $q.notify({ type: 'positive', message: 'Suscripcion cancelada' });
      emit('subscription-changed');
      refreshAll();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error cancelling subscription', { error: message });
      $q.notify({ type: 'negative', message: 'Error cancelando suscripcion' });
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
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error cancelling program subscription', { error: message });
      $q.notify({ type: 'negative', message: 'Error cancelando programa' });
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
