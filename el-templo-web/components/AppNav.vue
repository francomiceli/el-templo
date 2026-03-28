<script setup lang="ts">
/**
 * AppNav — Fixed navigation bar with desktop links, mobile drawer,
 * scroll shadow, and active section highlighting.
 */

interface NavLink {
  label: string;
  href: string;
  sectionId: string | null;
  modifier?: string;
}

const navLinks: NavLink[] = [
  { label: "El Metodo", href: "/#metodo", sectionId: "metodo" },
  { label: "Niveles", href: "/#niveles", sectionId: "niveles" },
  { label: "Sedes", href: "/#sedes", sectionId: "sedes" },
  { label: "Franquicias", href: "/franquicias", sectionId: null },
  {
    label: "Gladius",
    href: "/gladius",
    sectionId: null,
    modifier: "gladius",
  },
  { label: "Blog", href: "/blog", sectionId: null },
  { label: "Academy", href: "/academy", sectionId: null },
  { label: "App", href: "/app", sectionId: null },
];

const WHATSAPP_URL =
  "https://wa.me/5492235820521?text=Hola%21%20Quiero%20reservar%20mi%20primera%20sesi%C3%B3n%20de%20prueba";

const ctaLink: NavLink = {
  label: "Reservar Sesion",
  href: WHATSAPP_URL,
  sectionId: null,
};

// Active section tracking
const sectionIds = [
  ...navLinks.filter((l) => l.sectionId).map((l) => l.sectionId as string),
  ctaLink.sectionId as string,
];
const { activeSection, cleanup } = useActiveSection(sectionIds);

// Scroll shadow state
const isScrolled = ref(false);

function onScroll(): void {
  isScrolled.value = window.scrollY > 20;
}

// Mobile drawer state
const isDrawerOpen = ref(false);

function toggleDrawer(): void {
  isDrawerOpen.value = !isDrawerOpen.value;
  updateBodyScroll();
}

function closeDrawer(): void {
  isDrawerOpen.value = false;
  updateBodyScroll();
}

function updateBodyScroll(): void {
  if (import.meta.client) {
    document.body.style.overflow = isDrawerOpen.value ? "hidden" : "";
  }
}

// Close drawer on link click (for same-page anchors)
function handleLinkClick(): void {
  if (isDrawerOpen.value) {
    closeDrawer();
  }
}

// Close drawer on route change
const route = useRoute();
watch(
  () => route.path,
  () => {
    if (isDrawerOpen.value) {
      closeDrawer();
    }
  },
);

// Check if a link is active (for section-based links)
function isLinkActive(link: NavLink): boolean {
  return link.sectionId !== null && activeSection.value === link.sectionId;
}

// Lifecycle — client-only listeners
if (import.meta.client) {
  onMounted(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    // Set initial scroll state
    onScroll();
  });

  onBeforeUnmount(() => {
    window.removeEventListener("scroll", onScroll);
    cleanup();
    // Ensure body scroll is restored
    document.body.style.overflow = "";
  });
}
</script>

