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
          <h1 class="header-greeting__name">
            Hola, {{ memberName }}!<VeteranSeal :since="memberSince" />
          </h1>
          <p class="header-greeting__date">{{ formattedDate }}</p>
        </div>
        <HeaderLevelDropdown v-if="userStore.activeLevel" />
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
          <q-badge
            v-else-if="tab.introBadge && showIntroBadge"
            floating
            rounded
            color="negative"
            label="1"
            class="desktop-rail__badge desktop-rail__badge--count"
            aria-label="Novedad: Empezá acá"
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
            <h1 class="header-greeting__name">
              Hola, {{ memberName }}!<VeteranSeal :since="memberSince" />
            </h1>
            <p class="header-greeting__date">{{ formattedDate }}</p>
          </div>
          <HeaderLevelDropdown v-if="userStore.activeLevel" />
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

    <!-- Tip de primer uso del QR (SPEC "Empezá acá" A2): globo persistente
         anclado al FAB, una sola vez por socio (useTipsSeenStorage). -->
    <transition name="fade">
      <div
        v-if="showQrTip"
        class="check-in-fab-tip"
        :class="{ 'check-in-fab-tip--with-footer': !isDesktop }"
        role="status"
      >
        <p class="check-in-fab-tip__text">{{ qrTipMessage }}</p>
        <q-btn
          flat
          dense
          no-caps
          label="Entendido"
          class="check-in-fab-tip__btn"
          @click="dismissQrTip"
        />
      </div>
    </transition>

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
          <q-badge
            v-else-if="tab.introBadge && showIntroBadge"
            floating
            rounded
            color="negative"
            label="1"
            class="mobile-tab__badge mobile-tab__badge--count"
            aria-label="Novedad: Empezá acá"
          />
        </router-link>
      </div>
    </q-footer>

    <!-- First-login soft pre-prompt for push notifications (native only). -->
    <PushPermissionDialog />

    <!-- Improvement proposal pop-up (aviso de sistema `improvement_prompt`,
         D-09: cadencia editable server-side). -->
    <ImprovementPromptDialog />

    <!-- Class rating pop-up (aviso de sistema `rating_prompt`, D-08: cadencia
         editable server-side; la guarda por clase sigue siendo local). -->
    <RatingPromptDialog />

    <!-- Plan expiry pop-up (aviso de sistema `plan_expiry`, D-10: regla de
         disparo fija en código, texto y botón editables). -->
    <PlanExpiryDialog />

    <!-- Aviso genérico creado por el staff (D-06/D-07: gana su turno cuando
         no compite con ninguno de los 3 anteriores). -->
    <AvisoPromptDialog />
  </q-layout>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'stores/useAuthStore'
import { useUserStore } from 'stores/useUserStore'
import { useProgressionStore } from 'src/modules/progression/stores/progressionStore'
import { useCommunicationsStore } from 'src/stores/useCommunicationsStore'
import { useAvisosStore } from 'src/stores/useAvisosStore'
import PushPermissionDialog from 'src/components/PushPermissionDialog.vue'
import ImprovementPromptDialog from 'src/components/ImprovementPromptDialog.vue'
import RatingPromptDialog from 'src/components/RatingPromptDialog.vue'
import PlanExpiryDialog from 'src/components/PlanExpiryDialog.vue'
import AvisoPromptDialog from 'src/components/AvisoPromptDialog.vue'
import HeaderLevelDropdown from 'src/modules/training/components/HeaderLevelDropdown.vue'
import VeteranSeal from 'src/components/VeteranSeal.vue'
import { useTipsSeenStorage } from 'src/composables/useTipsSeenStorage'
import { TIPS_CONTENT } from 'src/config/tips-content'
import { isNewMember } from 'src/modules/guia/new-member'

const $q = useQuasar()
const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const userStore = useUserStore()
const progressionStore = useProgressionStore()
const communicationsStore = useCommunicationsStore()
const avisosStore = useAvisosStore()

// Fase 193 (D-20/D-21): hidrata el número de ventas del servidor + el texto
// por defecto de WhatsApp una vez por sesión, mismo patrón `watch` +
// `immediate: true` que los 4 diálogos globales de abajo (ver
// PlanExpiryDialog.vue). MainLayout es el único punto montado siempre que hay
// sesión activa, tanto en boot con token persistido como en login recién
// hecho — cubre ambos caminos de hidratación del perfil sin duplicar lógica
// en boot/auth.ts y useAuthStore.login()/register().
watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) void communicationsStore.loadConfig()
  },
  { immediate: true },
)

// Fase 193 (D-06/D-07): un único punto que pide "qué pop-up toca hoy" — la
// app ya NO arbitra, cada uno de los 4 diálogos de abajo (PushPermissionDialog
// queda fuera, D-07) solo reacciona al getter que le corresponde en
// `avisosStore`. `reset()` al desloguear limpia el estado de la apertura
// anterior para que la próxima sesión evalúe de cero.
watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) {
      void avisosStore.evaluate()
    } else {
      avisosStore.reset()
    }
  },
  { immediate: true },
)

