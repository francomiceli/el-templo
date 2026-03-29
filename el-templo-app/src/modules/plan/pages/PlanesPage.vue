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
    <div v-if="currentPlan" class="q-mb-lg">
      <p class="planes-section-title">Tu plan actual</p>
      <q-card flat bordered class="current-plan-card">
        <q-card-section>
          <div class="row items-center justify-between q-mb-xs">
            <div class="planes-card-name">{{ currentPlan.name }}</div>
            <q-badge
              :color="tierColor(currentPlan.planTier)"
              :label="tierLabel(currentPlan.planTier)"
            />
          </div>
          <div class="text-positive text-caption">
            <q-icon name="check_circle" size="16px" class="q-mr-xs" />
            Activo — vence {{ formatEndDate() }}
          </div>
          <div v-if="currentPlan.classesPerWeek" class="q-mt-sm">
            <q-badge outline color="grey-7">{{ currentPlan.classesPerWeek }} clases/semana</q-badge>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <!-- Planes Personalizados Section (per D-18) — shown first -->
    <div v-if="experiencias.length > 0">
      <p class="planes-section-title">Planes Personalizados</p>
      <div class="text-body2 text-grey-7 q-mb-md">
        Planes diseñados a tu medida para potenciar tu entrenamiento.
      </div>
      <div class="row q-col-gutter-md">
        <div v-for="exp in experiencias" :key="exp.id" class="col-12 col-sm-6">
          <q-card class="full-height">
            <q-card-section>
              <div class="row items-center justify-between q-mb-sm">
                <div class="planes-card-name">
                  {{ exp.name }}
                </div>
                <q-badge color="amber-8" label="PERSONALIZADO" />
              </div>
              <q-badge v-if="!exp.hasContent" color="grey" label="Proximamente" class="q-mb-sm" />
              <div v-if="exp.description" class="text-body2 text-grey-7 q-mb-sm">
                {{ exp.description }}
              </div>
              <div class="q-gutter-xs">
                <q-badge outline color="grey-7">{{ exp.durationWeeks }} semanas</q-badge>
                <q-badge outline color="primary">${{ exp.price.toLocaleString() }}</q-badge>
              </div>
            </q-card-section>
            <q-separator />
            <q-card-actions>
              <div v-if="enrolledProgramId === exp.id" class="text-positive text-caption q-pa-sm">
                <q-icon name="check_circle" size="16px" class="q-mr-xs" />
                Ya estas inscripto
              </div>
              <q-btn
                v-else
                flat
                no-caps
                color="positive"
                label="Más info"
                @click="openExperienciaWhatsApp(exp)"
              >
                <template #prepend>
                  <q-icon name="img:/icons/whatsapp.svg" size="20px" />
                </template>
              </q-btn>
            </q-card-actions>
          </q-card>
        </div>
      </div>
    </div>

    <!-- Planes Regulares -->
    <div v-if="plans.length > 0" :class="experiencias.length > 0 ? 'q-mt-lg' : ''">
      <p class="planes-section-title">Planes Regulares</p>

      <!-- Presencial Plans -->
      <div v-if="presencialPlans.length > 0">
        <div class="row q-col-gutter-md">
          <div v-for="plan in presencialPlans" :key="plan.id" class="col-12 col-sm-6">
            <q-card class="full-height">
              <q-card-section>
                <div class="row items-center justify-between q-mb-sm">
                  <div class="planes-card-name">
                    {{ plan.name }}
                  </div>
                  <q-badge :color="tierColor(plan.planTier)" :label="tierLabel(plan.planTier)" />
                </div>
                <q-badge
                  v-if="isCurrentPlan(plan)"
                  color="primary"
                  label="Tu plan actual"
                  class="q-mb-sm"
                />
                <div class="q-mt-sm q-gutter-xs">
                  <q-badge v-if="plan.durationDays" outline color="grey-7">
                    {{ plan.durationDays }} dias
                  </q-badge>
                  <q-badge v-if="plan.classesPerWeek" outline color="grey-7">
                    {{ plan.classesPerWeek }} clases/semana
                  </q-badge>
                </div>
                <div v-if="plan.description" class="text-body2 text-grey-7 q-mt-sm">
                  {{ plan.description }}
                </div>
              </q-card-section>
              <q-separator />
              <q-card-actions>
                <div v-if="isCurrentPlan(plan)" class="text-positive text-caption q-pa-sm">
                  <q-icon name="check_circle" size="16px" class="q-mr-xs" />
                  Activo — vence {{ formatEndDate() }}
                </div>
                <q-btn
                  v-else
                  flat
                  no-caps
                  color="positive"
                  icon="chat"
                  :label="ctaText"
                  @click="openWhatsApp(plan)"
                />
              </q-card-actions>
            </q-card>
          </div>
        </div>
      </div>

      <!-- Online Plans -->
      <div v-if="onlinePlans.length > 0" class="q-mt-md">
        <div class="row q-col-gutter-md">
          <div v-for="plan in onlinePlans" :key="plan.id" class="col-12 col-sm-6">
            <q-card class="full-height">
              <q-card-section>
                <div class="row items-center justify-between q-mb-sm">
                  <div class="planes-card-name">
                    {{ plan.name }}
                  </div>
                  <q-badge :color="tierColor(plan.planTier)" :label="tierLabel(plan.planTier)" />
                </div>
                <q-badge
                  v-if="isCurrentPlan(plan)"
                  color="primary"
                  label="Tu plan actual"
                  class="q-mb-sm"
                />
                <div class="q-mt-sm q-gutter-xs">
                  <q-badge v-if="plan.durationDays" outline color="grey-7">
                    {{ plan.durationDays }} dias
                  </q-badge>
                  <q-badge v-if="plan.classesPerWeek" outline color="grey-7">
                    {{ plan.classesPerWeek }} clases/semana
                  </q-badge>
                </div>
                <div v-if="plan.description" class="text-body2 text-grey-7 q-mt-sm">
                  {{ plan.description }}
                </div>
              </q-card-section>
              <q-separator />
              <q-card-actions>
                <div v-if="isCurrentPlan(plan)" class="text-positive text-caption q-pa-sm">
                  <q-icon name="check_circle" size="16px" class="q-mr-xs" />
                  Activo — vence {{ formatEndDate() }}
                </div>
                <q-btn
                  v-else
                  flat
                  no-caps
                  color="positive"
                  icon="chat"
                  :label="ctaText"
                  @click="openWhatsApp(plan)"
                />
              </q-card-actions>
            </q-card>
          </div>
        </div>
      </div>

      <!-- Personalizada Plans -->
      <div v-if="personalizadaPlans.length > 0" class="q-mt-md">
        <div class="row q-col-gutter-md">
          <div v-for="plan in personalizadaPlans" :key="plan.id" class="col-12 col-sm-6">
            <q-card class="full-height">
              <q-card-section>
                <div class="planes-card-name q-mb-sm">
                  {{ plan.name }}
                </div>
                <q-badge
                  v-if="isCurrentPlan(plan)"
                  color="primary"
                  label="Tu plan actual"
                  class="q-mb-sm"
                />
                <div v-if="plan.description" class="text-body2 text-grey-7">
                  {{ plan.description }}
                </div>
                <div v-if="plan.durationDays" class="q-mt-sm">
                  <q-badge outline color="grey-7"> {{ plan.durationDays }} dias </q-badge>
                </div>
                <div v-if="plan.personalizadaZones?.length" class="q-mt-sm">
                  <div class="text-caption text-grey-6">Zonas</div>
                  <div class="q-gutter-xs q-mt-xs">
                    <q-badge
                      v-for="zone in plan.personalizadaZones"
                      :key="zone"
                      outline
                      color="primary"
                      :label="zone"
                    />
                  </div>
                </div>
              </q-card-section>
              <q-separator />
              <q-card-actions>
                <div v-if="isCurrentPlan(plan)" class="text-positive text-caption q-pa-sm">
                  <q-icon name="check_circle" size="16px" class="q-mr-xs" />
                  Activo — vence {{ formatEndDate() }}
                </div>
                <q-btn
                  v-else
                  flat
                  no-caps
                  color="positive"
                  icon="chat"
                  :label="ctaText"
                  @click="openWhatsApp(plan)"
                />
              </q-card-actions>
            </q-card>
          </div>
        </div>
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
  isPersonalizada: boolean
  isOnline: boolean
  personalizadaType: string | null
  personalizadaZones: string[] | null
}

