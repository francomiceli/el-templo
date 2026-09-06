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
        <!-- Drawer derivado de NAV_MODEL (templo-config.ts): un header por
             categoría visible (≥1 item visible para el rol) + sus items. -->
        <template v-for="(cat, catIdx) in visibleCategories" :key="cat.header">
          <q-separator v-if="catIdx > 0" />
          <q-item-label header>{{ cat.header }}</q-item-label>
          <q-item
            v-for="item in visibleItems(cat)"
            :key="item.path"
            clickable
            v-ripple
            :to="item.path"
          >
            <q-item-section avatar>
              <q-icon :name="item.icon" />
            </q-item-section>
            <q-item-section>{{ item.label }}</q-item-section>
            <q-item-section side v-if="badgeCount(item) > 0">
              <q-badge color="negative" :label="badgeCount(item)" />
            </q-item-section>
          </q-item>
        </template>
      </q-list>
    </q-drawer>

    <q-page-container>
      <!-- Low sessions alert banner -->
      <q-banner
        v-if="canSeeTraining && adminStore.lowSessionsAlert && $route.path !== '/generate'"
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
import { canAccessTraining } from 'src/utils/trainingAccess';
import {
  NAV_MODEL,
  isNavCategoryVisible,
  isNavItemVisible,
  type NavCategory,
  type NavItem,
} from 'src/config/templo-config';

const drawer = ref(false);
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const adminStore = useAdminStore();

// Staging-only visual marker: the CI staging build sets VITE_APP_ENVIRONMENT=staging
// (production leaves it unset). Drives the blue header + "(PRUEBAS)" title so
// it's obvious at a glance which environment you're operating on.
const isStaging = computed(() => import.meta.env.VITE_APP_ENVIRONMENT === 'staging');

// Drawer visibility derives entirely from NAV_MODEL (templo-config.ts) — the
// single source of truth. No inline role sets here (the 7 ad-hoc computed that
// duplicated allowedRoles were removed; visibility lives in the config now).
const visibleCategories = computed(() =>
  NAV_MODEL.filter((cat) => isNavCategoryVisible(cat, authStore.user))
);
function visibleItems(cat: NavCategory) {
  return cat.items.filter((item) => isNavItemVisible(item, authStore.user));
}

// Pelotita de cada ítem: la clave `badge` del NAV_MODEL elige el contador del
// store. Un solo lugar para todos los badges (antes había un v-if por clave).
function badgeCount(item: NavItem): number {
  switch (item.badge) {
    case 'pending':
      return adminStore.pendingCount;
    case 'app-trials':
      return adminStore.appTrialsPendingCount;
    case 'landing-academy':
      return adminStore.landingInbox.academy;
    case 'landing-labs':
      return adminStore.landingInbox.labs;
    case 'landing-franquicias':
      return adminStore.landingInbox.franchise;
    default:
      return 0;
  }
}

// Quiénes ven el grupo Landing (y por ende sus pelotitas): se deriva del
// NAV_MODEL en vez de repetir el set de roles + el flag Templo acá.
const canSeeLanding = computed(() =>
  visibleCategories.value.some((cat) => cat.header === 'Landing')
);

// Entrenamiento surface (sesiones, programador, ejercicios, árbol): owner or
// the exclusive training coach only. Still needed to gate the mount/watch
// fetches and the low-sessions banner below (nav item visibility itself now
// comes from isNavItemVisible on the trainingOnly items).
const canSeeTraining = computed(() => canAccessTraining(authStore.user));

// Quiénes ven Reportes (y por ende la pelotita de SP desde la app): gestión,
// admin y dueño. Mismo set que REPORTES_ROLES en templo-config.ts.
const canSeeReports = computed(() => {
  const role = authStore.user?.role;
  return role === 'gestion' || role === 'admin' || role === 'owner';
});

async function handleLogout() {
  await authStore.logout();
  router.push('/login');
}

// Fetch pending count and coverage on mount (only for training viewers)
onMounted(() => {
  if (canSeeTraining.value) {
    adminStore.fetchPendingCount();
    adminStore.checkSessionCoverage();
  }
  if (canSeeReports.value) {
    adminStore.fetchAppTrialsPendingCount();
  }
  if (canSeeLanding.value) {
    adminStore.fetchLandingInbox();
  }
});

// Refresh pending count on route change (only for training viewers)
watch(
  () => route.path,
  () => {
    if (canSeeTraining.value) {
      adminStore.fetchPendingCount();
    }
    if (canSeeReports.value) {
      adminStore.fetchAppTrialsPendingCount();
    }
    if (canSeeLanding.value) {
      adminStore.fetchLandingInbox();
    }
  }
);
</script>
