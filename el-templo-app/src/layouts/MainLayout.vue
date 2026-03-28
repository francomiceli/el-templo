<template>
  <q-layout view="lHh Lpr lFf">
    <q-header
      :elevated="!isMiTemplo"
      class="main-header"
      :class="{ 'main-header--unified': isMiTemplo }"
    >
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

        <q-toolbar-title
          class="header-title"
          clickable
          @click="$router.push('/mi-templo')"
          style="cursor: pointer"
        >
          <img src="/icons/icon-48.webp" alt="El Templo" class="header-logo" />
          <img src="/icons/el-templo-title.png" alt="EL TEMPLO" class="header-title-img" />
        </q-toolbar-title>

        <q-btn v-if="authStore.isAuthenticated" flat round icon="person" to="/profile">
          <q-tooltip>Mi Perfil</q-tooltip>
        </q-btn>
        <q-btn v-if="authStore.isAuthenticated" flat round icon="logout" @click="onLogout">
          <q-tooltip>Cerrar sesion</q-tooltip>
        </q-btn>
      </q-toolbar>

      <!-- Greeting row — only on Mi Templo -->
      <div v-if="isMiTemplo && authStore.isAuthenticated" class="header-greeting">
        <div class="header-greeting__text">
          <h1 class="header-greeting__name">Hola, {{ memberName }}!</h1>
          <p class="header-greeting__date">{{ formattedDate }}</p>
        </div>
        <div v-if="greetingLevel" class="header-greeting__badge">
          <span class="header-greeting__symbol">{{ greetingLevel.greekLetter }}</span>
          <span class="header-greeting__level">{{ greetingLevel.levelName }}</span>
        </div>
      </div>
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

        <q-item clickable to="/mi-templo" @click="leftDrawerOpen = false">
          <q-item-section avatar>
            <q-icon name="account_balance">
              <q-badge
                v-if="progressionStore.evaluationEligible"
                floating
                rounded
                color="secondary"
              />
            </q-icon>
          </q-item-section>
          <q-item-section>Mi Templo</q-item-section>
        </q-item>

        <q-item clickable to="/training" @click="leftDrawerOpen = false">
          <q-item-section avatar>
            <q-icon name="fitness_center" />
          </q-item-section>
          <q-item-section>Entrenamiento</q-item-section>
        </q-item>

        <q-item clickable to="/reservas" @click="leftDrawerOpen = false">
          <q-item-section avatar>
            <q-icon name="event_available" />
          </q-item-section>
          <q-item-section>Reservas</q-item-section>
        </q-item>

        <q-item clickable to="/training/guia" @click="leftDrawerOpen = false">
          <q-item-section avatar>
            <q-icon name="menu_book" />
          </q-item-section>
          <q-item-section>Guía</q-item-section>
        </q-item>

        <q-item clickable to="/planes" @click="leftDrawerOpen = false">
          <q-item-section avatar>
            <q-icon name="card_membership" />
          </q-item-section>
          <q-item-section>Planes</q-item-section>
        </q-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>

    <!-- Check-in FAB (hidden for Templo Online / virtual branch members) -->
    <q-btn
      v-if="showCheckInFab"
      fab
      icon="qr_code_scanner"
      color="primary"
      class="check-in-fab"
      :class="{ 'check-in-fab--with-footer': $q.screen.lt.md }"
      @click="router.push('/check-in')"
    >
      <q-tooltip>Registrar asistencia</q-tooltip>
    </q-btn>

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
import { ref, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'stores/useAuthStore'
import { useUserStore } from 'stores/useUserStore'
import { useProgressionStore } from 'src/modules/progression/stores/progressionStore'

const $q = useQuasar()
const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const userStore = useUserStore()
const progressionStore = useProgressionStore()

const isMiTemplo = computed(() => route.path === '/mi-templo')

const memberName = computed(() => {
  const profile = userStore.profile
  if (!profile) return 'Atleta'
  return profile.firstName ?? profile.displayName ?? 'Atleta'
})

const formattedDate = computed(() => {
  const date = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return 'Hoy es ' + date.charAt(0).toUpperCase() + date.slice(1)
})

const greetingLevel = computed(() => {
  if (!progressionStore.level) return null
  return {
    greekLetter: progressionStore.level.greekLetter,
    levelName: progressionStore.level.displayName,
  }
})

const showCheckInFab = computed(() => {
  if (!authStore.isAuthenticated) return false
  if (!userStore.profile) return false
  if (userStore.profile.branchIsVirtual) return false
  return route.path === '/mi-templo'
})

const leftDrawerOpen = ref(false)

interface MobileTab {
  to: string
  icon: string
  label: string
  badge?: boolean
}

const mobileTabs = computed<MobileTab[]>(() => {
  const tabs: MobileTab[] = [
    { to: '/mi-templo', icon: 'account_balance', label: 'Mi Templo', badge: true },
    { to: '/training', icon: 'fitness_center', label: 'Entrenar' },
  ]
  tabs.push({ to: '/reservas', icon: 'event_available', label: 'Reservas' })
  tabs.push({ to: '/training/guia', icon: 'menu_book', label: 'Guía' })
  tabs.push({ to: '/planes', icon: 'card_membership', label: 'Planes' })
  return tabs
})

function isTabActive(tabTo: string): boolean {
  // Exact match for /training to avoid matching /training/guia
  if (tabTo === '/training') {
    return (
      route.path === '/training' ||
      (route.path.startsWith('/training') && !route.path.startsWith('/training/guia'))
    )
  }
  return route.path.startsWith(tabTo)
}

function toggleLeftDrawer() {
  leftDrawerOpen.value = !leftDrawerOpen.value
}

async function onLogout() {
  await authStore.logout()
  $q.notify({ type: 'positive', message: 'Sesión cerrada' })
  router.push('/login')
}
</script>

<style scoped lang="scss">
@import 'src/css/brand';
@import 'src/css/quasar.variables.scss';

.app-bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100lvh;
  background: url('/bars-open.webp') left center / cover no-repeat;
  filter: saturate(0.3) sepia(0.4) contrast(1.05);
  opacity: 0.08;
  pointer-events: none;
  z-index: 0;
}

