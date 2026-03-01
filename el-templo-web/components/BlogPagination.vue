<script setup lang="ts">
/**
 * BlogPagination -- Page number navigation component.
 *
 * Renders page numbers as NuxtLink to /blog?page={N} for SEO-friendly URLs.
 * Shows: First, Previous, current range (max 5 visible), Next, Last.
 * BEM prefix: blog-pagination
 */

const props = defineProps<{
  currentPage: number;
  totalPages: number;
}>();

defineEmits<{
  "page-change": [page: number];
}>();

const isFirstPage = computed(() => props.currentPage <= 1);
const isLastPage = computed(() => props.currentPage >= props.totalPages);

/**
 * Compute visible page range (max 5 pages centered on current).
 */
const visiblePages = computed(() => {
  const total = props.totalPages;
  const current = props.currentPage;
  const maxVisible = 5;

  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  let start = Math.max(1, current - Math.floor(maxVisible / 2));
  const end = Math.min(total, start + maxVisible - 1);

  // Adjust start if we hit the end
  if (end - start + 1 < maxVisible) {
    start = Math.max(1, end - maxVisible + 1);
  }

  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
});

function pageLink(page: number): string {
  if (page <= 1) return "/blog";
  return `/blog?page=${page}`;
}
</script>

<template>
  <nav
    v-if="totalPages > 1"
    class="blog-pagination"
    aria-label="Paginaci&oacute;n del blog"
  >
    <!-- First -->
    <NuxtLink
      v-if="!isFirstPage"
      :to="pageLink(1)"
      class="blog-pagination__btn"
      aria-label="Primera p&aacute;gina"
      @click.prevent="$emit('page-change', 1)"
    >
      &laquo;
    </NuxtLink>

    <!-- Previous -->
    <NuxtLink
      v-if="!isFirstPage"
      :to="pageLink(currentPage - 1)"
      class="blog-pagination__btn"
      aria-label="P&aacute;gina anterior"
      @click.prevent="$emit('page-change', currentPage - 1)"
    >
      &lsaquo;
    </NuxtLink>

    <!-- Page numbers -->
    <NuxtLink
      v-for="page in visiblePages"
      :key="page"
      :to="pageLink(page)"
      class="blog-pagination__btn"
      :class="{ 'blog-pagination__btn--active': page === currentPage }"
      :aria-current="page === currentPage ? 'page' : undefined"
      @click.prevent="$emit('page-change', page)"
    >
      {{ page }}
    </NuxtLink>

    <!-- Next -->
    <NuxtLink
      v-if="!isLastPage"
      :to="pageLink(currentPage + 1)"
      class="blog-pagination__btn"
      aria-label="P&aacute;gina siguiente"
      @click.prevent="$emit('page-change', currentPage + 1)"
    >
      &rsaquo;
    </NuxtLink>

    <!-- Last -->
    <NuxtLink
      v-if="!isLastPage"
      :to="pageLink(totalPages)"
      class="blog-pagination__btn"
      aria-label="&Uacute;ltima p&aacute;gina"
      @click.prevent="$emit('page-change', totalPages)"
    >
      &raquo;
    </NuxtLink>
  </nav>
</template>

<style scoped>
/* ==========================================================================
   BlogPagination — Page number navigation
   BEM naming. Token variables only.
   ========================================================================== */

.blog-pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  padding: var(--space-spacious) 0;
}

.blog-pagination__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  height: 40px;
  padding: 0 12px;
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 14px;
  color: var(--color-deep-charcoal);
  background: transparent;
  border: 1px solid var(--color-warm-stone);
  border-radius: var(--radius-base);
  text-decoration: none;
  transition:
    background var(--transition-base),
    color var(--transition-base),
    border-color var(--transition-base);
  cursor: pointer;
}

.blog-pagination__btn:hover {
  background: var(--color-sandy-beige);
  border-color: var(--color-terracotta);
}

.blog-pagination__btn--active {
  background: var(--color-terracotta);
  color: var(--color-marble-cream);
  border-color: var(--color-terracotta);
  pointer-events: none;
}

/* ------------------------------------------------------------------
   Mobile
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .blog-pagination__btn {
    min-width: 36px;
    height: 36px;
    padding: 0 8px;
    font-size: 13px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .blog-pagination__btn {
    transition: none;
  }
}
</style>
