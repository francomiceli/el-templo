<template>
  <div class="cq-card cq-card--sel cq-subir">
    <div class="cq-caps">Hoy toca subir</div>

    <div
      v-for="item in steps"
      :key="subirStepKey(item.exerciseId, item.step)"
      class="cq-subir__row"
    >
      <div class="cq-subir__text">
        <b>{{ item.exerciseName }}</b> · {{ stepLabel(item.step) }}
        <div class="cq-sub">{{ rungText(item.fromRungName, item.toRungName) }}</div>
      </div>
      <button
        v-if="item.toRungName"
        type="button"
        class="cq-small cq-small--fill cq-subir__btn"
        :disabled="busyKey !== null"
        :aria-busy="busyKey === subirStepKey(item.exerciseId, item.step) ? 'true' : undefined"
        @click="emit('subir', item.exerciseId, item.step)"
      >
        <span
          v-if="busyKey === subirStepKey(item.exerciseId, item.step)"
          class="cq-subir__spin"
          aria-hidden="true"
        />
        Subir
      </button>
    </div>

    <div v-for="item in combos" :key="subirComboKey(item.comboKey)" class="cq-subir__row">
      <div class="cq-subir__text">
        <b>Combo {{ item.label }}</b>
        <div class="cq-sub">{{ rungText(item.fromRungName, item.toRungName) }}</div>
      </div>
      <button
        v-if="item.toRungName"
        type="button"
        class="cq-small cq-small--fill cq-subir__btn"
        :disabled="busyKey !== null"
        :aria-busy="busyKey === subirComboKey(item.comboKey) ? 'true' : undefined"
        @click="emit('subir-combo', item.comboKey)"
      >
        <span
          v-if="busyKey === subirComboKey(item.comboKey)"
          class="cq-subir__spin"
          aria-hidden="true"
        />
        Subir
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { subirComboKey, subirStepKey } from '../../utils/progressView'
import type { ComboKey, ComboSubirItem, CountedStep, SubirItem } from '../../types'

// Fase 201 §4.5, §7.1 Progreso, S12-5: card "Hoy toca subir". Una fila por escalón (y por combo de
// Toro) que el motor marcó como listo, con "de → a" y el botón Subir, sin aprobación del coach. Si
// `toRungName` es null el alumno ya está en el tope de la escalera: sin botón y con el aviso (el
// coach ya recibió la alerta). El botón activo muestra el spinner (`busyKey`) y todos se bloquean
// mientras una acción está en curso (T-201-62: un doble toque no sube dos veces).
defineProps<{
  steps: SubirItem[]
  combos: ComboSubirItem[]
  /** Clave de la acción en curso (`subirStepKey` / `subirComboKey`), o null. */
  busyKey: string | null
}>()

const emit = defineEmits<{
  subir: [exerciseId: number, step: CountedStep]
  'subir-combo': [comboKey: ComboKey]
}>()

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
  &__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--cq-hair2);
  }

  &__text {
    min-width: 0;
    font-size: 15px;
    color: var(--cq-cream);

    b {
      font-family: var(--cq-display);
      font-size: 18px;
      font-weight: 600;
    }
  }

  &__btn {
    flex-shrink: 0;
    min-width: 88px;
  }

  &__spin {
    display: inline-block;
    width: 12px;
    height: 12px;
    margin-right: 8px;
    vertical-align: -2px;
    border-radius: 50%;
    border: 2px solid currentColor;
    border-right-color: transparent;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .cq-subir__spin {
    animation: cq-subir-spin 0.8s linear infinite;
  }
}

@keyframes cq-subir-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
