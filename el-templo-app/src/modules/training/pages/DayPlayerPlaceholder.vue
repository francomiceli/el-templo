<template>
  <q-page class="day-player-placeholder flex flex-center column">
    <!-- Back button fixed at top left -->
    <div class="placeholder__back-button">
      <q-btn
        icon="arrow_back"
        flat
        round
        color="primary"
        @click="goBack"
      />
    </div>

    <!-- Placeholder content -->
    <div class="placeholder__content text-center q-pa-lg">
      <q-icon
        name="build"
        size="120px"
        color="grey-4"
        class="q-mb-md"
      />

      <div class="text-h4 text-weight-bold text-grey-7 q-mb-md">
        Próximamente
      </div>

      <div class="text-body1 text-grey-6 q-mb-lg" style="max-width: 400px;">
        El reproductor de sesión (Day Player) está en desarrollo.
        Aquí podrás entrenar siguiendo tu sesión paso a paso con
        temporizadores, videos y progreso en tiempo real.
      </div>

      <div class="text-caption text-grey-5">
        Sesión para: <strong>{{ formattedDate }}</strong>
      </div>

      <q-btn
        color="primary"
        unelevated
        label="Volver a Semanal"
        class="q-mt-xl"
        @click="goBack"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { formatDayName } from '../composables/useDateNavigation';

/**
 * Day Player Placeholder
 *
 * Temporary page shown when user clicks "Comenzar Entrenamiento".
 * This will be replaced in Phase 7 with the actual Day Player functionality.
 *
 * Displays:
 * - "Próximamente" message
 * - Back button to return to Weekly View
 * - Session date from route params
 */

const route = useRoute();
const router = useRouter();

/**
 * Format the date from route params for display
 */
const formattedDate = computed(() => {
  const dateParam = route.params.date as string;
  if (!dateParam) return 'Fecha no disponible';

  try {
    const dayName = formatDayName(dateParam);
    const date = new Date(dateParam + 'T00:00:00');
    const day = date.getDate();
    const month = date.getMonth() + 1;

    return `${dayName} ${day}/${month}`;
  } catch {
    return dateParam;
  }
});

/**
 * Navigate back to Weekly View
 */
function goBack() {
  router.push({ name: 'training' });
}
</script>

<style scoped lang="scss">
.day-player-placeholder {
  position: relative;
  background: linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%);
}

.placeholder__back-button {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 1;
}

.placeholder__content {
  max-width: 600px;
  margin: 0 auto;
}
</style>
