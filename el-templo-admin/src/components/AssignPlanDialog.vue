<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="width: 650px; max-width: 95vw">
      <q-card-section>
        <div class="text-h6">Asignar Plan</div>
      </q-card-section>

      <q-separator />

      <q-stepper v-model="step" animated flat>
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
                    <div class="text-weight-medium">${{ plan.priceRegular.toLocaleString() }}</div>
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
              class="q-mb-md"
            />

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
                    <div>${{ pricingDisplay.basePrice.toLocaleString() }}</div>
                  </div>
                  <div v-if="pricingDisplay.discountAmount > 0">
                    <div class="text-caption text-grey-7">Descuento</div>
                    <div class="text-positive">
                      -${{ pricingDisplay.discountAmount.toLocaleString() }}
                    </div>
                  </div>
                  <div>
                    <div class="text-caption text-grey-7">Precio final</div>
                    <div class="text-h6 text-weight-bold">
                      ${{ pricingDisplay.finalPrice.toLocaleString() }}
                    </div>
                  </div>
                </div>
              </q-card-section>
            </q-card>

            <q-stepper-navigation class="q-mt-md">
              <q-btn flat label="Volver" @click="step = 1" class="q-mr-sm" />
              <q-btn
                color="primary"
                label="Continuar"
                :disable="assignForm.useOverride && !assignForm.priceOverrideReason?.trim()"
                @click="step = 3"
              />
            </q-stepper-navigation>
          </template>
        </q-step>

        <!-- ============================================================ -->
        <!-- Step 3: Confirm -->
        <!-- ============================================================ -->
        <q-step :name="3" title="Confirmar" icon="check_circle">
          <template v-if="selectedPlan">
            <q-card flat bordered class="q-mb-md">
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
                      ${{ pricingDisplay.finalPrice.toLocaleString() }}
                    </q-item-section>
                  </q-item>
                  <q-item v-if="pricingDisplay.discountAmount > 0">
                    <q-item-section>Descuento</q-item-section>
                    <q-item-section side class="text-positive">
                      -${{ pricingDisplay.discountAmount.toLocaleString() }}
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

            <q-stepper-navigation>
              <q-btn flat label="Volver" @click="step = 2" class="q-mr-sm" />
              <q-btn
                color="primary"
                label="Confirmar"
                icon="check"
                :loading="assigning"
                @click="onConfirm"
              />
            </q-stepper-navigation>
          </template>
        </q-step>
      </q-stepper>

      <q-separator />

      <q-card-actions align="right" class="q-pa-md">
        <q-btn flat label="Cerrar" color="grey" @click="$emit('update:modelValue', false)" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useQuasar } from 'quasar';
import { createLogger } from 'src/utils/logger';
import { useSubscriptionsApi } from 'src/composables/useSubscriptionsApi';
import {
  PLAN_TIER_LABELS,
  AURA_DISCOUNT_TIERS,
  PRICE_TYPE_LABELS,
  type PlanListItem,
  type PlanTier,
  type PriceType,
  type PricingPreview,
} from 'src/types/subscription';

const log = createLogger('AssignPlanDialog');
const $q = useQuasar();

// =========================================================================
// Props & Emits
// =========================================================================

const props = defineProps<{
  modelValue: boolean;
  userId: number;
  memberBranchId: number;
  boardingPassUsed: boolean;
}>();

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
const assigning = ref(false);

const assignForm = ref({
  priceTypeApplied: 'regular' as PriceType,
  startDate: new Date().toISOString().split('T')[0],
  boardingPass: false,
  auraSpend: null as number | null,
  useOverride: false,
  priceOverrideAmount: null as number | null,
  priceOverrideReason: '',
  notes: '',
});

// =========================================================================
// Computed
// =========================================================================

interface TierGroup {
  tier: PlanTier;
  plans: PlanListItem[];
}

const plansByTier = computed((): TierGroup[] => {
  const tierOrder: PlanTier[] = ['flex', 'foundation', 'performance', 'other'];
  const groups: TierGroup[] = [];

  for (const tier of tierOrder) {
    const tierPlans = plans.value.filter((p) => p.planTier === tier);
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

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// =========================================================================
// Data loading
// =========================================================================

async function loadPlans() {
  loadingPlans.value = true;
  try {
    const subsApi = useSubscriptionsApi();
    plans.value = await subsApi.getPlans(true);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error loading plans for assignment', { error: message });
    $q.notify({ type: 'negative', message: 'Error cargando planes' });
  } finally {
    loadingPlans.value = false;
  }
}

async function loadPricingPreview() {
  if (!selectedPlan.value) return;
  try {
    const subsApi = useSubscriptionsApi();
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

function selectPlan(plan: PlanListItem) {
  selectedPlan.value = plan;
  assignForm.value.priceTypeApplied = 'regular';
  assignForm.value.boardingPass = false;
  assignForm.value.auraSpend = null;
  assignForm.value.useOverride = false;
  assignForm.value.priceOverrideAmount = null;
  assignForm.value.priceOverrideReason = '';
  step.value = 2;
  loadPricingPreview();
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

async function onConfirm() {
  if (!selectedPlan.value) return;

  assigning.value = true;
  try {
    const subsApi = useSubscriptionsApi();
    await subsApi.assignPlan(props.userId, {
      planId: selectedPlan.value.id,
      branchId: props.memberBranchId,
      startDate: assignForm.value.startDate,
      priceTypeApplied: assignForm.value.boardingPass ? 'zero' : assignForm.value.priceTypeApplied,
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
    });

    $q.notify({ type: 'positive', message: 'Plan asignado correctamente' });
    emit('assigned');
    emit('update:modelValue', false);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error assigning plan', { error: message });
    $q.notify({ type: 'negative', message: 'Error asignando plan' });
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
      assignForm.value = {
        priceTypeApplied: 'regular',
        startDate: new Date().toISOString().split('T')[0],
        boardingPass: false,
        auraSpend: null,
        useOverride: false,
        priceOverrideAmount: null,
        priceOverrideReason: '',
        notes: '',
      };
      loadPlans();
    }
  }
);
</script>
