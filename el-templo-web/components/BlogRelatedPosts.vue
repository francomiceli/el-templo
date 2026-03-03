<script setup lang="ts">
/**
 * BlogRelatedPosts -- "Posts Relacionados" section for blog post pages.
 *
 * Displays up to 3 related posts in a responsive grid.
 * Cards show thumbnail, title, and tag names (plain text, not links).
 * BEM prefix: blog-related
 */

interface RelatedPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string | null;
  publishedAt: string | null;
  readingTime: number;
  tags: Array<{ id: number; name: string; slug: string }>;
}

defineProps<{
  posts: RelatedPost[];
}>();
</script>

<template>
  <section v-if="posts.length > 0" class="blog-related">
    <h3 class="blog-related__heading">Posts Relacionados</h3>
    <div class="blog-related__grid">
      <NuxtLink
        v-for="post in posts"
        :key="post.id"
        :to="`/blog/${post.slug}`"
        class="blog-related__card"
      >
        <!-- Thumbnail -->
        <div class="blog-related__image-wrapper">
          <img
            v-if="post.coverImage"
            :src="post.coverImage"
            :alt="post.title"
            class="blog-related__image"
            loading="lazy"
          >
          <PlaceholderBox v-else aspect-ratio="16 / 9" label="" />
        </div>
        <!-- Content -->
        <div class="blog-related__content">
          <h4 class="blog-related__title">{{ post.title }}</h4>
          <div v-if="post.tags?.length" class="blog-related__tags">
            <span
              v-for="tag in post.tags.slice(0, 3)"
              :key="tag.id"
              class="blog-related__tag"
            >
              {{ tag.name }}
            </span>
          </div>
        </div>
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped>
/* ==========================================================================
   BlogRelatedPosts -- Related posts grid section
   BEM naming. Token variables only.
   ========================================================================== */

.blog-related {
  margin-top: var(--space-section);
}

.blog-related__heading {
  font-family: var(--font-authority);
  font-weight: 600;
  font-size: 18px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-deep-charcoal);
  margin: 0 0 var(--space-comfortable) 0;
}

.blog-related__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-comfortable);
}

.blog-related__card {
  text-decoration: none;
  transition: transform var(--transition-base);
}

.blog-related__card:hover {
  transform: translateY(-2px);
}

.blog-related__image-wrapper {
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: var(--radius-base);
}

.blog-related__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.blog-related__content {
  padding-top: 8px;
}

.blog-related__title {
  font-family: var(--font-authority);
  font-weight: 500;
  font-size: 15px;
  color: var(--color-deep-charcoal);
  line-height: 1.3;
  margin: 0;
}

.blog-related__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.blog-related__tag {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 11px;
  color: var(--color-olive-stone);
}

/* ------------------------------------------------------------------
   Mobile (max-width: 768px) — stack cards
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .blog-related__grid {
    grid-template-columns: 1fr;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .blog-related__card {
    transition: none;
  }
}
</style>
