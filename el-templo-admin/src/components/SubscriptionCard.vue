<template>
  <q-card flat bordered class="q-mb-md">
    <q-card-section>
      <!-- Label -->
      <div class="text-overline text-grey-7 q-mb-xs">{{ label }}</div>

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
        <q-badge
          v-if="showCategoryBadge"
          :color="categoryColor(subscription.planCategory)"
          :label="categoryLabel(subscription.planCategory)"
          outline
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

      <!-- Paused auto-resume banner -->
      <q-banner
        v-if="subscription.status === 'paused' && subscription.pauseEndDate"
        dense
        class="bg-amber-1 q-mb-md"
      >
        <template #avatar>
          <q-icon name="schedule" color="warning" />
        </template>
        Reanuda automatica: {{ formatDate(subscription.pauseEndDate) }}
      </q-banner>

      <!-- Class usage section (presencial only) -->
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
              classUsage.classesRemaining !== null
                ? `${classUsage.classesRemaining} / ${classUsage.classesBudget}`
                : 'Sin limite'
            }}
          </div>
        </div>
        <div v-if="classUsage.scheduleSlots && classUsage.scheduleSlots.length > 0">
          <div class="text-caption text-grey-7">Horarios fijos</div>
          <div v-for="slot in classUsage.scheduleSlots" :key="slot.id" class="text-body2">
            {{ dayLabel(slot.dayOfWeek) }} {{ slot.startTime }} — {{ slot.activityName }}
          </div>
        </div>
        <div v-if="subscription.replacementCredits > 0">
          <div class="text-caption text-grey-7">Clases de reemplazo</div>
          <div class="text-positive text-weight-medium">
            {{ subscription.replacementCredits }}
          </div>
        </div>
        <div v-if="classUsage.bonusUsage?.applicable">
          <div class="text-caption text-grey-7">Clases bonus</div>
          <div class="text-weight-medium">
            {{ classUsage.bonusUsage.used ?? 0 }} / {{ classUsage.bonusUsage.limit ?? 2 }}
            <span v-if="classUsage.bonusUsage.periodEnd" class="text-caption text-grey-6">
              · renueva {{ formatDate(classUsage.bonusUsage.periodEnd) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Pricing row -->
      <div class="row q-gutter-x-lg q-mb-sm">
        <div>
          <div class="text-caption text-grey-7">Pagado</div>
          <div class="text-weight-medium">
            {{ formatPrice(subscription.pricePaid, subscription.currency ?? 'ARS') }}
          </div>
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
          <div>{{ subscription.auraDiscountPercent }}% (-{{ subscription.auraDiscount }} AURA)</div>
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
    <q-card-actions
      v-if="
        subscription.status === 'active' ||
        subscription.status === 'paused' ||
        subscription.status === 'expired'
      "
    >
      <template v-if="subscription.status === 'active'">
        <q-btn flat icon="autorenew" label="Renovar" color="positive" @click="emit('renew')" />
        <q-btn
          v-if="canChangeTurnos"
          flat
          icon="calendar_today"
          label="Cambiar turnos"
          color="primary"
          @click="emit('change-turnos')"
        />
        <q-btn
          v-if="isPresencial"
          flat
          icon="swap_horiz"
          label="Cambiar Plan"
          color="primary"
          @click="emit('change')"
        />
        <q-btn
          v-if="isPresencial"
          flat
          icon="pause"
          label="Pausar"
          color="warning"
          @click="emit('pause')"
        />
        <q-btn flat icon="cancel" label="Cancelar" color="negative" @click="emit('cancel')" />
      </template>
      <template v-else-if="subscription.status === 'paused'">
        <q-btn
          v-if="isPresencial"
          flat
          icon="swap_horiz"
          label="Cambiar Plan"
          color="primary"
          @click="emit('change')"
        />
        <q-btn
          v-if="isPresencial"
          flat
          icon="play_arrow"
          label="Reanudar"
          color="positive"
          @click="emit('resume')"
        />
        <q-btn flat icon="cancel" label="Cancelar" color="negative" @click="emit('cancel')" />
      </template>
      <template v-else-if="subscription.status === 'expired'">
        <q-btn flat icon="autorenew" label="Renovar" color="positive" @click="emit('renew')" />
      </template>
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatDate } from 'src/utils/format-date';
import { formatPrice } from 'src/utils/format-price';
import {
  PLAN_TIER_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  PRICE_TYPE_LABELS,
  PLAN_CATEGORY_LABELS,
  PLAN_CATEGORY_COLORS,
  type SubscriptionDetail,
  type ClassUsageInfo,
  type PlanTier,
  type PlanCategory,
  type SubscriptionStatus,
  type PriceType,
} from 'src/types/subscription';

const props = defineProps<{
  subscription: SubscriptionDetail;
  classUsage?: ClassUsageInfo | null;
  label: string;
  showCategoryBadge?: boolean;
}>();

const emit = defineEmits<{
  renew: [];
  change: [];
  'change-turnos': [];
  pause: [];
  resume: [];
  cancel: [];
}>();

const isPresencial = computed(() => props.subscription.planCategory === 'presencial');

const canChangeTurnos = computed(() => {
  if (!isPresencial.value) return false;
  if (!props.classUsage) return false;
  const mode = props.classUsage.bookingMode;
  const hasAnchors = (props.classUsage.scheduleIds?.length ?? 0) > 0;
  // Fixed plans always show the button (they always have anchors).
  // Flexible plans show it when classesPerWeek is set, so the user can add/remove partial anchors.
  if (mode === 'fixed') return hasAnchors;
  if (mode === 'flexible') return props.classUsage.weeklyLimit !== null;
  return false;
});

const daysRemaining = computed(() => {
  if (!props.subscription.endDate) return 0;
  const end = new Date(props.subscription.endDate);
  const now = new Date();
  const diffMs = end.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
});

const showClassUsage = computed(() => {
  if (!isPresencial.value) return false;
  if (!props.classUsage) return false;
  return props.classUsage.weeklyLimit !== null || props.classUsage.scheduleIds.length > 0;
});

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

const DAY_LABELS: Record<number, string> = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
};

function dayLabel(dayOfWeek: number): string {
  return DAY_LABELS[dayOfWeek] ?? `Día ${dayOfWeek}`;
}
</script>