const PLAN_TIER_LABELS: Record<string, string> = {
  flex: 'Flex',
  foundation: 'Foundation',
  performance: 'Performance',
  other: 'Otro',
}

const TIER_COLORS: Record<string, string> = {
  flex: 'blue',
  foundation: 'teal',
  performance: 'deep-purple',
  other: 'grey',
}

const WHATSAPP_NUMBER = '5492235820521'

const userStore = useUserStore()
const plans = ref<MemberPlan[]>([])
const loading = ref(false)

const { getCatalog, getMyProgress } = useProgramsApi()
const experiencias = ref<MemberProgramCatalogItem[]>([])
const enrolledProgramId = ref<number | null>(null)

const presencialPlans = computed(() => plans.value.filter((p) => !p.isPersonalizada && !p.isOnline))

const onlinePlans = computed(() => plans.value.filter((p) => p.isOnline && !p.isPersonalizada))

const personalizadaPlans = computed(() => plans.value.filter((p) => p.isPersonalizada))

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

function tierColor(tier: string): string {
  return TIER_COLORS[tier] ?? 'grey'
}

function openWhatsApp(plan: MemberPlan): void {
  const message = `Hola, me interesa el plan ${plan.name}`
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
  window.open(url, '_blank')
}

function openExperienciaWhatsApp(exp: MemberProgramCatalogItem) {
  const message = `Hola, me interesa el plan personalizado "${exp.name}"`
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
  window.open(url, '_blank')
}

onMounted(async () => {
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

  // Fetch Planes Personalizados catalog
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
    /* ignore — non-critical for catalog display */
  }
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.planes-card-name {
  font-family: 'Montserrat', sans-serif;
  font-size: 15px;
  font-weight: 700;
  color: $primary;
}

.planes-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
}

.planes-section-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 14px;
  font-weight: 600;
  color: rgba($primary, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 4px 0 12px;
  padding: 4px 0 0 4px;
}

.current-plan-card {
  border-color: rgba($primary, 0.2);
  border-left: 4px solid $primary;
  border-radius: 12px;
}
</style>
