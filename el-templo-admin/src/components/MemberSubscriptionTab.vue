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
        @pause="confirmPause"
        @resume="confirmResume"
        @cancel="confirmCancel"
      />

      <!-- No presencial subscription -->
      <q-card v-else flat bordered class="q-mb-md">
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

      <!-- ========================================== -->
      <!-- Programa Section -->
      <!-- ========================================== -->
      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="row items-center q-mb-sm">
            <div class="text-subtitle1 text-weight-bold col">Programa</div>
            <q-btn
              flat
              dense
              icon="swap_horiz"
              label="Cambiar"
              color="primary"
              @click="showSwapProgramDialog = true"
            />
          </div>

          <div v-if="loadingEnrollment" class="flex flex-center q-pa-md">
            <q-spinner-dots size="24px" color="primary" />
          </div>

          <template v-else-if="activeEnrollment">
            <div class="row items-center q-gutter-sm q-mb-xs">
              <div class="text-body1 text-weight-medium">{{ activeEnrollment.programName }}</div>
              <q-badge
                v-if="activeEnrollment.durationWeeks"
                outline
                color="grey-7"
                :label="`${activeEnrollment.durationWeeks} semanas`"
              />
              <q-badge v-else outline color="grey-7" label="Indefinido" />
            </div>
            <div class="text-caption text-grey-7">
              Semana {{ activeEnrollment.currentWeek }}
              <template v-if="activeEnrollment.durationWeeks">
                de {{ activeEnrollment.durationWeeks }}
              </template>
              · Inscripto {{ formatDate(activeEnrollment.enrolledAt) }}
            </div>
          </template>

          <div v-else class="text-grey-5 text-italic">Sin programa activo</div>
        </q-card-section>
      </q-card>

      <!-- Online Subscription Card (if exists) -->
      <SubscriptionCard
        v-if="programaSub"
        :subscription="programaSub"
        label="Suscripcion Online"
        show-category-badge
        @renew="openRenewal(programaSub!)"
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
                <div class="text-weight-medium">${{ item.pricePaid.toLocaleString() }}</div>
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
      @assigned="onAssigned"
    />

    <!-- Change Plan Dialog (presencial — reuses AssignPlanDialog in change mode) -->
    <AssignPlanDialog
      v-model="showChangeDialog"
      :userId="userId"
      :memberBranchId="memberBranchId"
      :memberBranchName="memberBranchName"
      :boardingPassUsed="memberBoardingPassUsed"
      mode="change"
      @assigned="onAssigned"
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

    <!-- Swap Program Dialog -->
    <q-dialog v-model="showSwapProgramDialog">
      <q-card style="width: 450px; max-width: 95vw">
        <q-card-section>
          <div class="text-h6">Cambiar Programa</div>
        </q-card-section>
        <q-separator />
        <q-card-section>
          <div v-if="activeEnrollment" class="text-caption text-grey-7 q-mb-md">
            Programa actual: <strong>{{ activeEnrollment.programName }}</strong>
          </div>
          <q-select
            v-model="swapTargetProgramId"
            :options="availablePrograms"
            option-value="id"
            option-label="name"
            emit-value
            map-options
            label="Nuevo programa"
            dense
            outlined
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancelar" color="grey" @click="showSwapProgramDialog = false" />
          <q-btn
            color="primary"
            label="Confirmar Cambio"
            icon="swap_horiz"
            :loading="swapLoading"
            :disable="!swapTargetProgramId"
            @click="executeSwapProgram"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

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
            <q-item>
              <q-item-section>Nuevo vencimiento</q-item-section>
              <q-item-section side class="text-weight-bold text-positive">{{
                renewalEndDate
              }}</q-item-section>
            </q-item>
            <q-item>
              <q-item-section>Precio</q-item-section>
              <q-item-section side class="text-weight-bold text-h6"
                >${{ renewTarget.pricePaid.toLocaleString() }}</q-item-section
              >
            </q-item>
          </q-list>

          <q-select
            v-model="renewalMethod"
            :options="paymentMethodOptions"
            label="Metodo de pago *"
            dense
            outlined
            emit-value
            map-options
            class="q-mt-md"
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancelar" color="grey" @click="showRenewalDialog = false" />
          <q-btn
            color="positive"
            label="Confirmar Renovacion"
            icon="check"
            :loading="renewalLoading"
            @click="executeRenewal"
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
import { useSubscriptionsApi } from 'src/composables/useSubscriptionsApi';
import { useProgramsApi } from 'src/composables/useProgramsApi';
import type { Program, ProgramEnrollment } from 'src/types/program';
import {
  PLAN_TIER_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  PRICE_TYPE_LABELS,
  PLAN_CATEGORY_LABELS,
  PLAN_CATEGORY_COLORS,
  type SubscriptionDetail,
  type SubscriptionHistoryItem,
  type ClassUsageInfo,
  type PlanTier,
  type PlanCategory,
  type SubscriptionStatus,
  type PriceType,
} from 'src/types/subscription';
import { PAYMENT_METHOD_OPTIONS, type PaymentMethod } from 'src/types/payment';
import AssignPlanDialog from 'src/components/AssignPlanDialog.vue';
import SubscriptionCard from 'src/components/SubscriptionCard.vue';

