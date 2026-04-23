<template>
  <q-page padding>
    <!-- Loading state -->
    <div v-if="loading" class="planes-loading">
      <TemploLoader size="lg" />
    </div>

    <!-- Empty state -->
    <div v-if="!loading && plans.length === 0" class="text-center text-grey-6 q-pa-xl">
      No hay planes disponibles
    </div>

    <!-- Tu plan actual — hero card at top -->
    <!-- Tu plan actual -->
    <div v-if="currentPlan" class="q-mb-lg">
      <p class="planes-section-title">Tu plan actual</p>
      <div class="plan-card plan-card--active">
        <div class="plan-card__header">
          <span class="plan-card__name">{{ currentPlan.name }}</span>
          <q-badge
            :style="{ backgroundColor: '#96593a' }"
            :label="tierLabel(currentPlan.planTier)"
          />
        </div>
        <div class="plan-card__badges">
          <q-badge v-if="currentPlan.classesPerWeek" outline color="grey-7">
            {{ currentPlan.classesPerWeek }} clases/semana
          </q-badge>
        </div>
        <div class="plan-card__status">
          <q-icon name="check_circle" size="16px" color="positive" />
          <span>Activo — vence {{ formatEndDate() }}</span>
        </div>
      </div>
    </div>

    <!-- Planes Por Objetivos -->
    <div v-if="experiencias.length > 0" class="q-mb-lg">
      <p class="planes-section-title">Planes Por Objetivos</p>
      <div class="text-body2 text-grey-7 q-mb-md" style="padding-left: 4px">
        Planes diseñados a tu medida para potenciar tu entrenamiento.
      </div>
      <div
        v-for="exp in experiencias"
        :key="exp.id"
        class="plan-card q-mb-sm"
        :class="{ 'plan-card--active': enrolledProgramId === exp.id }"
      >
        <div class="plan-card__header">
          <span class="plan-card__name">{{ exp.name }}</span>
          <q-badge :style="{ backgroundColor: '#96593a' }" label="POR OBJETIVOS" />
        </div>
        <div v-if="exp.description" class="plan-card__desc">{{ exp.description }}</div>
        <div class="plan-card__badges">
          <q-badge v-if="!exp.hasContent" color="grey" label="Proximamente" />
          <q-badge outline color="grey-7">{{ exp.durationWeeks }} semanas</q-badge>
          <q-badge v-if="exp.price != null" outline color="primary">{{
            formatPrice(exp.price, exp.currency ?? 'ARS')
          }}</q-badge>
        </div>
        <div v-if="enrolledProgramId === exp.id" class="plan-card__status">
          <q-icon name="check_circle" size="16px" color="positive" />
          <span>Ya estas inscripto</span>
        </div>
        <q-btn
          v-else
          flat
          dense
          no-caps
          color="positive"
          class="plan-card__cta"
          @click="openExperienciaWhatsApp(exp)"
        >
          <q-icon name="img:/icons/whatsapp.svg" size="16px" class="q-ml-xs q-mr-sm" />
          Mas info
        </q-btn>
      </div>
    </div>

    <!-- Planes Regulares -->
    <div v-if="plans.length > 0" :class="experiencias.length > 0 ? 'q-mt-lg' : ''">
      <p class="planes-section-title">Planes Regulares</p>

      <!-- All regular plans -->
      <div
        v-for="plan in allRegularPlans"
        :key="plan.id"
        class="plan-card q-mb-sm"
        :class="{ 'plan-card--active': isCurrentPlan(plan) }"
      >
        <div class="plan-card__header">
          <span class="plan-card__name">{{ plan.name }}</span>
          <q-badge :style="{ backgroundColor: '#96593a' }" :label="tierLabel(plan.planTier)" />
        </div>
        <div v-if="plan.description" class="plan-card__desc">{{ plan.description }}</div>
        <div class="plan-card__badges">
          <q-badge v-if="plan.durationDays" outline color="grey-7">
            {{ plan.durationDays }} dias
          </q-badge>
          <q-badge v-if="plan.classesPerWeek" outline color="grey-7">
            {{ plan.classesPerWeek }} clases/semana
          </q-badge>
        </div>
        <div v-if="isCurrentPlan(plan)" class="plan-card__status">
          <q-icon name="check_circle" size="16px" color="positive" />
          <span>Activo — vence {{ formatEndDate() }}</span>
        </div>
        <q-btn
          v-else
          flat
          dense
          no-caps
          color="positive"
          class="plan-card__cta"
          @click="openWhatsApp(plan)"
        >
          <q-icon name="img:/icons/whatsapp.svg" size="16px" class="q-ml-xs q-mr-sm" />
          {{ ctaText }}
        </q-btn>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import TemploLoader from 'src/components/TemploLoader.vue'
import { api } from 'src/boot/axios'
import { useUserStore } from 'src/stores/useUserStore'
import { createLogger } from 'src/utils/logger'
import { formatPrice } from 'src/utils/format-price'
import { buildWhatsAppUrl } from 'src/utils/whatsapp'
import { useProgramsApi } from 'src/modules/programs/composables/useProgramsApi'
import type { MemberProgramCatalogItem } from 'src/modules/programs/types'

