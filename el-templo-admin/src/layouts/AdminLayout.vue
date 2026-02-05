<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated class="bg-primary">
      <q-toolbar>
        <q-btn flat dense round icon="menu" @click="drawer = !drawer" />
        <q-toolbar-title>El Templo Admin</q-toolbar-title>
        <q-btn flat round icon="logout" @click="handleLogout">
          <q-tooltip>Cerrar sesion</q-tooltip>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="drawer" show-if-above bordered>
      <q-list>
        <q-item-label header>Menu</q-item-label>
        <q-item clickable v-ripple to="/sessions">
          <q-item-section avatar>
            <q-icon name="fitness_center" />
          </q-item-section>
          <q-item-section>Sesiones</q-item-section>
          <q-item-section side v-if="pendingCount > 0">
            <q-badge color="negative" :label="pendingCount" />
          </q-item-section>
        </q-item>
        <q-item clickable v-ripple to="/generate">
          <q-item-section avatar>
            <q-icon name="auto_awesome" />
          </q-item-section>
          <q-item-section>Generar</q-item-section>
        </q-item>
        <q-item clickable v-ripple to="/discarded">
          <q-item-section avatar>
            <q-icon name="delete_outline" />
          </q-item-section>
          <q-item-section>Descartadas</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from 'src/stores/useAuthStore';

const drawer = ref(false);
const pendingCount = ref(0); // Will be fetched from API in later plan
const router = useRouter();
const authStore = useAuthStore();

async function handleLogout() {
  await authStore.logout();
  router.push('/login');
}
</script>
