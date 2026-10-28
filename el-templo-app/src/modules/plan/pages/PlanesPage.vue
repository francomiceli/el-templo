<template>
  <!-- Sketch 028 D: arriba "Tu plan" (card oscura con la línea de tiempo), después los planes
       anteriores (plegados) y el catálogo con el lenguaje del rework. Página transparente sobre
       el fondo `.app-bg` del layout. -->
  <q-page class="planes-page">
    <div class="planes-wrap">
      <!-- Fase 203 (D-04): la página aparece completa de una vez. Mientras falta algo, cada
           sección conserva su lugar con un esqueleto (mismo orden, nunca se reordena); antes de
           que llegue todo, las tres están en esqueleto. Ver `resolvePlanesView`. -->

      <!-- Tu plan: esqueleto / error con reintento / contenido -->
      <template v-if="view.tuPlan === 'show' && timeline && summary && today">
        <TuPlanCard :model="timeline" @cta="openPlanWhatsApp" />
        <PlanHistoryCard :items="summary.history" :today="today" />
      </template>

      <div v-else-if="view.tuPlan === 'error'" class="planes-error" role="alert">
        <p class="planes-error__text">No pudimos cargar tu plan.</p>
        <button type="button" class="planes-error__retry" @click="loadSummary(true)">
          Reintentar
        </button>
      </div>

      <CardSkeleton v-else dark :height="200" label="Cargando planes" />

      <!-- Planes por objetivos -->
      <section v-if="view.objetivos === 'show'" class="planes-section">
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
            <!-- Solo mientras my-progress carga (antes del tope) no se afirma nada; si falló o venció
                 el tope se vuelve a "Más info" para no cortar el camino de venta. -->
            <template v-if="view.enrollment === 'known'">
              <span v-if="enrolledProgramId === exp.id" class="pc-pill pc-pill--ok">
                <q-icon name="check" size="14px" aria-hidden="true" />
                Ya estás inscripto
              </span>
              <button v-else type="button" class="pc__cta" @click="openExperienciaWhatsApp(exp)">
                <q-icon name="img:/icons/whatsapp.svg" size="18px" aria-hidden="true" />
                Más info
              </button>
            </template>
          </div>
        </article>
      </section>

      <section v-else-if="view.objetivos === 'skeleton'" class="planes-section">
        <q-skeleton type="text" animation="none" width="170px" class="planes-title-sk" />
        <CardSkeleton :height="120" label="Cargando planes" />
      </section>

      <!-- Planes regulares -->
      <section v-if="view.regulares === 'content'" class="planes-section">
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

      <section v-else-if="view.regulares === 'skeleton'" class="planes-section">
        <q-skeleton type="text" animation="none" width="150px" class="planes-title-sk" />
        <CardSkeleton :height="96" label="Cargando planes" />
        <CardSkeleton :height="96" label="Cargando planes" />
      </section>

      <!-- Vacío de verdad: el server respondió 2xx sin planes y no hay objetivos que mostrar. -->
      <div v-else-if="view.regulares === 'empty' && view.objetivos === 'hide'" class="planes-empty">
        No hay planes disponibles
      </div>

      <!-- Un pedido caído nunca se dibuja como "No hay planes". -->
      <div v-else-if="view.regulares === 'error'" class="planes-error" role="alert">
        <p class="planes-error__text">No pudimos cargar los planes.</p>
        <button type="button" class="planes-error__retry" @click="retryPlans">Reintentar</button>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import CardSkeleton from 'src/components/CardSkeleton.vue'
import { useLoadDeadline } from 'src/composables/useLoadDeadline'
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
import { resolvePlanesView } from '../utils/planes-view'
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

// Fase 203 (D-04): ninguna fuente arranca "resuelta". El primer frame es esqueleto, no el vacío.
// `*Settled` = ya respondió (bien o mal); `*Failed` = la última carga falló.
const plansSettled = ref(false)
const plansFailed = ref(false)
const plansRetrying = ref(false)
const catalogSettled = ref(false)

