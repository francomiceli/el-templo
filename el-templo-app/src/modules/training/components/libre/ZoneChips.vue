<template>
  <div class="zone-chips" role="group" aria-label="Zona del cuerpo">
    <button
      type="button"
      class="zone-chips__chip"
      :class="{ 'zone-chips__chip--on': selected === null }"
      :aria-pressed="selected === null"
      @click="emit('select', null)"
    >
      Todo
    </button>
    <button
      v-for="group in ZONE_GROUP_ORDER"
      :key="group"
      type="button"
      class="zone-chips__chip"
      :class="{ 'zone-chips__chip--on': selected === group }"
      :aria-pressed="selected === group"
      @click="onPick(group)"
    >
      {{ ZONE_GROUP_LABELS[group] }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ZONE_GROUP_LABELS, ZONE_GROUP_ORDER } from 'src/components/anatomy/zones'
import type { ZoneGroup } from 'src/components/anatomy/zones'

// Fase 197 D-04: chips de zona equivalentes a la figura tocable (accesibilidad). "Todo" limpia el
// filtro; tocar el grupo ya elegido lo deselecciona (igual que la figura y la sugerencia).
const props = defineProps<{
  selected: ZoneGroup | null
}>()

const emit = defineEmits<{
  select: [group: ZoneGroup | null]
}>()

function onPick(group: ZoneGroup): void {
  emit('select', props.selected === group ? null : group)
}
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

// Fila con scroll horizontal que sale al borde (margen -16 / padding 16). El padding vertical deja
// lugar al hitbox de 44 px de los chips de 36 px, que si no se recortaría por el overflow.
.zone-chips {
  display: flex;
  gap: 6px;
  margin: -4px -16px;
  padding: 4px 16px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }

  &__chip {
    @include pd-hit-44;
    flex: none;
    height: 36px;
    padding: 0 14px;
    border: 1px solid $pd-light-edge;
    border-radius: 999px;
    background: white;
    color: $pd-ink;
    font-family: 'Geologica', sans-serif;
    font-weight: 500;
    font-size: 13px;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid $pd-ink;
      outline-offset: 2px;
    }

    &--on {
      background: $pd-ink;
      border-color: $pd-ink;
      color: white;
    }
  }
}
</style>
