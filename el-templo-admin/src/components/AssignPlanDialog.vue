<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="width: 700px; max-width: 95vw">
      <q-card-section>
        <div class="text-h6">{{ dialogTitle }}</div>
      </q-card-section>

      <q-separator />

      <q-stepper v-model="step" animated flat alternative-labels>
        <!-- ============================================================ -->
        <!-- Step 1: Select Plan -->
        <!-- ============================================================ -->
        <q-step :name="1" title="Seleccionar Plan" icon="list" :done="step > 1">
          <div v-if="loadingPlans" class="flex flex-center q-pa-lg">
            <q-spinner-dots size="40px" color="primary" />
          </div>

          <template v-else>
            <div v-for="tier in plansByTier" :key="tier.tier" class="q-mb-md">
              <div class="text-subtitle2 text-weight-bold q-mb-xs">
                <q-badge :color="tierColor(tier.tier)" :label="tierLabel(tier.tier)" />
              </div>
              <q-list bordered separator class="rounded-borders">
                <q-item
                  v-for="plan in tier.plans"
                  :key="plan.id"
                  clickable
                  v-ripple
                  @click="selectPlan(plan)"
                >
                  <q-item-section>
                    <q-item-label>{{ plan.name }}</q-item-label>
                    <q-item-label caption>
                      {{ plan.durationDays }} dias
                      <template v-if="plan.classesPerWeek">
                        · {{ plan.classesPerWeek }} clases/sem
                      </template>
                      <template v-else> · Ilimitado </template>
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <div class="text-weight-medium">
                      {{ formatPrice(plan.priceRegular, plan.currency ?? 'ARS') }}
                    </div>
                  </q-item-section>
                </q-item>
              </q-list>
            </div>

            <div
              v-if="plansByTier.length === 0"
              class="text-center text-grey-5 text-italic q-pa-lg"
            >
              No hay planes activos disponibles
            </div>
          </template>
        </q-step>

        <!-- ============================================================ -->
        <!-- Step 2: Pricing Preview -->
        <!-- ============================================================ -->
        <q-step :name="2" title="Precio y Opciones" icon="calculate" :done="step > 2">
          <template v-if="selectedPlan">
            <!-- Selected plan info -->
            <q-card flat bordered class="q-mb-md">
              <q-card-section>
                <div class="row items-center q-gutter-sm">
                  <div class="text-subtitle1 text-weight-bold">{{ selectedPlan.name }}</div>
                  <q-badge
                    :color="tierColor(selectedPlan.planTier)"
                    :label="tierLabel(selectedPlan.planTier)"
                  />
                </div>
                <div class="text-caption text-grey-7 q-mt-xs">
                  {{ selectedPlan.durationDays }} dias ·
                  {{
                    selectedPlan.classesPerWeek
                      ? `${selectedPlan.classesPerWeek} clases/sem`
                      : 'Ilimitado'
                  }}
                </div>
              </q-card-section>
            </q-card>

            <!-- Price type selector -->
            <div class="q-mb-md">
              <div class="text-caption text-grey-7 q-mb-xs">Tipo de Precio</div>
              <q-btn-toggle
                v-model="assignForm.priceTypeApplied"
                toggle-color="primary"
                :options="priceTypeOptions"
                spread
                no-caps
                @update:model-value="onPricingOptionChange"
              />
            </div>

            <!-- Start date -->
            <q-input
              v-model="assignForm.startDate"
              label="Fecha de inicio"
              type="date"
              dense
              outlined
              :min="startDateMin"
              :max="startDateMax"
              class="q-mb-xs"
            />
            <div class="text-caption text-grey-7 q-mb-xs">
              Vencimiento estimado: {{ calculatedEndDate ? formatDate(calculatedEndDate) : '—' }}
            </div>
            <q-banner v-if="isFutureStart" dense rounded class="bg-blue-1 q-mb-md">
              <template #avatar>
                <q-icon name="schedule" color="primary" />
              </template>
              La membresía quedará programada y se activará automáticamente el
              {{ formatDate(assignForm.startDate) }}.
            </q-banner>
            <div v-else class="q-mb-md" />

            <!-- Boarding pass -->
            <div class="q-mb-md">
              <q-toggle
                v-model="assignForm.boardingPass"
                label="Usar Boarding Pass"
                :disable="boardingPassUsed"
                @update:model-value="onPricingOptionChange"
              />
              <div v-if="boardingPassUsed" class="text-caption text-grey-5 q-ml-md">
                Ya utilizado
              </div>
            </div>

            <!-- AURA discount -->
            <div v-if="!assignForm.boardingPass && !assignForm.useOverride" class="q-mb-md">
              <q-select
                v-model="assignForm.auraSpend"
                :options="auraOptions"
                label="Descuento AURA"
                dense
                outlined
                emit-value
                map-options
                clearable
                @update:model-value="onPricingOptionChange"
              />
            </div>

            <!-- Price override -->
            <div class="q-mb-md">
              <q-toggle
                v-model="assignForm.useOverride"
                label="Precio personalizado"
                @update:model-value="onOverrideToggle"
              />
              <template v-if="assignForm.useOverride">
                <div class="row q-col-gutter-sm q-mt-xs">
                  <div class="col-12 col-sm-4">
                    <q-input
                      v-model.number="assignForm.priceOverrideAmount"
                      label="Monto"
                      type="number"
                      dense
                      outlined
                      prefix="$"
                    />
                  </div>
                  <div class="col-12 col-sm-8">
                    <q-input
                      v-model="assignForm.priceOverrideReason"
                      label="Razon (requerida)"
                      dense
                      outlined
                    />
                  </div>
                </div>
              </template>
            </div>

            <!-- Live pricing preview -->
            <q-card flat bordered class="bg-grey-1">
              <q-card-section>
                <div class="text-subtitle2 text-weight-bold q-mb-sm">Resumen de Precio</div>
                <div class="row q-gutter-x-lg">
                  <div>
                    <div class="text-caption text-grey-7">Precio base</div>
                    <div>{{ formatPrice(pricingDisplay.basePrice, displayCurrency) }}</div>
                  </div>
                  <div v-if="pricingDisplay.discountAmount > 0">
                    <div class="text-caption text-grey-7">Descuento</div>
                    <div class="text-positive">
                      -{{ formatPrice(pricingDisplay.discountAmount, displayCurrency) }}
                    </div>
                  </div>
                  <div>
                    <div class="text-caption text-grey-7">Precio final</div>
                    <div class="text-h6 text-weight-bold">
                      {{ formatPrice(pricingDisplay.finalPrice, displayCurrency) }}
                    </div>
                  </div>
                </div>
              </q-card-section>
            </q-card>
          </template>
        </q-step>

        <!-- ============================================================ -->
        <!-- Step 3 (conditional): Schedule Slot Picker -->
        <!-- ============================================================ -->
        <q-step
          v-if="showScheduleStep"
          :name="3"
          title="Horarios Fijos"
          icon="calendar_today"
          :done="step > 3"
        >
          <div v-if="!isFixedMode" class="text-caption text-grey-7 q-mb-sm">
            Opcional — podés fijar hasta {{ requiredSlotCount }} clases semanales o dejarlo vacío.
          </div>

          <FixedSchedulePicker
            ref="schedulePickerRef"
            v-model="selectedScheduleIds"
            :branch-id="memberBranchId"
            :required-count="requiredSlotCount"
            :allow-partial="!isFixedMode"
            title="Selecciona los horarios fijos para este plan"
            :branch-name="memberBranchName"
            class="q-mb-md"
          />
        </q-step>

        <!-- ============================================================ -->
        <!-- Step 3/4: Confirm -->
        <!-- ============================================================ -->
        <q-step :name="confirmStep" title="Confirmar" icon="check_circle">
          <template v-if="selectedPlan">
            <!-- Loading preview spinner for change mode -->
            <div v-if="props.mode === 'change' && loadingPreview" class="flex flex-center q-pa-lg">
              <q-spinner-dots size="40px" color="primary" />
            </div>

            <!-- Start mode toggle: only available in change mode when current sub has a future endDate -->
            <div
              v-if="props.mode === 'change' && canOfferAfterCurrent && !loadingPreview"
              class="q-mb-md"
            >
              <div class="text-caption text-grey-7 q-mb-xs">Cuando iniciar el nuevo plan</div>
              <q-btn-toggle
                v-model="startMode"
                toggle-color="primary"
                spread
                no-caps
                :options="[
                  { label: 'Cambiar ahora', value: 'now' },
                  {
                    label: `Empezar el ${formatDate(afterCurrentStartDate)}`,
                    value: 'after_current',
                  },
                ]"
              />
              <div v-if="startMode === 'after_current'" class="text-caption text-grey-6 q-mt-xs">
                El plan actual continua hasta {{ formatDate(afterCurrentStartDate) }}. El nuevo plan
                queda programado y se cobra ahora.
              </div>
            </div>

            <!-- Downgrade blocked message (only applies to "cambiar ahora" — after_current has no proration so downgrade is allowed) -->
            <q-card
              v-if="
                props.mode === 'change' &&
                startMode === 'now' &&
                changePlanPreviewData &&
                !changePlanPreviewData.allowed
              "
              flat
              bordered
              class="q-mb-md bg-red-1"
            >
              <q-card-section>
                <div class="row items-center q-gutter-sm q-mb-sm">
                  <q-icon name="block" color="negative" size="sm" />
                  <div class="text-subtitle2 text-negative text-weight-bold">
                    Cambio no permitido
                  </div>
                </div>
                <div class="text-body2">{{ changePlanPreviewData.reason }}</div>
                <div
                  v-if="changePlanPreviewData.expiryDate"
                  class="text-caption text-grey-7 q-mt-sm"
                >
                  Vencimiento actual: {{ formatDate(changePlanPreviewData.expiryDate) }}
                </div>
              </q-card-section>
            </q-card>

            <!-- Change plan (now): summary with proration -->
            <q-card
              v-if="
                props.mode === 'change' && startMode === 'now' && changePlanPreviewData?.allowed
              "
              flat
              bordered
              class="q-mb-md"
            >
              <q-card-section>
                <div class="text-subtitle1 text-weight-bold q-mb-md">Resumen de Cambio de Plan</div>
                <q-list dense>
                  <q-item>
                    <q-item-section>Plan actual</q-item-section>
                    <q-item-section side>
                      {{ changePlanPreviewData.currentPlan.name }} —
                      {{
                        formatPrice(changePlanPreviewData.currentPlan.pricePaid, displayCurrency)
                      }}
                    </q-item-section>
                  </q-item>
                  <q-item>
                    <q-item-section>Credito prorrateado</q-item-section>
                    <q-item-section side class="text-positive">
                      -{{
                        formatPrice(
                          changePlanPreviewData.proration!.remainingValue,
                          displayCurrency
                        )
                      }}
                      <span class="text-caption text-grey-6 q-ml-xs">
                        ({{ changePlanPreviewData.proration!.remainingDetail }})
                      </span>
                    </q-item-section>
                  </q-item>
                  <q-separator spaced />
                  <q-item>
                    <q-item-section>Nuevo plan</q-item-section>
                    <q-item-section side class="text-weight-medium">
                      {{ changePlanPreviewData.targetPlan.name }}
                    </q-item-section>
                  </q-item>
                  <q-item>
                    <q-item-section>Precio del plan</q-item-section>
                    <q-item-section side>
                      {{
                        formatPrice(changePlanPreviewData.targetPlan.priceRegular, displayCurrency)
                      }}
                    </q-item-section>
                  </q-item>
                  <q-item>
                    <q-item-section>Inicio</q-item-section>
                    <q-item-section side>{{ formatDate(assignForm.startDate) }}</q-item-section>
                  </q-item>
                  <q-item>
                    <q-item-section>Vencimiento</q-item-section>
                    <q-item-section side>{{ formatDate(calculatedEndDate) }}</q-item-section>
                  </q-item>
                  <q-item v-if="showScheduleStep && selectedScheduleIds.length > 0">
                    <q-item-section>Horarios fijos</q-item-section>
                    <q-item-section side class="text-weight-medium">
                      {{ formatSelectedSchedules() }}
                    </q-item-section>
                  </q-item>
                  <q-separator spaced />
                  <q-item class="bg-blue-1 rounded-borders q-pa-sm">
                    <q-item-section class="text-weight-bold text-h6">Total a cobrar</q-item-section>
                    <q-item-section side class="text-weight-bold text-h5 text-primary">
                      {{ formatPrice(changePlanPreviewData.netAmount!, displayCurrency) }}
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-card-section>
            </q-card>

            <!-- Change plan (after_current): queued summary, no proration, full price -->
            <q-card
              v-if="props.mode === 'change' && startMode === 'after_current' && selectedPlan"
              flat
              bordered
              class="q-mb-md"
            >
              <q-card-section>
                <div class="text-subtitle1 text-weight-bold q-mb-md">Cambio Programado</div>
                <q-list dense>
                  <q-item>
                    <q-item-section>Plan actual</q-item-section>
                    <q-item-section side>
                      {{ changePlanPreviewData?.currentPlan.name ?? '—' }}
                    </q-item-section>
                  </q-item>
                  <q-item>
                    <q-item-section>Activo hasta</q-item-section>
                    <q-item-section side>
                      {{ formatDate(afterCurrentStartDate) }}
                    </q-item-section>
                  </q-item>
                  <q-separator spaced />
                  <q-item>
                    <q-item-section>Nuevo plan</q-item-section>
                    <q-item-section side class="text-weight-medium">
                      {{ selectedPlan.name }}
                    </q-item-section>
                  </q-item>
                  <q-item>
                    <q-item-section>Inicia</q-item-section>
                    <q-item-section side class="text-weight-medium">
                      {{ formatDate(afterCurrentStartDate) }}
                    </q-item-section>
                  </q-item>
                  <q-item>
                    <q-item-section>Vencimiento</q-item-section>
                    <q-item-section side>
                      {{ formatDate(afterCurrentEndDate) }}
                    </q-item-section>
                  </q-item>
                  <q-item v-if="showScheduleStep && selectedScheduleIds.length > 0">
                    <q-item-section>Horarios fijos</q-item-section>
                    <q-item-section side class="text-weight-medium">
                      {{ formatSelectedSchedules() }}
                    </q-item-section>
                  </q-item>
                  <q-separator spaced />
                  <q-item class="bg-blue-1 rounded-borders q-pa-sm">
                    <q-item-section class="text-weight-bold text-h6"
                      >Total a cobrar ahora</q-item-section
                    >
                    <q-item-section side class="text-weight-bold text-h5 text-primary">
                      {{ formatPrice(pricingDisplay.finalPrice, displayCurrency) }}
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-card-section>
            </q-card>

            <!-- Assign mode: confirmation card -->
            <q-card v-if="props.mode !== 'change'" flat bordered class="q-mb-md">
              <q-card-section>
                <div class="text-subtitle1 text-weight-bold q-mb-md">Confirmacion</div>
                <q-list dense>
                  <q-item>
                    <q-item-section>Plan</q-item-section>
                    <q-item-section side class="text-weight-medium">
                      {{ selectedPlan.name }}
                    </q-item-section>
                  </q-item>
                  <q-item>
                    <q-item-section>Inicio</q-item-section>
                    <q-item-section side>{{ formatDate(assignForm.startDate) }}</q-item-section>
                  </q-item>
                  <q-item>
                    <q-item-section>Vencimiento</q-item-section>
                    <q-item-section side>{{ formatDate(calculatedEndDate) }}</q-item-section>
                  </q-item>
                  <q-item>
                    <q-item-section>Precio final</q-item-section>
                    <q-item-section side class="text-weight-bold text-h6">
                      {{ formatPrice(pricingDisplay.finalPrice, displayCurrency) }}
                    </q-item-section>
                  </q-item>
                  <q-item v-if="pricingDisplay.discountAmount > 0">
                    <q-item-section>Descuento</q-item-section>
                    <q-item-section side class="text-positive">
                      -{{ formatPrice(pricingDisplay.discountAmount, displayCurrency) }}
                    </q-item-section>
                  </q-item>
                  <q-item v-if="showScheduleStep && selectedScheduleIds.length > 0">
                    <q-item-section>Horarios fijos</q-item-section>
                    <q-item-section side class="text-weight-medium">
                      {{ formatSelectedSchedules() }}
                    </q-item-section>
                  </q-item>
                  <q-item v-if="assignForm.boardingPass">
                    <q-item-section>Boarding Pass</q-item-section>
                    <q-item-section side>
                      <q-badge color="deep-purple" label="Aplicado" />
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-card-section>
            </q-card>

            <!-- Payment method selector -->
            <q-select
              v-model="assignForm.paymentMethod"
              :options="paymentMethodOptions"
              label="Metodo de pago *"
              dense
              outlined
              emit-value
              map-options
              class="q-mb-md"
            />

            <!-- Notes -->
            <q-input
              v-model="assignForm.notes"
              label="Notas (opcional)"
              type="textarea"
              :rows="2"
              dense
              outlined
              class="q-mb-md"
            />
          </template>
        </q-step>
      </q-stepper>

      <q-separator />

      <q-card-actions class="q-pa-md row items-center">
        <q-btn flat label="Cerrar" color="grey" @click="$emit('update:modelValue', false)" />
        <q-space />
        <template v-if="step > 1">
          <q-btn flat label="Volver" color="grey-8" class="q-mr-sm" @click="goToPrevStep" />
        </template>
        <q-btn
          v-if="step === 2"
          color="primary"
          label="Continuar"
          :disable="assignForm.useOverride && !assignForm.priceOverrideReason?.trim()"
          @click="step = showScheduleStep ? 3 : confirmStep"
        />
        <q-btn
          v-else-if="step === 3 && showScheduleStep"
          color="primary"
          :label="
            !isFixedMode && selectedScheduleIds.length === 0
              ? 'Continuar sin turnos fijos'
              : 'Continuar'
          "
          :disable="!scheduleStepValid"
          @click="step = confirmStep"
        />
        <q-btn
          v-else-if="step === confirmStep"
          color="primary"
          label="Confirmar"
          icon="check"
          :loading="assigning"
          :disable="
            props.mode === 'change' &&
            startMode === 'now' &&
            changePlanPreviewData?.allowed === false
          "
          @click="onConfirm"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { formatDate } from 'src/utils/format-date';
