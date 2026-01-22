<template>
  <q-page class="flex flex-center column q-pa-md">
    <div class="text-center">
      <q-icon name="fitness_center" size="80px" color="primary" />
      <h1 class="text-h3 q-mt-md q-mb-sm">El Templo</h1>
      <p class="text-subtitle1 text-grey-7">Training Module</p>

      <div class="q-mt-xl">
        <q-banner v-if="!isAuthenticated" class="bg-grey-2 q-mb-md" rounded>
          <template v-slot:avatar>
            <q-icon name="info" color="primary" />
          </template>
          Phase 1 Complete: Foundation ready
        </q-banner>

        <div class="q-gutter-md">
          <q-btn
            color="primary"
            label="Login"
            to="/login"
            :disable="true"
            class="q-px-xl"
          />
          <q-btn
            color="secondary"
            label="Register"
            to="/register"
            :disable="true"
            outline
            class="q-px-xl"
          />
        </div>

        <p class="text-caption text-grey q-mt-md">
          Authentication coming in Phase 2
        </p>
      </div>

      <q-separator class="q-my-xl" />

      <div class="text-left" style="max-width: 400px">
        <p class="text-subtitle2 text-grey-8 q-mb-sm">Foundation Status:</p>
        <q-list dense>
          <q-item>
            <q-item-section avatar>
              <q-icon name="check_circle" color="positive" />
            </q-item-section>
            <q-item-section>Quasar + Capacitor configured</q-item-section>
          </q-item>
          <q-item>
            <q-item-section avatar>
              <q-icon name="check_circle" color="positive" />
            </q-item-section>
            <q-item-section>Pinia stores ready</q-item-section>
          </q-item>
          <q-item>
            <q-item-section avatar>
              <q-icon name="check_circle" color="positive" />
            </q-item-section>
            <q-item-section>API client configured</q-item-section>
          </q-item>
          <q-item>
            <q-item-section avatar>
              <q-icon name="schedule" color="warning" />
            </q-item-section>
            <q-item-section>Backend connection: {{ apiStatus }}</q-item-section>
          </q-item>
        </q-list>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAuthStore } from 'stores/useAuthStore';
import axios from 'axios';
import { storeToRefs } from 'pinia';

const authStore = useAuthStore();
const { isAuthenticated } = storeToRefs(authStore);

const apiStatus = ref('checking...');

// Health endpoint is at root level, not under /api
const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace('/api', '');

onMounted(async () => {
  try {
    const response = await axios.get(`${apiBaseUrl}/health`);
    if (response.data.status === 'ok') {
      apiStatus.value = 'connected';
    }
  } catch {
    apiStatus.value = 'offline (start backend with pnpm dev)';
  }
});
</script>

<style scoped>
.q-page {
  min-height: calc(100vh - 50px);
}
</style>
