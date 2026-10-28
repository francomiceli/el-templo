<template>
  <q-page class="training-index">
    <!-- SPEC "Empezá acá" C — tip de primera vez en Entrenar. -->
    <FirstVisitTipBanner v-if="view !== 'loading'" tip-id="entrenar-bloques" />

    <!-- Loading: hasta que llegan perfil, suscripción, programa e inscripciones (D-09). Entrenar
         no elige entre la vidriera y EntrenarView con datos a medias. -->
    <div v-if="view === 'loading'" class="training-index__loading">
      <TemploLoader size="lg" />
    </div>

    <!-- No presencial plan AND no active program enrollment — vidriera (fase 197 D-06): Entrenar
         desenfocado con una plani de ejemplo y la tarjeta "Activá Tu Plan" encima.
         Phase 104 R10: online-only members WITH an active enrollment skip this block and go
         directly to EntrenarView. -->
    <EntrenarVidriera v-else-if="view === 'vidriera'" />

    <!-- Active subscription — EntrenarView (4 tabs) for all members -->
    <EntrenarView v-else />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import TemploLoader from 'src/components/TemploLoader.vue'
import FirstVisitTipBanner from 'src/components/FirstVisitTipBanner.vue'
import { useUserStore, MEMBER_STATE_MAX_AGE_MS } from 'src/stores/useUserStore'
import { useLoadDeadline } from 'src/composables/useLoadDeadline'
import { resolveTrainingIndexView } from '../utils/training-index-view'
import EntrenarVidriera from '../components/EntrenarVidriera.vue'
import EntrenarView from './EntrenarView.vue'

const userStore = useUserStore()
const deadline = useLoadDeadline()

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

/**
 * Fase 203 (D-09): qué se dibuja mientras carga. Una falla es "no sé", nunca "no": solo con todo
 * llegado y sin fallas se afirma la vidriera. Sin perfil espera siempre (D-08).
 */
const view = computed(() =>
  resolveTrainingIndexView({
    profileLoaded: userStore.profile !== null,
    memberStateLoaded: userStore.memberStateLoaded,
    subscriptionFailed: userStore.subscriptionFailed,
    programFailed: userStore.programFailed,
    canEnterTraining: canEnterTraining.value,
    deadlinePassed: deadline.passed.value,
  }),
)

onMounted(() => {
  deadline.start()
  // Sin await: la vista decide con las banderas del store. Dentro de la frescura no pide nada.
  void userStore.ensureMemberState({ maxAgeMs: MEMBER_STATE_MAX_AGE_MS })
})

onBeforeUnmount(() => deadline.cleanup())
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
