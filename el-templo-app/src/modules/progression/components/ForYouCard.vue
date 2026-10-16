<!-- Card clara y compacta del carrusel "Para vos" (fase 199, D-10). Presentacional: la lógica
     de copy editable, fallbacks, eventos y destino vive en cada tarjeta que la usa
     (ReferralCtaCard, UpsellBadge, ProgramCtaCard, AvisoCard). Texto siempre interpolado
     con {{ }}, nunca v-html. Dorado reservado a Aura: el link va en terracota. -->
<template>
  <article
    class="for-you-card"
    role="button"
    tabindex="0"
    @click="emit('action')"
    @keydown.enter.self="emit('action')"
  >
    <span class="for-you-card__kicker">{{ kicker }}</span>
    <h4 class="for-you-card__title">{{ title }}</h4>
    <p class="for-you-card__body">{{ body }}</p>
    <button type="button" class="for-you-card__go" @click.stop="emit('action')">
      {{ actionLabel }} →
    </button>
  </article>
</template>

<script setup lang="ts">
defineProps<{
  kicker: string
  title: string
  body: string
  actionLabel: string
}>()

const emit = defineEmits<{ action: [] }>()
</script>

<style lang="scss" scoped>
.for-you-card {
  display: flex;
  flex-direction: column;
  min-height: 128px;
  box-sizing: border-box;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #e5dbcd;
  border-radius: 16px;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid #96593a;
    outline-offset: 2px;
  }

  &__kicker {
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #96593a;
  }

  &__title {
    margin: 4px 0 2px;
    font-family: 'Montserrat', sans-serif;
    font-weight: 700;
    font-size: 16px;
    line-height: 1.25;
    color: #2c2318;
  }

  &__body {
    flex: 1;
    margin: 0;
    font-size: 13px;
    line-height: 1.4;
    color: #6b6459;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  &__go {
    align-self: flex-start;
    min-height: 44px;
    margin-top: 2px;
    padding: 6px 12px 6px 0;
    background: none;
    border: 0;
    font-family: 'Geologica', sans-serif;
    font-weight: 600;
    font-size: 14px;
    color: #96593a;
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }
}
</style>
