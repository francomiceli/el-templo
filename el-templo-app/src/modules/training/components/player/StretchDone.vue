<template>
  <!-- Fase 213-10 (D-07): pantalla final del estiramiento. Corta: "Listo. X minutos de
       estiramiento", una frase y vuelta a Mi Templo; sin puntaje, sin notas y sin resumen.
       T-213-31: el "+5 AURA" sale SOLO de `auraAwarded`, que viene de la respuesta del servidor. -->
  <CelebrationFrame
    kicker="Estiramiento"
    title="Listo."
    cta-label="Volver a Mi Templo"
    @cta="emit('done')"
  >
    <p class="sd-minutes">{{ minutesLabel }}</p>

    <div v-if="auraAwarded" class="sd-aura">
      <span class="sd-aura__amount">+5</span>
      <span class="sd-aura__label">AURA</span>
    </div>

    <p class="sd-phrase">{{ phrase }}</p>
  </CelebrationFrame>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import CelebrationFrame from './CelebrationFrame.vue'
import { stretchClosingPhrase, stretchMinutesLabel } from '../../utils/stretchSession'

interface Props {
  /** Minutos de la RESPUESTA del servidor */
  minutes: number
  /** true solo si el servidor acreditó los +5 AURA */
  auraAwarded: boolean
  /** Día local de la oferta (YYYY-MM-DD): elige la frase de cierre */
  localDate: string
}

interface Emits {
  (e: 'done'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const minutesLabel = computed(() => stretchMinutesLabel(props.minutes))
const phrase = computed(() => stretchClosingPhrase(props.localDate))
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.sd-minutes {
  margin: 0;
  font-family: 'Montserrat', sans-serif;
  font-size: 17px;
  font-weight: 600;
  color: $pd-cream;
}

// "+5 AURA": el único dorado de la pantalla (D-18)
.sd-aura {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.sd-aura__amount {
  font-family: 'Montserrat', sans-serif;
  font-weight: 800;
  font-size: 40px;
  line-height: 1;
  color: $pd-gold;
  text-shadow: 0 0 28px rgba(212, 180, 106, 0.35);
}

.sd-aura__label {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.14em;
  color: $pd-gold;
}

.sd-phrase {
  margin: 0;
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-weight: 500;
  font-size: 17px;
  line-height: 1.4;
  color: $pd-cream-2;
}
</style>
