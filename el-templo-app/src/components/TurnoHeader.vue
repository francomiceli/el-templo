<template>
  <p class="turno-header">
    <span class="turno-header__label">{{ label }}</span>
    <span v-if="coachName" class="turno-header__coach">PROFE: {{ coachName }}</span>
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WeeklySlotView } from 'src/types/scheduling'
import { turnoCoachName } from 'src/utils/turno-coach'
import type { TurnoKey } from 'src/utils/turno-sections'

/**
 * Encabezado de turno de la grilla de Reservas (App 1.7.9). Extraído porque
 * ReservasPage.vue lo repetía 3 veces (freemium/partner, sesión de prueba,
 * socio normal) con la misma marca y la misma regla de cuándo mostrar el
 * profe — DRY.
 */
const props = defineProps<{
  turno: TurnoKey
  /** Slots de la sección YA filtrados (splitDaySections del padre). */
  slots: WeeklySlotView[]
}>()

const LABELS: Record<TurnoKey, string> = {
  morning: 'Turno Mañana',
  especiales: 'Especiales',
  afternoon: 'Turno Tarde',
}

const label = computed(() => LABELS[props.turno])

/**
 * Profe único del turno (ignora los slots con profe propio) — ver turnoCoachName.
 * La sección "Especiales" no anuncia profe: varía según la clase.
 */
const coachName = computed(() =>
  props.turno === 'especiales' ? null : turnoCoachName(props.slots),
)
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

// Mismo estilo que el <p class="day-slots__period"> original (600,
// rgba($accent, 0.4)) — el bold + contraste pleno de la 1.7.9 se revirtió a
// pedido de Franco. El profe va a la derecha en la misma fila, mismo estilo.
.turno-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-family: 'Montserrat', sans-serif;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba($accent, 0.4);
  margin: 16px 0 6px;

  &:first-child {
    margin-top: 0;
  }
}
</style>
