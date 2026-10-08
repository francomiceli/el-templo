// Fallback de video entre copias del mismo ejercicio en el catálogo.
//
// POR QUÉ EXISTE
// --------------
// El video vive por FILA de `exercises` (`video_url`), pero el catálogo tiene
// varias filas con el mismo nombre (relevado en prod 2026-10-08: 2.169 filas
// para 1.325 nombres). Dos orígenes:
//   1. Variantes legítimas: una fila por contracción (SISSY SQ EXC/ISO/CON) o
//      el mismo movimiento en dos rutas (LOW BRIDGE en BRIDGE y en HT).
//   2. Re-altas: una copia nueva del mismo ejercicio (CRAB WALK 4234 → 4517).
// El video suele quedar cargado en UNA sola copia, y las planis que apuntan a
// las otras se mostraban sin video aunque el clip existía (3.556
// prescripciones en 2026).
//
// QUÉ HACE
// --------
// Dado un set de ids de ejercicio, devuelve para cada uno el video de otra
// copia con el MISMO nombre (comparado con TRIM + UPPER) dentro del MISMO
// tenant. Si hay varias copias con video, prefiere la de la misma ruta y,
// dentro de eso, la más nueva (id mayor). Los ids sin copia con video no
// aparecen en el Map.
//
// Es solo lectura y para lo que ve el ALUMNO (app, TV, programas). El admin de
// catálogo sigue mostrando el `video_url` real de cada fila.

import { and, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";

type Db = MySql2Database<typeof schema>;

/** `true` si la fila no tiene un video utilizable (NULL o string vacío). */
export function isMissingVideo(url: string | null | undefined): boolean {
  return url == null || url.trim() === "";
}

/**
 * Para cada id de `exerciseIds`, el `video_url` de otra copia del mismo
 * ejercicio (mismo nombre, mismo tenant) que sí tenga video.
 *
 * Pensado para llamarse SOLO con los ids cuyo video propio falta: el Map no
 * dice nada sobre el video propio de cada id.
 */
export async function findSiblingVideoUrls(
  db: Db,
  exerciseIds: readonly number[],
): Promise<Map<number, string>> {
  const ids = [...new Set(exerciseIds)];
  if (ids.length === 0) return new Map();

  const src = alias(schema.exercises, "src");
  const sib = alias(schema.exercises, "sib");

  /* tenant-safe: self-join del catálogo restringido a `sib.tenant_id =
     src.tenant_id` — la copia de la que se toma el video es siempre del mismo
     gimnasio que el ejercicio pedido, y los ids pedidos salen de filas que el
     llamador ya leyó en su propio scope. */
  const rows = await db
    .select({
      exerciseId: src.id,
      siblingId: sib.id,
      sameRoute: sql<number>`(${sib.route} = ${src.route})`,
      videoUrl: sib.videoUrl,
    })
    .from(src)
    .innerJoin(
      sib,
      and(
        sql`/* tenant-safe: copia del mismo gimnasio */ ${sib.tenantId} = ${src.tenantId}`,
        sql`UPPER(TRIM(${sib.exercise})) = UPPER(TRIM(${src.exercise}))`,
        ne(sib.id, src.id),
        isNotNull(sib.videoUrl),
        sql`TRIM(${sib.videoUrl}) <> ''`,
      ),
    )
    .where(inArray(src.id, ids));

  // Elegir la mejor copia por id pedido: misma ruta primero, después la más
  // nueva. Explícito en JS en vez de un ORDER BY + "primera por grupo".
  const best = new Map<
    number,
    { siblingId: number; sameRoute: boolean; videoUrl: string }
  >();
  for (const row of rows) {
    if (row.videoUrl == null) continue;
    const candidate = {
      siblingId: row.siblingId,
      sameRoute: Number(row.sameRoute) === 1,
      videoUrl: row.videoUrl,
    };
    const current = best.get(row.exerciseId);
    if (
      !current ||
      (candidate.sameRoute && !current.sameRoute) ||
      (candidate.sameRoute === current.sameRoute &&
        candidate.siblingId > current.siblingId)
    ) {
      best.set(row.exerciseId, candidate);
    }
  }

  return new Map([...best].map(([id, b]) => [id, b.videoUrl]));
}

/**
 * Atajo para los call sites: recibe filas con `exerciseId` + video propio y
 * devuelve una función que resuelve el video final de cada fila (propio si lo
 * tiene, si no el de una copia del mismo ejercicio, si no `null`).
 */
export async function buildVideoResolver(
  db: Db,
  rows: ReadonlyArray<{
    exerciseId: number | null;
    videoUrl: string | null;
  }>,
): Promise<(exerciseId: number | null, ownUrl: string | null) => string | null> {
  const missingIds = rows.flatMap((r) =>
    r.exerciseId != null && isMissingVideo(r.videoUrl) ? [r.exerciseId] : [],
  );
  const siblings = await findSiblingVideoUrls(db, missingIds);
  return (exerciseId, ownUrl) => {
    if (!isMissingVideo(ownUrl)) return ownUrl;
    if (exerciseId == null) return null;
    return siblings.get(exerciseId) ?? null;
  };
}
