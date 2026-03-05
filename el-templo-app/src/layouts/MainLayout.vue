<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated class="main-header">
      <q-toolbar>
        <!-- Desktop: hamburger for drawer -->
        <q-btn
          v-if="$q.screen.gt.sm"
          flat
          dense
          round
          icon="menu"
          aria-label="Menu"
          @click="toggleLeftDrawer"
        />

        <q-toolbar-title class="header-title">
          <img src="/icons/icon-48.webp" alt="El Templo" class="header-logo" />
          EL TEMPLO
        </q-toolbar-title>

        <q-btn v-if="authStore.isAuthenticated" flat round icon="logout" @click="onLogout">
          <q-tooltip>Cerrar sesion</q-tooltip>
        </q-btn>
      </q-toolbar>
    </q-header>

    <!-- Desktop drawer (hidden on mobile) -->
    <q-drawer
      v-if="$q.screen.gt.sm"
      v-model="leftDrawerOpen"
      show-if-above
      bordered
      class="main-drawer"
    >
      <q-list>
        <q-item-label header class="drawer-header">Menu</q-item-label>

        <q-item clickable to="/mi-camino" @click="leftDrawerOpen = false">
          <q-item-section avatar>
            <q-icon name="trending_up">
              <q-badge
                v-if="progressionStore.evaluationEligible"
                floating
                rounded
                color="secondary"
              />
            </q-icon>
          </q-item-section>
          <q-item-section>Mi Camino</q-item-section>
        </q-item>

        <q-item clickable to="/training" @click="leftDrawerOpen = false">
          <q-item-section avatar>
            <q-icon name="fitness_center" />
          </q-item-section>
          <q-item-section>Entrenamiento</q-item-section>
        </q-item>

        <q-item clickable to="/journey" @click="leftDrawerOpen = false">
          <q-item-section avatar>
            <q-icon name="explore" />
          </q-item-section>
          <q-item-section>Journey</q-item-section>
        </q-item>

        <q-item clickable to="/training/conceptos" @click="leftDrawerOpen = false">
          <q-item-section avatar>
            <q-icon name="menu_book" />
          </q-item-section>
          <q-item-section>Conceptos</q-item-section>
        </q-item>

        <q-item clickable to="/profile" @click="leftDrawerOpen = false">
          <q-item-section avatar>
            <q-icon name="person" />
          </q-item-section>
          <q-item-section>Mi Perfil</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
    <div class="app-bg" />

    <!-- Mobile bottom tab bar -->
    <q-footer v-if="$q.screen.lt.md" elevated class="mobile-footer">
      <div class="mobile-tabs">
        <router-link
          v-for="tab in mobileTabs"
          :key="tab.to"
          :to="tab.to"
          class="mobile-tab"
          :class="{ 'mobile-tab--active': isTabActive(tab.to) }"
        >
          <q-icon :name="tab.icon" size="24px" />
          <span class="mobile-tab__label">{{ tab.label }}</span>
          <q-badge
            v-if="tab.badge && progressionStore.evaluationEligible"
            floating
            rounded
            color="primary"
            class="mobile-tab__badge"
          />
        </router-link>
      </div>
    </q-footer>
  </q-layout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'stores/useAuthStore'
import { useProgressionStore } from 'src/modules/progression/stores/progressionStore'

const $q = useQuasar()
const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const progressionStore = useProgressionStore()

const leftDrawerOpen = ref(false)

interface MobileTab {
  to: string
  icon: string
  label: string
  badge?: boolean
}

const mobileTabs: MobileTab[] = [
  { to: '/mi-camino', icon: 'trending_up', label: 'Mi Camino', badge: true },
  { to: '/training', icon: 'fitness_center', label: 'Entrenar' },
  { to: '/journey', icon: 'explore', label: 'Journey' },
  { to: '/training/conceptos', icon: 'menu_book', label: 'Conceptos' },
  { to: '/profile', icon: 'person', label: 'Perfil' },
]

function isTabActive(tabTo: string): boolean {
  return route.path.startsWith(tabTo)
}

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value
}

async function onLogout() {
  await authStore.logout()
  $q.notify({ type: 'positive', message: 'Sesion cerrada' })
  router.push('/login')
}
</script>

<style scoped lang="scss">
@import 'src/css/quasar.variables.scss';

.app-bg {
  position: fixed;
  inset: 0;
  background: url('/bars-open.webp') left center / cover no-repeat;
  filter: saturate(0.3) sepia(0.4) contrast(1.05);
  opacity: 0.08;
  pointer-events: none;
  z-index: 0;
}

.main-header {
  background: linear-gradient(135deg, #c07a56 0%, #a0755a 100%);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: 'Montserrat', sans-serif;
  font-size: 1.1rem;
  letter-spacing: 0.1em;
  font-weight: 600;
  text-transform: uppercase;
}

.header-logo {
  height: 32px;
  width: 32px;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.main-drawer {
  background-color: $cream;
}

.drawer-header {
  font-family: 'Montserrat', sans-serif;
  color: $primary;
  letter-spacing: 0.05em;
}

/* ------------------------------------------------------------------
   Mobile Bottom Tab Bar
   ------------------------------------------------------------------ */
.mobile-footer {
  background: $cream;
  border-top: 1px solid rgba($accent, 0.12);
}

.mobile-tabs {
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: 56px;
  padding: 0 4px;
  // Safe area for phones with home indicator
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

.mobile-tab {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  flex: 1;
  height: 100%;
  text-decoration: none;
  color: rgba($accent, 0.5);
  transition: color 200ms ease;
  -webkit-tap-highlight-color: transparent;

  &--active {
    color: $primary;
  }

  &__label {
    font-family: 'Geologica', sans-serif;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  &__badge {
    position: absolute;
    top: 4px;
    right: calc(50% - 16px);
  }
}
</style>
