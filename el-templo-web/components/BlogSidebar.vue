<script setup lang="ts">
/**
 * BlogSidebar -- Sidebar for individual blog post pages.
 *
 * Contains:
 * 1. Recent posts section (5 most recent, excluding current)
 * 2. Brand CTA section (reserve trial session)
 * 3. Social share section (WhatsApp, Twitter/X, copy link)
 *
 * Sticky positioning on desktop, flows below article on mobile.
 * BEM prefix: blog-sidebar
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

interface BlogListResponse {
  posts: BlogPost[];
  total: number;
  page: number;
  totalPages: number;
}

const props = defineProps<{
  currentSlug: string;
}>();

const config = useRuntimeConfig();

const { data } = useFetch<BlogListResponse>(
  () => `${config.public.apiUrl}/blog/posts?limit=5`,
);

const recentPosts = computed(() => {
  if (!data.value?.posts) return [];
  return data.value.posts.filter((p) => p.slug !== props.currentSlug);
});

function formatSidebarDate(dateString: string): string {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleDateString("es-AR", { month: "long" });
  const capitalizedMonth = month.charAt(0).toUpperCase() + month.slice(1);
  const year = date.getFullYear();
  return `${day} de ${capitalizedMonth}, ${year}`;
}

// Social share
const shareUrl = computed(() => {
  if (import.meta.server) return "";
  return window.location.href;
});

const encodedUrl = computed(() => encodeURIComponent(shareUrl.value));

const linkCopied = ref(false);

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    linkCopied.value = true;
    setTimeout(() => {
      linkCopied.value = false;
    }, 2000);
  } catch {
    // Clipboard API not available, silently fail
  }
}
</script>

<template>
  <aside class="blog-sidebar">
    <!-- Recent posts -->
    <div v-if="recentPosts.length > 0" class="blog-sidebar__recent">
      <h3 class="blog-sidebar__heading">Posts Recientes</h3>
      <ul class="blog-sidebar__recent-list">
        <li
          v-for="post in recentPosts"
          :key="post.id"
          class="blog-sidebar__recent-item"
        >
          <NuxtLink
            :to="`/blog/${post.slug}`"
            class="blog-sidebar__recent-link"
          >
            <span class="blog-sidebar__recent-title">{{ post.title }}</span>
            <span v-if="post.publishedAt" class="blog-sidebar__recent-date">
              {{ formatSidebarDate(post.publishedAt) }}
            </span>
          </NuxtLink>
        </li>
      </ul>
    </div>

    <!-- Brand CTA -->
    <div class="blog-sidebar__cta">
      <NuxtLink to="/#descubri-nivel" class="blog-sidebar__cta-btn">
        Reserv&aacute; tu Sesi&oacute;n de Prueba
      </NuxtLink>
      <p class="blog-sidebar__cta-tagline">
        Descubr&iacute; tu nivel y empez&aacute; a entrenar.
      </p>
    </div>

    <!-- Social share -->
    <div class="blog-sidebar__share">
      <h3 class="blog-sidebar__heading">Compartir</h3>
      <div class="blog-sidebar__share-buttons">
        <!-- WhatsApp -->
        <a
          :href="`https://wa.me/?text=${encodedUrl}`"
          target="_blank"
          rel="noopener noreferrer"
          class="blog-sidebar__share-btn blog-sidebar__share-btn--whatsapp"
          aria-label="Compartir en WhatsApp"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
            />
          </svg>
        </a>

        <!-- Twitter / X -->
        <a
          :href="`https://twitter.com/intent/tweet?url=${encodedUrl}`"
          target="_blank"
          rel="noopener noreferrer"
          class="blog-sidebar__share-btn blog-sidebar__share-btn--twitter"
          aria-label="Compartir en Twitter"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 4l11.733 16h4.267l-11.733 -16h-4.267z" />
            <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />
          </svg>
        </a>

        <!-- Copy link -->
        <button
          class="blog-sidebar__share-btn blog-sidebar__share-btn--copy"
          :aria-label="linkCopied ? 'Enlace copiado' : 'Copiar enlace'"
          @click="copyLink"
        >
          <svg
            v-if="!linkCopied"
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
            />
            <path
              d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
            />
          </svg>
          <span v-else class="blog-sidebar__copied-text">Copiado!</span>
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* ==========================================================================
   BlogSidebar -- Sidebar for individual post pages
   BEM naming. Token variables only.
   ========================================================================== */