import { formatPrice, type Currency } from 'src/utils/format-price';
import { extractError, isExpectedClientError } from 'src/utils/extract-error';
import { useSubscriptionsApi } from 'src/composables/useSubscriptionsApi';
import {
  PLAN_TIER_LABELS,
  AURA_DISCOUNT_TIERS,
  PRICE_TYPE_LABELS,
  type PlanListItem,
  type PlanTier,
  type PriceType,
  type PricingPreview,
  type AssignPlanInput,
  type ChangePlanPreview,
} from 'src/types/subscription';
import { PAYMENT_METHOD_OPTIONS, type PaymentMethod } from 'src/types/payment';
import { DAY_SHORT_LABELS, type DayOfWeek } from 'src/types/scheduling';
import FixedSchedulePicker from 'src/components/scheduling/FixedSchedulePicker.vue';

const log = createLogger('AssignPlanDialog');
const $q = useQuasar();
const subsApi = useSubscriptionsApi();

// =========================================================================
// Props & Emits
// =========================================================================

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    userId: number;
    memberBranchId: number;
    memberBranchName: string;
    boardingPassUsed: boolean;
    mode?: 'assign' | 'change';
    /** Filter plans by category group: 'presencial' shows only presencial, 'online' shows only online_* categories */
    categoryFilter?: 'presencial' | 'online';
    /** End date of the member's current subscription. Required for change mode to offer the "start after current ends" option. */
    currentSubEndDate?: string | null;
  }>(),
  { mode: 'assign', categoryFilter: undefined, currentSubEndDate: null }
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  assigned: [];
}>();

