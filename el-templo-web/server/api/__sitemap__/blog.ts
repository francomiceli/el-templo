/**
 * Dynamic sitemap source for blog posts.
 *
 * Fetches published blog post slugs from the API at build time
 * and returns them as sitemap entries with lastmod dates.
 */
export default defineSitemapEventHandler(async () => {
  const config = useRuntimeConfig();
  try {
    const response = await $fetch<{
      posts: Array<{ slug: string; updatedAt: string }>;
    }>(`${config.public.apiUrl}/blog/posts?limit=1000`);
    return response.posts.map((post) => ({
      loc: `/blog/${post.slug}`,
      lastmod: post.updatedAt,
    }));
  } catch {
    return [];
  }
});
