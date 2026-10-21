<template>
  <!-- Card de un bloque en los resúmenes (sesión completa y bloque libre): rol, nombre, meta y la
       lista de ejercicios con su tilde. Lenguaje de FreeBlockSummary (superficie clara, tildes en
       salvia). -->
  <section class="sbc" aria-label="Bloque">
    <div class="sbc__head">
      <div class="sbc__text">
        <span class="sbc__role">{{ roleLabel }}</span>
        <span class="sbc__name">{{ blockDisplayName(block) }}</span>
        <span class="sbc__meta">{{
          keepHyphenWords(blockMetaLine(block, { withEstimate: false }))
        }}</span>
      </div>
      <button
        v-if="guiaLink"
        type="button"
        class="sbc__guia"
        :aria-label="guiaLink.question"
        @click="openGuia"
      >
        <q-icon name="help_outline" size="22px" />
      </button>
    </div>
    <ul class="sbc__list">
      <li v-for="(ex, i) in block.exercises" :key="`${ex.exerciseId}-${i}`" class="sbc__row">
        <q-icon
          v-if="isDone(ex.exerciseId)"
          name="check_circle"
          size="18px"
          class="sbc__check"
          role="img"
          aria-label="Hecho"
        />
        <q-icon
          v-else
          name="radio_button_unchecked"
          size="18px"
          class="sbc__check sbc__check--off"
          role="img"
          aria-label="Sin hacer"
        />
        <span class="sbc__ex">{{ ex.exerciseName }}</span>
        <span class="sbc__dose">{{ doseOf(ex) }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ROLE_LABELS } from 'src/constants/roleLabels'
import type { Block, Prescription } from '../../types/session'
import { getGuiaLinkForRole } from '../../guia-role-map'
import { blockDisplayName, blockMetaLine, keepHyphenWords } from '../../utils/blockMeta'
import { formatDose, formatQuickDose, isPyramidBlock } from '../../utils/formatDose'

interface Props {
  block: Block
  /**
   * exerciseId de los ejercicios tildados. `null` (default) = todos hechos: es el caso de la
   * sesión completa, donde un bloque solo se da por terminado con todos los ejercicios tildados.
   */
  doneIds?: number[] | null
  /** Muestra el link "¿Qué es X?" a la Guía (solo roles documentados) */
  showGuia?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  doneIds: null,
  showGuia: false,
})

const router = useRouter()

const roleLabel = computed(() => ROLE_LABELS[props.block.role] ?? props.block.role)

const doneSet = computed(() => (props.doneIds ? new Set(props.doneIds) : null))

function isDone(exerciseId: number): boolean {
  return doneSet.value === null || doneSet.value.has(exerciseId)
}

// formatDose no es consciente de las pirámides: para esos bloques se usa la versión compacta.
const pyramid = computed(() => isPyramidBlock(props.block))

function doseOf(ex: Prescription): string {
  return pyramid.value ? formatQuickDose(ex, true) : formatDose(ex)
}

const guiaLink = computed(() => (props.showGuia ? getGuiaLinkForRole(props.block.role) : null))

// Mismo destino que el "¿Qué es X?" de la card de Semana.
function openGuia(): void {
  const link = guiaLink.value
  if (!link) return
  void router.push({ name: 'guia', query: { slide: link.slide } })
}
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.sbc {
  @include pd-surface-light;
  overflow: hidden;
}

.sbc__head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid $pd-light-line;
}

.sbc__text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.sbc__role {
  @include pd-role-label;
}

.sbc__name {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 16px;
  color: $pd-ink;
  overflow-wrap: anywhere;
}

.sbc__meta {
  font-family: 'Geologica', sans-serif;
  font-size: 13px;
  color: $pd-ink-2;
}

// Hitbox de 44x44; el margen negativo evita que el botón agrande el encabezado.
.sbc__guia {
  flex: none;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: -10px -8px -10px 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: $pd-terra-ink;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid $pd-ink;
    outline-offset: 2px;
  }
}

.sbc__list {
  margin: 0;
  padding: 4px 16px;
  list-style: none;
}

.sbc__row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  font-family: 'Geologica', sans-serif;
  font-size: 13px;
  color: $pd-ink;

  & + & {
    border-top: 1px solid $pd-light-line;
  }
}

.sbc__check {
  flex-shrink: 0;
  color: $pd-sage;

  &--off {
    color: $pd-ink-3;
  }
}

.sbc__ex {
  min-width: 0;
  overflow-wrap: anywhere;
}

.sbc__dose {
  flex-shrink: 0;
  margin-left: auto;
  font-weight: 600;
  color: $pd-ink-2;
}
</style>