// =========================================================================
// State
// =========================================================================

const step = ref(1);
const plans = ref<PlanListItem[]>([]);
const loadingPlans = ref(false);
const selectedPlan = ref<PlanListItem | null>(null);
const pricingPreview = ref<PricingPreview | null>(null);
const changePlanPreviewData = ref<ChangePlanPreview | null>(null);
const loadingPreview = ref(false);
const assigning = ref(false);

// Schedule slot picker state
const selectedScheduleIds = ref<number[]>([]);
const schedulePickerRef = ref<InstanceType<typeof FixedSchedulePicker> | null>(null);

const assignForm = ref({
  priceTypeApplied: 'regular' as PriceType,
  startDate: new Date().toISOString().split('T')[0],
  paymentMethod: 'cash' as PaymentMethod,
  boardingPass: false,
  auraSpend: null as number | null,
  useOverride: false,
  priceOverrideAmount: null as number | null,
  priceOverrideReason: '',
  notes: '',
});

// Change-mode only: "now" (proration, current ends immediately) vs
// "after_current" (queued, starts on current.endDate, full price).
const startMode = ref<'now' | 'after_current'>('now');

const paymentMethodOptions = PAYMENT_METHOD_OPTIONS;

// =========================================================================
// Computed
// =========================================================================

interface TierGroup {
  tier: PlanTier;
  plans: PlanListItem[];
}

