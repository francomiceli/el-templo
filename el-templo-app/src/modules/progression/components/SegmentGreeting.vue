<template>
  <div class="segment-greeting">
    <div class="segment-greeting__left">
      <p class="segment-greeting__name">{{ greetingMessage }} {{ memberName }}!</p>
      <p class="segment-greeting__date">{{ formattedDate }}</p>
    </div>
    <LevelDisplay
      v-if="level"
      :greek-letter="level.greekLetter"
      :level-name="level.levelName"
      class="segment-greeting__level"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import LevelDisplay from '../components/LevelDisplay.vue'
import type { MemberSegment } from 'src/stores/useUserStore'

interface Props {
  memberName: string
  segment: MemberSegment | null
  level: { greekLetter: string; levelName: string } | null
}

const props = defineProps<Props>()

/**
 * Segment greeting templates.
 * {name} is a placeholder split point — text before it becomes the greeting message,
 * text after becomes the suffix (if any).
 */
// Segment greeting prefixes — keys preserved for future copywriting
const SEGMENT_GREETINGS: Record<string, string> = {
  nuevo_guerrero: 'Hola,',
  espartano: 'Hola,',
  intermitente: 'Hola,',
  en_riesgo: 'Hola,',
  digital_warrior: 'Hola,',
  ghost: 'Hola,',
}

const greetingMessage = computed(() => {
  if (!props.segment) return 'Hola,'
  return SEGMENT_GREETINGS[props.segment] ?? 'Hola,'
})

const formattedDate = computed(() => {
  const date = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return 'Hoy es ' + date.charAt(0).toUpperCase() + date.slice(1)
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.segment-greeting {
  display: flex;
  justify-content: space-between;
  align-items: center;

  &__left {
    flex: 1;
  }

  &__name {
    font-family: 'Montserrat', sans-serif;
    font-size: 18px;
    font-weight: 700;
    color: $primary;
    margin: 0 0 4px;
  }

  &__date {
    font-family: 'Geologica', sans-serif;
    font-size: 14px;
    color: rgba($primary, 0.7);
    margin: 0;
  }

  &__level {
    flex-shrink: 0;
    margin-left: 8px;

    :deep(.level-display) {
      padding: 0;
    }

    :deep(.level-display__letter) {
      font-size: 32px;
      margin-bottom: 0;
      line-height: 1;
    }

    :deep(.level-display__name) {
      font-size: 10px;
      letter-spacing: 0.1em;
    }
  }
}
</style>
