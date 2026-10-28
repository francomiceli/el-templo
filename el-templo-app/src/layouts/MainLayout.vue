<template>
  <q-layout view="lHh Lpr lFf">
    <!-- D-16 (fase 199): la foto de fondo es el primer hijo y va DETRÁS (z-index -1) -->
    <div class="app-bg" aria-hidden="true" />

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
          <!-- Sin perfil: esqueleto, nunca "Atleta" ni una fecha en la zona por defecto (D-08). -->
          <h1 class="header-greeting__name">
            <q-skeleton
              v-if="!profileReady"
              type="text"
              tag="span"
              animation="none"
              class="header-greeting__sk-name"
            />
            <template v-else>
              Hola, {{ memberName }}!<VeteranSeal :since="memberSince" />
            </template>
          </h1>
          <p class="header-greeting__date">
            <q-skeleton
              v-if="!profileReady"
              type="text"
              tag="span"
              animation="none"
              class="header-greeting__sk-date"
            />
            <template v-else>{{ formattedDate }}</template>
          </p>
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
          v-for="tab in navTabs"
          :key="'rail-' + tab.to"
          :to="tab.to"
          class="desktop-rail__tab"
          :class="{ 'desktop-rail__tab--active': isTabActive(tab) }"
        >
          <q-icon :name="tab.icon" :size="tab.size ?? '24px'" />
          <span class="desktop-rail__label">{{ tab.label }}</span>
          <span
            v-if="tab.dot"
            class="tab-dot desktop-rail__badge"
            role="status"
            :aria-label="tab.dot.label"
          />
        </router-link>
      </nav>

      <!-- Profile + Logout -->
      <div v-if="authStore.isAuthenticated" class="desktop-rail__actions">
        <router-link
          to="/profile"
          class="desktop-rail__tab"
          :class="{ 'desktop-rail__tab--active': route.path.startsWith('/profile') }"
        >
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
              <q-skeleton
                v-if="!profileReady"
                type="text"
                tag="span"
                animation="none"
                class="header-greeting__sk-name"
              />
              <template v-else>
                Hola, {{ memberName }}!<VeteranSeal :since="memberSince" />
              </template>
            </h1>
            <p class="header-greeting__date">
              <q-skeleton
                v-if="!profileReady"
                type="text"
                tag="span"
                animation="none"
                class="header-greeting__sk-date"
              />
              <template v-else>{{ formattedDate }}</template>
            </p>
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
      no-caps
      icon="qr_code_scanner"
      label="Marcar asistencia"
      aria-label="Marcar asistencia"
      class="check-in-fab check-in-fab--extended"
      :class="{ 'check-in-fab--with-footer': !isDesktop }"
      @click="router.push('/check-in')"
    />

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

    <!-- Mobile bottom tab bar -->
    <q-footer v-if="!isDesktop" elevated class="mobile-footer">
      <div class="mobile-tabs">
        <router-link
          v-for="tab in navTabs"
          :key="tab.to"
          :to="tab.to"
          class="mobile-tab"
          :class="{ 'mobile-tab--active': isTabActive(tab) }"
        >
          <q-icon :name="tab.icon" :size="tab.size ?? '24px'" />
          <span class="mobile-tab__label">{{ tab.label }}</span>
          <span
            v-if="tab.dot"
            class="tab-dot mobile-tab__badge"
            role="status"
            :aria-label="tab.dot.label"
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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'stores/useAuthStore'
import { useUserStore } from 'stores/useUserStore'
import { useProgressionStore } from 'src/modules/progression/stores/progressionStore'
import { useCommunicationsStore } from 'src/stores/useCommunicationsStore'
import { useAvisosStore } from 'src/stores/useAvisosStore'
import { useNovedadesStore } from 'src/stores/useNovedadesStore'
import { useSponsorsStore } from 'src/stores/useSponsorsStore'
import { useTodayBookingStore } from 'src/stores/useTodayBookingStore'
import { useCardHadContentStore } from 'src/stores/useCardHadContentStore'
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
import { ANATOMIA_ALUMNOS_ENABLED } from 'src/config/featureFlags'
import { maybeRequestReview } from 'src/utils/in-app-review'
import { DEFAULT_BRANCH_TZ } from 'src/utils/tz'

