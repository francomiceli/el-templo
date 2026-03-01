<script setup lang="ts">
/**
 * /blog -- Blog index page with paginated post listing.
 *
 * Fetches published posts from the API with pagination.
 * Shows post cards in vertical list with page navigation.
 * SEO meta tags for the blog section.
 * BEM prefix: blog-index
 */

interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string | null;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  readingTime: number;
}

interface BlogListResponse {
  posts: BlogPost[];
  total: number;
  page: number;
  totalPages: number;
}

useHead({
  title:
    "Blog El Templo Calistenia \u2014 Entrenamiento, M\u00E9todo y Movimiento",
  meta: [
    {
      name: "description",
      content:
        "Art\u00EDculos sobre calistenia, entrenamiento con peso corporal, nutrici\u00F3n, movilidad y el m\u00E9todo El Templo.",
    },
    {
      property: "og:title",
      content:
        "Blog El Templo Calistenia \u2014 Entrenamiento, M\u00E9todo y Movimiento",
    },
    {
      property: "og:description",
      content:
        "Art\u00EDculos sobre calistenia, entrenamiento con peso corporal, nutrici\u00F3n, movilidad y el m\u00E9todo El Templo.",
    },
    { property: "og:url", content: "https://eltemplo.org/blog" },
    { property: "og:type", content: "website" },
  ],
});

const route = useRoute();
const config = useRuntimeConfig();

const page = computed(() => Number(route.query.page) || 1);

const { data, status } = useFetch<BlogListResponse>(
  () => `${config.public.apiUrl}/blog/posts?page=${page.value}&limit=10`,
  {
    watch: [page],
  },
);

const posts = computed(() => data.value?.posts ?? []);
const totalPages = computed(() => data.value?.totalPages ?? 0);
const isLoading = computed(() => status.value === "pending");
const isEmpty = computed(
  () => status.value === "success" && posts.value.length === 0,
);

function handlePageChange(newPage: number): void {
  navigateTo({ path: "/blog", query: newPage > 1 ? { page: newPage } : {} });
}
</script>

<template>
  <main class="blog-index">
    <div class="blog-index__container">
      <!-- Section header -->
      <div class="blog-index__header">
        <h1 class="blog-index__title">BLOG</h1>
        <p class="blog-index__subtitle">
          Entrenamiento, m&eacute;todo y movimiento
        </p>
      </div>

      <!-- Loading state -->
      <div v-if="isLoading" class="blog-index__loading">
        <div v-for="n in 3" :key="n" class="blog-index__skeleton">
          <div class="blog-index__skeleton-image" />
          <div class="blog-index__skeleton-content">
            <div class="blog-index__skeleton-meta" />
            <div class="blog-index__skeleton-title" />
            <div class="blog-index__skeleton-text" />
            <div
              class="blog-index__skeleton-text blog-index__skeleton-text--short"
            />
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="isEmpty" class="blog-index__empty">
        <p class="blog-index__empty-text">
          Pr&oacute;ximamente publicaremos contenido. Volv&eacute; pronto.
        </p>
      </div>

      <!-- Post list -->
      <div v-else class="blog-index__list">
        <BlogPostCard v-for="post in posts" :key="post.id" :post="post" />
      </div>

      <!-- Pagination -->
      <BlogPagination
        v-if="!isLoading && !isEmpty && totalPages > 1"
        :current-page="page"
        :total-pages="totalPages"
        @page-change="handlePageChange"
      />
    </div>
  </main>
</template>

<style scoped>
/* ==========================================================================
   Blog Index Page
   BEM naming. Token variables only. Never pure black or white.
   ========================================================================== */

.blog-index {
  background: var(--color-marble-cream);
  min-height: 60vh;
  padding: var(--space-large) 0;
}

.blog-index__container {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 5%;
}

/* ------------------------------------------------------------------
   Header
   ------------------------------------------------------------------ */
.blog-index__header {
  text-align: center;
  margin-bottom: var(--space-section);
}

.blog-index__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-deep-charcoal);
  margin: 0 0 8px 0;
}

.blog-index__subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 20px;
  color: var(--color-charcoal-mist);
  margin: 0;
}

/* ------------------------------------------------------------------
   Post list
   ------------------------------------------------------------------ */
.blog-index__list {
  display: flex;
  flex-direction: column;
}

/* ------------------------------------------------------------------
   Empty state
   ------------------------------------------------------------------ */
.blog-index__empty {
  text-align: center;
  padding: var(--space-hero) 0;
}

.blog-index__empty-text {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 17px;
  color: var(--color-olive-stone);
  line-height: 1.6;
}

/* ------------------------------------------------------------------
   Loading skeleton
   ------------------------------------------------------------------ */
.blog-index__loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacious);
}

.blog-index__skeleton {
  padding: var(--space-spacious) 0;
  border-bottom: 1px solid var(--color-warm-stone);
}

.blog-index__skeleton-image {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: var(--color-sandy-beige);
  border-radius: var(--radius-card);
  margin-bottom: var(--space-comfortable);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.blog-index__skeleton-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.blog-index__skeleton-meta {
  width: 200px;
  height: 14px;
  background: var(--color-sandy-beige);
  border-radius: 4px;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  animation-delay: 0.1s;
}

.blog-index__skeleton-title {
  width: 70%;
  height: 24px;
  background: var(--color-sandy-beige);
  border-radius: 4px;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  animation-delay: 0.2s;
}

.blog-index__skeleton-text {
  width: 100%;
  height: 14px;
  background: var(--color-sandy-beige);
  border-radius: 4px;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
  animation-delay: 0.3s;
}

.blog-index__skeleton-text--short {
  width: 60%;
}

@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 0.3;
  }
}

/* ------------------------------------------------------------------
   Mobile (max-width: 480px)
   ------------------------------------------------------------------ */
@media (max-width: 480px) {
  .blog-index {
    padding: var(--space-spacious) 0;
  }

  .blog-index__title {
    font-size: 28px;
  }

  .blog-index__subtitle {
    font-size: 17px;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .blog-index__skeleton-image,
  .blog-index__skeleton-meta,
  .blog-index__skeleton-title,
  .blog-index__skeleton-text {
    animation: none;
  }
}
</style>
