<script setup lang="ts">
/**
 * /blog/[slug] -- Individual blog post page.
 *
 * Fetches a single post by slug from the API.
 * Renders Markdown body as styled HTML.
 * Article (70%) + sidebar (30%) layout on desktop, stacked on mobile.
 * Per-post SEO meta tags (title, description, Open Graph).
 * BEM prefix: blog-post
 */
import { marked } from "marked";

interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string | null;
  body: string;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  readingTime: number;
}

const route = useRoute();
const config = useRuntimeConfig();

const slug = computed(() => String(route.params.slug));

const { data: post, error } = await useFetch<BlogPost>(
  () => `${config.public.apiUrl}/api/blog/posts/${slug.value}`,
);

// Handle 404
if (error.value || !post.value) {
  throw createError({
    statusCode: 404,
    statusMessage: "Post no encontrado",
    fatal: true,
  });
}

// Per-post SEO meta
useSeoMeta({
  title: () =>
    post.value ? `${post.value.title} \u2014 Blog El Templo` : "Blog El Templo",
  description: () => post.value?.excerpt?.substring(0, 160) ?? "",
  ogTitle: () => post.value?.title ?? "",
  ogDescription: () => post.value?.excerpt ?? "",
  ogImage: () => post.value?.coverImage ?? undefined,
  ogUrl: () => `https://eltemplo.org/blog/${post.value?.slug ?? ""}`,
  ogType: "article",
  ogSiteName: "El Templo",
  articlePublishedTime: () => post.value?.publishedAt ?? undefined,
});

// Canonical URL
useHead({
  link: [
    {
      rel: "canonical",
      href: `https://eltemplo.org/blog/${post.value?.slug ?? ""}`,
    },
  ],
});

// Article structured data (JSON-LD)
if (post.value) {
  useSchemaOrg([
    defineArticle({
      headline: post.value.title,
      description: post.value.excerpt,
      image: post.value.coverImage || undefined,
      datePublished: post.value.publishedAt || undefined,
      dateModified: post.value.updatedAt,
      author: {
        name: "El Templo",
        url: "https://eltemplo.org",
      },
      publisher: {
        name: "El Templo",
        url: "https://eltemplo.org",
        logo: "https://eltemplo.org/images/logo-eltemplo.svg",
      },
    }),
  ]);
}

// Markdown rendering
const renderedBody = computed(() => {
  if (!post.value?.body) return "";
  return marked.parse(post.value.body) as string;
});

// Date formatting
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleDateString("es-AR", { month: "long" });
  const capitalizedMonth = month.charAt(0).toUpperCase() + month.slice(1);
  const year = date.getFullYear();
  return `${day} de ${capitalizedMonth}, ${year}`;
}

const formattedDate = computed(() => {
  if (!post.value?.publishedAt) return "";
  return formatDate(post.value.publishedAt);
});
</script>

<template>
  <main v-if="post" class="blog-post">
    <!-- Hero: cover image + title + meta -->
    <div class="blog-post__hero">
      <div class="blog-post__hero-container">
        <div class="blog-post__cover-wrapper">
          <img
            v-if="post.coverImage"
            :src="post.coverImage"
            :alt="post.title"
            class="blog-post__cover"
          >
          <PlaceholderBox v-else aspect-ratio="21 / 9" label="" />
        </div>

        <h1 class="blog-post__title">{{ post.title }}</h1>

        <div class="blog-post__meta">
          <span v-if="formattedDate">{{ formattedDate }}</span>
          <span
            v-if="formattedDate && post.readingTime"
            class="blog-post__meta-sep"
            >&bull;</span
          >
          <span>{{ post.readingTime }} min de lectura</span>
        </div>
      </div>
    </div>

    <!-- Content grid: article + sidebar -->
    <div class="blog-post__grid">
      <article class="blog-post__article">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="blog-post__body" v-html="renderedBody" />
      </article>

      <BlogSidebar :current-slug="slug" />
    </div>
  </main>
</template>

<style scoped>
/* ==========================================================================
   Blog Post Page -- Individual post with sidebar
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

.blog-post {
  background: var(--color-marble-cream);
  min-height: 60vh;
}

/* ------------------------------------------------------------------
   Hero
   ------------------------------------------------------------------ */
