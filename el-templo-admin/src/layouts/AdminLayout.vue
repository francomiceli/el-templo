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
          <q-item-section side v-if="morososCount > 0">
            <q-badge color="negative" :label="morososCount" />
          </q-item-section>
        </q-item>
        <q-item clickable v-ripple to="/planes">
          <q-item-section avatar>
            <q-icon name="card_membership" />
          </q-item-section>
          <q-item-section>Planes</q-item-section>
        </q-item>
        <q-item clickable v-ripple to="/pagos">
          <q-item-section avatar>
            <q-icon name="payments" />
          </q-item-section>
          <q-item-section>Pagos</q-item-section>
        </q-item>
        <q-item clickable v-ripple to="/horarios">
          <q-item-section avatar>
            <q-icon name="calendar_month" />
          </q-item-section>
          <q-item-section>Horarios</q-item-section>
        </q-item>
        <q-item clickable v-ripple to="/analiticas">
          <q-item-section avatar>
            <q-icon name="analytics" />
          </q-item-section>
          <q-item-section>Analiticas</q-item-section>
        </q-item>
        <q-item clickable v-ripple to="/conversaciones">
          <q-item-section avatar>
            <q-icon name="chat" />
          </q-item-section>
          <q-item-section>WhatsApp</q-item-section>
          <q-item-section side v-if="whatsappActiveCount > 0">
            <q-badge color="negative" :label="whatsappActiveCount" />
          </q-item-section>
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
          <q-item clickable v-ripple to="/academy">
            <q-item-section avatar>
              <q-icon name="school" />
            </q-item-section>
            <q-item-section>Academy</q-item-section>
          </q-item>
          <q-item clickable v-ripple to="/app-waitlist">
            <q-item-section avatar>
              <q-icon name="notifications_active" />
            </q-item-section>
            <q-item-section>App Waitlist</q-item-section>
          </q-item>
          <q-item clickable v-ripple to="/labs-inquiries">
            <q-item-section avatar>
              <q-icon name="business" />
            </q-item-section>
            <q-item-section>Labs Inquiries</q-item-section>
          </q-item>
        </template>

        <template v-if="isSuperadminRole">
          <q-separator />
          <q-item-label header>Franquicias</q-item-label>
          <q-item clickable v-ripple to="/franquicias">
            <q-item-section avatar>
              <q-icon name="store" />
            </q-item-section>
            <q-item-section>Solicitudes</q-item-section>
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from 'src/stores/useAuthStore';
import { useAdminStore } from 'src/stores/useAdminStore';
import { usePaymentsApi } from 'src/composables/usePaymentsApi';
import { useWhatsappApi } from 'src/composables/useWhatsappApi';
import { createLogger } from 'src/utils/logger';

const log = createLogger('AdminLayout');
const drawer = ref(false);
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const adminStore = useAdminStore();
const paymentsApi = usePaymentsApi();
const whatsappApi = useWhatsappApi();
const morososCount = ref(0);
const whatsappActiveCount = ref(0);
let morososInterval: ReturnType<typeof setInterval> | null = null;
let whatsappInterval: ReturnType<typeof setInterval> | null = null;

const isAdminRole = computed(() => ['admin', 'superadmin'].includes(authStore.user?.role ?? ''));
const isSuperadminRole = computed(() => authStore.user?.role === 'superadmin');

async function handleLogout() {
  await authStore.logout();
  router.push('/login');
}

async function fetchMorososCount() {
  try {
    const result = await paymentsApi.getMorososCount();
    morososCount.value = result.count;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido';
    log.error('Error fetching morosos count', { error: message });
  }
}

async function fetchWhatsappActiveCount() {
  try {
    whatsappActiveCount.value = await whatsappApi.getActiveCount();
  } catch {
    // Silently ignore -- badge shows 0 on failure
  }
}

// Fetch pending count, coverage, morosos, and whatsapp on mount
onMounted(() => {
  adminStore.fetchPendingCount();
  adminStore.checkSessionCoverage();
  fetchMorososCount();
  fetchWhatsappActiveCount();

  // Refresh counts every 60 seconds
  morososInterval = setInterval(fetchMorososCount, 60_000);
  whatsappInterval = setInterval(fetchWhatsappActiveCount, 60_000);
});

onUnmounted(() => {
  if (morososInterval !== null) {
    clearInterval(morososInterval);
    morososInterval = null;
  }
  if (whatsappInterval !== null) {
    clearInterval(whatsappInterval);
    whatsappInterval = null;
  }
});

// Refresh pending count and morosos on route change
watch(
  () => route.path,
  () => {
    adminStore.fetchPendingCount();
    fetchMorososCount();
  }
);
</script>