const $q = useQuasar()
const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const userStore = useUserStore()
const progressionStore = useProgressionStore()
const communicationsStore = useCommunicationsStore()
const avisosStore = useAvisosStore()
const novedadesStore = useNovedadesStore()
const sponsorsStore = useSponsorsStore()
const todayBookingStore = useTodayBookingStore()
const cardFlags = useCardHadContentStore()

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
      // Pelotita de Planes: el flag viene en plan-status, que viaja dentro de la carga del socio.
      // ensureMemberState comparte la promesa con el boot y con Mi Templo, y cubre el boot con token
      // y el login recién hecho (el boot no corre en ese caso). Fase 203 (SC-4): un solo plan-status.
      void userStore.ensureMemberState()
      // D-04/D-06: turno de hoy + reloj de la ventana ±20 min (compartido con Mi Templo).
      void todayBookingStore.load()
      todayBookingStore.startClock()
      // Fase 203 (D-02): flags "tuvo contenido" del socio. Cubre el login sin reinicio; si el
      // boot ya los hidrató para este socio es un no-op.
      const userId = authStore.user?.id
      if (userId !== undefined) void cardFlags.hydrate(userId)
    } else {
      avisosStore.reset()
      // Novedades de Mi Templo: la próxima sesión (otro socio/sede) arranca de cero.
      novedadesStore.reset()
      // Patrocinadores (D-20): el feed (y sus vistas) de un socio no se arrastra al siguiente.
      sponsorsStore.reset()
      // Reservas del socio anterior + reloj: nada vivo tras el logout.
      todayBookingStore.reset()
      // Flags "tuvo contenido" (D-02): los del socio anterior no se arrastran al siguiente.
      cardFlags.reset()
      // Stats/check-ins (fase 203): `statsLoaded` y los datos del socio anterior no se arrastran.
      progressionStore.reset()
    }
  },
  { immediate: true },
)

// Refresca el turno de hoy al volver del escáner o de reservar (D-06).
watch(
  () => route.path,
  (path) => {
    if (authStore.isAuthenticated && (path === '/mi-templo' || path === '/reservas')) {
      void todayBookingStore.load()
    }
  },
)

// Fase 203 (D-08, Pitfall 7): si el boot cargó los turnos con la zona por defecto (perfil tardío),
// se recargan con la real cuando llega el perfil. Si la carga en vuelo (`loadedTz` todavía null) ya
// salió con esa misma zona, no se repite: el perfil llega con `prevTz === null`, o sea, zona por defecto.
watch(
  () => userStore.profile?.branchTimezone ?? null,
  (tz, prevTz) => {
    if (!tz || !authStore.isAuthenticated) return
    const inFlightWithThisTz =
      todayBookingStore.loadedTz === null && tz === (prevTz ?? DEFAULT_BRANCH_TZ)
    if (todayBookingStore.loadedTz !== tz && !inFlightWithThisTz) void todayBookingStore.load()
  },
)

// Al volver de segundo plano también: una reserva hecha por recepción o desde
// otro teléfono no pasa por un cambio de ruta, y sin recarga el botón QR no
// aparece aunque el socio esté en la ventana ±20 min. Con el perfil pendiente
// (boot optimista) se reintenta acá: si el socio no navega, el esqueleto del saludo
// y de la card de hoy no se resolvería solo (hoy solo se reintenta al navegar).
function onVisibilityChange(): void {
  if (document.visibilityState === 'visible' && authStore.isAuthenticated) {
    void todayBookingStore.load()
    if (userStore.profileStale) void userStore.retryProfileLoad()
  }
}

onMounted(() => document.addEventListener('visibilitychange', onVisibilityChange))

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  todayBookingStore.stopClock()
})

// Fase 195 (D-14): pedido de reseña nativa de las tiendas, neutral (sin
// preguntar antes si le gusta la app). `maybeRequestReview` decide solo: nada
// en web, nada antes de 14 días de uso, y como mucho una vez cada 120 días.
watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) void maybeRequestReview()
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

// Fase 203 (D-08): sin perfil el saludo es un esqueleto, sin tope (el perfil lo resuelve
// `retryProfileLoad`). "Atleta" queda solo para perfiles sin nombre.
const profileReady = computed(() => userStore.profile !== null)

const memberName = computed(() => {
  const profile = userStore.profile
  return profile?.firstName ?? profile?.displayName ?? 'Atleta'
})

// Formatea un 'YYYY-MM-DD' como "Hoy es <día> <n> de <mes>". Mediodía UTC +
// timeZone 'UTC' = el día calendario exacto, sin corrimiento por zona.
function formatGreetingDate(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
  return 'Hoy es ' + date.charAt(0).toUpperCase() + date.slice(1)
}

