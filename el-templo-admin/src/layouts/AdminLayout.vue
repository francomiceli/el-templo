<template>
  <q-layout view="lHh Lpr lFf">
    <!-- In staging the bg-primary turns blue-9 globally (see app.scss
         body.staging-env override); only the title text is conditional here. -->
    <q-header elevated class="bg-primary">
      <q-toolbar>
        <q-btn flat dense round icon="menu" @click="drawer = !drawer" />
        <q-toolbar-title>{{
          isStaging ? 'El Templo Admin (PRUEBAS)' : 'El Templo Admin'
        }}</q-toolbar-title>
        <q-btn flat round icon="logout" @click="handleLogout">
          <q-tooltip>Cerrar sesion</q-tooltip>
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="drawer" show-if-above bordered :width="220">
      <q-list>
        <!-- Entrenamiento -->
        <template v-if="isCoachRole">
          <q-item-label header>Entrenamiento</q-item-label>
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
            <q-item-section>Programador</q-item-section>
          </q-item>
          <q-item clickable v-ripple to="/exercises">
            <q-item-section avatar>
              <q-icon name="sports_gymnastics" />
            </q-item-section>
            <q-item-section>Ejercicios</q-item-section>
          </q-item>
          <q-item clickable v-ripple to="/proposals">
            <q-item-section avatar>
              <q-icon name="rule" />
            </q-item-section>
            <q-item-section>Revisión de dimensiones</q-item-section>
          </q-item>
          <q-item clickable v-ripple to="/tree-editor">
            <q-item-section avatar>
              <q-icon name="account_tree" />
            </q-item-section>
            <q-item-section>Editor de árbol</q-item-section>
          </q-item>
          <q-item clickable v-ripple to="/tree-map">
            <q-item-section avatar>
              <q-icon name="hub" />
            </q-item-section>
            <q-item-section>Mapa del árbol</q-item-section>
          </q-item>
        </template>

        <!-- Gestion -->
        <q-separator v-if="isCoachRole" />
        <q-item-label header>Gestion</q-item-label>
        <q-item clickable v-ripple to="/alumnos">
          <q-item-section avatar>
            <q-icon name="people" />
          </q-item-section>
          <q-item-section>Alumnos</q-item-section>
        </q-item>
        <q-item clickable v-ripple to="/horarios">
          <q-item-section avatar>
            <q-icon name="calendar_month" />
          </q-item-section>
          <q-item-section>Horarios</q-item-section>
        </q-item>
        <q-item v-if="isCoachDebtsRole" clickable v-ripple to="/deudas">
          <q-item-section avatar>
            <q-icon name="request_quote" />
          </q-item-section>
          <q-item-section>Deudas</q-item-section>
        </q-item>
        <q-item v-if="isCajaRole" clickable v-ripple to="/planes">
          <q-item-section avatar>
            <q-icon name="card_membership" />
          </q-item-section>
          <q-item-section>Planes</q-item-section>
        </q-item>
        <q-item v-if="isCajaRole" clickable v-ripple to="/programas">
          <q-item-section avatar>
            <q-icon name="school" />
          </q-item-section>
          <q-item-section>Programas</q-item-section>
        </q-item>
        <q-item v-if="isCajaRole" clickable v-ripple to="/caja">
          <q-item-section avatar>
            <q-icon name="point_of_sale" />
          </q-item-section>
          <q-item-section>Caja</q-item-section>
        </q-item>
        <q-item v-if="isAdminRole" clickable v-ripple to="/analiticas">
          <q-item-section avatar>
            <q-icon name="analytics" />
          </q-item-section>
          <q-item-section>Analiticas</q-item-section>
        </q-item>
        <q-item v-if="isCajaRole" clickable v-ripple to="/reportes">
          <q-item-section avatar>
            <q-icon name="summarize" />
          </q-item-section>
          <q-item-section>Reportes</q-item-section>
        </q-item>
        <q-item v-if="isAdminRole" clickable v-ripple to="/campanias">
          <q-item-section avatar>
            <q-icon name="campaign" />
          </q-item-section>
          <q-item-section>Campañas</q-item-section>
        </q-item>

        <!-- Landing (owner only) -->
        <template v-if="isOwnerRole">
          <q-separator />
          <q-item-label header>Landing</q-item-label>
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
          <q-item clickable v-ripple to="/franquicias">
            <q-item-section avatar>
              <q-icon name="store" />
            </q-item-section>
            <q-item-section>Franquicias</q-item-section>
          </q-item>
        </template>

        <!-- Administracion (admin/owner) -->
        <template v-if="isAdminRole">
          <q-separator />
          <q-item-label header>Administracion</q-item-label>
          <q-item v-if="isOwnerRole" clickable v-ripple to="/usuarios">
            <q-item-section avatar>
              <q-icon name="manage_accounts" />
            </q-item-section>
            <q-item-section>Usuarios</q-item-section>
          </q-item>
          <q-item clickable v-ripple to="/configuracion">
            <q-item-section avatar>
              <q-icon name="settings" />
            </q-item-section>
            <q-item-section>Configuracion</q-item-section>
          </q-item>
          <q-item clickable v-ripple to="/notificaciones">
            <q-item-section avatar>
              <q-icon name="notifications" />
            </q-item-section>
            <q-item-section>Notificaciones</q-item-section>
          </q-item>
        </template>
      </q-list>
    </q-drawer>

    <q-page-container>
      <!-- Low sessions alert banner -->
      <q-banner
        v-if="isCoachRole && adminStore.lowSessionsAlert && $route.path !== '/generate'"
        class="bg-warning text-white"
      >
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

// Staging-only visual marker: the CI staging build sets VITE_APP_ENVIRONMENT=staging
// (production leaves it unset). Drives the blue header + "(PRUEBAS)" title so
// it's obvious at a glance which environment you're operating on.
const isStaging = computed(() => import.meta.env.VITE_APP_ENVIRONMENT === 'staging');

// Permission-based sidebar visibility
const userRole = computed(() => authStore.user?.role ?? '');

// coach, admin, owner can see training pages (sesiones, generar, ejercicios, horarios)
const isCoachRole = computed(() => ['coach', 'owner'].includes(userRole.value));

// admin, owner can see admin pages (planes, analiticas)
const isAdminRole = computed(() => ['admin', 'owner'].includes(userRole.value));

// gestion, admin, owner can see caja and reportes
const isCajaRole = computed(() => ['gestion', 'admin', 'owner'].includes(userRole.value));

// coach + caja roles can see the simplified Deudas tab (server-side guard
// uses COACH_DEBTS_ROLES; keep this in sync)
const isCoachDebtsRole = computed(() =>
  ['coach', 'gestion', 'admin', 'owner'].includes(userRole.value)
);

// owner only for content pages, franquicias, usuarios
const isOwnerRole = computed(() => userRole.value === 'owner');

async function handleLogout() {
  await authStore.logout();
  router.push('/login');
}

// Fetch pending count and coverage on mount (only for coach+ roles)
onMounted(() => {
  if (isCoachRole.value) {
    adminStore.fetchPendingCount();
    adminStore.checkSessionCoverage();
  }
});

// Refresh pending count on route change (only for coach+ roles)
watch(
  () => route.path,
  () => {
    if (isCoachRole.value) {
      adminStore.fetchPendingCount();
    }
  }
);
</script>