const dialogTitle = computed(() => {
  if (props.mode === 'change') return 'Cambiar Plan';
  if (props.categoryFilter === 'online') return 'Agregar Programa';
  return 'Gestionar Plan';
});

const isOnlinePlan = computed(() =>
  selectedPlan.value ? selectedPlan.value.planCategory !== 'presencial' : false
);

const isFixedMode = computed(
  () => selectedPlan.value?.bookingMode === 'fixed' && !isOnlinePlan.value
);

const showScheduleStep = computed(() => {
  if (isOnlinePlan.value) return false;
  if (!selectedPlan.value?.classesPerWeek) return false;
  if (selectedPlan.value.bookingMode === 'fixed') return true;
  // Flexible presencial: only expose the optional anchor step on NEW
  // subscriptions. Plan-change flow keeps the existing minimal UX; members
  // can add/remove anchors afterwards via "Cambiar turnos".
  return selectedPlan.value.bookingMode === 'flexible' && props.mode !== 'change';
});

const confirmStep = computed(() => (showScheduleStep.value ? 4 : 3));

function goToPrevStep(): void {
  // Mirrors the per-step "Volver" callbacks the stepper-navigation blocks
  // had before the action bar was unified.
  if (step.value === confirmStep.value) {
    step.value = props.mode === 'change' ? 1 : showScheduleStep.value ? 3 : 2;
    return;
  }
  if (step.value === 3) {
    step.value = 2;
    return;
  }
  if (step.value === 2) {
    step.value = 1;
  }
}