// D-04: 'hoy' en la zona de la sede, no del teléfono (un socio de Madrid con el
// teléfono en hora AR veía el día equivocado de 19 a 24). Sale del store del
// turno de hoy: su reloj de 30 s cambia la fecha solo a la medianoche de la sede.
const formattedDate = computed(() => formatGreetingDate(todayBookingStore.todayStr))

const showCheckInFab = computed(() => {
  if (!authStore.isAuthenticated) return false
  if (!userStore.profile) return false
  if (userStore.profile.branchIsVirtual) return false
  if (!userStore.hasActiveSubscription) return false
  // Solo en la ventana ±20 min de una reserva `reservado` de hoy, misma ventana
  // que el server. Fuera de la ventana escanear siempre falla (D-06).
  if (!todayBookingStore.fabVisible) return false
  return route.path === '/mi-templo' || route.path === '/reservas'
})

// "Empezá acá" (Franco, 2026-09-24): TODOS los socios ven un "1" rojo sobre
// Guía hasta que abren las historias; al abrirlas, EmpezaAcaPage registra
// `introStoriesSeenAt` en el perfil y la pelotita desaparece.
const showIntroBadge = computed(() => {
  const profile = userStore.profile
  return !!profile && profile.role === 'member' && !profile.introStoriesSeenAt
})

// Sketch 028: punto en la tab Planes cuando el staff cargó una membresía y el socio todavía no abrió
// Planes. Dentro de Planes no se muestra (la página lo apaga al abrir, con el POST `seen`).
const showPlanBadge = computed(
  () => userStore.planStatus?.hasUnseenPlanUpdate === true && !route.path.startsWith('/planes'),
)

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
  /** Punto mientras el socio no abrió "Empezá acá". */
  introBadge?: boolean
  /** Punto mientras haya un plan cargado por el staff que el socio todavía no vio en Planes. */
  planBadge?: boolean
  /** Prefijo de ruta con el que la tab se marca activa, si no es el propio `to`. */
  match?: string
}

const mobileTabs = computed<MobileTab[]>(() => {
  const tabs: MobileTab[] = [
    { to: '/mi-templo', icon: 'account_balance', label: 'Mi Templo', badge: true },
    {
      // Fase 200 P1/D12: con el flag ON la tab abre la portada (Empezá acá + Tu cuerpo); apagado,
      // las historias directo como hoy. `match` mantiene la tab activa en todo /training/guia*.
      to: ANATOMIA_ALUMNOS_ENABLED ? '/training/guia/inicio' : '/training/guia',
      match: '/training/guia',
      icon: 'menu_book',
      label: 'Guía',
      size: '26px',
      introBadge: true,
    },
    { to: '/training', icon: 'img:/icons/entrenar.svg', label: 'Entrenar', size: '26px' },
  ]
  tabs.push({ to: '/reservas', icon: 'event_available', label: 'Reservas' })
  tabs.push({ to: '/planes', icon: 'card_membership', label: 'Planes', planBadge: true })
  return tabs
})

interface TabDot {
  /** Texto para lectores de pantalla; sin él el punto es solo decorativo. */
  label?: string
}

/** Un único punto por tab (evaluación en Mi Templo, "Empezá acá" en Guía, plan cargado en Planes). */
function dotFor(tab: MobileTab): TabDot | null {
  if (tab.badge && progressionStore.evaluationEligible) return {}
  if (tab.introBadge && showIntroBadge.value) return { label: 'Novedad: Empezá acá' }
  if (tab.planBadge && showPlanBadge.value) return { label: 'Novedad: plan cargado' }
  return null
}

const navTabs = computed(() => mobileTabs.value.map((tab) => ({ ...tab, dot: dotFor(tab) })))

