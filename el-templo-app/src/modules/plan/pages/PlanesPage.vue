<template>
  <!-- Sketch 028 D: arriba "Tu plan" (card oscura con la línea de tiempo), después los planes
       anteriores (plegados) y el catálogo con el lenguaje del rework. Página transparente sobre
       el fondo `.app-bg` del layout. -->
  <q-page class="planes-page">
    <div class="planes-wrap">
      <!-- Tu plan: carga / error con reintento / contenido -->
      <div v-if="summaryLoading && !summary" class="planes-loading">
        <TemploLoader size="lg" />
      </div>

      <div v-else-if="summaryError" class="planes-error" role="alert">
        <p class="planes-error__text">No pudimos cargar tu plan.</p>
        <button type="button" class="planes-error__retry" @click="loadSummary">Reintentar</button>
      </div>

      <template v-else-if="timeline && summary">
        <TuPlanCard :model="timeline" @cta="openPlanWhatsApp" />
        <PlanHistoryCard :items="summary.history" :today="today" />
      </template>

      <!-- Catálogo -->
      <div v-if="catalogLoading" class="planes-loading planes-loading--catalog">
        <TemploLoader size="md" />
      </div>

      <div v-else-if="plans.length === 0 && experiencias.length === 0" class="planes-empty">
        No hay planes disponibles
      </div>

      <section v-if="experiencias.length > 0" class="planes-section">
        <h3 class="planes-title">Planes por objetivos</h3>
        <p class="planes-sub">Planes diseñados a tu medida para potenciar tu entrenamiento.</p>
        <article v-for="exp in experiencias" :key="exp.id" class="pc">
          <div class="pc__head">
            <span class="pc__name">{{ exp.name }}</span>
            <span v-if="exp.durationWeeks" class="pc-pill pc-pill--neu"
              >{{ exp.durationWeeks }} semanas</span
            >
          </div>
          <p v-if="exp.description" class="pc__desc">{{ exp.description }}</p>
          <div v-if="!exp.hasContent || exp.price != null" class="pc__tags">
            <span v-if="!exp.hasContent" class="pc-pill pc-pill--mid">Próximamente</span>
            <span v-if="exp.price != null" class="pc-pill pc-pill--neu">{{
              formatPrice(exp.price, exp.currency ?? 'ARS')
            }}</span>
          </div>
          <div class="pc__foot">
            <span v-if="enrolledProgramId === exp.id" class="pc-pill pc-pill--ok">
              <q-icon name="check" size="14px" aria-hidden="true" />
              Ya estás inscripto
            </span>
            <button v-else type="button" class="pc__cta" @click="openExperienciaWhatsApp(exp)">
              <q-icon name="img:/icons/whatsapp.svg" size="18px" aria-hidden="true" />
              Más info
            </button>
          </div>
        </article>
      </section>

      <section v-if="plans.length > 0" class="planes-section">
        <h3 class="planes-title">Planes regulares</h3>
        <article v-for="plan in allRegularPlans" :key="plan.id" class="pc">
          <div class="pc__head">
            <span class="pc__name">{{ plan.name }}</span>
            <span v-if="isCurrentPlan(plan)" class="pc-pill pc-pill--ok">
              <q-icon name="check" size="14px" aria-hidden="true" />
              Tu plan
            </span>
            <span v-else-if="plan.durationDays" class="pc-pill pc-pill--neu"
              >{{ plan.durationDays }} días</span
            >
          </div>
          <p v-if="plan.description" class="pc__desc">{{ plan.description }}</p>
          <div v-if="plan.classesPerWeek || tierLabel(plan.planTier)" class="pc__tags">
            <span v-if="tierLabel(plan.planTier)" class="pc-pill pc-pill--neu">{{
              tierLabel(plan.planTier)
            }}</span>
            <span v-if="plan.classesPerWeek" class="pc-pill pc-pill--neu">{{
              plan.classesPerWeek === 1
                ? '1 clase por semana'
                : `${plan.classesPerWeek} clases por semana`
            }}</span>
          </div>
          <div v-if="!isCurrentPlan(plan)" class="pc__foot">
            <button type="button" class="pc__cta" @click="openWhatsApp(plan)">
              <q-icon name="img:/icons/whatsapp.svg" size="18px" aria-hidden="true" />
              Consultar
            </button>
          </div>
        </article>
      </section>
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
import { DEFAULT_BRANCH_TZ, todayInTz } from 'src/utils/tz'
import { useProgramsApi } from 'src/modules/programs/composables/useProgramsApi'
import type { MemberProgramCatalogItem } from 'src/modules/programs/types'
import TuPlanCard from '../components/TuPlanCard.vue'
import PlanHistoryCard from '../components/PlanHistoryCard.vue'
import { fetchPlanSummary, markPlanSummarySeen } from '../api'
import { buildPlanTimeline } from '../utils/plan-timeline'
import type { PlanSummary } from '../types'

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
}

const userStore = useUserStore()
const plans = ref<MemberPlan[]>([])
const catalogLoading = ref(false)

const { getCatalog, getMyProgress } = useProgramsApi()
const experiencias = ref<MemberProgramCatalogItem[]>([])
const enrolledProgramId = ref<number | null>(null)

// ── Tu plan ──
const summary = ref<PlanSummary | null>(null)
const summaryLoading = ref(false)
const summaryError = ref(false)
// "Hoy" en la sede (no en el teléfono): se recalcula en cada carga.
const today = ref(todayInTz(DEFAULT_BRANCH_TZ))

const timeline = computed(() =>
  summary.value ? buildPlanTimeline(summary.value, today.value) : null,
)

