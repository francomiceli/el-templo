<script setup lang="ts">
/**
 * BlogPostCard -- Post card component for the blog index listing.
 *
 * Vertical card layout: cover image (16:9) -> date + reading time -> title -> excerpt -> "Leer mas" CTA.
 * NuxtLink wrapping entire card for accessibility.
 * BEM prefix: blog-card
 */

interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string | null;
  publishedAt: string | null;
  readingTime: number;
}

const props = defineProps<{
  post: BlogPost;
}>();

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleDateString("es-AR", { month: "long" });
  const capitalizedMonth = month.charAt(0).toUpperCase() + month.slice(1);
  const year = date.getFullYear();
  return `${day} de ${capitalizedMonth}, ${year}`;
}

const formattedDate = computed(() => {
  if (!props.post.publishedAt) return "";
  return formatDate(props.post.publishedAt);
});
</script>

<template>
  <NuxtLink :to="`/blog/${post.slug}`" class="blog-card">
    <!-- Cover image -->
    <div class="blog-card__image-wrapper">
      <img
        v-if="post.coverImage"
        :src="post.coverImage"
        :alt="post.title"
        class="blog-card__image"
        loading="lazy"
      >
      <PlaceholderBox v-else aspect-ratio="16 / 9" label="" />
    </div>

    <!-- Content -->
    <div class="blog-card__content">
      <div class="blog-card__meta">
        <span v-if="formattedDate" class="blog-card__date">{{
          formattedDate
        }}</span>
        <span class="blog-card__reading-time"
          >{{ post.readingTime }} min de lectura</span
        >
      </div>

      <h2 class="blog-card__title">{{ post.title }}</h2>

      <p class="blog-card__excerpt">{{ post.excerpt }}</p>

      <span class="blog-card__cta">
        Leer m&aacute;s
        <span class="blog-card__arrow">&rarr;</span>
      </span>
    </div>
  </NuxtLink>
</template>

<style scoped>
/* ==========================================================================
   BlogPostCard — Vertical card for blog index listing
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

.blog-card {
  display: block;
  background: var(--color-marble-cream);
  border-bottom: 1px solid var(--color-warm-stone);
  padding: var(--space-spacious) 0;
  text-decoration: none;
  transition:
    box-shadow var(--transition-base),
    transform var(--transition-base);
}

.blog-card:hover {
  box-shadow: var(--shadow-subtle);
}

/* ------------------------------------------------------------------
   Image
   ------------------------------------------------------------------ */
.blog-card__image-wrapper {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: var(--radius-card);
  margin-bottom: var(--space-comfortable);
}

.blog-card__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* ------------------------------------------------------------------
   Content
   ------------------------------------------------------------------ */
.blog-card__content {
  display: flex;
  flex-direction: column;
}

.blog-card__meta {
  display: flex;
  align-items: center;
  gap: var(--space-base);
  margin-bottom: 8px;
}

.blog-card__date,
.blog-card__reading-time {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 13px;
  color: var(--color-olive-stone);
}

.blog-card__title {
  font-family: var(--font-authority);
  font-weight: 600;
  font-size: 22px;
  color: var(--color-deep-charcoal);
  line-height: 1.3;
  margin: 0 0 8px 0;
}

.blog-card__excerpt {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 15px;
  color: var(--color-deep-charcoal);
  line-height: 1.6;
  margin: 0 0 var(--space-base) 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ------------------------------------------------------------------
   Ghost CTA
   ------------------------------------------------------------------ */
.blog-card__cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-terracotta);
  transition: color var(--transition-base);
}

.blog-card:hover .blog-card__cta {
  color: var(--color-clay);
}

.blog-card__arrow {
  transition: transform var(--transition-base);
}

.blog-card:hover .blog-card__arrow {
  transform: translateX(4px);
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .blog-card__title {
    font-size: 18px;
  }

  .blog-card__excerpt {
    font-size: 14px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .blog-card {
    transition: none;
  }

  .blog-card:hover {
    box-shadow: none;
  }

  .blog-card__arrow {
    transition: none;
  }
}
</style>
