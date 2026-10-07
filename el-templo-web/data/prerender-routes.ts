/**
 * Rutas a prerenderizar derivadas de `web-data.json` (fase 195).
 *
 * Hoy: posts y tags del blog. Los planes 195-04 a 195-06 agregan sedes,
 * disciplinas, profes y `/es`.
 */
import type { WebData } from "./web-data.types";

export function prerenderRoutes(data: WebData): string[] {
  return [
    ...data.blog.posts.map((p) => `/blog/${p.slug}`),
    ...data.blog.tags.map((t) => `/blog/tag/${t.slug}`),
  ];
}
