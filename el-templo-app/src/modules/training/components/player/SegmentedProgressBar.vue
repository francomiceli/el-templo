<template>
  <div class="story-progress" :class="`story-progress--${theme}`">
    <div
      v-for="index in totalSegments"
      :key="index"
      class="story-progress__segment"
      :class="{
        'story-progress__segment--active': index - 1 === activeIndex,
        'story-progress__segment--done': index - 1 < activeIndex,
        'story-progress__segment--completed': completedIndices.includes(index - 1),
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
  /**
   * Segmentos (base 0) de ejercicios ya completados: en el tema `'video'` van en verde, así se ve
   * qué está hecho mientras se hace otro.
   */
  completedIndices?: readonly number[]
}

withDefaults(defineProps<Props>(), { theme: 'video', completedIndices: () => [] })
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';
@import 'src/css/premium-card';

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

// Tema 'video' (default): activo dorado con glow, resto blanco translúcido y los completados en
// verde (también el activo si ya está completado, con su glow).
.story-progress--video .story-progress__segment {
  background: rgba(255, 255, 255, 0.75);

  &.story-progress__segment--active {
    background: #e8c84a;
    box-shadow: 0 0 6px rgba(232, 200, 74, 0.7);
  }

  &.story-progress__segment--completed {
    background: $pd-sage-on-dark;
  }

  &.story-progress__segment--active.story-progress__segment--completed {
    box-shadow: 0 0 6px rgba($pd-sage-on-dark, 0.7);
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