const { getCatalog } = useProgramsApi()
const experiencias = ref<MemberProgramCatalogItem[]>([])
// "Ya estás inscripto" sale del store (una sola carga compartida con el boot), sin pedido propio.
const enrolledProgramId = computed<number | null>(() => userStore.myProgress?.programId ?? null)

// ── Tu plan ──
const summary = ref<PlanSummary | null>(null)
const summarySettled = ref(false)
const summaryRetrying = ref(false)
// La última carga falló; `summary` conserva su valor anterior si lo había.
const summaryError = ref(false)
// "Hoy" en la sede (no en el teléfono), reactivo al perfil. D-08: sin perfil no hay zona real,
// así que NUNCA se usa la zona por defecto como si fuera dato: null y Tu plan queda en esqueleto.
// Un perfil cargado sin `branchTimezone` sí usa la zona por defecto de la sede (eso es dato).
const today = computed<string | null>(() =>
  userStore.profile ? todayInTz(userStore.profile.branchTimezone ?? DEFAULT_BRANCH_TZ) : null,
)

const timeline = computed(() =>
  summary.value && today.value ? buildPlanTimeline(summary.value, today.value) : null,
)

// Tope de carga (D-07): una sola vez al montar (nunca dentro de un watch: reiniciaría `passed`).
const deadline = useLoadDeadline()

const view = computed(() =>
  resolvePlanesView({
    summarySettled: summarySettled.value,
    summaryFailed: summaryError.value && summary.value === null,
    summaryRetrying: summaryRetrying.value,
    profileReady: userStore.profile !== null,
    plansSettled: plansSettled.value,
    plansFailed: plansFailed.value && plans.value.length === 0,
    plansRetrying: plansRetrying.value,
    plansCount: plans.value.length,
    catalogSettled: catalogSettled.value,
    catalogCount: experiencias.value.length,
    myProgressSettled: userStore.myProgressLoaded,
    deadlinePassed: deadline.passed.value,
  }),
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

/**
 * Siempre pide el resumen al server (aunque haya datos en memoria): es lo que el socio espera ver.
 * `retry` = el socio tocó "Reintentar": Tu plan vuelve al esqueleto mientras dura el pedido.
 */
async function loadSummary(retry = false): Promise<void> {
  if (retry) summaryRetrying.value = true
  summaryError.value = false
  try {
    const data = await fetchPlanSummary()
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
    summarySettled.value = true
    summaryRetrying.value = false
  }
}

/** `retry` = el socio tocó "Reintentar": los regulares vuelven al esqueleto mientras dura el pedido. */
async function loadPlans(retry = false): Promise<void> {
  if (retry) plansRetrying.value = true
  try {
    const response = await api.get<{ plans: MemberPlan[] }>('/members/subscription/plans')
    plans.value = response.data.plans
    plansFailed.value = false
  } catch (err: unknown) {
    plansFailed.value = true
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Failed to load plans', { error: message })
  } finally {
    plansSettled.value = true
    plansRetrying.value = false
  }
}

function retryPlans(): void {
  void loadPlans(true)
}

/** Planes por objetivos: si falla, la sección se oculta (no hay nada que reintentar ni afirmar). */
async function loadCatalog(): Promise<void> {
  try {
    experiencias.value = await getCatalog()
  } catch (err: unknown) {
    experiencias.value = []
    const message = err instanceof Error ? err.message : 'Unknown error'
    log.error('Failed to load experiencias', { error: message })
  } finally {
    catalogSettled.value = true
  }
}

onMounted(() => {
  deadline.start()
  // D-04: todo en el mismo tick, sin `await` antes. `ensureMemberState` solo aporta my-progress
  // (para "Ya estás inscripto") y comparte la promesa del boot: no es un pedido propio.
  void Promise.allSettled([
    loadSummary(),
    loadPlans(),
    loadCatalog(),
    userStore.ensureMemberState(),
  ])
})

onBeforeUnmount(() => {
  deadline.cleanup()
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

// Esqueleto del título de bloque: mismo alto de línea que `.planes-title`.
.planes-title-sk {
  height: 16px;
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