const requiredSlotCount = computed(() => selectedPlan.value?.classesPerWeek ?? 0);

const scheduleStepValid = computed(() => {
  if (isFixedMode.value) {
    return selectedScheduleIds.value.length === requiredSlotCount.value;
  }
  // Flexible: any count 0..requiredSlotCount is valid (partial anchors).
  return selectedScheduleIds.value.length <= requiredSlotCount.value;
});

const filteredPlans = computed(() => {
  if (!props.categoryFilter) return plans.value;
  if (props.categoryFilter === 'presencial') {
    return plans.value.filter((p) => p.planCategory === 'presencial');
  }
  // 'online' filter: show all non-presencial categories
  return plans.value.filter((p) => p.planCategory !== 'presencial');
});

const plansByTier = computed((): TierGroup[] => {
  const tierOrder: PlanTier[] = ['flex', 'foundation', 'performance', 'other'];
  const groups: TierGroup[] = [];

  for (const tier of tierOrder) {
    const tierPlans = filteredPlans.value.filter((p) => p.planTier === tier);
    if (tierPlans.length > 0) {
      groups.push({ tier, plans: tierPlans });
    }
  }

  return groups;
});

const priceTypeOptions = computed(() => {
  const opts = [
    { label: PRICE_TYPE_LABELS.regular, value: 'regular' as PriceType },
    { label: PRICE_TYPE_LABELS.zero, value: 'zero' as PriceType },
  ];
  if (
    selectedPlan.value?.priceCreditCard !== null &&
    selectedPlan.value?.priceCreditCard !== undefined
  ) {
    opts.push({ label: PRICE_TYPE_LABELS.credit_card, value: 'credit_card' as PriceType });
  }
  return opts;
});

