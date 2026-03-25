<template>
  <q-card class="program-cta-card">
    <q-card-section>
      <div class="row items-center q-mb-sm">
        <q-icon name="auto_awesome" color="primary" size="24px" class="q-mr-sm" />
        <div class="text-subtitle1 text-weight-bold">Experiencias a Medida</div>
      </div>
      <div class="text-body2 text-grey-7">{{ ctaMessage }}</div>
    </q-card-section>
    <q-card-actions>
      <q-btn flat no-caps color="positive" icon="chat" label="Mas info" @click="openWhatsApp" />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUserStore, type MemberSegment } from 'src/stores/useUserStore'

const props = defineProps<{
  segment: MemberSegment | null
}>()

const userStore = useUserStore()

const WHATSAPP_NUMBER = '5492235820521'

const SEGMENT_CTA_MESSAGES: Record<string, string> = {
  espartano: 'Potencia tu entrenamiento con un plan a medida',
  intermitente: 'Entrena con un plan disenado para vos',
  en_riesgo: 'Retoma con un plan personalizado',
  nuevo_guerrero: 'Acelera tu progreso con un plan a medida',
  digital_warrior: 'Tu proximo paso: un plan personalizado',
  ghost: 'Volve con un plan disenado para vos',
}

const ctaMessage = computed(() => {
  if (props.segment && SEGMENT_CTA_MESSAGES[props.segment]) {
    return SEGMENT_CTA_MESSAGES[props.segment]
  }
  return 'Descubri nuestros planes personalizados'
})

function openWhatsApp() {
  const memberId = userStore.profile?.id ?? ''
  const seg = userStore.segment ?? ''
  const deepMessage = `Hola, me interesa una Experiencia a Medida [ref:${memberId}|${seg}|tu_dia_cta]`
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(deepMessage)}`
  window.open(url, '_blank')
}
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.program-cta-card {
  border-left: 4px solid $primary;
  background: rgba($primary, 0.04);
}
</style>
