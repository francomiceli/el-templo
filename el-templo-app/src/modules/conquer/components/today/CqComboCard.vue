<template>
  <div class="cq-card cq-combo">
    <div class="cq-combo__head cq-dark">
      <p class="cq-kicker">{{ kicker }}</p>
      <h3 v-if="heading" class="cq-combo__title">{{ heading }}</h3>
    </div>
    <p class="cq-combo__seq">
      Press <b>{{ combo.press }}</b> (sube y baja) <span class="cq-combo__ar">→</span> Push
      <b>{{ combo.push }}</b> <span class="cq-combo__ar">→</span> Hold <b>{{ combo.hold }}</b>
    </p>
    <p v-if="hint" class="cq-sub">{{ hint }}</p>

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
        <span class="cq-sub">objetivo {{ combo.target }}</span>
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
      <CqButton
        v-if="combo.subir.toRungName"
        class="cq-combo__subir"
        variant="subir"
        small
        :label="`Subir a ${combo.subir.toRungName}`"
        :disabled="busy"
        @click="emit('subir')"
      />
      <p v-else class="cq-sub cq-combo__top">Ya estás en la progresión más difícil</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ComboView } from '../../types'
import CqButton from '../brand/CqButton.vue'
import CqCounter from './CqCounter.vue'

// Fase 201 §3, D-14, §7.1 Hoy, DA-31 (sketch 022 B): combo de Toro (apertura de cada día o push/pull del sábado):
// "Press X (sube y baja) → Push Y → Hold Z", progresión de arranque, series completadas con su
// objetivo y, cuando el API lo habilita, el botón Subir. `rungId` y `seriesValue` son los del
// formulario (lo que el alumno eligió), no los del API.
const props = withDefaults(
  defineProps<{
    combo: ComboView
    title: string
    /** Ayuda del anexo §9 (`combo`) debajo de la secuencia. */
    hint?: string
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

// La cabecera oscura parte el título en rótulo y encabezado: "Combo de apertura · al fallo" va como
// kicker "Combo de apertura" y título "Al fallo". Sin " · " el título entero queda de kicker.
const kicker = computed(() => props.title.split(' · ')[0] ?? props.title)
const heading = computed(() => {
  const rest = props.title.split(' · ').slice(1).join(' · ')
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : ''
})

function onRungChange(event: Event): void {
  emit('update:rung', Number((event.target as HTMLSelectElement).value))
}
</script>

<style scoped lang="scss">
.cq-combo {
  &__head.cq-dark {
    margin: -16px -16px 0;
    padding: 14px 16px;
    border: 0;
    border-radius: 16px 16px 0 0;
    box-shadow: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
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

  &__seq {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--cq-text);

    b {
      font-weight: 600;
      color: var(--cq-night);
    }
  }

  &__ar {
    padding: 0 2px;
    font-weight: 700;
    color: var(--cq-text-gold);
  }

  &__line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--cq-line);
  }

  &__label {
    min-width: 0;
    display: flex;
    flex-direction: column;

    b {
      font-size: 15px;
      font-weight: 600;
    }
  }

  // El padre delante: `.cq-select` (ancho 100 %) y este selector empatan en especificidad
  .cq-combo__select {
    flex: none;
    width: 150px;
  }

  &__subir {
    align-self: flex-end;
    max-width: 100%;
  }

  &__top {
    text-align: center;
  }
}
</style>