const auraOptions = computed(() => {
  const balance = pricingPreview.value?.auraBalance ?? 0;
  return [
    { label: 'Sin descuento AURA', value: null },
    ...AURA_DISCOUNT_TIERS.map((t) => ({
      label: `Gastar ${t.spend} AURA = ${t.percent}% descuento`,
      value: t.spend,
      disable: t.spend > balance,
    })),
  ];
});

const pricingDisplay = computed(() => {
  if (assignForm.value.useOverride && assignForm.value.priceOverrideAmount !== null) {
    const base = getBasePrice();
    return {
      basePrice: base,
      discountAmount: base - assignForm.value.priceOverrideAmount,
      finalPrice: assignForm.value.priceOverrideAmount,
    };
  }
  if (pricingPreview.value) {
    return {
      basePrice: pricingPreview.value.basePrice,
      discountAmount: pricingPreview.value.discountAmount,
      finalPrice: pricingPreview.value.finalPrice,
    };
  }
  const base = getBasePrice();
  return { basePrice: base, discountAmount: 0, finalPrice: base };
});

const calculatedEndDate = computed(() => {
  if (!selectedPlan.value || !assignForm.value.startDate) return '';
  const start = new Date(assignForm.value.startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + selectedPlan.value.durationDays);
  return end.toISOString().split('T')[0];
});

// Mirrors backend assertStartDateWithinLimits (-90 / +60 from today).
const PAST_LIMIT_DAYS = 90;
const FUTURE_LIMIT_DAYS = 60;

