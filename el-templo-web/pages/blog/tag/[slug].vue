<script setup lang="ts">
/**
 * /blog/tag/[slug] -- Tag browse page with paginated filtered post listing.
 *
 * Shows posts filtered by tag, with tag bar, pagination, SEO meta, and BreadcrumbList.
 * BEM prefix: blog-tag-page
 */

interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string | null;
  publishedAt: string | null;
  readingTime: number;
  tags?: Array<{ id: number; name: string; slug: string }>;
}

interface TagWithCount {
  id: number;
  name: string;
  slug: string;
  postCount: number;
}

interface TagPostsResponse {
  posts: BlogPost[];
  total: number;
  page: number;
  totalPages: number;
  tag: { id: number; name: string; slug: string };
}

const route = useRoute();
const config = useRuntimeConfig();

const tagSlug = computed(() => String(route.params.slug));
const page = computed(() => Number(route.query.page) || 1);

// Fetch tag posts
const { data, status, error } = useFetch<TagPostsResponse>(
  () =>
    `${config.public.apiUrl}/blog/tags/${tagSlug.value}/posts?page=${page.value}&limit=10`,
  { watch: [page, tagSlug] },
);

// Handle 404
if (error.value) {
  throw createError({
    statusCode: 404,
    statusMessage: "Tag no encontrado",
    fatal: true,
  });
}

// Fetch all tags for the tag bar
const { data: tagsData } = useFetch<{ tags: TagWithCount[] }>(
  () => `${config.public.apiUrl}/blog/tags`,
);

const posts = computed(() => data.value?.posts ?? []);
const tag = computed(() => data.value?.tag);
const totalPages = computed(() => data.value?.totalPages ?? 0);
const tags = computed(() => tagsData.value?.tags ?? []);
const isLoading = computed(() => status.value === "pending");
const isEmpty = computed(
  () => status.value === "success" && posts.value.length === 0,
);

function handlePageChange(newPage: number): void {
  navigateTo({
    path: `/blog/tag/${tagSlug.value}`,
    query: newPage > 1 ? { page: newPage } : {},
  });
}

// SEO meta
useSeoMeta({
  title: () =>
    tag.value
      ? `Articulos sobre ${tag.value.name} | El Templo`
      : "Blog El Templo",
  description: () =>
    tag.value
      ? `Articulos sobre ${tag.value.name.toLowerCase()}: entrenamiento, calistenia y peso corporal.`
      : "",
  ogTitle: () =>
    tag.value ? `Articulos sobre ${tag.value.name} | El Templo` : "",
  ogUrl: () => `https://eltemplo.org/blog/tag/${tagSlug.value}`,
  ogType: "website",
  ogSiteName: "El Templo",
});

useHead({
  link: [
    {
      rel: "canonical",
      href: `https://eltemplo.org/blog/tag/${tagSlug.value}`,
    },
  ],
});

// BreadcrumbList JSON-LD
watchEffect(() => {
  if (tag.value) {
    useSchemaOrg([
      defineBreadcrumb({
        itemListElement: [
          { name: "Inicio", item: "https://eltemplo.org/" },
          { name: "Blog", item: "https://eltemplo.org/blog" },
          { name: tag.value.name },
        ],
      }),
    ]);
  }
});
</script>

<template>
  <main class="blog-tag-page">
    <div class="blog-tag-page__container">
      <!-- Header -->
      <div class="blog-tag-page__header">
        <h1 v-if="tag" class="blog-tag-page__title">
          {{ tag.name.toUpperCase() }}
        </h1>
        <p class="blog-tag-page__subtitle">Art&iacute;culos sobre este tema</p>
      </div>

      <!-- Tag bar -->
      <BlogTagBar v-if="tags.length > 0" :tags="tags" :active-slug="tagSlug" />

      <!-- Loading state -->
      <div v-if="isLoading" class="blog-tag-page__loading">
        <div v-for="n in 3" :key="n" class="blog-tag-page__skeleton">
          <div class="blog-tag-page__skeleton-image" />
          <div class="blog-tag-page__skeleton-content">
            <div class="blog-tag-page__skeleton-meta" />
            <div class="blog-tag-page__skeleton-title" />
            <div class="blog-tag-page__skeleton-text" />
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else-if="isEmpty" class="blog-tag-page__empty">
        <p class="blog-tag-page__empty-text">
          No hay art&iacute;culos con este tag todav&iacute;a.
        </p>
      </div>

      <!-- Post list -->
      <div v-else class="blog-tag-page__list">
        <BlogPostCard v-for="post in posts" :key="post.id" :post="post" />
      </div>

      <!-- Pagination -->
      <BlogPagination
        v-if="!isLoading && !isEmpty && totalPages > 1"
        :current-page="page"
        :total-pages="totalPages"
        :base-path="`/blog/tag/${tagSlug}`"
        @page-change="handlePageChange"
      />
    </div>
  </main>
</template>

<style scoped>
/* ==========================================================================
   Blog Tag Page -- Filtered post listing by tag
   BEM naming. Token variables only.
   ========================================================================== */

.blog-tag-page {
  background: var(--color-marble-cream);
  min-height: 60vh;
  padding: var(--space-large) 0;
}

.blog-tag-page__container {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 5%;
}

.blog-tag-page__header {
  text-align: center;
  margin-bottom: var(--space-section);
}

.blog-tag-page__title {
  font-family: var(--font-authority);
  font-weight: 700;
  font-size: 36px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-deep-charcoal);
  margin: 0 0 8px 0;
}

.blog-tag-page__subtitle {
  font-family: var(--font-elegance);
  font-weight: 400;
  font-style: italic;
  font-size: 20px;
  color: var(--color-charcoal-mist);
  margin: 0;
}

.blog-tag-page__list {
  display: flex;
  flex-direction: column;
}

.blog-tag-page__empty {
  text-align: center;
  padding: var(--space-hero) 0;
}

.blog-tag-page__empty-text {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 17px;
  color: var(--color-olive-stone);
  line-height: 1.6;
}

/* Loading skeleton */
.blog-tag-page__loading {
  display: flex;
  flex-direction: column;
  gap: var(--space-spacious);
}

.blog-tag-page__skeleton {
  padding: var(--space-spacious) 0;
  border-bottom: 1px solid var(--color-warm-stone);
}

.blog-tag-page__skeleton-image {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: var(--color-sandy-beige);
  border-radius: var(--radius-card);
  margin-bottom: var(--space-comfortable);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.blog-tag-page__skeleton-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.blog-tag-page__skeleton-meta {
  width: 200px;
  height: 14px;
  background: var(--color-sandy-beige);
  border-radius: 4px;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.blog-tag-page__skeleton-title {
  width: 70%;
  height: 24px;
  background: var(--color-sandy-beige);
  border-radius: 4px;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.blog-tag-page__skeleton-text {
  width: 100%;
  height: 14px;
  background: var(--color-sandy-beige);
  border-radius: 4px;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
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

@media (max-width: 480px) {
  .blog-tag-page {
    padding: var(--space-spacious) 0;
  }

  .blog-tag-page__title {
    font-size: 28px;
  }

  .blog-tag-page__subtitle {
    font-size: 17px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .blog-tag-page__skeleton-image,
  .blog-tag-page__skeleton-meta,
  .blog-tag-page__skeleton-title,
  .blog-tag-page__skeleton-text {
    animation: none;
  }
}
</style>