.blog-post__hero {
  background: var(--color-marble-cream);
  padding: var(--space-large) 0 var(--space-spacious) 0;
}

.blog-post__hero-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 5%;
}

.blog-post__cover-wrapper {
  width: 100%;
  overflow: hidden;
  border-radius: var(--radius-card);
  margin-bottom: var(--space-spacious);
}

.blog-post__cover {
  width: 100%;
  height: auto;
  display: block;
  object-fit: cover;
}

.blog-post__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 36px;
  color: var(--color-deep-charcoal);
  line-height: 1.2;
  margin: 0 0 var(--space-base) 0;
}

.blog-post__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 14px;
  color: var(--color-olive-stone);
}

.blog-post__meta-sep {
  color: var(--color-warm-stone);
}

/* ------------------------------------------------------------------
   Content grid (article 70% + sidebar 30%)
   ------------------------------------------------------------------ */
.blog-post__grid {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 5% var(--space-large) 5%;
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: var(--space-section);
}

/* ------------------------------------------------------------------
   Article body — styled Markdown HTML
   ------------------------------------------------------------------ */
.blog-post__article {
  min-width: 0;
}

.blog-post__body :deep(h2) {
  font-family: var(--font-authority);
  font-weight: 600;
  font-size: 28px;
  color: var(--color-deep-charcoal);
  line-height: 1.3;
  margin: var(--space-section) 0 var(--space-comfortable) 0;
}

.blog-post__body :deep(h3) {
  font-family: var(--font-authority);
  font-weight: 500;
  font-size: 22px;
  color: var(--color-deep-charcoal);
  line-height: 1.3;
  margin: var(--space-spacious) 0 var(--space-base) 0;
}

.blog-post__body :deep(p) {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 17px;
  color: var(--color-deep-charcoal);
  line-height: 1.8;
  margin: 0 0 var(--space-comfortable) 0;
}

.blog-post__body :deep(a) {
  color: var(--color-terracotta);
  text-decoration: none;
  transition: text-decoration var(--transition-fast);
}

.blog-post__body :deep(a:hover) {
  text-decoration: underline;
}

.blog-post__body :deep(ul),
.blog-post__body :deep(ol) {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 17px;
  color: var(--color-deep-charcoal);
  line-height: 1.8;
  padding-left: var(--space-spacious);
  margin: 0 0 var(--space-comfortable) 0;
}

.blog-post__body :deep(li) {
  margin-bottom: 4px;
}

.blog-post__body :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: var(--radius-base);
  margin: var(--space-comfortable) 0;
  display: block;
}

.blog-post__body :deep(blockquote) {
  border-left: 3px solid var(--color-terracotta);
  padding-left: var(--space-comfortable);
  margin: var(--space-comfortable) 0;
  font-family: var(--font-elegance);
  font-style: italic;
  font-size: 18px;
  color: var(--color-charcoal-mist);
  line-height: 1.6;
}

.blog-post__body :deep(code) {
  font-family: monospace;
  background: var(--color-sandy-beige);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 15px;
}

.blog-post__body :deep(pre) {
  background: var(--color-sandy-beige);
  padding: var(--space-comfortable);
  border-radius: var(--radius-base);
  overflow-x: auto;
  margin: 0 0 var(--space-comfortable) 0;
}

.blog-post__body :deep(pre code) {
  background: transparent;
  padding: 0;
  border-radius: 0;
}

/* ------------------------------------------------------------------
   Tablet (max-width: 900px) — sidebar narrows
   ------------------------------------------------------------------ */
@media (max-width: 900px) {
  .blog-post__grid {
    grid-template-columns: 1fr 240px;
    gap: var(--space-spacious);
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 768px) — single column, sidebar below article
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .blog-post__grid {
    grid-template-columns: 1fr;
    gap: var(--space-spacious);
  }

  .blog-post__title {
    font-size: 28px;
  }

  .blog-post__body :deep(h2) {
    font-size: 24px;
  }

  .blog-post__body :deep(h3) {
    font-size: 20px;
  }
}

/* ------------------------------------------------------------------
   Mobile small (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .blog-post__title {
    font-size: 24px;
  }

  .blog-post__body :deep(p) {
    font-size: 16px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .blog-post__body :deep(a) {
    transition: none;
  }
}
</style>
