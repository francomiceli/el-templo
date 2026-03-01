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
          <q-item-section side v-if="adminStore.pendingCount > 0">
            <q-badge color="negative" :label="adminStore.pendingCount" />
          </q-item-section>
        </q-item>
        <q-item clickable v-ripple to="/generate">
          <q-item-section avatar>
            <q-icon name="auto_awesome" />
          </q-item-section>
          <q-item-section>Generar</q-item-section>
        </q-item>
        <q-item clickable v-ripple to="/exercises">
          <q-item-section avatar>
            <q-icon name="sports_gymnastics" />
          </q-item-section>
          <q-item-section>Ejercicios</q-item-section>
        </q-item>
        <q-item clickable v-ripple to="/alumnos">
          <q-item-section avatar>
            <q-icon name="people" />
          </q-item-section>
          <q-item-section>Alumnos</q-item-section>
        </q-item>

        <template v-if="isAdminRole">
          <q-separator />
          <q-item-label header>Contenido</q-item-label>
          <q-item clickable v-ripple to="/blog">
            <q-item-section avatar>
              <q-icon name="article" />
            </q-item-section>
            <q-item-section>Blog</q-item-section>
          </q-item>
          <q-item clickable v-ripple to="/gladius">
            <q-item-section avatar>
              <q-icon name="fitness_center" />
            </q-item-section>
            <q-item-section>Gladius</q-item-section>
          </q-item>
        </template>
      </q-list>
    </q-drawer>

    <q-page-container>
      <!-- Low sessions alert banner -->
      <q-banner v-if="adminStore.lowSessionsAlert" class="bg-warning text-white">
        <template #avatar>
          <q-icon name="warning" />
        </template>
        Solo hay sesiones aprobadas para la semana actual o menos. Genera y aprueba mas semanas.
        <template #action>
          <q-btn flat color="white" label="Generar" to="/generate" />
        </template>
      </q-banner>

      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from 'src/stores/useAuthStore';
import { useAdminStore } from 'src/stores/useAdminStore';

const drawer = ref(false);
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const adminStore = useAdminStore();

const isAdminRole = computed(() => ['admin', 'superadmin'].includes(authStore.user?.role ?? ''));

async function handleLogout() {
  await authStore.logout();
  router.push('/login');
}

// Fetch pending count and coverage on mount
onMounted(() => {
  adminStore.fetchPendingCount();
  adminStore.checkSessionCoverage();
});

// Refresh pending count on route change
watch(
  () => route.path,
  () => {
    adminStore.fetchPendingCount();
  }
);
</script>
