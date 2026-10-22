<template>
  <div class="block-chip-stack" role="group" aria-label="Bloques de la sesión">
    <button
      v-for="(block, i) in blocks"
      :key="block.blockId"
      type="button"
      class="block-chip-stack__chip"
      :class="{
        'block-chip-stack__chip--on': i === selected,
        'block-chip-stack__chip--hit': isHit(i),
        'block-chip-stack__chip--off': dimOthers && !isHit(i),
      }"
      :aria-pressed="i === selected"
      :aria-label="chipLabel(block, i)"
      @click="onPick(i)"
    >
      <span class="block-chip-stack__role">{{ ROLE_LABELS[block.role] }}</span>
      <span class="block-chip-stack__name">{{ blockDisplayName(block) }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ROLE_LABELS } from 'src/constants/roleLabels'
import type { Block } from '../../types/session'
import { blockDisplayName } from '../../utils/blockMeta'

// Fase 197 D-03: chips de bloque apilados (rol arriba, nombre en una línea). Siempre hay uno
// elegido: tocar el elegido emite igual y no lo deselecciona.
// Fase 200 D18: con la hoja de una zona abierta, `selected = -1` (ningún chip elegido), `hits` marca
// los bloques que trabajan esa zona (borde + punto) y `dimOthers` apaga el resto. Con los defaults
// el chip se comporta exactamente como en la 197.
const props = withDefaults(
  defineProps<{
    blocks: Block[]
    selected: number
    interactive?: boolean
    /** Índices de los bloques que trabajan la zona tocada */
    hits?: readonly number[]
    /** Apaga los chips que no están en `hits` */
    dimOthers?: boolean
  }>(),
  {
    interactive: true,
    hits: () => [],
    dimOthers: false,
  },
)

const emit = defineEmits<{
  select: [index: number]
}>()

function isHit(index: number): boolean {
  return props.hits.includes(index)
}

// Sin hit el nombre accesible sigue siendo el texto del chip (rol + nombre): no se pisa
function chipLabel(block: Block, index: number): string | undefined {
  if (!isHit(index)) return undefined
  return `${ROLE_LABELS[block.role]} ${blockDisplayName(block)}, trabaja esta zona`
}

function onPick(index: number): void {
  if (props.interactive) emit('select', index)
}
</script>

<style scoped lang="scss">
@import 'src/css/brand';
@import 'src/css/premium-card';

.block-chip-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  &__chip {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
    min-height: 44px;
    padding: 5px 10px;
    border: 1px solid $pd-light-edge;
    border-radius: 12px;
    background: #fff;
    color: $pd-ink;
    text-align: left;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid $pd-ink;
      outline-offset: 2px;
    }

    &--on {
      background: $pd-ink;
      border-color: $pd-ink;
      color: #fff;
    }

    // Fase 200 D18: el bloque trabaja la zona tocada (borde de tinta terracota + punto arriba a la derecha)
    &--hit {
      position: relative;
      border: 1.5px solid $pd-terra-ink;
      // El borde engorda 0.5px por lado: se resta del padding para que el chip no cambie de tamaño
      padding: 4.5px 9.5px;

      &::after {
        content: '';
        position: absolute;
        top: 6px;
        right: 7px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: $pd-terra-ink;
      }
    }

    // Fase 200 D18: apagado, en color sólido (el texto mantiene su contraste)
    &--off {
      border-color: $pd-unavailable-bg;
      background: $pd-unavailable-bg;
      color: $pd-ink-2;
    }
  }

  &__role {
    @include pd-role-label;
    display: block;
    line-height: 1.2;
    // Gap 197-24 (hallazgo 9): una línea, para que los chips queden parejos a 360
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  &__chip--on &__role {
    color: $pd-cream-2;
  }

  // Fase 200 D18: chip apagado, el rótulo del rol también en tinta-2 sólida
  &__chip--off &__role {
    color: $pd-ink-2;
  }

  // Chip elegido que además trabaja la zona (fondo oscuro): el punto va en crema
  &__chip--on.block-chip-stack__chip--hit::after {
    background: $pd-cream-2;
  }

  // El punto de la marca no pisa el rótulo del rol (que ya corta con ellipsis)
  &__chip--hit &__role {
    padding-right: 12px;
  }

  &__name {
    display: block;
    min-width: 0;
    overflow: hidden;
    font-family: 'Geologica', sans-serif;
    font-weight: 500;
    font-size: 13px;
    line-height: 1.2;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}
</style>
