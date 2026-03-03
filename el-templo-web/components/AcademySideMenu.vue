<script setup lang="ts">
/**
 * AcademySideMenu — Sticky sidebar for /academy page.
 *
 * Desktop only (hidden below 1200px). 240px wide, sticky below nav.
 * Active section tracking via useActiveSection composable.
 * Terracotta active indicator with 2px left border.
 */

import { sideMenuItems } from "~/data/academy";

const sectionIds = sideMenuItems.map((item) => item.anchor);
const { activeSection, cleanup } = useActiveSection(sectionIds);

// Entrance animation
const visible = ref(false);

if (import.meta.client) {
  onMounted(() => {
    requestAnimationFrame(() => {
      visible.value = true;
    });
  });
}

onBeforeUnmount(() => {
  cleanup();
});
</script>

<template>
  <nav
    class="academy-side-menu"
    :class="{ 'academy-side-menu--visible': visible }"
    aria-label="Navegación de secciones"
  >
    <ul class="academy-side-menu__list">
      <li
        v-for="item in sideMenuItems"
        :key="item.anchor"
        class="academy-side-menu__item"
      >
        <a
          :href="`#${item.anchor}`"
          class="academy-side-menu__link"
          :class="{
            'academy-side-menu__link--active': activeSection === item.anchor,
          }"
        >
          {{ item.label }}
        </a>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
/* ==========================================================================
   AcademySideMenu — Sticky Section Navigation
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

.academy-side-menu {
  position: fixed;
  top: 100px;
  left: 0;
  width: 240px;
  z-index: 50;
  padding: 0 24px;
  opacity: 0;
  transform: translateX(-20px);
  transition:
    opacity 0.5s ease,
    transform 0.5s ease;
}

.academy-side-menu--visible {
  opacity: 1;
  transform: translateX(0);
}

/* ------------------------------------------------------------------
   List
   ------------------------------------------------------------------ */
.academy-side-menu__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* ------------------------------------------------------------------
   Link
   ------------------------------------------------------------------ */
.academy-side-menu__link {
  display: block;
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 14px;
  color: var(--color-olive-stone);
  text-decoration: none;
  padding: 6px 12px;
  border-left: 2px solid transparent;
  transition:
    color 200ms ease,
    border-color 200ms ease;
}

.academy-side-menu__link:hover {
  color: var(--color-terracotta);
}

.academy-side-menu__link--active {
  color: var(--color-terracotta);
  border-left-color: var(--color-terracotta);
  font-weight: 600;
}

/* ------------------------------------------------------------------
   Responsive: hidden below 1200px
   ------------------------------------------------------------------ */
@media (max-width: 1199px) {
  .academy-side-menu {
    display: none;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .academy-side-menu {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