<template>
  <nav class="nav" :class="{ 'nav--scrolled': isScrolled }">
    <div class="nav__inner">
      <!-- Logo -->
      <NuxtLink to="/" class="nav__logo" @click="handleLinkClick">
        <img src="/icons/icon-48.webp" alt="" class="nav__logo-icon" >
        <span class="nav__logo-title" />
      </NuxtLink>

      <!-- Desktop links -->
      <div class="nav__links">
        <NuxtLink
          v-for="link in navLinks"
          :key="link.href"
          :to="link.href"
          class="nav__link"
          :class="{
            [`nav__link--${link.modifier}`]: link.modifier,
            'nav__link--active': isLinkActive(link),
          }"
          @click="handleLinkClick"
        >
          {{ link.label }}
        </NuxtLink>
        <a
          :href="ctaLink.href"
          target="_blank"
          rel="noopener noreferrer"
          class="nav__cta"
          @click="handleLinkClick"
        >
          {{ ctaLink.label }}
        </a>
      </div>

      <!-- Hamburger (mobile only) -->
      <button
        class="nav__hamburger"
        :class="{ 'nav__hamburger--open': isDrawerOpen }"
        :aria-expanded="isDrawerOpen"
        aria-label="Menu"
        @click="toggleDrawer"
      >
        <span class="nav__hamburger-line" />
        <span class="nav__hamburger-line" />
        <span class="nav__hamburger-line" />
      </button>
    </div>

    <!-- Mobile backdrop overlay -->
    <Transition name="drawer-backdrop">
      <div v-if="isDrawerOpen" class="nav__backdrop" @click="closeDrawer" />
    </Transition>

    <!-- Mobile drawer panel -->
    <Transition name="drawer">
      <div v-if="isDrawerOpen" class="nav__drawer">
        <NuxtLink
          v-for="(link, index) in navLinks"
          :key="link.href"
          :to="link.href"
          class="nav__drawer-link"
          :class="{
            [`nav__drawer-link--${link.modifier}`]: link.modifier,
            'nav__drawer-link--active': isLinkActive(link),
          }"
          :style="{ '--stagger-delay': `${index * 50}ms` }"
          @click="handleLinkClick"
        >
          {{ link.label }}
        </NuxtLink>
        <a
          :href="ctaLink.href"
          target="_blank"
          rel="noopener noreferrer"
          class="nav__drawer-cta btn btn--primary"
          :style="{ '--stagger-delay': `${navLinks.length * 50}ms` }"
          @click="handleLinkClick"
        >
          {{ ctaLink.label }}
        </a>
      </div>
    </Transition>
  </nav>
</template>

<style scoped>
/* ==========================================================================
   Nav — Fixed navigation bar
   ========================================================================== */

.nav {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 64px;
  background: var(--color-marble-cream);
  z-index: 100;
  transition: box-shadow var(--transition-base);
}

.nav--scrolled {
  box-shadow: 0 2px 12px rgba(61, 55, 50, 0.12);
}

.nav__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  padding: 0 5%;
  max-width: 1440px;
  margin: 0 auto;
}

/* ------------------------------------------------------------------
   Logo
   ------------------------------------------------------------------ */

.nav__logo {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  flex-shrink: 0;
}

.nav__logo-icon {
  width: 40px;
  height: 40px;
  border-radius: 6px;
}

.nav__logo-title {
  display: inline-block;
  height: 44px;
  width: 240px;
  background: var(--color-deep-charcoal);
  mask-image: url("/icons/el-templo-title.png");
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: left center;
  -webkit-mask-image: url("/icons/el-templo-title.png");
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: left center;
}

/* ------------------------------------------------------------------
   Desktop Links
   ------------------------------------------------------------------ */

.nav__links {
  display: flex;
  align-items: center;
  gap: 32px;
}

.nav__link {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 14px;
  color: var(--color-deep-charcoal);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  text-decoration: none;
  transition: color var(--transition-base);
  white-space: nowrap;
}

.nav__link:hover {
  color: var(--color-terracotta);
}

.nav__link--gladius:hover {
  color: var(--color-aged-gold);
}

.nav__link--active {
  color: var(--color-terracotta);
}

.nav__link--gladius.nav__link--active {
  color: var(--color-aged-gold);
}

/* CTA button (desktop) */
.nav__cta {
  font-family: var(--font-clarity);
  font-weight: 600;
  font-size: 14px;
  color: var(--color-marble-cream);
  background: var(--color-terracotta);
  padding: 10px 24px;
  border-radius: var(--radius-base);
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  transition:
    background var(--transition-base),
    transform var(--transition-fast);
  white-space: nowrap;
}

.nav__cta:hover {
  background: var(--color-clay);
}

.nav__cta:active {
  transform: scale(0.97);
}

/* ------------------------------------------------------------------
   Hamburger (mobile only)
   ------------------------------------------------------------------ */

