<!-- Tarjeta genérica de "Para vos" para los avisos libres del admin (D-15b, rediseño 199 D-10).
     Kicker "Aviso"; el clic sigue reportando `clicked` y navegando igual (L43). -->
<template>
  <ForYouCard
    kicker="Aviso"
    :title="title"
    :body="body"
    :action-label="buttonText"
    @action="onClick"
  />
</template>

<script setup lang="ts">
import ForYouCard from './ForYouCard.vue'
import { useRouter } from 'vue-router'
import { useAvisosStore, type PromptDestination } from 'src/stores/useAvisosStore'
import { navigateToAvisoDestination } from 'src/utils/aviso-navigation'

const props = defineProps<{
  avisoId: number
  title: string
  body: string
  buttonText: string
  destination: PromptDestination
}>()

const router = useRouter()
const avisosStore = useAvisosStore()

// D-19: las tarjetas miden solo clics — se reporta el evento y recién
// después se navega (fire-and-forget, no bloquea el click del socio).
function onClick(): void {
  void avisosStore.reportClicked(props.avisoId)
  navigateToAvisoDestination(router, props.destination)
}
</script>