function offsetIso(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const startDateMin = computed(() => offsetIso(-PAST_LIMIT_DAYS));
const startDateMax = computed(() => offsetIso(FUTURE_LIMIT_DAYS));
const isFutureStart = computed(() => {
  if (!assignForm.value.startDate) return false;
  return assignForm.value.startDate > offsetIso(0);
});

// Change mode: the "after current" start date (= current sub's endDate).
const afterCurrentStartDate = computed(() => props.currentSubEndDate ?? '');

const afterCurrentEndDate = computed(() => {
  if (!selectedPlan.value || !afterCurrentStartDate.value) return '';
  const start = new Date(afterCurrentStartDate.value);
  const end = new Date(start);
  end.setDate(end.getDate() + selectedPlan.value.durationDays);
  return end.toISOString().split('T')[0];
});

const canOfferAfterCurrent = computed(() => {
  if (props.mode !== 'change') return false;
  if (!props.currentSubEndDate) return false;
  const today = new Date().toISOString().split('T')[0];
  return props.currentSubEndDate >= today;
});

// Currency used for every price in this dialog. Derived from the selected
// plan's currency (server-enforced to match the member's branch country per
// phase 98 D-03/D-05). Falls back to 'ARS' defensively before a plan is
// picked (no price displays before step 2).
const displayCurrency = computed<Currency>(
  () => (selectedPlan.value?.currency ?? 'ARS') as Currency
);

function formatSelectedSchedules(): string {
  const slots = schedulePickerRef.value?.slots ?? [];
  const names: string[] = [];
  for (const id of selectedScheduleIds.value) {
    const slot = slots.find((s) => s.id === id);
    if (slot) {
      const dayLabel = DAY_SHORT_LABELS[slot.dayOfWeek as DayOfWeek];
      names.push(`${slot.activityName} ${dayLabel} ${slot.startTime.slice(0, 5)}`);
    }
  }
  return names.join(', ');
}

// =========================================================================
// Helpers
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

function getBasePrice(): number {
  if (!selectedPlan.value) return 0;
  switch (assignForm.value.priceTypeApplied) {
    case 'regular':
      return selectedPlan.value.priceRegular;
    case 'zero':
      return selectedPlan.value.priceZero;
    case 'credit_card':
      return selectedPlan.value.priceCreditCard ?? selectedPlan.value.priceRegular;
  }
}

// =========================================================================
// Data loading
// =========================================================================

async function loadPlans() {
  loadingPlans.value = true;
  try {
    plans.value = await subsApi.getPlans(true, { branchId: props.memberBranchId });
  } catch (err: unknown) {
    const message = extractError(err, 'Error cargando planes');
    if (isExpectedClientError(err)) {
      log.warn('Plans fetch rejected by server', { error: message });
    } else {
      log.error('Error loading plans for assignment', { error: message });
    }
    $q.notify({ type: 'negative', message, timeout: 5000 });
  } finally {
    loadingPlans.value = false;
  }
}

async function loadPricingPreview() {
  if (!selectedPlan.value) return;
  try {
    pricingPreview.value = await subsApi.getPricingPreview(
      props.userId,
      selectedPlan.value.id,
      assignForm.value.priceTypeApplied,
      assignForm.value.auraSpend ?? undefined
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading pricing preview', { error: message });
  }
}

// =========================================================================
// Actions
// =========================================================================

async function selectPlan(plan: PlanListItem) {
  selectedPlan.value = plan;
  assignForm.value.priceTypeApplied = 'regular';
  assignForm.value.boardingPass = false;
  assignForm.value.auraSpend = null;
  assignForm.value.useOverride = false;
  assignForm.value.priceOverrideAmount = null;
  assignForm.value.priceOverrideReason = '';
  selectedScheduleIds.value = [];

  if (props.mode === 'change') {
    // Upgrade starts a new full period from today
    assignForm.value.startDate = new Date().toISOString().split('T')[0];

    // Fetch change plan preview
    loadingPreview.value = true;
    try {
      changePlanPreviewData.value = await subsApi.getChangePlanPreview(props.userId, plan.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      log.error('Error loading change plan preview', { error: message });
    } finally {
      loadingPreview.value = false;
    }

    // Presencial plans (fixed or flexible with classesPerWeek) go to the
    // schedule-slot step. Online plans skip directly to confirm.
    if (showScheduleStep.value) {
      step.value = 3;
    } else {
      step.value = confirmStep.value;
    }
  } else {
    step.value = 2;
    loadPricingPreview();
  }
}

function onPricingOptionChange() {
  if (!assignForm.value.boardingPass && !assignForm.value.useOverride) {
    loadPricingPreview();
  }
}

function onOverrideToggle() {
  if (assignForm.value.useOverride) {
    assignForm.value.boardingPass = false;
    assignForm.value.auraSpend = null;
  } else {
    assignForm.value.priceOverrideAmount = null;
    assignForm.value.priceOverrideReason = '';
    loadPricingPreview();
  }
}

function onConfirm() {
  if (!selectedPlan.value) return;

  if (props.mode === 'change') {
    const message =
      startMode.value === 'after_current'
        ? `El plan actual continua hasta ${formatDate(afterCurrentStartDate.value)}. El nuevo plan queda programado y el pago se registra ahora. Podes cancelarlo antes de esa fecha cambiando el plan nuevamente.`
        : 'Esta accion no se puede deshacer. La suscripcion actual sera cancelada y se creara una nueva. Si queres volver al plan anterior, tendras que cambiarlo de nuevo.';
    $q.dialog({
      title: startMode.value === 'after_current' ? 'Programar cambio de plan' : 'Cambiar plan',
      message,
      cancel: { flat: true, label: 'Volver' },
      ok: {
        color: 'primary',
        label: startMode.value === 'after_current' ? 'Confirmar programacion' : 'Confirmar cambio',
      },
    }).onOk(() => executeConfirm());
  } else {
    executeConfirm();
  }
}

async function executeConfirm() {
  if (!selectedPlan.value) return;

  assigning.value = true;
  try {
    const isAfterCurrent = props.mode === 'change' && startMode.value === 'after_current';
    const payload: AssignPlanInput = {
      planId: selectedPlan.value.id,
      branchId: props.memberBranchId,
      startDate: isAfterCurrent ? afterCurrentStartDate.value : assignForm.value.startDate,
      priceTypeApplied: assignForm.value.boardingPass ? 'zero' : assignForm.value.priceTypeApplied,
      paymentMethod: assignForm.value.paymentMethod,
      scheduleIds:
        showScheduleStep.value && selectedScheduleIds.value.length > 0
          ? selectedScheduleIds.value
          : undefined,
      boardingPass: assignForm.value.boardingPass || undefined,
      auraSpend:
        !assignForm.value.boardingPass && !assignForm.value.useOverride
          ? (assignForm.value.auraSpend ?? undefined)
          : undefined,
      priceOverrideAmount: assignForm.value.useOverride
        ? (assignForm.value.priceOverrideAmount ?? undefined)
        : undefined,
      priceOverrideReason: assignForm.value.useOverride
        ? assignForm.value.priceOverrideReason || undefined
        : undefined,
      notes: assignForm.value.notes.trim() || undefined,
      startMode: props.mode === 'change' ? startMode.value : undefined,
    };

    if (props.mode === 'change') {
      await subsApi.changePlan(props.userId, payload);
    } else {
      await subsApi.assignPlan(props.userId, payload);
    }

    $q.notify({
      type: 'positive',
      message: isAfterCurrent
        ? 'Cambio de plan programado correctamente'
        : props.mode === 'change'
          ? 'Plan cambiado correctamente'
          : 'Plan asignado correctamente',
    });
    emit('assigned');
    emit('update:modelValue', false);
  } catch (err: unknown) {
    // Cross-country validation (400) and similar client-correctable errors
    // surface as warnings (D-17) — they stay out of Sentry — and show the
    // server's Spanish message. The dialog stays open so the admin can fix.
    const message = extractError(
      err,
      props.mode === 'change' ? 'Error cambiando plan' : 'Error asignando plan'
    );
    if (isExpectedClientError(err)) {
      log.warn('Plan assignment rejected by server', { error: message });
    } else {
      log.error('Error assigning plan', { error: message });
    }
    $q.notify({ type: 'negative', message, timeout: 5000 });
  } finally {
    assigning.value = false;
  }
}

// =========================================================================
// Dialog lifecycle
// =========================================================================

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      step.value = 1;
      selectedPlan.value = null;
      pricingPreview.value = null;
      changePlanPreviewData.value = null;
      selectedScheduleIds.value = [];
      assignForm.value = {
        priceTypeApplied: 'regular',
        startDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
        boardingPass: false,
        auraSpend: null,
        useOverride: false,
        priceOverrideAmount: null,
        priceOverrideReason: '',
        notes: '',
      };
      startMode.value = 'now';
      loadPlans();
    }
  },
  // immediate covers the post-create flow in AlumnosPage where the dialog is
  // rendered with `v-if` and mounts already with modelValue=true; without
  // immediate the watch would never see that initial open and loadPlans
  // would not run, leaving the plan picker empty.
  { immediate: true }
);
</script>
