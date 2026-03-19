<template>
  <q-page padding>
    <div class="text-h5 text-weight-bold q-mb-lg">Planes</div>

    <!-- Loading state -->
    <q-inner-loading :showing="loading">
      <q-spinner-dots size="40px" color="primary" />
    </q-inner-loading>

    <!-- Empty state -->
    <div v-if="!loading && plans.length === 0" class="text-center text-grey-6 q-pa-xl">
      No hay planes disponibles
    </div>

    <!-- Gym Plans Section -->
    <div v-if="gymPlans.length > 0">
      <div class="text-h6 q-mb-md">Planes de Gimnasio</div>
      <div class="row q-col-gutter-md">
        <div v-for="plan in gymPlans" :key="plan.id" class="col-12 col-sm-6">
          <q-card class="full-height">
            <q-card-section>
              <div class="row items-center justify-between q-mb-sm">
                <div class="text-subtitle1 text-weight-bold">
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

    <!-- Personalizada Plans Section -->
    <div v-if="personalizadaPlans.length > 0" class="q-mt-lg">
      <div class="text-h6 q-mb-md">Clases Personalizadas</div>
      <div class="row q-col-gutter-md">
        <div v-for="plan in personalizadaPlans" :key="plan.id" class="col-12 col-sm-6">
          <q-card class="full-height">
            <q-card-section>
              <div class="text-subtitle1 text-weight-bold q-mb-sm">
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
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from 'src/boot/axios'
import { useUserStore } from 'src/stores/useUserStore'
import { createLogger } from 'src/utils/logger'

const log = createLogger('PlanesPage')

interface MemberPlan {
  id: number
  name: string
  description: string | null
  planTier: string
  durationDays: number
  classesPerWeek: number | null
  isPersonalizada: boolean
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

const gymPlans = computed(() => plans.value.filter((p) => !p.isPersonalizada))

const personalizadaPlans = computed(() => plans.value.filter((p) => p.isPersonalizada))

const hasSubscription = computed(() => !!userStore.subscription)

const ctaText = computed(() =>
  hasSubscription.value ? 'Contacta para cambiar de plan' : 'Contacta para elegir tu plan',
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
})
</script>
