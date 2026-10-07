/**
 * Rutas a prerenderizar derivadas de `web-data.json` (fase 195).
 *
 * Hoy: hub y paginas de sedes, disciplinas, planes, profes, primera clase,
 * posts y tags del blog y la seccion `/es` (home, primera clase y planes).
 *
 * Sedes: las de Argentina (gym y espacio de comunidad) viven en
 * `/sedes/<slug>` y las de Espana en `/es/sedes/<slug>`. NUNCA se prerenderiza
 * `/sedes/<slug>` de una sede ES (la pagina responde 404).
 */
import { sedePath } from "../utils/schema-graph";
import { disciplinas } from "./disciplinas";
import { publishedProfes } from "./profes";
import type { WebData } from "./web-data.types";

export function prerenderRoutes(data: WebData): string[] {
  return [
    "/sedes",
    ...data.sedes.map(sedePath),
    "/disciplinas",
    ...disciplinas.map((d) => `/disciplinas/${d.slug}`),
    "/planes",
    "/profes",
    ...publishedProfes.map((p) => `/profes/${p.slug}`),
    "/primera-clase-gratis",
    "/es",
    "/es/primera-clase-gratis",
    "/es/planes",
    ...data.blog.posts.map((p) => `/blog/${p.slug}`),
    ...data.blog.tags.map((t) => `/blog/tag/${t.slug}`),
  ];
}
