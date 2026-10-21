<template>
  <article class="free-block-card">
    <div class="free-block-card__body">
      <span class="free-block-card__role">{{ ROLE_LABELS[item.role] }}</span>
      <h3 class="free-block-card__title">{{ keepHyphenWords(item.title) }}</h3>
      <p v-if="item.subtitle" class="free-block-card__sub">{{ item.subtitle }}</p>
      <p class="free-block-card__meta">{{ keepHyphenWords(meta) }}</p>
      <p v-if="item.workedToday" class="free-block-card__worked">
        <q-icon name="replay" size="14px" />
        Ya lo trabajaste hoy
      </p>
    </div>
    <button
      type="button"
      class="free-block-card__go"
      :aria-label="`Empezar ${item.title}`"
      @click="onStart"
    >
      Empezar
    </button>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ROLE_LABELS } from 'src/constants/roleLabels'
import type { FreeBlockItem } from '../../types/free-blocks'
import { blockMetaLine, keepHyphenWords } from '../../utils/blockMeta'

// Fase 197 D-04, D-09: card de la canasta. Título "Ruta · Formato", los primeros ejercicios como
// subtítulo, meta con minutos o "≈N'" y el botón que abre el player en modo bloque libre.
const props = defineProps<{
  item: FreeBlockItem
}>()

const router = useRouter()

const meta = computed(() => blockMetaLine(props.item, { withEstimate: true }))

function onStart(): void {
  void router.push({ name: 'free-block-player', params: { blockId: props.item.blockId } })
}
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.free-block-card {
  @include pd-surface-light;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 12px 12px 16px;

  &__body {
    flex: 1;
    min-width: 0;
  }

  &__role {
    @include pd-role-label;
    display: block;
  }

  &__title {
    margin: 0;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 16px;
    line-height: 1.25;
    color: $pd-ink;
  }

  &__sub,
  &__meta {
    margin: 2px 0 0;
    font-family: 'Geologica', sans-serif;
    font-size: 13px;
    line-height: 1.35;
    color: $pd-ink-2;
  }

  // Los primeros ejercicios: una sola línea con "…"
  &__sub {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  &__worked {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 4px 0 0;
    font-family: 'Geologica', sans-serif;
    font-size: 13px;
    color: $pd-ink-2;
  }

  &__go {
    @include pd-hit-44;
    flex: none;
    height: 36px;
    margin-left: auto;
    padding: 0 14px;
    border: 0;
    border-radius: 999px;
    background: $pd-terra-ink;
    color: white;
    font-family: 'Geologica', sans-serif;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;

    &:focus-visible {
      outline: 2px solid $pd-ink;
      outline-offset: 2px;
    }
  }
}
</style>
