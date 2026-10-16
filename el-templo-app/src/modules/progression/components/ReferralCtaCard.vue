<!-- Tarjeta de invitaciones de "Para vos" (fase 158, rebrand 194, rediseño 199 D-10). Copy editable
     (`card_referral`), clics y destino sin cambios; solo el render pasa a ForYouCard. -->
<template>
  <ForYouCard
    kicker="Invitaciones"
    :title="title"
    :body="subtitle"
    :action-label="buttonText"
    @action="goToInvitaciones"
  />
</template>

<script setup lang="ts">
import ForYouCard from './ForYouCard.vue'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { api } from 'src/boot/axios'
import { useAvisosStore } from 'src/stores/useAvisosStore'
import { navigateToAvisoDestination } from 'src/utils/aviso-navigation'
import { createLogger } from 'src/utils/logger'

const log = createLogger('ReferralCtaCard')
const router = useRouter()
const avisosStore = useAvisosStore()

// D-15: el test A/B de copy por paridad de user.id (v5.5) se retira acá —
// el título pasa a ser el copy editable del aviso de sistema
// `card_referral`. Fallback = la variante A (el seed de `system-avisos.ts`
// fija esa variante como copy base). El subtítulo nunca varió entre A/B.
// El helper de la app `utils/ab-variant.ts` se borró (retiro confirmado en
// el UAT de la 193, 2026-09-03); el backend sigue calculando variantes para
// el registro/atribución de clics de referidos, que este componente NO toca.
const FALLBACK_TITLE = 'Vos decidís cuánto bajás tu cuota'
// Igual al copy sembrado por la migración 0261 (aviso `card_referral`).
const FALLBACK_SUBTITLE = 'Invitá a entrenar: cada persona que invites y se sume baja tu cuota.'
const FALLBACK_BUTTON_TEXT = 'Invitar a alguien'

const cardRow = computed(() => avisosStore.tarjetaByCode('card_referral'))
const title = computed(() => cardRow.value?.title ?? FALLBACK_TITLE)
const subtitle = computed(() => cardRow.value?.body ?? FALLBACK_SUBTITLE)
const buttonText = computed(() => cardRow.value?.buttonText ?? FALLBACK_BUTTON_TEXT)

function goToInvitaciones(): void {
  // Atribución/registro de clics de referidos: NO se toca (endpoint y
  // regla propios, ajenos a D-15/D-19).
  void api.post('/members/referrals/cta-click').catch((err: unknown) => {
    log.warn('Referral CTA click tracking failed', {
      error: err instanceof Error ? err.message : String(err),
    })
  })

  // D-19: la tarjeta mide su propio clic (aparte del tracking de arriba)
  // cuando el aviso de sistema existe, y navega al destino del servidor.
  const row = cardRow.value
  if (row) {
    void avisosStore.reportClicked(row.id)
    navigateToAvisoDestination(router, row.destination)
    return
  }
  void router.push('/mis-invitados')
}
</script>
