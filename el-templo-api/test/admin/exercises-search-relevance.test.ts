import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken } from "../helpers";
import { inArray } from "drizzle-orm";
import * as schema from "../../src/db/schema";

/**
 * Feedback de profes: buscar "remo" traía primero ejercicios que sólo
 * contienen esas letras en el medio de otra palabra (orden puramente
 * alfabético, sin ranking de relevancia). Ver
 * ExerciseSwapService.searchExercises.
 */
describe("GET /admin/exercises/search — ranking de relevancia", () => {
  let app: FastifyInstance;
  let adminToken: string;
  const seededExerciseIds: number[] = [];

  // Token único por corrida para no colisionar con datos ya sembrados en la
  // DB de test compartida por el worker. `stamp` aísla nombres que NO deben
  // contener el término buscado (el caso tier 3, que sólo matchea vía
  // exercise2); `term` es lo que efectivamente se busca.
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000000)}`;
  const term = `remo${stamp}`;

  const SEED_EXERCISES = [
    // Tier 0: el nombre EMPIEZA con el término.
    { exercise: `${term} invertido`, exercise2: null },
    { exercise: `${term} con barra`, exercise2: null },
    // Tier 1: alguna PALABRA del nombre empieza con el término.
    { exercise: `Peso muerto ${term}`, exercise2: null },
    // Tier 2: substring en el medio de otra palabra (el bug reportado).
    { exercise: `T${term} de pierna`, exercise2: null },
    // Tier 3: sólo matchea en exercise2 (nombre secundario) — el nombre
    // propio NO debe contener el término, solo el sufijo de aislamiento.
    { exercise: `Sentadilla-${stamp}-sin-relacion`, exercise2: `${term} bulgaro` },
  ];

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    for (const ex of SEED_EXERCISES) {
      const [res] = await app.db
        .insert(schema.exercises)
        .values({
          pattern: "test",
          category: "test",
          exercise: ex.exercise,
          exercise2: ex.exercise2,
          effort: "CON",
          route: "PL",
          dificultadLineal: 1,
        })
        .$returningId();
      seededExerciseIds.push(res.id);
    }

    // El ejercicio "tier 3" tiene un nombre propio distinto del término
    // buscado (para no matchear por tier 0/1/2); lo sacamos de la lista de
    // búsqueda renombrándolo sin el término salvo el sufijo de aislamiento.
  });

  afterAll(async () => {
    if (seededExerciseIds.length > 0) {
      await app.db
        .delete(schema.exercises)
        .where(inArray(schema.exercises.id, seededExerciseIds));
    }
    await app.close();
  });

  it("ranks by relevance (prefix > word-start > substring > exercise2), then alphabetically", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/exercises/search?q=${term}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const names: string[] = body.exercises.map(
      (e: { exercise: string }) => e.exercise,
    );

    expect(names).toEqual([
      `${term} con barra`, // tier 0, alphabetically before "invertido"
      `${term} invertido`, // tier 0
      `Peso muerto ${term}`, // tier 1
      `T${term} de pierna`, // tier 2
      `Sentadilla-${stamp}-sin-relacion`, // tier 3 (matches only via exercise2)
    ]);
  });

  it("excludes exercises that don't match on either exercise or exercise2", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/exercises/search?q=${term}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const ids: number[] = body.exercises.map((e: { id: number }) => e.id);
    expect(ids.sort()).toEqual([...seededExerciseIds].sort());
  });

  it("treats % and _ in the search term as literal characters, not LIKE wildcards", async () => {
    // El seed no tiene ningún ejercicio con "%" o "_" en el nombre: un query
    // con esos caracteres no debería devolver matches espurios ni romper.
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/exercises/search?q=${encodeURIComponent(`${term}%_x`)}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const ids: number[] = body.exercises.map((e: { id: number }) => e.id);
    for (const seededId of seededExerciseIds) {
      expect(ids).not.toContain(seededId);
    }
  });
});
