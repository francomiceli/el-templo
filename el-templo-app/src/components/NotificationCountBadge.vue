<template>
  <!-- Fase 215 (plan 19, UI-SPEC Pantalla 3): número de avisos sin leer sobre la campana de la barra
       y sobre el ítem del riel. Mismo lenguaje que el punto de novedad (`.tab-dot`): crema con aro
       oscuro. Nunca dorado y sin animación. `aria-hidden`: el número ya está en el `aria-label`
       del botón o del link que lo contiene. -->
  <span
    v-if="text !== null"
    class="notif-count-badge"
    :class="`notif-count-badge--${placement}`"
    aria-hidden="true"
  >
    {{ text }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { badgeText } from 'src/utils/notifications-view'

const props = withDefaults(
  defineProps<{
    count: number
    /** `bar`: dentro del botón de la barra (top 4, right 4). `rail`: en el riel (top 8, left 38). */
    placement?: 'bar' | 'rail'
  }>(),
  { placement: 'bar' },
)

const text = computed(() => badgeText(props.count))
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.notif-count-badge {
  position: absolute;
  box-sizing: border-box;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 999px;
  background: #fbf8f3;
  box-shadow: 0 0 0 2px $pd-btn-b;
  color: $pd-terra-ink;
  font-family: 'Montserrat', sans-serif;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  pointer-events: none;

  &--bar {
    top: 4px;
    right: 4px;
  }

  &--rail {
    top: 8px;
    left: 38px;
  }
}
</style>
