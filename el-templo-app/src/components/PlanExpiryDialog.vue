<template>
  <!-- D-07: salteable → el q-dialog NO usa el modo bloqueante. -->
  <q-dialog v-model="show">
    <PremiumDialogCard kicker="Tu membresía" icon="event_busy">
      <h3 class="pd-title">{{ title }}</h3>
      <p class="pd-text">{{ body }}</p>

      <div class="pd-acts">
        <q-btn unelevated no-caps class="pd-cta" :label="buttonText" @click="onRenew" />
        <q-btn flat no-caps dense class="pd-skip" label="Ahora no" @click="onSkip" />
      </div>
    </PremiumDialogCard>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Preferences } from '@capacitor/preferences'
import { useAvisosStore } from 'src/stores/useAvisosStore'
import { createLogger } from 'src/utils/logger'
import PremiumDialogCard from 'src/components/PremiumDialogCard.vue'

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
