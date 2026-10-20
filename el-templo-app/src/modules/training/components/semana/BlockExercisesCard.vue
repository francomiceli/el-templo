<template>
  <section class="block-exercises-card">
    <header class="block-exercises-card__head">
      <div class="block-exercises-card__text">
        <span class="block-exercises-card__role">{{ ROLE_LABELS[block.role] }}</span>
        <h2 class="block-exercises-card__name">{{ blockDisplayName(block) }}</h2>
        <p class="block-exercises-card__meta">{{ meta }}</p>
      </div>
      <button
        v-if="guiaLink"
        type="button"
        class="block-exercises-card__guia"
        :aria-label="guiaLink.question"
        @click="openGuia"
      >
        <q-icon name="help_outline" size="22px" />
      </button>
    </header>

    <ol class="block-exercises-card__list">
      <li v-for="ex in exercises" :key="`${ex.sortOrder}-${ex.exerciseId}`" class="exercise-row">
        <span class="exercise-row__thumb" aria-hidden="true">
          <q-icon
            v-if="ex.videoUrl"
            name="play_arrow"
            size="22px"
            class="exercise-row__icon exercise-row__icon--video"
          />
          <q-icon v-else name="fitness_center" size="20px" class="exercise-row__icon" />
        </span>
        <span class="exercise-row__name">{{ ex.exerciseName }}</span>
        <span class="exercise-row__dose">{{ formatDose(ex) }}</span>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ROLE_LABELS } from 'src/constants/roleLabels'
import type { Block } from '../../types/session'
import { getGuiaLinkForRole } from '../../guia-role-map'
import { blockDisplayName, blockMetaLine } from '../../utils/blockMeta'
import { formatDose } from '../../utils/formatDose'

// Fase 197 D-03: lista de ejercicios del bloque elegido en Semana. Sin cruz de cerrar (Franco la
// sacó) y sin reproducir video: la miniatura solo indica si el ejercicio tiene uno (T-197-33).
const props = defineProps<{
  block: Block
}>()

const router = useRouter()

const guiaLink = computed(() => getGuiaLinkForRole(props.block.role))

const meta = computed(() => blockMetaLine(props.block, { withEstimate: false }))

const exercises = computed(() =>
  [...props.block.exercises].sort((a, b) => a.sortOrder - b.sortOrder),
)

// Mismo destino que el "¿Qué es X?" de BlockCard.
function openGuia(): void {
  const link = guiaLink.value
  if (!link) return
  void router.push({ name: 'guia', query: { slide: link.slide } })
}
</script>

<style scoped lang="scss">
@import 'src/css/brand';
@import 'src/css/premium-card';

.block-exercises-card {
  @include pd-surface-light;
  overflow: hidden;

  &__head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px 8px 10px 16px;
    border-bottom: 1px solid $pd-light-line;
  }

  &__text {
    flex: 1;
    min-width: 0;
  }

  &__role {
    @include pd-role-label;
    display: block;
  }

  &__name {
    margin: 0;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 16px;
    line-height: 1.25;
    color: $pd-ink;
  }

  &__meta {
    margin: 2px 0 0;
    font-size: 13px;
    color: $pd-ink-2;
  }

  // Hitbox de 44x44; el margen negativo evita que el botón agrande el encabezado.
  &__guia {
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    margin: -8px 0 -8px auto;
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

  &__list {
    margin: 0;
    padding: 4px 0;
    list-style: none;
  }
}

.exercise-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 6px 16px;

  & + & {
    border-top: 1px solid $pd-light-line;
  }

  &__thumb {
    flex: none;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: linear-gradient(135deg, $fig-skin, $fig-muscle);
  }

  &__icon {
    color: $pd-ink-3;

    &--video {
      color: $pd-terra-ink;
    }
  }

  &__name {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    font-family: 'Geologica', sans-serif;
    font-weight: 500;
    font-size: 13px;
    line-height: 1.25;
    color: $pd-ink;
  }

  &__dose {
    flex: none;
    font-family: 'Geologica', sans-serif;
    font-weight: 600;
    font-size: 13px;
    color: $pd-ink-2;
  }
}
</style>
