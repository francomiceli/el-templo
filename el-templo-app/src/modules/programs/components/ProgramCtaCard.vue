<!-- Tarjeta "Planes personalizados" de "Para vos" (rediseño 199 D-10). Copy editable
     (`card_program`), clics y destino sin cambios; solo el render pasa a ForYouCard.
     Los saltos de línea del fallback se aplanan a espacio. -->
<template>
  <ForYouCard
    kicker="Planes personalizados"
    :title="title.replace(/\n/g, ' ')"
    :body="subtitle"
    :action-label="buttonText"
    @action="openWhatsApp"
  />
</template>

<script setup lang="ts">
import ForYouCard from 'src/modules/progression/components/ForYouCard.vue'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from 'src/stores/useUserStore'
import type { MemberSegment } from 'src/stores/useUserStore'
import { useAvisosStore } from 'src/stores/useAvisosStore'
import { buildWhatsAppUrl } from 'src/utils/whatsapp'
import { navigateToAvisoDestination } from 'src/utils/aviso-navigation'

defineProps<{
  segment: MemberSegment | null
}>()

// D-15a: copy editable vía el aviso de sistema `card_program`, con fallback
// al literal de hoy. La visibilidad (solo cuando no corresponde
// ProgramProgressCard) NO se toca acá, sigue en MiTemplo.vue
// (`showProgramCta`/`showProgramProgress`).
const FALLBACK_TITLE = 'Entrená con un plan\ndiseñado para vos'
const FALLBACK_SUBTITLE =
  'Creamos programas enfocados en tus objetivos, con seguimiento personalizado'
const FALLBACK_BUTTON_TEXT = 'Mi Plan'
const FALLBACK_WHATSAPP_TEXT = 'Hola! Quiero saber más sobre mi plan personalizado 💪'

const router = useRouter()
const userStore = useUserStore()
const avisosStore = useAvisosStore()

const cardRow = computed(() => avisosStore.tarjetaByCode('card_program'))
const title = computed(() => cardRow.value?.title ?? FALLBACK_TITLE)
const subtitle = computed(() => cardRow.value?.body ?? FALLBACK_SUBTITLE)
const buttonText = computed(() => cardRow.value?.buttonText ?? FALLBACK_BUTTON_TEXT)

function openWhatsApp() {
  const row = cardRow.value
  if (row) {
    void avisosStore.reportClicked(row.id)
    navigateToAvisoDestination(router, row.destination)
    return
  }
  const url = buildWhatsAppUrl(userStore.profile?.branchCountry, FALLBACK_WHATSAPP_TEXT)
  window.open(url, '_blank')
}
</script>
