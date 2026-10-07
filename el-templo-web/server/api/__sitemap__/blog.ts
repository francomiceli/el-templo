/**
 * Dynamic sitemap source for blog posts and tag pages.
 *
 * Lee posts y tags de `data/generated/web-data.json` (la misma fuente que el
 * prerender, escrita por `scripts/fetch-web-data.mjs`), sin llamadas de red y
 * sin atrapar errores: si el archivo falta, el build tiene que fallar.
 */
import webDataRaw from "../../../data/generated/web-data.json";
import type { WebData } from "../../../data/web-data.types";

const webData = webDataRaw as unknown as WebData;

export default defineSitemapEventHandler(() => [
  ...webData.blog.posts.map((post) => ({
    loc: `/blog/${post.slug}`,
    ...(post.updatedAt ? { lastmod: post.updatedAt } : {}),
  })),
  ...webData.blog.tags.map((tag) => ({
    loc: `/blog/tag/${tag.slug}`,
    changefreq: "weekly" as const,
  })),
]);