const allRegularPlans = computed(() => plans.value.filter((p) => !p.linkedProgramId))

/** El plan del socio se marca por id de plan (no por nombre) con su membresía actual. */
function isCurrentPlan(plan: MemberPlan): boolean {
  return summary.value?.current?.planId === plan.id
}

/** Etiqueta del nivel del plan; vacía para "other"/desconocidos (no aporta nada al socio). */
function tierLabel(tier: string): string {
  return PLAN_TIER_LABELS[tier] ?? ''
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
    return `Hola! Me interesa el plan ${planName}. Quiero más info.`
  }
  const wp = computeWeeklyPrice(monthlyPrice, currency)
  return `Hola! Me interesa el plan ${planName} (${wp}/semana). Quiero más info.`
}

function openWhatsAppWith(message: string): void {
  window.open(buildWhatsAppUrl(userStore.profile?.branchCountry, message), '_blank')
}

function openWhatsApp(plan: MemberPlan): void {
  openWhatsAppWith(buildWhatsAppMessage(plan.name, plan.priceRegular, plan.currency))
}

function openExperienciaWhatsApp(exp: MemberProgramCatalogItem): void {
  openWhatsAppWith(buildWhatsAppMessage(exp.name, exp.price, exp.currency))
}

/** Botón de la card "Tu plan" (renovar / consultar): el texto ya viene armado por el modelo. */
function openPlanWhatsApp(message: string): void {
  openWhatsAppWith(message)
}

/**
 * Abrir Planes = "visto": apaga la pelotita de la tab (flag local) y avisa al server, best-effort.
 * El `summary` ya cargado conserva sus `isNew`, así el "Nuevo" se ve en esta visita.
 */
async function markSeen(): Promise<void> {
  userStore.clearPlanUpdateUnseen()
  try {
    await markPlanSummarySeen()
  } catch (err: unknown) {
    log.warn('No se pudo marcar Planes como visto', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Siempre pide el resumen al server (aunque haya datos en memoria): es lo que el socio espera ver. */
async function loadSummary(): Promise<void> {
  summaryLoading.value = true
  summaryError.value = false
  try {
    const data = await fetchPlanSummary()
    today.value = todayInTz(userStore.profile?.branchTimezone ?? DEFAULT_BRANCH_TZ)
    summary.value = data
    if (data.hasUnseen) {
      void markSeen()
    } else {
      // El server no tiene nada sin ver: una pelotita vieja en memoria no corresponde.
      userStore.clearPlanUpdateUnseen()
    }
  } catch (err: unknown) {
    summaryError.value = true
    log.error('Failed to load plan summary', {
      error: err instanceof Error ? err.message : String(err),
    })
  } finally {
    summaryLoading.value = false
  }
}

async function loadCatalog(): Promise<void> {
  catalogLoading.value = true
  try {
    const response = await api.get<{ plans: MemberPlan[] }>('/members/subscription/plans')
    plans.value = response.data.plans
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Failed to load plans', { error: message })
  } finally {
    catalogLoading.value = false
  }

  // Fetch Planes Por Objetivos catalog
  try {
    experiencias.value = await getCatalog()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Failed to load experiencias', { error: message })
  }

  // Check enrollment status for "Ya estás inscripto" per D-47
  try {
    const progress = await getMyProgress()
    if (progress) {
      enrolledProgramId.value = progress.programId
    }
  } catch {
    /* ignore -- non-critical for catalog display */
  }
}

onMounted(() => {
  void loadSummary()
  void loadCatalog()
})
</script>

<style scoped lang="scss">
@import 'src/css/brand';
@import 'src/css/premium-card';

.planes-page {
  background-color: transparent; // la foto de fondo (.app-bg) se ve detrás
}

.planes-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 16px 28px;
}

.planes-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40vh;

  &--catalog {
    min-height: 96px;
  }
}

.planes-empty {
  padding: 24px 0;
  text-align: center;
  color: $pd-ink; // sobre la página: tinta sólida
}

.planes-error {
  @include pd-surface-light;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;

  &__text {
    margin: 0;
    font-size: 14px;
    color: $pd-ink;
  }

  &__retry {
    @include pd-cta;
    @include pd-cta-secondary-light;
  }
}

.planes-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

// Título de bloque del rework; sobre la PÁGINA va en tinta (terracota no llega a AA ahí).
.planes-title {
  @include mt-block-title;
  margin: 0;
  color: $pd-ink;
}

.planes-sub {
  margin: -8px 0 0;
  font-size: 14px;
  line-height: 1.4;
  color: $pd-ink;
}

// ── Cards del catálogo ──
.pc {
  @include pd-surface-light;
  padding: 14px 16px;

  &__head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
  }

  &__name {
    min-width: 0;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 16px;
    color: $pd-ink;
    overflow-wrap: anywhere;
  }

  &__desc {
    margin: 4px 0 0;
    font-size: 13.5px;
    line-height: 1.4;
    color: $pd-ink-2;
  }

  &__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  &__foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 6px;
  }

  &__cta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    font-family: 'Geologica', sans-serif;
    font-weight: 600;
    font-size: 14px;
    color: $pd-terra-ink;
  }
}

.pc-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-family: 'Geologica', sans-serif;
  font-weight: 600;
  font-size: 12px;
  white-space: nowrap;

  &--neu {
    background: #f3ede4;
    color: $pd-ink-3;
  }

  &--ok {
    background: $pd-sage-tint;
    color: $pd-sage;
  }

  &--mid {
    background: $pd-gold-tint;
    color: $pd-gold-ink;
  }
}
</style>
