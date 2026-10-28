<template>
  <q-page class="training-index">
    <!-- SPEC "Empezá acá" C — tip de primera vez en Entrenar. -->
    <FirstVisitTipBanner v-if="!userStore.subscriptionLoading" tip-id="entrenar-bloques" />

    <!-- Loading (while subscription loads) -->
    <div v-if="userStore.subscriptionLoading" class="training-index__loading">
      <TemploLoader size="lg" />
    </div>

    <!-- No presencial plan AND no active program enrollment — vidriera (fase 197 D-06): Entrenar
         desenfocado con una plani de ejemplo y la tarjeta "Activá Tu Plan" encima.
         Phase 104 R10: online-only members WITH an active enrollment skip this block and go
         directly to EntrenarView. -->
    <EntrenarVidriera v-else-if="!canEnterTraining" />

    <!-- Active subscription — EntrenarView (4 tabs) for all members -->
    <EntrenarView v-else />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import TemploLoader from 'src/components/TemploLoader.vue'
import FirstVisitTipBanner from 'src/components/FirstVisitTipBanner.vue'
import { useUserStore } from 'src/stores/useUserStore'
import EntrenarVidriera from '../components/EntrenarVidriera.vue'
import EntrenarView from './EntrenarView.vue'

const userStore = useUserStore()

/**
 * Phase 104 (R10): users may enter the Entrenar tab when they hold a
 * presencial plan OR have at least one active program enrollment. The old
 * `!hasActiveSubscription` gate falsely blocked online-only members with
 * an active program (e.g. linkedProgramId-driven enrollment from an online
 * plan, or any of the bundle-driven enrollments).
 */
const canEnterTraining = computed(() => {
  return userStore.hasPresencialPlan || userStore.allActiveEnrollments.length > 0
})

onMounted(async () => {
  if (!userStore.subscription && !userStore.subscriptionLoading) {
    await userStore.loadSubscription()
  }
})
</script>

<style scoped lang="scss">
.training-index {
  background-color: transparent; // D-16: la foto de fondo se ve detrás
  min-height: var(--app-vh);
}

/* Loading state */
.training-index__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}
</style>
