<template>
  <p class="turno-header">
    <span class="turno-header__label">{{ label }}</span>
    <span v-if="coachName" class="turno-header__coach">PROFE: {{ coachName }}</span>
  </p>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WeeklySlotView } from 'src/types/scheduling'

/**
 * Encabezado de turno de la grilla de Reservas (App 1.7.9). Extraído porque
 * ReservasPage.vue lo repetía 3 veces (freemium/partner, sesión de prueba,
 * socio normal) con la misma marca y la misma regla de cuándo mostrar el
 * profe — DRY.
 */
const props = defineProps<{
  turno: 'morning' | 'afternoon'
  /** Slots del turno YA filtrados (morningSlots/afternoonSlots del padre). */
  slots: WeeklySlotView[]
}>()

const label = computed(() => (props.turno === 'morning' ? 'Turno Mañana' : 'Turno Tarde'))

/**
 * El profe se muestra solo si TODOS los slots del turno comparten el mismo
 * coachFirstName no nulo — un turno con horarios de distintas actividades
 * dando clase con profes distintos no tiene un "el profe de este turno"
 * único que anunciar.
 */
const coachName = computed(() => {
  if (props.slots.length === 0) return null
  const first = props.slots[0]?.coachFirstName ?? null
  if (!first) return null
  const allSame = props.slots.every((s) => s.coachFirstName === first)
  return allSame ? first : null
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

// Antes era un solo <p class="day-slots__period"> con rgba($accent, 0.4) —
// bajo contraste. App 1.7.9: bold + contraste pleno, y el profe a la derecha
// en la misma fila.
.turno-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-family: 'Montserrat', sans-serif;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: $accent;
  margin: 16px 0 6px;

  &:first-child {
    margin-top: 0;
  }
}

.turno-header__coach {
  font-weight: 700;
}
</style>
