<template>
  <div class="story-progress" :class="`story-progress--${theme}`">
    <div
      v-for="index in totalSegments"
      :key="index"
      class="story-progress__segment"
      :class="{
        'story-progress__segment--active': index - 1 === activeIndex,
        'story-progress__segment--done': index - 1 < activeIndex,
      }"
    />
  </div>
</template>

<script setup lang="ts">
interface Props {
  totalSegments: number
  activeIndex: number
  /**
   * UI-SPEC "Empezá acá" §2/§6: `'video'` (default) preserva EXACTAMENTE el
   * comportamiento original — dos estados (activo dorado con glow, resto
   * blanco translúcido) — consumido por BlockProgressionView.vue/DayPlayer,
   * su apariencia no cambia. `'story-dark'`/`'story-light'` agregan un
   * tercer estado ("visto") con la paleta de marca para las historias.
   */
  theme?: 'video' | 'story-dark' | 'story-light'
}

withDefaults(defineProps<Props>(), { theme: 'video' })
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.story-progress {
  display: flex;
  gap: 3px;
  padding: 8px 12px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
}

.story-progress__segment {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  transition: background-color 0.3s ease;
}

// Tema 'video' (default) — SIN CAMBIOS respecto al original.
.story-progress--video .story-progress__segment {
  background: rgba(255, 255, 255, 0.75);

  &.story-progress__segment--active {
    background: #e8c84a;
    box-shadow: 0 0 6px rgba(232, 200, 74, 0.7);
  }
}

// Temas de historia (UI-SPEC "Empezá acá" §3/§6) — 3 estados, paleta de marca.
.story-progress--story-dark .story-progress__segment {
  background: rgba($cream, 0.3);

  &.story-progress__segment--done {
    background: rgba($cream, 0.85);
  }

  &.story-progress__segment--active {
    background: $bronze-light;
    box-shadow: 0 0 6px rgba(212, 184, 150, 0.7);
  }
}

.story-progress--story-light .story-progress__segment {
  background: rgba($accent, 0.18);

  &.story-progress__segment--done {
    background: rgba($accent, 0.5);
  }

  &.story-progress__segment--active {
    background: $primary;
    box-shadow: 0 0 6px rgba($primary, 0.5);
  }
}
</style>
