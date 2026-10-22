<template>
  <div class="cq-card cq-card--sel cq-combo">
    <div class="cq-caps">{{ title }}</div>
    <div class="cq-ital cq-combo__seq">
      Press <b>{{ combo.press }}</b> (sube y baja) → Push <b>{{ combo.push }}</b> → Hold
      <b>{{ combo.hold }}</b>
    </div>

    <div class="cq-combo__line">
      <div class="cq-combo__label"><b>Progresión de arranque</b></div>
      <select
        class="cq-select cq-combo__select"
        aria-label="Progresión de arranque"
        :value="rungId"
        :disabled="busy"
        @change="onRungChange"
      >
        <option v-for="rung in combo.rungs" :key="rung.id" :value="rung.id">{{ rung.name }}</option>
      </select>
    </div>

    <div class="cq-combo__line">
      <div class="cq-combo__label">
        <b>Series completadas</b>
        <span>objetivo {{ combo.target }}</span>
      </div>
      <CqCounter
        :model-value="seriesValue"
        :max="max"
        label="Series completadas"
        :disabled="busy"
        @update:model-value="(v: number) => emit('update:series', v)"
      />
    </div>

    <template v-if="combo.subir.ready">
      <button
        v-if="combo.subir.toRungName"
        type="button"
        class="cq-small cq-small--fill"
        :disabled="busy"
        @click="emit('subir')"
      >
        Subir a {{ combo.subir.toRungName }}
      </button>
      <div v-else class="cq-sub cq-combo__top">Ya estás en la progresión más difícil</div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { ComboView } from '../../types'
import CqCounter from './CqCounter.vue'

// Fase 201 §3, D-14, §7.1 Hoy: combo de Toro (apertura de cada día o push/pull del sábado):
// "Press X (sube y baja) → Push Y → Hold Z", progresión de arranque, series completadas con su
// objetivo y, cuando el API lo habilita, el botón Subir. `rungId` y `seriesValue` son los del
// formulario (lo que el alumno eligió), no los del API.
withDefaults(
  defineProps<{
    combo: ComboView
    title: string
    rungId: number
    seriesValue: number
    /** Tope del contador de series: 10 en la apertura, 13 en el sábado. */
    max?: number
    busy?: boolean
  }>(),
  { max: 10, busy: false },
)

const emit = defineEmits<{
  'update:rung': [rungId: number]
  'update:series': [value: number]
  subir: []
}>()

function onRungChange(event: Event): void {
  emit('update:rung', Number((event.target as HTMLSelectElement).value))
}
</script>

<style scoped lang="scss">
.cq-combo {
  &__seq {
    font-size: 15px;
    line-height: 1.35;

    b {
      font-style: normal;
      color: var(--cq-gold-hi);
    }
  }

  &__line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--cq-hair2);
  }

  &__label {
    min-width: 0;
    display: flex;
    flex-direction: column;

    b {
      font-size: 14px;
      font-weight: 500;
    }

    span {
      font-size: 12px;
      color: var(--cq-gold);
    }
  }

  &__select {
    width: auto;
    max-width: 150px;
  }

  &__top {
    text-align: center;
  }
}
</style>
