<template>
  <div class="coming-soon">
    <span class="coming-soon__icon">
      <q-icon :name="copy.icon" size="40px" aria-hidden="true" />
    </span>
    <p class="coming-soon__kicker">Próximamente</p>
    <h2 class="coming-soon__title">{{ copy.title }}</h2>
    <p class="coming-soon__text">{{ copy.text }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

// Fase 197 D-05: pantalla "Próximamente" de las tabs Desafíos y Conquer (sketch 015, paneSoon).
const props = defineProps<{
  kind: 'desafios' | 'conquer'
}>()

interface SoonCopy {
  icon: string
  title: string
  text: string
}

const COPY: Readonly<Record<'desafios' | 'conquer', SoonCopy>> = {
  desafios: {
    icon: 'emoji_events',
    title: 'Desafíos',
    text: 'Estamos preparando desafíos para que pongas a prueba lo que entrenás.',
  },
  conquer: {
    icon: 'flag',
    title: 'Conquer',
    text: 'Tu camino de habilidades, paso a paso. Muy pronto vas a poder empezarlo desde acá.',
  },
}

const copy = computed(() => COPY[props.kind])
</script>

<style scoped lang="scss">
@import 'src/css/premium-card';

.coming-soon {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 48px 24px;
  text-align: center;

  &__icon {
    display: grid;
    place-items: center;
    width: 88px;
    height: 88px;
    border-radius: 50%;
    background: white;
    border: 1px solid $pd-light-line;
    box-shadow: 0 10px 24px rgba(150, 89, 58, 0.1);
    color: $pd-terra-ink;
  }

  &__kicker {
    @include pd-kicker-light;
  }

  &__title {
    margin: 6px 0 0;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 28px;
    line-height: 1.15;
    color: $pd-ink;
  }

  &__text {
    margin: 0;
    max-width: 280px;
    font-family: 'Geologica', sans-serif;
    font-size: 13px;
    line-height: 1.45;
    color: $pd-ink-2;
  }
}
</style>
