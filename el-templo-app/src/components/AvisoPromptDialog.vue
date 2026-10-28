<template>
  <!-- D-07: salteable → el q-dialog NO usa el modo bloqueante. -->
  <q-dialog v-model="show" @hide="onHide">
    <PremiumDialogCard kicker="Aviso">
      <h3 class="pd-title">{{ aviso?.title }}</h3>
      <p class="pd-text">{{ aviso?.body }}</p>

      <div class="pd-acts">
        <q-btn unelevated no-caps class="pd-cta" :label="aviso?.buttonText" @click="onAccept" />
        <q-btn flat no-caps dense class="pd-skip" label="Descartar" @click="onSkip" />
      </div>
    </PremiumDialogCard>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAvisosStore } from 'src/stores/useAvisosStore'
import { CONTACT_SALES_ROUTE } from 'src/config/destinations'
import { createLogger } from 'src/utils/logger'
import PremiumDialogCard from 'src/components/PremiumDialogCard.vue'

const log = createLogger('AvisoPromptDialog')
const router = useRouter()
const avisosStore = useAvisosStore()

const show = ref(false)

// Evita reportar 'dismissed' dos veces: onAccept ya reportó 'clicked' y
// marca este flag antes de cerrar, así el @hide del q-dialog (que dispara
// SIEMPRE que se cierra, sea por backdrop, Esc o el botón secundario) no
// suma un 'dismissed' espurio sobre un aviso que el socio sí tocó.
let reported = false

const aviso = computed(() => (avisosStore.isAviso ? (avisosStore.prompt?.aviso ?? null) : null))

watch(
  () => avisosStore.isAviso,
  (isAviso) => {
    if (isAviso) {
      reported = false
      show.value = true
    }
  },
  { immediate: true },
)

function onSkip(): void {
  log.info('Aviso dismissed by user')
  show.value = false
}

// Cubre backdrop / Esc / el botón secundario en un solo lugar (D-11: "cerró"
// se reporta siempre que el aviso se cierra sin que se haya tocado el botón).
function onHide(): void {
  if (reported) return
  reported = true
  const id = aviso.value?.id
  if (id) void avisosStore.reportDismissed(id)
}

function onAccept(): void {
  const current = aviso.value
  if (!current) return

  reported = true
  void avisosStore.reportClicked(current.id)
  show.value = false

  const destination = current.destination
  if (destination.type === 'whatsapp_sales') {
    const text = destination.whatsappText ?? ''
    void router.push(`${CONTACT_SALES_ROUTE}?text=${encodeURIComponent(text)}`)
  } else {
    void router.push(destination.route)
  }
}
</script>

<!-- deploy 2026-09-03: "Descartar" + retiro A/B referidos (el push anterior murió en CI, este fuerza el build de la app) -->
