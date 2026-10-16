<!-- Tarjeta "Presencial" de "Para vos" (solo sedes virtuales; rediseño 199 D-10). Copy editable
     (`card_upsell`), clics y destino sin cambios; solo el render pasa a ForYouCard. -->
<template>
  <ForYouCard
    kicker="Presencial"
    :title="title"
    :body="subtitle"
    :action-label="buttonText"
    @action="openWhatsApp"
  />
</template>

<script setup lang="ts">
import ForYouCard from './ForYouCard.vue'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from 'src/stores/useUserStore'
import { useAvisosStore } from 'src/stores/useAvisosStore'
import { buildWhatsAppUrl } from 'src/utils/whatsapp'
import { navigateToAvisoDestination } from 'src/utils/aviso-navigation'

// D-15a: copy editable vía el aviso de sistema `card_upsell`, con fallback
// al literal de hoy. La visibilidad (solo sedes virtuales) NO se toca acá,
// sigue en MiTemplo.vue (`showUpsellBadge`).
const FALLBACK_TITLE = 'Llevalo al siguiente nivel'
const FALLBACK_SUBTITLE = 'Visitá nuestras sedes y entrená junto a nuestros entrenadores'
const FALLBACK_BUTTON_TEXT = 'Más info'
const FALLBACK_WHATSAPP_TEXT = 'Hola, me interesa entrenar de forma presencial'

const router = useRouter()
const userStore = useUserStore()
const avisosStore = useAvisosStore()

const cardRow = computed(() => avisosStore.tarjetaByCode('card_upsell'))
const title = computed(() => cardRow.value?.title ?? FALLBACK_TITLE)
const subtitle = computed(() => cardRow.value?.body ?? FALLBACK_SUBTITLE)
const buttonText = computed(() => cardRow.value?.buttonText ?? FALLBACK_BUTTON_TEXT)

function openWhatsApp(): void {
  const row = cardRow.value
  if (row) {
    void avisosStore.reportClicked(row.id)
    navigateToAvisoDestination(router, row.destination)
    return
  }
  window.open(buildWhatsAppUrl(userStore.profile?.branchCountry, FALLBACK_WHATSAPP_TEXT), '_blank')
}
</script>
