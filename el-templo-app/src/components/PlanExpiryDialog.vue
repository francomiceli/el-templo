<template>
  <!-- D-07: salteable → el q-dialog NO usa el modo bloqueante. -->
  <q-dialog v-model="show">
    <q-card class="plan-expiry-dialog">
      <q-card-section class="plan-expiry-dialog__body">
        <q-icon name="event_busy" class="plan-expiry-dialog__icon" size="40px" />

        <h3 class="plan-expiry-dialog__title">{{ title }}</h3>

        <p class="plan-expiry-dialog__text">{{ body }}</p>
      </q-card-section>

      <q-card-actions class="plan-expiry-dialog__actions">
        <q-btn
          unelevated
          no-caps
          class="plan-expiry-dialog__primary full-width"
          label="Renovar por WhatsApp"
          @click="onRenew"
        />
        <q-btn
          flat
          no-caps
          dense
          class="plan-expiry-dialog__secondary"
          label="Ahora no"
          @click="onSkip"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { api } from 'src/boot/axios'
import { useAuthStore } from 'stores/useAuthStore'
import { useUserStore } from 'stores/useUserStore'
import { buildWhatsAppUrl } from 'src/utils/whatsapp'
import { createLogger } from 'src/utils/logger'

const log = createLogger('PlanExpiryDialog')
const authStore = useAuthStore()
const userStore = useUserStore()

// Once-per-DAY (D-08, distinto del once-ever de RatingPromptDialog): guardamos
// la fecha local "YYYY-MM-DD" de la última vez que se mostró. Reaparece a lo
// sumo una vez por día calendario hasta que la cobertura se extienda.
const SHOWN_KEY = 'plan_expiry_shown_v1'
const WHATSAPP_TEXT = 'Hola, quiero renovar mi membresía 💪'

interface CoverageResponse {
  coveredUntil: string | null
  daysRemaining: number | null
}

const show = ref(false)
const daysRemaining = ref(0)

const title = 'Tu membresía está por vencer'

// Copy de UI-SPEC §97-98: variante "vence hoy" (N=0) y singular "1 día" (N=1).
const body = computed(() => {
  const n = daysRemaining.value
  if (n === 0) {
    return 'Tu membresía vence hoy. Renovala por WhatsApp para seguir entrenando.'
  }
  const dayWord = n === 1 ? '1 día' : `${n} días`
  const verb = n === 1 ? 'Te queda' : 'Te quedan'
  return `${verb} ${dayWord} de acceso. Renovala por WhatsApp para no perder tu lugar en las clases.`
})

/** Fecha local del dispositivo como "YYYY-MM-DD" (día calendario local). */
function todayLocalStr(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function recordShownToday(): Promise<void> {
  await Preferences.set({ key: SHOWN_KEY, value: todayLocalStr() })
}

async function shouldShow(): Promise<boolean> {
  if (!authStore.isAuthenticated) return false

  // Ya mostrado hoy en este dispositivo → no re-pedir (evita el fetch).
  const { value: shown } = await Preferences.get({ key: SHOWN_KEY })
  if (shown === todayLocalStr()) return false

  const { data } = await api.get<CoverageResponse>('/members/subscription/coverage')
  const days = data.daysRemaining

  // Gate (D-06/D-10): autenticado AND 0 ≤ daysRemaining ≤ 3 AND no mostrado hoy.
  // El límite inferior >= 0 es OBLIGATORIO: /coverage NO dispara el barrido
  // autoExpireSubscriptions, así que un socio vencido-pero-no-barrido puede
  // devolver daysRemaining negativo, para el cual UI-SPEC no define copy (esos
  // casos los cubren el push del día y el bloqueo de reserva, no este diálogo).
  if (days === null || days < 0 || days > 3) return false

  daysRemaining.value = days
  return true
}

async function evaluate(): Promise<void> {
  try {
    if (await shouldShow()) {
      show.value = true
    }
  } catch (err: unknown) {
    log.error('Failed to evaluate plan expiry', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

async function onRenew(): Promise<void> {
  log.info('Plan expiry → WhatsApp renewal')
  window.open(buildWhatsAppUrl(userStore.profile?.branchCountry, WHATSAPP_TEXT), '_blank')
  await recordShownToday()
  show.value = false
}

async function onSkip(): Promise<void> {
  log.info('Plan expiry skipped')
  await recordShownToday()
  show.value = false
}

// Dispara al login / al volver a la app ya autenticado (igual que los hermanos).
watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) void evaluate()
  },
  { immediate: true },
)
</script>

<style lang="scss" scoped>
@import 'src/css/brand';

$terracotta: $brand-terracotta;
$cream: #f2ede5;
$charcoal: #2e2a26;

// Estilos copiados de RatingPromptDialog.vue (mandato de reuse de UI-SPEC):
// card charcoal #2e2a26, gradiente terracotta, secundario flat cream-55,
// max-width 340px, border-radius 16px. NO re-estilizar.
.plan-expiry-dialog {
  width: 100%;
  max-width: 340px;
  background: $charcoal;
  color: $cream;
  border-radius: 16px;
  border-top: 2px solid rgba($terracotta, 0.6);
  padding: 8px 4px 16px;
}

.plan-expiry-dialog__body {
  text-align: center;
  padding-top: 16px;
}

.plan-expiry-dialog__icon {
  color: $terracotta;
  margin-bottom: 8px;
}

.plan-expiry-dialog__title {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.125rem;
  letter-spacing: 0.04em;
  margin: 0 0 16px 0;
  color: $cream;
}

.plan-expiry-dialog__text {
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: rgba($cream, 0.85);
  margin: 0;
}

.plan-expiry-dialog__actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 20px 4px;
}

.plan-expiry-dialog__primary {
  background: linear-gradient(135deg, $terracotta 0%, #ad6540 100%) !important;
  color: $cream !important;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 0.9375rem;
  letter-spacing: 0.12em;
  padding: 12px 0;
  border-radius: 8px;
}

.plan-expiry-dialog__secondary {
  color: rgba($cream, 0.55) !important;
  font-family: 'Geologica', sans-serif;
  font-weight: 400;
  font-size: 0.8125rem;
  margin-top: 4px;
}
</style>