.blog-sidebar {
  position: sticky;
  top: 80px;
  max-width: 300px;
  display: flex;
  flex-direction: column;
  gap: var(--space-spacious);
  align-self: start;
}

/* ------------------------------------------------------------------
   Section headings
   ------------------------------------------------------------------ */
.blog-sidebar__heading {
  font-family: var(--font-authority);
  font-weight: 600;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-deep-charcoal);
  margin: 0 0 var(--space-base) 0;
}

/* ------------------------------------------------------------------
   Recent posts
   ------------------------------------------------------------------ */
.blog-sidebar__recent {
  padding-bottom: var(--space-comfortable);
  border-bottom: 1px solid var(--color-warm-stone);
}

.blog-sidebar__recent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.blog-sidebar__recent-item {
  margin: 0;
  padding: 0;
}

.blog-sidebar__recent-link {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-decoration: none;
  transition: color var(--transition-base);
}

.blog-sidebar__recent-link:hover .blog-sidebar__recent-title {
  color: var(--color-terracotta);
}

.blog-sidebar__recent-title {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 14px;
  color: var(--color-deep-charcoal);
  line-height: 1.4;
  transition: color var(--transition-base);
}

.blog-sidebar__recent-date {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 12px;
  color: var(--color-olive-stone);
}

/* ------------------------------------------------------------------
   Brand CTA
   ------------------------------------------------------------------ */
.blog-sidebar__cta {
  background: var(--color-sandy-beige);
  border-radius: var(--radius-card);
  padding: var(--space-comfortable);
  text-align: center;
}

.blog-sidebar__cta-btn {
  display: block;
  background: var(--color-terracotta);
  color: var(--color-marble-cream);
  font-family: var(--font-authority);
  font-weight: 600;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  text-decoration: none;
  padding: 12px 20px;
  border-radius: var(--radius-base);
  transition:
    background var(--transition-base),
    transform var(--transition-base);
}

.blog-sidebar__cta-btn:hover {
  background: var(--color-clay);
  transform: translateY(-1px);
}

.blog-sidebar__cta-tagline {
  font-family: var(--font-clarity);
  font-weight: 400;
  font-size: 13px;
  color: var(--color-charcoal-mist);
  margin: 10px 0 0 0;
}

/* ------------------------------------------------------------------
   Social share
   ------------------------------------------------------------------ */
.blog-sidebar__share {
  padding-top: var(--space-comfortable);
  border-top: 1px solid var(--color-warm-stone);
}

.blog-sidebar__share-buttons {
  display: flex;
  gap: 12px;
}

.blog-sidebar__share-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-base);
  border: 1px solid var(--color-warm-stone);
  background: transparent;
  color: var(--color-deep-charcoal);
  cursor: pointer;
  transition:
    background var(--transition-base),
    color var(--transition-base),
    border-color var(--transition-base);
  text-decoration: none;
}

.blog-sidebar__share-btn:hover {
  border-color: var(--color-terracotta);
}

.blog-sidebar__share-btn--whatsapp:hover {
  color: #25d366;
  border-color: #25d366;
}

.blog-sidebar__share-btn--twitter:hover {
  color: var(--color-deep-charcoal);
  background: var(--color-sandy-beige);
}

.blog-sidebar__share-btn--copy:hover {
  color: var(--color-terracotta);
}

.blog-sidebar__copied-text {
  font-family: var(--font-clarity);
  font-weight: 500;
  font-size: 10px;
  color: var(--color-terracotta);
}

/* ------------------------------------------------------------------
   Mobile (max-width: 768px) — sidebar flows below article
   ------------------------------------------------------------------ */
@media (max-width: 768px) {
  .blog-sidebar {
    position: static;
    max-width: 100%;
  }
}

/* ------------------------------------------------------------------
   Reduced Motion
   ------------------------------------------------------------------ */
@media (prefers-reduced-motion: reduce) {
  .blog-sidebar__share-btn,
  .blog-sidebar__cta-btn,
  .blog-sidebar__recent-link {
    transition: none;
  }
}
</style>
