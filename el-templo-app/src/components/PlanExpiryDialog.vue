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
          :label="buttonText"
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
import { useRouter } from 'vue-router'
import { Preferences } from '@capacitor/preferences'
import { useAvisosStore } from 'src/stores/useAvisosStore'
import { createLogger } from 'src/utils/logger'

const log = createLogger('PlanExpiryDialog')
const router = useRouter()
const avisosStore = useAvisosStore()

// Cache local opcional (D-10/D-11): la cadencia REAL la impone el servidor
// (aviso `plan_expiry`, `every_n_days`/1 — daily). Esta key ya no gatea si el
// diálogo se muestra; solo queda como registro local para diagnóstico.
const SHOWN_KEY = 'plan_expiry_shown_v1'

const show = ref(false)

const current = computed(() => {
  const p = avisosStore.prompt
  return p && p.kind === 'plan_expiry' ? p : null
})

const title = computed(() => current.value?.aviso.title ?? 'Tu membresía está por vencer')

const buttonText = computed(() => current.value?.aviso.buttonText ?? 'Renovar por WhatsApp')

// El copy editable del servidor trae el token literal `{dias}` (D-10):
// la app lo sustituye por el `daysRemaining` que el propio endpoint calculó,
// respetando singular/plural y el caso "vence hoy" (n === 0, UI-SPEC).
const body = computed(() => {
  const c = current.value
  if (!c) return ''
  const n = c.daysRemaining
  if (n === 0) {
    return 'Tu membresía vence hoy. Renovala por WhatsApp para seguir entrenando.'
  }
  const dayWord = n === 1 ? '1 día' : `${n} días`
  return c.aviso.body.replace('{dias}', dayWord)
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

// El servidor ya decidió que hoy toca el vencimiento (D-06/D-07/D-10): esta
// vista solo reacciona al getter del store, sin re-implementar la regla de
// disparo (≤3 días, supresión por cobertura, fase 144).
watch(
  () => avisosStore.isPlanExpiry,
  (isPlanExpiry) => {
    if (isPlanExpiry) show.value = true
  },
  { immediate: true },
)

async function onRenew(): Promise<void> {
  const c = current.value
  if (!c) return
  log.info('Plan expiry → renewal')
  void avisosStore.reportClicked(c.aviso.id)
  await recordShownToday()
  show.value = false

  // El botón usa el destino del aviso (WhatsApp de ventas por defecto, D-20).
  const destination = c.aviso.destination
  if (destination.type === 'whatsapp_sales') {
    const text = destination.whatsappText ?? ''
    void router.push(`${destination.route}?text=${encodeURIComponent(text)}`)
  } else {
    void router.push(destination.route)
  }
}

async function onSkip(): Promise<void> {
  log.info('Plan expiry skipped')
  const c = current.value
  if (c) void avisosStore.reportDismissed(c.aviso.id)
  await recordShownToday()
  show.value = false
}
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
