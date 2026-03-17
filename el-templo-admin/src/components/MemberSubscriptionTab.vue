<template>
  <div>
    <!-- Loading -->
    <div v-if="loadingSubscription" class="flex flex-center q-pa-lg">
      <q-spinner-dots size="40px" color="primary" />
    </div>

    <template v-else>
      <!-- ========================================== -->
      <!-- Active Subscription Card -->
      <!-- ========================================== -->
      <q-card v-if="subscription" flat bordered class="q-mb-md">
        <q-card-section>
          <!-- Header: plan name + badges -->
          <div class="row items-center q-gutter-sm q-mb-md">
            <div class="text-h6">{{ subscription.planName }}</div>
            <q-badge
              :color="tierColor(subscription.planTier)"
              :label="tierLabel(subscription.planTier)"
            />
            <q-badge
              :color="statusColor(subscription.status)"
              :label="statusLabel(subscription.status)"
            />
          </div>

          <!-- Dates row -->
          <div class="row q-gutter-x-lg q-mb-md">
            <div>
              <div class="text-caption text-grey-7">Inicio</div>
              <div>{{ formatDate(subscription.startDate) }}</div>
            </div>
            <div>
              <div class="text-caption text-grey-7">Vencimiento</div>
              <div>{{ subscription.endDate ? formatDate(subscription.endDate) : '—' }}</div>
            </div>
            <div>
              <div class="text-caption text-grey-7">Dias restantes</div>
              <div :class="{ 'text-negative text-weight-bold': daysRemaining < 7 }">
                {{ daysRemaining >= 0 ? daysRemaining : 0 }}
              </div>
            </div>
          </div>

          <!-- Class usage section -->
          <div v-if="showClassUsage && classUsage" class="row q-gutter-x-lg q-mb-md">
            <div>
              <div class="text-caption text-grey-7">Clases esta semana</div>
              <div>
                {{ classUsage.classesUsedThisWeek }} /
                {{ classUsage.weeklyLimit !== null ? classUsage.weeklyLimit : 'Sin limite' }}
              </div>
            </div>
            <div>
              <div class="text-caption text-grey-7">Clases restantes</div>
              <div>
                {{
                  classUsage.classesRemaining !== null ? classUsage.classesRemaining : 'Sin limite'
                }}
              </div>
            </div>
            <div v-if="classUsage.scheduleIds && classUsage.scheduleIds.length > 0">
              <div class="text-caption text-grey-7">Horarios fijos</div>
              <div>{{ classUsage.scheduleIds.length }} clases asignadas</div>
            </div>
            <div v-if="subscription && subscription.replacementCredits > 0">
              <div class="text-caption text-grey-7">Clases de reemplazo</div>
              <div class="text-positive text-weight-medium">
                {{ subscription.replacementCredits }}
              </div>
            </div>
          </div>

          <!-- Pricing row -->
          <div class="row q-gutter-x-lg q-mb-sm">
            <div>
              <div class="text-caption text-grey-7">Pagado</div>
              <div class="text-weight-medium">${{ subscription.pricePaid.toLocaleString() }}</div>
            </div>
            <div>
              <q-badge
                outline
                :color="priceTypeBadgeColor(subscription.priceTypeApplied)"
                :label="priceTypeLabel(subscription.priceTypeApplied)"
              />
            </div>
            <div v-if="subscription.auraDiscount">
              <div class="text-caption text-grey-7">Descuento AURA</div>
              <div>
                {{ subscription.auraDiscountPercent }}% (-{{ subscription.auraDiscount }} AURA)
              </div>
            </div>
            <div v-if="subscription.boardingPassUsed">
              <q-badge color="deep-purple" label="Boarding Pass" />
            </div>
            <div v-if="subscription.priceOverrideReason">
              <div class="text-caption text-grey-7">Precio especial</div>
              <div class="text-italic">{{ subscription.priceOverrideReason }}</div>
            </div>
          </div>

          <!-- Notes -->
          <div v-if="subscription.notes" class="q-mt-sm text-italic text-grey-7">
            {{ subscription.notes }}
          </div>
        </q-card-section>

        <!-- Action buttons -->
        <q-card-actions v-if="subscription.status === 'active' || subscription.status === 'paused'">
          <template v-if="subscription.status === 'active'">
            <q-btn
              flat
              icon="swap_horiz"
              label="Cambiar Plan"
              color="primary"
              :loading="actionLoading"
              @click="showChangeDialog = true"
            />
            <q-btn
              flat
              icon="pause"
              label="Pausar"
              color="warning"
              :loading="actionLoading"
              @click="confirmPause"
            />
            <q-btn
              flat
              icon="cancel"
              label="Cancelar"
              color="negative"
              :loading="actionLoading"
              @click="confirmCancel"
            />
          </template>
          <template v-else-if="subscription.status === 'paused'">
            <q-btn
              flat
              icon="swap_horiz"
              label="Cambiar Plan"
              color="primary"
              :loading="actionLoading"
              @click="showChangeDialog = true"
            />
            <q-btn
              flat
              icon="play_arrow"
              label="Reanudar"
              color="positive"
              :loading="actionLoading"
              @click="confirmResume"
            />
            <q-btn
              flat
              icon="cancel"
              label="Cancelar"
              color="negative"
              :loading="actionLoading"
              @click="confirmCancel"
            />
          </template>
        </q-card-actions>
      </q-card>

      <!-- ========================================== -->
      <!-- No Subscription State -->
      <!-- ========================================== -->
      <q-card v-else flat bordered class="q-mb-md">
        <q-card-section class="text-center q-pa-lg">
          <div class="text-grey-5 text-italic q-mb-md">Sin suscripcion activa</div>
          <q-btn
            icon="assignment"
            label="Gestionar Plan"
            color="primary"
            @click="showAssignDialog = true"
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
    <!-- Assign Plan Dialog -->
    <!-- ========================================== -->
    <AssignPlanDialog
      v-model="showAssignDialog"
      :userId="userId"
      :memberBranchId="memberBranchId"
      :boardingPassUsed="memberBoardingPassUsed"
      @assigned="onAssigned"
    />

    <!-- Change Plan Dialog (reuses AssignPlanDialog in change mode) -->
    <AssignPlanDialog
      v-model="showChangeDialog"
      :userId="userId"
      :memberBranchId="memberBranchId"
      :boardingPassUsed="memberBoardingPassUsed"
      mode="change"
      @assigned="onAssigned"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { formatDate } from 'src/utils/format-date';