.nav__hamburger {
  display: none;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.nav__hamburger-line {
  display: block;
  width: 24px;
  height: 2px;
  background: var(--color-deep-charcoal);
  border-radius: 1px;
  transition:
    transform var(--transition-base),
    opacity var(--transition-base);
  transform-origin: center;
}

/* Morph to X when open */
.nav__hamburger--open .nav__hamburger-line:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}

.nav__hamburger--open .nav__hamburger-line:nth-child(2) {
  opacity: 0;
}

.nav__hamburger--open .nav__hamburger-line:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

/* ------------------------------------------------------------------
   Backdrop overlay
   ------------------------------------------------------------------ */

.nav__backdrop {
  position: fixed;
  inset: 0;
  background: rgba(61, 55, 50, 0.6);
  z-index: 99;
}

/* Backdrop transition */
.drawer-backdrop-enter-active {
  transition: opacity 300ms ease;
}

.drawer-backdrop-leave-active {
  transition: opacity 250ms ease;
}

.drawer-backdrop-enter-from,
.drawer-backdrop-leave-to {
  opacity: 0;
}

/* ------------------------------------------------------------------
   Mobile Drawer
   ------------------------------------------------------------------ */

.nav__drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: 80%;
  max-width: 320px;
  height: 100vh;
  height: 100dvh;
  background: var(--color-deep-charcoal);
  z-index: 100;
  padding: 80px 32px 32px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

/* Drawer panel transition — snappy slide + scale */
.drawer-enter-active {
  transition:
    transform 400ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 300ms ease;
}

.drawer-leave-active {
  transition:
    transform 300ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 200ms ease;
}

.drawer-enter-from {
  transform: translateX(100%) scale(0.95);
  opacity: 0;
}

.drawer-leave-to {
  transform: translateX(100%) scale(0.98);
  opacity: 0;
}

/* ------------------------------------------------------------------
   Drawer links
   ------------------------------------------------------------------ */

.nav__drawer-link {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 18px;
  color: var(--color-sandy-beige);
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 16px 0;
  border-bottom: 1px solid rgba(242, 237, 229, 0.1);
  transition:
    color var(--transition-base),
    opacity 400ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 400ms cubic-bezier(0.16, 1, 0.3, 1);
}

.nav__drawer-link:hover,
.nav__drawer-link:active {
  color: var(--color-marble-cream);
}

.nav__drawer-link--gladius:hover,
.nav__drawer-link--gladius:active {
  color: var(--color-aged-gold);
}

.nav__drawer-link--active {
  color: var(--color-terracotta);
}

.nav__drawer-link--gladius.nav__drawer-link--active {
  color: var(--color-aged-gold);
}

/* Staggered entrance for drawer links */
.drawer-enter-from .nav__drawer-link,
.drawer-enter-from .nav__drawer-cta {
  opacity: 0;
  transform: translateX(20px);
}

.drawer-enter-active .nav__drawer-link,
.drawer-enter-active .nav__drawer-cta {
  transition:
    opacity 400ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 400ms cubic-bezier(0.16, 1, 0.3, 1),
    color var(--transition-base);
  transition-delay: var(--stagger-delay, 0ms);
}

/* CTA button in drawer */
.nav__drawer-cta {
  margin-top: auto;
  text-align: center;
  width: 100%;
  transition:
    opacity 400ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 400ms cubic-bezier(0.16, 1, 0.3, 1),
    background var(--transition-base);
}

/* ------------------------------------------------------------------
   Mobile responsive
   ------------------------------------------------------------------ */

@media (max-width: 768px) {
  .nav {
    height: 56px;
  }

  .nav__links {
    display: none;
  }

  .nav__hamburger {
    display: flex;
  }
}

/* Narrow desktop — reduce link gap */
@media (max-width: 1024px) and (min-width: 769px) {
  .nav__links {
    gap: 20px;
  }

  .nav__link {
    font-size: 13px;
  }

  .nav__cta {
    font-size: 13px;
    padding: 8px 18px;
  }
}
</style>
