/**
 * Rutas a prerenderizar derivadas de `web-data.json` (fase 195).
 *
 * Hoy: hub y paginas de sedes, disciplinas, planes, posts y tags del blog. El
 * plan 195-06 agrega el resto de `/es`.
 *
 * Sedes: las de Argentina (gym y espacio de comunidad) viven en
 * `/sedes/<slug>` y las de Espana en `/es/sedes/<slug>`. NUNCA se prerenderiza
 * `/sedes/<slug>` de una sede ES (la pagina responde 404).
 */
import { sedePath } from "../utils/schema-graph";
import { disciplinas } from "./disciplinas";
import type { WebData } from "./web-data.types";

export function prerenderRoutes(data: WebData): string[] {
  return [
    "/sedes",
    ...data.sedes.map(sedePath),
    "/disciplinas",
    ...disciplinas.map((d) => `/disciplinas/${d.slug}`),
    "/planes",
    ...data.blog.posts.map((p) => `/blog/${p.slug}`),
    ...data.blog.tags.map((t) => `/blog/tag/${t.slug}`),
  ];
}
