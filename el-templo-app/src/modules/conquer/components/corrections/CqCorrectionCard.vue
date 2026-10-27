<template>
  <button
    type="button"
    class="cq-card cq-ccard"
    data-test="conquer-correction-card"
    @click="emit('open')"
  >
    <span class="cq-ccard__top">
      <span class="cq-ccard__name">{{ item.targetLabel }}</span>
      <span class="cq-chip" :class="CHIP_CLASS[chip.tone]">{{ chip.label }}</span>
    </span>
    <span class="cq-sub">{{ meta }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import '../../styles/conquer.scss'
import { correctionChip, localDayOf } from '../../utils/corrections'
import type { CorrectionChipTone } from '../../utils/corrections'
import { shortDate } from '../../utils/format'
import { formatSeconds } from '../../utils/videoFile'
import type { CorrectionView } from '../../types'

// Fase 202 D-26, DA-47: una corrección del alumno en la lista. Toda la card es el botón que abre el
// detalle. El rótulo ("Esperando respuesta", "Nueva respuesta", "Respondida") lo decide `correctionChip`.
const props = defineProps<{ item: CorrectionView }>()

const emit = defineEmits<{ open: [] }>()

const CHIP_CLASS: Record<CorrectionChipTone, string> = {
  espera: 'cq-chip--rango',
  nueva: 'cq-chip--nueva',
  hecha: 'cq-chip--hecha',
}

const chip = computed(() => correctionChip(props.item))

// Fecha corta del día local en que lo mandó y duración del video
const meta = computed(() => {
  const day = localDayOf(props.item.createdAt)
  const duration = formatSeconds(props.item.durationSec)
  return day ? `${shortDate(day)} · ${duration}` : duration
})
</script>

<style scoped lang="scss">
// Botón que parece card: sin los estilos nativos del botón, con la tipografía de Conquer. Dos clases
// en el mismo elemento le ganan al `gap` de `.cq-card`
.cq-card.cq-ccard {
  width: 100%;
  min-height: 44px;
  gap: 6px;
  text-align: left;
  font: inherit;
  color: var(--cq-text);
  cursor: pointer;
}

.cq-ccard__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.cq-ccard__name {
  min-width: 0;
  overflow-wrap: anywhere;
  font-weight: 500;
  font-size: 15px;
}
</style>
