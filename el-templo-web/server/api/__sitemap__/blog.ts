/**
 * Dynamic sitemap source for blog posts and tag pages.
 *
 * Fetches published blog post slugs and tag slugs from the API
 * and returns them as sitemap entries with lastmod dates.
 */
export default defineSitemapEventHandler(async () => {
  const config = useRuntimeConfig();
  const entries: Array<{
    loc: string;
    lastmod?: string;
    changefreq?:
      | "always"
      | "hourly"
      | "daily"
      | "weekly"
      | "monthly"
      | "yearly"
      | "never";
  }> = [];

  try {
    // Blog post URLs
    const postsResponse = await $fetch<{
      posts: Array<{ slug: string; updatedAt: string }>;
    }>(`${config.public.apiUrl}/blog/posts?limit=1000`);

    for (const post of postsResponse.posts) {
      entries.push({
        loc: `/blog/${post.slug}`,
        lastmod: post.updatedAt,
      });
    }

    // Tag page URLs
    const tagsResponse = await $fetch<{
      tags: Array<{ slug: string }>;
    }>(`${config.public.apiUrl}/blog/tags`);

    for (const tag of tagsResponse.tags) {
      entries.push({
        loc: `/blog/tag/${tag.slug}`,
        changefreq: "weekly",
      });
    }
  } catch {
    // Gracefully return whatever we have
  }

  return entries;
});
