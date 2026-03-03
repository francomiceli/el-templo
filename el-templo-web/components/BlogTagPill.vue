<script setup lang="ts">
/**
 * BlogTagPill -- Small clickable tag pill linking to /blog/tag/{slug}.
 * BEM prefix: blog-tag-pill
 */

defineProps<{
  tag: { name: string; slug: string };
  size?: "sm" | "md";
}>();
</script>

<template>
  <NuxtLink
    :to="`/blog/tag/${tag.slug}`"
    class="blog-tag-pill"
    :class="`blog-tag-pill--${size ?? 'sm'}`"
    @click.stop
  >
    {{ tag.name }}
  </NuxtLink>
</template>

<style scoped>
.blog-tag-pill {
  display: inline-flex;
  align-items: center;
  background: var(--color-sandy-beige);
  border: 1px solid var(--color-warm-stone);
  border-radius: 20px;
  font-family: var(--font-clarity);
  font-weight: 500;
  color: var(--color-olive-stone);
  text-decoration: none;
  text-transform: lowercase;
  transition:
    background var(--transition-base),
    color var(--transition-base),
    border-color var(--transition-base);
}

.blog-tag-pill:hover {
  background: var(--color-warm-stone);
  color: var(--color-deep-charcoal);
  border-color: var(--color-olive-stone);
}

.blog-tag-pill--sm {
  font-size: 11px;
  padding: 3px 10px;
}

.blog-tag-pill--md {
  font-size: 13px;
  padding: 4px 12px;
}
</style>
