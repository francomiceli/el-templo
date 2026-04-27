<template>
  <q-page class="training-index">
    <!-- Loading (while subscription loads) -->
    <div v-if="userStore.subscriptionLoading" class="training-index__loading">
      <TemploLoader size="lg" />
    </div>

    <!-- No presencial plan AND no active program enrollment — blocked state.
         Phase 104 R10: online-only members WITH an active enrollment skip
         this block and go directly to WeeklyView. -->
    <div v-else-if="!canEnterTraining" class="training-index__blocked">
      <div class="training-index__blocked-content">
        <q-icon
          name="img:/icons/entrenar-dark.svg"
          size="64px"
          class="training-index__blocked-icon"
        />
        <h2 class="training-index__blocked-title">Activá Tu Plan</h2>
        <p class="training-index__blocked-text">
          No tenés un plan activo. Consultá por tu plan para comenzar a entrenar.
        </p>
        <q-btn no-caps rounded color="positive" class="q-mt-md" @click="openWhatsApp">
          <q-icon
            name="img:/icons/whatsapp.svg"
            size="20px"
            class="q-mr-sm"
            style="filter: brightness(0) invert(1)"
          />
          Consultá por tu plan
        </q-btn>
      </div>
    </div>

    <!-- Active subscription — WeeklyView for all members -->
    <WeeklyView v-else />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import TemploLoader from 'src/components/TemploLoader.vue'
import { useUserStore } from 'src/stores/useUserStore'
import { buildWhatsAppUrl } from 'src/utils/whatsapp'
import WeeklyView from './WeeklyView.vue'

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

function openWhatsApp(): void {
  const message = 'Hola, quiero consultar por los planes de entrenamiento'
  window.open(buildWhatsAppUrl(userStore.profile?.branchCountry, message), '_blank')
}

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
  max-width: none !important;
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
  font-size: 20px;
  font-weight: 700;
  color: $primary;
  margin: 16px 0 8px;
}

.training-index__blocked-text {
  font-size: 14px;
  color: $grey-7;
}
</style>
