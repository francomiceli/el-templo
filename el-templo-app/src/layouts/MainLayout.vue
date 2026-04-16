<template>
  <q-layout view="lHh Lpr lFf">
    <!-- Header: full bar on mobile, greeting-only on desktop Mi Templo, hidden otherwise -->
    <q-header
      v-if="!isDesktop || isMiTemplo"
      :elevated="!isMiTemplo"
      class="main-header"
      :class="{ 'main-header--unified': isMiTemplo, 'main-header--desktop': isDesktop }"
    >
      <q-toolbar v-if="!isDesktop">
        <q-toolbar-title class="header-title">
          <img src="/icons/icon-48.webp" alt="El Templo" class="header-logo" />
          <img
            src="/icons/el-templo-title.png"
            alt="EL TEMPLO"
            class="header-title-img"
            style="cursor: pointer"
            @click="router.push('/mi-templo')"
          />
        </q-toolbar-title>

        <q-btn v-if="authStore.isAuthenticated" flat round icon="person" to="/profile">
          <q-tooltip>Mi Perfil</q-tooltip>
        </q-btn>
        <q-btn v-if="authStore.isAuthenticated" flat round icon="logout" @click="onLogout">
          <q-tooltip>Cerrar sesion</q-tooltip>
        </q-btn>
      </q-toolbar>

      <!-- Greeting row — desktop only (stays in sticky header) -->
      <div v-if="isDesktop && isMiTemplo && authStore.isAuthenticated" class="header-greeting">
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

    <!-- Desktop side rail (icons only, expand on hover) -->
    <aside v-if="isDesktop" class="desktop-rail">
      <!-- Brand -->
      <router-link to="/mi-templo" class="desktop-rail__brand">
        <img src="/icons/icon-48.webp" alt="El Templo" class="desktop-rail__icon" />
        <img src="/icons/el-templo-title.png" alt="EL TEMPLO" class="desktop-rail__title-img" />
      </router-link>

      <!-- Navigation -->
      <nav class="desktop-rail__nav">
        <router-link
          v-for="tab in mobileTabs"
          :key="'rail-' + tab.to"
          :to="tab.to"
          class="desktop-rail__tab"
          :class="{ 'desktop-rail__tab--active': isTabActive(tab.to) }"
        >
          <q-icon :name="tab.icon" :size="tab.size ?? '24px'" />
          <span class="desktop-rail__label">{{ tab.label }}</span>
          <q-badge
            v-if="tab.badge && progressionStore.evaluationEligible"
            floating
            rounded
            color="primary"
            class="desktop-rail__badge"
          />
        </router-link>
      </nav>

      <!-- Profile + Logout -->
      <div v-if="authStore.isAuthenticated" class="desktop-rail__actions">
        <router-link to="/profile" class="desktop-rail__tab">
          <q-icon name="person" size="24px" />
          <span class="desktop-rail__label">Mi Perfil</span>
        </router-link>
        <button class="desktop-rail__tab desktop-rail__tab--btn" @click="onLogout">
          <q-icon name="logout" size="24px" />
          <span class="desktop-rail__label">Salir</span>
        </button>
      </div>
    </aside>

    <q-page-container :class="{ 'with-desktop-rail': isDesktop }">
      <!-- Greeting row — mobile only (scrolls with content) -->
      <div v-if="!isDesktop && isMiTemplo && authStore.isAuthenticated" class="mobile-greeting">
        <div class="header-greeting">
          <div class="header-greeting__text">
            <h1 class="header-greeting__name">Hola, {{ memberName }}!</h1>
            <p class="header-greeting__date">{{ formattedDate }}</p>
          </div>
          <div v-if="greetingLevel" class="header-greeting__badge">
            <span class="header-greeting__symbol">{{ greetingLevel.greekLetter }}</span>
            <span class="header-greeting__level">{{ greetingLevel.levelName }}</span>
          </div>
        </div>
      </div>
      <router-view />
    </q-page-container>

    <!-- Check-in FAB (hidden for Templo Online / virtual branch members) -->
    <q-btn
      v-if="showCheckInFab && !isDesktop"
      fab
      icon="qr_code_scanner"
      color="primary"
      class="check-in-fab"
      :class="{ 'check-in-fab--with-footer': !isDesktop }"
      @click="router.push('/check-in')"
    >
      <q-tooltip>Registrar asistencia</q-tooltip>
    </q-btn>

    <div class="app-bg" />

    <!-- Mobile bottom tab bar -->
    <q-footer v-if="!isDesktop" elevated class="mobile-footer">
      <div class="mobile-tabs">
        <router-link
          v-for="tab in mobileTabs"
          :key="tab.to"
          :to="tab.to"
          class="mobile-tab"
          :class="{ 'mobile-tab--active': isTabActive(tab.to) }"
        >
          <q-icon :name="tab.icon" :size="tab.size ?? '24px'" />
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
import { computed } from 'vue'
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