.main-header {
  background: linear-gradient(135deg, $brand-terracotta 0%, $brand-aged-gold 100%);

  &--unified {
    background: linear-gradient(135deg, $brand-terracotta 0%, $brand-aged-gold 100%);
  }
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-title-img {
  height: 40px;
  width: auto;
}

.header-logo {
  height: 32px;
  width: 32px;
  border-radius: 6px;
  background-color: #f5f0e8;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.header-greeting {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 8px 16px 14px;

  &__text {
    flex: 1;
  }

  &__name {
    font-family: 'Montserrat', sans-serif;
    font-size: 22px;
    font-weight: 600;
    color: #fff;
    margin: 0;
    line-height: 1.2;
  }

  &__date {
    font-family: 'Geologica', sans-serif;
    font-size: 12px;
    color: rgba(white, 0.7);
    margin: 2px 0 0;
  }

  &__badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    opacity: 0.6;
    padding-bottom: 2px;
    margin-right: 6px;
  }

  &__symbol {
    font-size: 32px;
    color: #fff;
    line-height: 1;
  }

  &__level {
    font-size: 8px;
    color: #fff;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
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
  background: linear-gradient(135deg, $brand-aged-gold 0%, $brand-terracotta 100%);
  border-top: none;
  // Safe area for phones with home indicator — gradient fills below the tabs
  padding-bottom: env(safe-area-inset-bottom, 0px);
  // iOS Safari: force compositor layer to prevent fixed-position detach during scroll
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

.mobile-tabs {
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: 56px;
  padding: 0 4px;
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
  color: rgba(white, 0.6);
  transition: color 200ms ease;
  -webkit-tap-highlight-color: transparent;

  &--active {
    color: white;
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

/* ------------------------------------------------------------------
   Check-in FAB
   ------------------------------------------------------------------ */
.check-in-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 100;

  &--with-footer {
    // Above mobile footer tabs (56px height + safe area)
    bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 16px);
  }
}
</style>
