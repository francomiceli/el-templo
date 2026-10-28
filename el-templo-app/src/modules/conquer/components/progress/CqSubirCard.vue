<template>
  <div class="cq-card cq-subir">
    <div class="cq-subir__head cq-dark">
      <p class="cq-kicker">Hoy toca subir</p>
      <h3 class="cq-subir__title">{{ title }}</h3>
    </div>

    <div class="cq-subir__rows">
      <div
        v-for="item in steps"
        :key="subirStepKey(item.exerciseId, item.step)"
        class="cq-subir__row"
      >
        <div class="cq-subir__text">
          <b>{{ item.exerciseName }}</b> · {{ stepLabel(item.step) }}
          <p class="cq-sub">{{ rungText(item.fromRungName, item.toRungName) }}</p>
        </div>
        <CqButton
          v-if="item.toRungName"
          class="cq-subir__btn"
          label="Subir"
          variant="subir"
          small
          :disabled="busyKey !== null"
          :loading="busyKey === subirStepKey(item.exerciseId, item.step)"
          @click="emit('subir', item.exerciseId, item.step)"
        />
      </div>

      <div v-for="item in combos" :key="subirComboKey(item.comboKey)" class="cq-subir__row">
        <div class="cq-subir__text">
          <b>Combo {{ item.label }}</b>
          <p class="cq-sub">{{ rungText(item.fromRungName, item.toRungName) }}</p>
        </div>
        <CqButton
          v-if="item.toRungName"
          class="cq-subir__btn"
          label="Subir"
          variant="subir"
          small
          :disabled="busyKey !== null"
          :loading="busyKey === subirComboKey(item.comboKey)"
          @click="emit('subir-combo', item.comboKey)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { subirComboKey, subirStepKey } from '../../utils/progressView'
import type { ComboKey, ComboSubirItem, CountedStep, SubirItem } from '../../types'
import CqButton from '../brand/CqButton.vue'

// Fase 201 §4.5, §7.1 Progreso, S12-5, DA-35: card "Hoy toca subir". Una fila por escalón (y por
// combo de Toro) que el motor marcó como listo, con "de → a" y el botón Subir, sin aprobación del
// coach. Si `toRungName` es null el alumno ya está en el tope de la escalera: sin botón y con el
// aviso (el coach ya recibió la alerta). El botón activo muestra el spinner (`busyKey`) y todos se
// bloquean mientras una acción está en curso (T-201-62: un doble toque no sube dos veces). La
// cabecera es la pieza oscura de la pantalla (sketch 022 B) y Subir es el único verde.
const props = defineProps<{
  steps: SubirItem[]
  combos: ComboSubirItem[]
  /** Clave de la acción en curso (`subirStepKey` / `subirComboKey`), o null. */
  busyKey: string | null
}>()

const emit = defineEmits<{
  subir: [exerciseId: number, step: CountedStep]
  'subir-combo': [comboKey: ComboKey]
}>()

const title = computed(() => {
  const total = props.steps.length + props.combos.length
  if (total > 1) return `${total} listos para subir`
  return props.steps.length === 1 ? 'Un escalón listo' : 'Un combo listo'
})

const TOP_TEXT = 'Llegaste al tope de la escalera: tu coach ya está avisado'

function stepLabel(step: CountedStep): string {
  return `E${step.slice(1)}`
}

function rungText(from: string, to: string | null): string {
  return to === null ? TOP_TEXT : `${from} → ${to}`
}
</script>

<style scoped lang="scss">
.cq-subir {
  // `.cq-card` pone gap 12: con dos clases en el mismo elemento le gana (con una sola empatan)
  &.cq-card {
    gap: 0;
  }

  // Cabecera oscura pegada arriba de la card (como las de Hoy): se come el padding de 16 px y le
  // saca la sombra y el borde de la pieza oscura suelta
  &__head.cq-dark {
    margin: -16px -16px 0;
    padding: 14px 16px;
    border: 0;
    border-radius: 16px 16px 0 0;
    box-shadow: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__title {
    margin: 0;
    font-family: var(--cq-font-head);
    font-size: 17px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: normal;
    color: var(--cq-on-night);
  }

  &__rows {
    display: flex;
    flex-direction: column;
    padding-top: 4px;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;

    & + & {
      border-top: 1px solid var(--cq-line);
    }
  }

  &__text {
    flex: 1;
    min-width: 0;
    font-size: 14.5px;
    color: var(--cq-text);

    b {
      font-weight: 600;
    }

    .cq-sub {
      margin-top: 2px;
    }
  }

  &__btn {
    flex: none;
    min-width: 88px;
  }
}
</style>