const isDesktop = computed(() => $q.screen.width >= 768)
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
  if (!userStore.hasActiveSubscription) return false
  return route.path === '/mi-templo' || route.path === '/reservas'
})

interface MobileTab {
  to: string
  icon: string
  label: string
  size?: string
  badge?: boolean
}

const mobileTabs = computed<MobileTab[]>(() => {
  const tabs: MobileTab[] = [
    { to: '/mi-templo', icon: 'account_balance', label: 'Mi Templo', badge: true },
    { to: '/training/guia', icon: 'menu_book', label: 'Guía', size: '26px' },
    { to: '/training', icon: 'img:/icons/entrenar.svg', label: 'Entrenar', size: '26px' },
  ]
  tabs.push({ to: '/reservas', icon: 'event_available', label: 'Reservas' })
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

  // Android safe area — Quasar only handles iOS via q-ios-padding class
  body.platform-android & {
    padding-top: env(safe-area-inset-top, 0px);
  }

  &--unified {
    background: linear-gradient(135deg, $brand-terracotta 0%, $brand-aged-gold 100%);
  }

  &--desktop {
    padding-left: 64px;
    background: transparent !important;
    box-shadow: none !important;

    @media (min-width: 1025px) {
      padding-left: 200px;
    }

    .header-greeting {
      background: linear-gradient(135deg, $brand-terracotta 0%, $brand-aged-gold 100%);
      border-radius: 0 0 12px 12px;
    }
  }
}

.main-header--desktop .q-toolbar,
.main-header--desktop .header-greeting {
  max-width: 630px;
  margin-left: auto;
  margin-right: auto;
}

.main-header--desktop .header-greeting {
  padding-top: 16px;
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

/* ------------------------------------------------------------------
   Mobile Greeting (scrolls with content)
   ------------------------------------------------------------------ */
.mobile-greeting {
  position: relative;
  z-index: 1; // above app-bg overlay
  background: linear-gradient(135deg, $brand-terracotta 0%, $brand-aged-gold 100%);
  margin: -1px 0 0; // close gap with header
}

/* ------------------------------------------------------------------
   Desktop Side Rail
   ------------------------------------------------------------------ */
.desktop-rail {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 64px;
  background: linear-gradient(180deg, $brand-aged-gold 0%, $brand-terracotta 100%);
  display: flex;
  flex-direction: column;
  z-index: 1999;
  transition: width 200ms ease;
  overflow: hidden;

  &:hover {
    width: 200px;
    box-shadow: 4px 0 16px rgba(0, 0, 0, 0.15);
  }

  @media (min-width: 1025px) {
    width: 200px;
  }
}

.desktop-rail__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 16px 8px;
  flex-shrink: 0;
  text-decoration: none;
}

.desktop-rail__icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background-color: #f5f0e8;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
}

.desktop-rail__title-img {
  height: 40px;
  width: auto;
  opacity: 0;
  transition: opacity 200ms ease;

  .desktop-rail:hover & {
    opacity: 1;
  }

  @media (min-width: 1025px) {
    opacity: 1;
  }
}

.desktop-rail__nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.desktop-rail__actions {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 16px;
  border-top: 1px solid rgba(white, 0.15);
  margin-top: 8px;
  padding-top: 8px;
}

.desktop-rail__tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px;
  color: rgba(white, 0.6);
  text-decoration: none;
  white-space: nowrap;
  transition:
    color 200ms ease,
    background-color 200ms ease;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    background-color: rgba(white, 0.1);
  }

  &--active {
    color: white;
  }

  :deep(.q-icon img) {
    opacity: 0.6;
    transition: opacity 200ms ease;
  }

  &--active :deep(.q-icon img) {
    opacity: 1;
  }

  &--btn {
    border: none;
    background: none;
    font: inherit;
    cursor: pointer;
    width: 100%;
  }
}

.desktop-rail__label {
  font-family: 'Geologica', sans-serif;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
  opacity: 0;
  transition: opacity 200ms ease;

  .desktop-rail:hover & {
    opacity: 1;
  }

  @media (min-width: 1025px) {
    opacity: 1;
  }
}

.desktop-rail__badge {
  position: absolute;
  top: 8px;
  left: 38px;
}

.with-desktop-rail {
  padding-left: 64px !important;

  @media (min-width: 1025px) {
    padding-left: 200px !important;
  }
}

.with-desktop-rail :deep(.q-page) {
  max-width: 630px;
  margin-left: auto;
  margin-right: auto;
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

  // img-based icons (SVG via img: prefix) don't inherit CSS color.
  // Match active/inactive opacity to the text color alpha.
  :deep(.q-icon img) {
    opacity: 0.6;
    transition: opacity 200ms ease;
  }

  &--active :deep(.q-icon img) {
    opacity: 1;
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
