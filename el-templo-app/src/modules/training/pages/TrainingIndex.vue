<template>
  <q-page class="training-index">
    <!-- Loading (while subscription loads) -->
    <div v-if="userStore.subscriptionLoading" class="training-index__loading">
      <q-spinner-dots color="primary" size="50px" />
    </div>

    <!-- No active subscription — blocked state -->
    <div v-else-if="!hasActiveSubscription" class="training-index__blocked">
      <div class="training-index__blocked-content">
        <q-icon name="fitness_center" size="64px" class="training-index__blocked-icon" />
        <h2 class="training-index__blocked-title">Activa Tu Plan</h2>
        <p class="training-index__blocked-text">
          Consulta en recepcion para elegir tu plan y comenzar a entrenar
        </p>
      </div>
    </div>

    <!-- Active subscription — WeeklyView for all members -->
    <WeeklyView v-else />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useUserStore } from 'src/stores/useUserStore'
import WeeklyView from './WeeklyView.vue'

const userStore = useUserStore()

const hasActiveSubscription = computed(() => userStore.hasActiveSubscription)

onMounted(async () => {
  if (!userStore.subscription && !userStore.subscriptionLoading) {
    await userStore.loadSubscription()
  }
})
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.training-index {
  background-color: $cream;
  min-height: var(--app-vh);
}

/* Loading state */
.training-index__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}

/* Blocked state (no subscription) */
.training-index__blocked {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 24px;
}

.training-index__blocked-content {
  text-align: center;
  max-width: 320px;
}

.training-index__blocked-icon {
  color: rgba($accent, 0.25);
  margin-bottom: 16px;
}

.training-index__blocked-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 1.5rem;
  font-weight: 600;
  color: $accent;
  margin: 0 0 8px;
}

.training-index__blocked-text {
  font-size: 0.9rem;
  color: rgba($accent, 0.6);
  line-height: 1.5;
  margin: 0;
}
</style>