function isTabActive(tab: MobileTab): boolean {
  const tabTo = tab.match ?? tab.to
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

// D-16 fase 199: la foto va DETRÁS de páginas y cards. z-index negativo dentro
// del stacking context raíz: se pinta sobre el fondo crema del body/canvas y
// debajo de todo el contenido en flujo. Antes iba después de q-page-container
// con z-index 0 y velaba las cards.
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
  z-index: -1;
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
    font-size: 13px;
    line-height: 1.2; // igual que el esqueleto (1.2em), así la fecha no mueve el layout al llegar
    color: #fff;
    margin: 2px 0 0;
  }

  // Esqueletos del saludo (D-08): anchos fijos y alto de línea del texto real (type="text" = 1.2em).
  &__sk-name {
    display: block; // tag="span": un div dentro de h1/p no es HTML válido
    width: 160px;
    max-width: 100%;
  }

  &__sk-date {
    display: block;
    width: 200px;
    max-width: 100%;
  }

  &__badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    opacity: 1;
    padding-bottom: 2px;
    margin-right: 6px;
  }

  &__symbol {
    font-size: 32px;
    color: #fff;
    line-height: 1;
  }

  &__level {
    font-size: 10px;
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
  z-index: 1;
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
  color: #f2ede5; // inactiva: crema sólido, igual que la barra de abajo (fase 199-11, sketch 009 A)
  text-decoration: none;
  white-space: nowrap;
  transition:
    color 200ms ease,
    background-color 200ms ease;
  -webkit-tap-highlight-color: transparent;

  &:hover {
    background-color: rgba(white, 0.1);
  }

  // Activa: blanco + franja translúcida con filete a la izquierda, así se distingue sin
  // depender solo del color (el fondo y el filete son decoración; el texto sigue sólido).
  &--active,
  &--active:hover {
    color: #fff;
    background-color: rgba(white, 0.2);
    box-shadow: inset 3px 0 0 #fff;

    .desktop-rail__label {
      font-weight: 700;
    }
  }

  // Íconos imagen (SVG): no heredan `color`; a opacidad plena como los de la barra de abajo.
  :deep(.q-icon img) {
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

// Punto de novedad (evaluación, Guía, plan cargado) en la barra y el rail. Crema con aro oscuro:
// un `q-badge` color primary era terracota sobre el degradé terracota y no se veía (sketch 028).
.tab-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #f0e6d6;
  box-shadow: 0 0 0 2px #7e4529;
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
  color: #f2ede5; // inactiva: crema sólido (4.75 sobre el gradiente, D-15)
  transition: color 200ms ease;
  -webkit-tap-highlight-color: transparent;

  &--active {
    color: #fff;

    .mobile-tab__label {
      font-weight: 700;
    }
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
  // El ícono no es texto (>= 3:1 alcanza): inactivo 0.9, activo 1.
  :deep(.q-icon img) {
    opacity: 0.9;
    transition: opacity 200ms ease;
  }

  &--active :deep(.q-icon img) {
    opacity: 1;
  }

  // Pestaña activa (sketch 009 A): píldora translúcida detrás del ícono que se estira
  // al activarse. El ícono blanco sobre la píldora queda ≥ 3:1 (no es texto).
  .q-icon {
    position: relative;
    z-index: 0;

    &::before {
      content: '';
      position: absolute;
      z-index: -1;
      left: 50%;
      top: 50%;
      width: 58px;
      height: 30px;
      border-radius: 999px;
      background: rgba(#fff, 0.2);
      opacity: 0;
      transform: translate(-50%, -50%) scaleX(0.5);
      transition:
        transform 250ms ease,
        opacity 200ms ease;
    }
  }

  &--active .q-icon::before {
    opacity: 1;
    transform: translate(-50%, -50%) scaleX(1);
  }

  @media (prefers-reduced-motion: reduce) {
    .q-icon::before {
      transition: none;
    }
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

  // D-06: extendido con "Marcar asistencia", solo aparece en la ventana ±20 min.
  &--extended {
    right: 16px;
    height: 56px;
    min-height: 56px;
    padding: 0 22px 0 18px;
    border-radius: 28px;
    background: #96593a;
    color: #fff;
    font-family: 'Geologica', sans-serif;
    font-weight: 600;
    font-size: 16px;
    box-shadow: 0 8px 20px rgba(150, 89, 58, 0.45);

    // Quasar centra el ícono del fab con `margin: auto` y pisa el `on-left`:
    // sin esto el ícono queda pegado al texto.
    :deep(.q-icon) {
      margin: 0 10px 0 0;
    }

    @media (prefers-reduced-motion: no-preference) {
      animation:
        fabIn 0.35s ease,
        pulse 2s ease-in-out 0.4s infinite;
    }
  }
}

@keyframes fabIn {
  from {
    transform: translateY(20px) scale(0.9);
    opacity: 0;
  }

  to {
    transform: none;
    opacity: 1;
  }
}

@keyframes pulse {
  50% {
    box-shadow:
      0 8px 20px rgba(150, 89, 58, 0.45),
      0 0 0 10px rgba(150, 89, 58, 0.15);
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