// SPEC "Empezá acá" B — apertura automática: la primera vez que un socio
// entra DESPUÉS de completar el onboarding (o ya lo tenía completo) y nunca
// vio las historias, se abren solas una vez navegando a la Guía
// (`/training/guia`, SPEC "La Guía pasa a ser las historias" 2026-09-24: ya
// no hay una pantalla `empeza-aca` separada, las historias SON la Guía).
// `introStoriesChecked` acota la decisión a la primera vez que el perfil está
// disponible en esta sesión — MainLayout persiste durante toda la sesión (no
// se remonta entre navegaciones), así que esto nunca se re-evalúa hasta el
// próximo login. Si el socio cambia de tab antes del final, GuiaPage ya
// registró "seen" y actualizó `userStore.profile` — no vuelven a abrirse solas.
let introStoriesChecked = false
watch(
  () => userStore.profile,
  (profile) => {
    if (!profile || introStoriesChecked) return
    introStoriesChecked = true
    if (
      profile.role === 'member' &&
      profile.onboardingCompleted &&
      !profile.introStoriesSeenAt &&
      isNewMember(profile.memberSince) &&
      route.name !== 'guia'
    ) {
      void router.push({ name: 'guia' })
    }
  },
  { immediate: true },
)

const isDesktop = computed(() => $q.screen.width >= 768)
const isMiTemplo = computed(() => route.path === '/mi-templo')

const memberSince = computed(() => userStore.profile?.memberSince ?? null)

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

const showCheckInFab = computed(() => {
  if (!authStore.isAuthenticated) return false
  if (!userStore.profile) return false
  if (userStore.profile.branchIsVirtual) return false
  if (!userStore.hasActiveSubscription) return false
  return route.path === '/mi-templo' || route.path === '/reservas'
})

// "Empezá acá" (Franco, 2026-09-24): TODOS los socios ven un "1" rojo sobre
// Guía hasta que abren las historias; al abrirlas, EmpezaAcaPage registra
// `introStoriesSeenAt` en el perfil y la pelotita desaparece.
const showIntroBadge = computed(() => {
  const profile = userStore.profile
  return !!profile && profile.role === 'member' && !profile.introStoriesSeenAt
})

// SPEC "Empezá acá" A2 — tip de primer uso del QR de check-in: se muestra
// una sola vez por socio (useTipsSeenStorage), la primera vez que el FAB se
// vuelve visible. `qrTipChecked` evita re-consultar el storage en cada
// recomputo de `showCheckInFab` (cambia de página en página) — solo importa
// la PRIMERA vez que se hizo visible en esta sesión.
const tipsStorage = useTipsSeenStorage()
const qrTipMessage = TIPS_CONTENT['qr-checkin'].message
const showQrTip = ref(false)
let qrTipChecked = false

watch(
  showCheckInFab,
  (visible) => {
    if (!visible || qrTipChecked) return
    const userId = userStore.profile?.id
    if (!userId) return
    qrTipChecked = true
    // Globos de primer uso: solo socios nuevos (ver new-member.ts).
    if (!isNewMember(userStore.profile?.memberSince)) return
    void tipsStorage.hasSeen(userId, 'qr-checkin').then((seen) => {
      if (!seen) showQrTip.value = true
    })
  },
  { immediate: true },
)

async function dismissQrTip() {
  showQrTip.value = false
  const userId = userStore.profile?.id
  if (userId) await tipsStorage.markSeen(userId, 'qr-checkin')
}

interface MobileTab {
  to: string
  icon: string
  label: string
  size?: string
  badge?: boolean
  /** Pelotita roja con "1" mientras el socio no abrió "Empezá acá". */
  introBadge?: boolean
}

const mobileTabs = computed<MobileTab[]>(() => {
  const tabs: MobileTab[] = [
    { to: '/mi-templo', icon: 'account_balance', label: 'Mi Templo', badge: true },
    { to: '/training/guia', icon: 'menu_book', label: 'Guía', size: '26px', introBadge: true },
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

// "1" rojo de "Empezá acá" sobre Guía: un número legible, no un punto.
.desktop-rail__badge--count,
.mobile-tab__badge--count {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  justify-content: center;
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

/* ------------------------------------------------------------------
   Check-in FAB — tip de primer uso (SPEC "Empezá acá" A2)
   ------------------------------------------------------------------ */
.check-in-fab-tip {
  position: fixed;
  bottom: 100px;
  right: 16px;
  z-index: 101; // por encima del FAB
  max-width: 220px;
  padding: 12px 14px;
  border-radius: 14px;
  background: $primary;
  color: white;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);

  // Flechita apuntando al FAB
  &::after {
    content: '';
    position: absolute;
    bottom: -8px;
    right: 28px;
    border-width: 8px 8px 0;
    border-style: solid;
    border-color: $primary transparent transparent;
  }

  &--with-footer {
    bottom: calc(56px + env(safe-area-inset-bottom, 0px) + 92px);
  }
}

.check-in-fab-tip__text {
  margin: 0 0 6px;
  font-size: 13px;
  line-height: 1.4;
}

.check-in-fab-tip__btn {
  color: white;
  font-weight: 600;
  min-height: 28px;
  padding: 0 8px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