const log = createLogger('MemberSubscriptionTab');
const $q = useQuasar();
const subsApi = useSubscriptionsApi();
const programsApi = useProgramsApi();

// =========================================================================
// Props & Emits
// =========================================================================

const props = defineProps<{
  userId: number;
  memberBranchId: number;
  memberBranchName: string;
  memberBoardingPassUsed: boolean;
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
const showSwapProgramDialog = ref(false);
const swapTargetProgramId = ref<number | null>(null);
const swapLoading = ref(false);
const loadingEnrollment = ref(false);
const activeEnrollment = ref<ProgramEnrollment | null>(null);
const allPrograms = ref<Program[]>([]);
const showRenewalDialog = ref(false);
const renewTarget = ref<SubscriptionDetail | null>(null);
const renewalMethod = ref<PaymentMethod>('cash');
const renewalLoading = ref(false);

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

async function loadEnrollment() {
  loadingEnrollment.value = true;
  try {
    const enrollments = await programsApi.getUserEnrollments(props.userId);
    activeEnrollment.value = enrollments.find((e) => e.status === 'active') ?? null;
  } catch (err: unknown) {
    activeEnrollment.value = null;
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.warn('Error loading enrollment', { error: message, userId: props.userId });
  } finally {
    loadingEnrollment.value = false;
  }
}

async function loadAllPrograms() {
  try {
    allPrograms.value = await programsApi.getPrograms();
  } catch {
    allPrograms.value = [];
  }
}

const availablePrograms = computed(() =>
  allPrograms.value.filter((p) => p.isActive && p.id !== activeEnrollment.value?.programId)
);

function executeSwapProgram() {
  if (!swapTargetProgramId.value) return;

  // If upgrading from Foundation (free) to a paid program, warn about payment
  const isFromFoundation =
    activeEnrollment.value?.programName?.toLowerCase().includes('foundation') ?? false;
  const targetProgram = allPrograms.value.find((p) => p.id === swapTargetProgramId.value);
  const isToFoundation = targetProgram?.name?.toLowerCase().includes('foundation') ?? false;

  if (isFromFoundation && !isToFoundation) {
    $q.dialog({
      title: 'Registrar pago',
      message: `Estas cambiando de Foundation (incluido) a "${targetProgram?.name}". Asegurate de registrar el pago en Caja antes de confirmar el cambio.`,
      cancel: { flat: true, label: 'Cancelar' },
      ok: { color: 'primary', label: 'Ya registre el pago, continuar' },
    }).onOk(() => doSwapProgram());
  } else {
    doSwapProgram();
  }
}

async function doSwapProgram() {
  if (!swapTargetProgramId.value) return;
  swapLoading.value = true;
  try {
    await programsApi.swapProgram(props.userId, swapTargetProgramId.value);
    $q.notify({ type: 'positive', message: 'Programa cambiado correctamente' });
    showSwapProgramDialog.value = false;
    swapTargetProgramId.value = null;
    await loadEnrollment();
    emit('subscription-changed');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error swapping program', { error: message });
    $q.notify({ type: 'negative', message: 'Error cambiando programa' });
  } finally {
    swapLoading.value = false;
  }
}

async function refreshAll() {
  await Promise.all([loadSubscriptions(), loadHistory(), loadClassUsage(), loadEnrollment()]);
}

// =========================================================================
// Lifecycle Actions
// =========================================================================

function openRenewal(sub: SubscriptionDetail) {
  renewTarget.value = sub;
  showRenewalDialog.value = true;
}

async function executeRenewal() {
  renewalLoading.value = true;
  try {
    await subsApi.renewSubscription(props.userId, {
      paymentMethod: renewalMethod.value,
    });
    $q.notify({ type: 'positive', message: 'Suscripcion renovada correctamente' });
    showRenewalDialog.value = false;
    renewTarget.value = null;
    renewalMethod.value = 'cash';
    refreshAll();
    emit('subscription-changed');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error renewing subscription', { error: message });
    $q.notify({ type: 'negative', message: 'Error renovando suscripcion' });
  } finally {
    renewalLoading.value = false;
  }
}

function confirmPause() {
  $q.dialog({
    title: 'Pausar suscripcion',
    message:
      'Pausar la suscripcion? El tiempo pausado se extendera en la fecha de vencimiento cuando se reanude.',
    cancel: { flat: true, label: 'No' },
    ok: { color: 'warning', label: 'Pausar' },
  }).onOk(async () => {
    actionLoading.value = true;
    try {
      await subsApi.pauseSubscription(props.userId);
      $q.notify({ type: 'positive', message: 'Suscripcion pausada' });
      emit('subscription-changed');
      refreshAll();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error pausing subscription', { error: message });
      $q.notify({ type: 'negative', message: 'Error pausando suscripcion' });
    } finally {
      actionLoading.value = false;
    }
  });
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
    message: 'Cancelar la suscripcion? Esta accion no se puede deshacer.',
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

// =========================================================================
// Lifecycle
// =========================================================================

onMounted(() => {
  refreshAll();
  loadAllPrograms();
});
</script>
