<script setup lang="ts">
/**
 * BlogTagBar -- Horizontal scrollable row of popular tag pills for blog index/tag pages.
 * BEM prefix: blog-tag-bar
 */

interface TagWithCount {
  id: number;
  name: string;
  slug: string;
  postCount: number;
}

defineProps<{
  tags: TagWithCount[];
  activeSlug?: string;
}>();
</script>

<template>
  <div v-if="tags.length > 0" class="blog-tag-bar">
    <div class="blog-tag-bar__scroll">
      <NuxtLink
        v-for="tag in tags"
        :key="tag.id"
        :to="`/blog/tag/${tag.slug}`"
        class="blog-tag-bar__item"
        :class="{ 'blog-tag-bar__item--active': tag.slug === activeSlug }"
      >
        {{ tag.name }}
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.blog-tag-bar {
  margin-bottom: var(--space-comfortable);
}

.blog-tag-bar__scroll {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 4px 0 12px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.blog-tag-bar__scroll::-webkit-scrollbar {
  display: none;
}

.blog-tag-bar__item {
  font-family: var(--font-clarity);
  font-size: 13px;
  font-weight: 500;
  padding: 6px 16px;
  border-radius: 20px;
  white-space: nowrap;
  text-decoration: none;
  border: 1px solid var(--color-warm-stone);
  background: transparent;
  color: var(--color-olive-stone);
  transition:
    background var(--transition-base),
    color var(--transition-base),
    border-color var(--transition-base);
}

.blog-tag-bar__item:hover {
  background: var(--color-sandy-beige);
  color: var(--color-deep-charcoal);
  border-color: var(--color-olive-stone);
}

.blog-tag-bar__item--active {
  background: var(--color-terracotta);
  color: var(--color-marble-cream);
  border-color: var(--color-terracotta);
}

.blog-tag-bar__item--active:hover {
  background: var(--color-terracotta);
  color: var(--color-marble-cream);
  border-color: var(--color-terracotta);
}
</style>