import { useSubscriptionsApi } from 'src/composables/useSubscriptionsApi';
import {
  PLAN_TIER_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  PRICE_TYPE_LABELS,
  type SubscriptionDetail,
  type SubscriptionHistoryItem,
  type ClassUsageInfo,
  type PlanTier,
  type SubscriptionStatus,
  type PriceType,
} from 'src/types/subscription';
import AssignPlanDialog from 'src/components/AssignPlanDialog.vue';

const log = createLogger('MemberSubscriptionTab');
const $q = useQuasar();
const subsApi = useSubscriptionsApi();

// =========================================================================
// Props & Emits
// =========================================================================

const props = defineProps<{
  userId: number;
  memberBranchId: number;
  memberBoardingPassUsed: boolean;
}>();

const emit = defineEmits<{
  'subscription-changed': [];
}>();

// =========================================================================
// State
// =========================================================================

const subscription = ref<SubscriptionDetail | null>(null);
const classUsage = ref<ClassUsageInfo | null>(null);
const history = ref<SubscriptionHistoryItem[]>([]);
const loadingSubscription = ref(false);
const loadingHistory = ref(false);
const actionLoading = ref(false);
const showAssignDialog = ref(false);
const showChangeDialog = ref(false);

const daysRemaining = computed(() => {
  if (!subscription.value?.endDate) return 0;
  const end = new Date(subscription.value.endDate);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
});

const showClassUsage = computed(() => {
  if (!classUsage.value) return false;
  return classUsage.value.weeklyLimit !== null || classUsage.value.scheduleIds.length > 0;
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

function priceTypeLabel(priceType: PriceType): string {
  return PRICE_TYPE_LABELS[priceType] ?? priceType;
}

function priceTypeBadgeColor(priceType: PriceType): string {
  const colors: Record<PriceType, string> = {
    regular: 'grey-7',
    zero: 'deep-purple',
    credit_card: 'blue-grey',
  };
  return colors[priceType] ?? 'grey';
}

// =========================================================================
// Data loading
// =========================================================================

async function loadSubscription() {
  loadingSubscription.value = true;
  try {
    subscription.value = await subsApi.getMemberSubscription(props.userId);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading subscription', { error: message, userId: props.userId });
    $q.notify({ type: 'negative', message: 'Error cargando suscripcion' });
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
    // Non-critical — if no active subscription, this may 404
    classUsage.value = null;
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading class usage', { error: message, userId: props.userId });
  }
}

async function refreshAll() {
  await Promise.all([loadSubscription(), loadHistory(), loadClassUsage()]);
}

// =========================================================================
// Lifecycle Actions
// =========================================================================

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
      subscription.value = await subsApi.pauseSubscription(props.userId);
      $q.notify({ type: 'positive', message: 'Suscripcion pausada' });
      emit('subscription-changed');
      loadHistory();
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
      subscription.value = await subsApi.resumeSubscription(props.userId);
      $q.notify({ type: 'positive', message: 'Suscripcion reanudada' });
      emit('subscription-changed');
      loadHistory();
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
    title: 'Cancelar suscripcion',
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
      subscription.value = await subsApi.cancelSubscription(
        props.userId,
        notes.trim() || undefined
      );
      $q.notify({ type: 'positive', message: 'Suscripcion cancelada' });
      emit('subscription-changed');
      loadHistory();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error cancelling subscription', { error: message });
      $q.notify({ type: 'negative', message: 'Error cancelando suscripcion' });
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
});
</script>
