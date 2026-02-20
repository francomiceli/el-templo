<template>
  <q-page class="journey-session-page" padding>
    <div class="text-center q-pa-xl">
      <q-icon name="construction" size="64px" color="grey-6" />
      <h5 class="q-mt-md text-grey-7">Sesion de Journey</h5>
      <p class="text-grey-6">Proximamente</p>
      <q-btn flat color="primary" label="Volver" icon="arrow_back" to="/journey" />
    </div>
  </q-page>
</template>

<script setup lang="ts">
/**
 * JourneySession placeholder page.
 * Will be implemented in Plan 05 with full session player.
 */
</script>

<style scoped lang="scss">
.journey-session-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
}
</style>