const log = createLogger('PlanesPage')

interface MemberPlan {
  id: number
  name: string
  description: string | null
  planTier: string
  durationDays: number
  classesPerWeek: number | null
  planCategory: string
  linkedProgramId: number | null
  priceRegular: number
  // Phase 98 D-18/D-19: additive + optional for forward-compat with responses
  // predating the currency field. Fallback to 'ARS' at the call site.
  currency?: 'ARS' | 'EUR'
}

const PLAN_TIER_LABELS: Record<string, string> = {
  flex: 'Flex',
  foundation: 'Foundation',
  performance: 'Performance',
  other: 'Otro',
}

const userStore = useUserStore()
const plans = ref<MemberPlan[]>([])
const loading = ref(false)

const { getCatalog, getMyProgress } = useProgramsApi()
const experiencias = ref<MemberProgramCatalogItem[]>([])
const enrolledProgramId = ref<number | null>(null)

const allRegularPlans = computed(() => plans.value.filter((p) => !p.linkedProgramId))

const hasSubscription = computed(() => !!userStore.subscription)

const ctaText = computed(() =>
  hasSubscription.value ? 'Contacta para cambiar de plan' : 'Contacta para elegir tu plan',
)

const currentPlan = computed(
  () => plans.value.find((p) => userStore.subscription?.planName === p.name) ?? null,
)

function isCurrentPlan(plan: MemberPlan): boolean {
  return userStore.subscription?.planName === plan.name
}

function formatEndDate(): string {
  const endDate = userStore.subscription?.endDate
  if (!endDate) return 'sin fecha'
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(endDate))
}

function tierLabel(tier: string): string {
  return PLAN_TIER_LABELS[tier] ?? tier
}

/**
 * Compute weekly price from monthly price.
 * priceRegular is always the monthly price regardless of plan durationDays.
 * Returns a currency-formatted string via formatPrice (Phase 98 D-09).
 * Currency fallback to 'ARS' per D-19 for forward-compat with older responses.
 */
function computeWeeklyPrice(monthlyPrice: number, currency?: 'ARS' | 'EUR'): string {
  const weeklyAmount = Math.round(monthlyPrice / 4.33)
  return formatPrice(weeklyAmount, currency ?? 'ARS')
}

/**
 * Build WhatsApp pre-filled message with plan name and weekly price.
 * Currency is optional (fallback 'ARS' per D-19).
 */
function buildWhatsAppMessage(
  planName: string,
  monthlyPrice: number | undefined,
  currency?: 'ARS' | 'EUR',
): string {
  if (monthlyPrice == null) {
    return `Hola! Me interesa el plan ${planName}. Quiero mas info.`
  }
  const wp = computeWeeklyPrice(monthlyPrice, currency)
  return `Hola! Me interesa el plan ${planName} (${wp}/semana). Quiero mas info.`
}

function openWhatsApp(plan: MemberPlan): void {
  const message = buildWhatsAppMessage(plan.name, plan.priceRegular, plan.currency)
  window.open(buildWhatsAppUrl(userStore.profile?.branchCountry, message), '_blank')
}

function openExperienciaWhatsApp(exp: MemberProgramCatalogItem) {
  const message = buildWhatsAppMessage(exp.name, exp.price, exp.currency)
  window.open(buildWhatsAppUrl(userStore.profile?.branchCountry, message), '_blank')
}

onMounted(async () => {
  // Ensure subscription is loaded for "Tu plan actual" card
  if (!userStore.subscription && !userStore.subscriptionLoading) {
    await userStore.loadSubscription()
  }

  loading.value = true
  try {
    const response = await api.get<{ plans: MemberPlan[] }>('/members/subscription/plans')
    plans.value = response.data.plans
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Failed to load plans', { error: message })
  } finally {
    loading.value = false
  }

  // Fetch Planes Por Objetivos catalog
  try {
    const catalog = await getCatalog()
    experiencias.value = catalog
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Failed to load experiencias', { error: message })
  }

  // Check enrollment status for "Ya estas inscripto" per D-47
  try {
    const progress = await getMyProgress()
    if (progress) {
      enrolledProgramId.value = progress.programId
    }
  } catch {
    /* ignore -- non-critical for catalog display */
  }
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.planes-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
}

.planes-section-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 18px;
  font-weight: 800;
  color: $primary;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 4px 0 12px;
  padding: 4px 0 0 4px;
}

.plan-card {
  padding: 16px;
  background: white;
  border: 1px solid rgba($primary, 0.15);
  border-radius: 12px;
  border-left: 4px solid rgba($primary, 0.3);

  &--active {
    border-left-color: $positive;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }

  &__name {
    font-family: 'Montserrat', sans-serif;
    font-size: 15px;
    font-weight: 700;
    color: $primary;
  }

  &__desc {
    font-size: 13px;
    color: $grey-7;
    line-height: 1.4;
    margin-bottom: 8px;
  }

  &__badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
  }

  &__status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: $positive;
    font-weight: 500;
  }

  &__cta {
    margin-top: 4px;
    margin-left: -8px;
  }
}
</style>
