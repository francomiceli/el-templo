<template>
  <div class="welcome-screen">
    <div class="glass-card">
      <h2 class="welcome-heading">Hola, {{ firstName }}</h2>
      <p class="welcome-subtitle text-elegance">
        Contanos un poco sobre vos para armar tu camino en El Templo
      </p>
      <q-btn
        label="Empezar"
        unelevated
        no-caps
        class="welcome-cta full-width"
        @click="emit('start')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useUserStore } from 'src/stores/useUserStore'

const emit = defineEmits<{
  start: []
}>()

const userStore = useUserStore()
const firstName = computed(() => userStore.profile?.firstName ?? 'Atleta')
</script>

<style lang="scss" scoped>
@import 'src/css/brand';
$terracotta: $brand-terracotta;
$cream: #f2ede5;
$charcoal-mid: #3d3732;

.welcome-screen {
  width: 100%;
  max-width: 380px;
  padding: 0 20px;
}

.glass-card {
  width: 100%;
  background: rgba($charcoal-mid, 0.85);
  border-top: 2px solid rgba($terracotta, 0.6);
  border-radius: 8px;
  padding: 28px 24px 20px;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  text-align: center;
}

.welcome-heading {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 1.375rem;
  letter-spacing: 0.08em;
  color: $cream;
  margin: 0 0 12px 0;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.5);
  line-height: 1.2;
}

.welcome-subtitle {
  color: rgba($cream, 0.6);
  font-size: 1.0625rem;
  margin: 0 0 24px 0;
  line-height: 1.6;
}

.welcome-cta {
  background: linear-gradient(135deg, $terracotta 0%, #ad6540 100%) !important;
  color: $cream !important;
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 0.9375rem;
  letter-spacing: 0.12em;
  padding: 12px 0;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition:
    box-shadow 0.3s ease,
    transform 0.2s ease;

  &:hover {
    box-shadow:
      0 4px 24px rgba($terracotta, 0.5),
      0 0 40px rgba($terracotta, 0.15);
    transform: scale(1.02);
  }

  &:active {
    transform: scale(0.98);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
}
</style>
