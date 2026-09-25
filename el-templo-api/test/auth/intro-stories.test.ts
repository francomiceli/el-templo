/**
 * SPEC "Empezá acá" B (persistencia y métrica) — POST /api/auth/me/intro-stories.
 *
 * El aislamiento multi-tenant de esta ruta vive en
 * test/tenancy/iso-03-auth.test.ts (gate ISO-03). Este archivo cubre el
 * COMPORTAMIENTO funcional: idempotencia de los timestamps, actualización
 * del slide, validación de body y el caso del socio sin fila
 * member_profiles todavía (freemium sin onboarding).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, registerUser } from "../helpers";

describe("POST /api/auth/me/intro-stories", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  // `member_profiles.intro_stories_*` son TIMESTAMP de MySQL: sin precisión
  // de milisegundos (a diferencia del `Date.now()` de Node). La PRIMERA
  // respuesta devuelve el Date en memoria (con ms); una SEGUNDA lectura que
  // reidrata desde la fila ya lo trae truncado al segundo — comparar
  // idempotencia al segundo, no al milisegundo, evita un falso rojo por esa
  // diferencia de precisión (no es un bug: el timestamp real no cambió).
  function alSegundo(iso: string): string {
    return iso.slice(0, 19);
  }

  // dni es varchar(20) — un sufijo descriptivo largo (p. ej.
  // "completed-idempotente") lo desborda y el INSERT falla en silencio con un
  // 500 genérico. Se genera un dni corto y único acá; el sufijo descriptivo
  // solo se usa en el email (sin ese límite de longitud).
  let dniCounter = 0;
  async function crearSocio(labelParaEmail: string) {
    dniCounter += 1;
    const { token } = await registerUser(app, {
      email: `intro-stories-${labelParaEmail}@test.com`,
      password: "password123",
      branchId: 1,
      dni: `INTRO${Date.now().toString(36)}${dniCounter}`,
    });
    return token;
  }

  it("401 sin token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/me/intro-stories",
      payload: { event: "seen", lastSlide: 0 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("400 con event inválido", async () => {
    const token = await crearSocio("bad-event");
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/me/intro-stories",
      headers: { authorization: `Bearer ${token}` },
      payload: { event: "algo-inventado", lastSlide: 0 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("400 con lastSlide negativo", async () => {
    const token = await crearSocio("bad-slide");
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/me/intro-stories",
      headers: { authorization: `Bearer ${token}` },
      payload: { event: "seen", lastSlide: -1 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("400 sin lastSlide", async () => {
    const token = await crearSocio("no-slide");
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/me/intro-stories",
      headers: { authorization: `Bearer ${token}` },
      payload: { event: "seen" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("un socio recién registrado (sin fila member_profiles todavía) crea la fila al registrar 'seen'", async () => {
    const token = await crearSocio("crea-fila");
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/me/intro-stories",
      headers: { authorization: `Bearer ${token}` },
      payload: { event: "seen", lastSlide: 0 },
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.introStoriesSeenAt).not.toBeNull();
    expect(body.introStoriesCompletedAt).toBeNull();
    expect(body.introStoriesLastSlide).toBe(0);
  });

  it("'seen' es idempotente: un segundo 'seen' no pisa el timestamp original", async () => {
    const token = await crearSocio("seen-idempotente");
    const primero = await app.inject({
      method: "POST",
      url: "/api/auth/me/intro-stories",
      headers: { authorization: `Bearer ${token}` },
      payload: { event: "seen", lastSlide: 0 },
    });
    const primerTimestamp = JSON.parse(primero.body).introStoriesSeenAt;

    await new Promise((resolve) => setTimeout(resolve, 50));

    const segundo = await app.inject({
      method: "POST",
      url: "/api/auth/me/intro-stories",
      headers: { authorization: `Bearer ${token}` },
      payload: { event: "seen", lastSlide: 2 },
    });
    expect(segundo.statusCode, segundo.body).toBe(200);
    const body = JSON.parse(segundo.body);
    expect(alSegundo(body.introStoriesSeenAt)).toBe(alSegundo(primerTimestamp));
    // El slide SÍ se actualiza siempre, aunque el timestamp no se pise.
    expect(body.introStoriesLastSlide).toBe(2);
  });

  it("'completed' estampa introStoriesCompletedAt y conserva introStoriesSeenAt", async () => {
    const token = await crearSocio("completed");
    await app.inject({
      method: "POST",
      url: "/api/auth/me/intro-stories",
      headers: { authorization: `Bearer ${token}` },
      payload: { event: "seen", lastSlide: 0 },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/me/intro-stories",
      headers: { authorization: `Bearer ${token}` },
      payload: { event: "completed", lastSlide: 6 },
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.introStoriesSeenAt).not.toBeNull();
    expect(body.introStoriesCompletedAt).not.toBeNull();
    expect(body.introStoriesLastSlide).toBe(6);
  });

  it("'completed' es idempotente: un segundo 'completed' no pisa el timestamp original", async () => {
    const token = await crearSocio("completed-idempotente");
    const primero = await app.inject({
      method: "POST",
      url: "/api/auth/me/intro-stories",
      headers: { authorization: `Bearer ${token}` },
      payload: { event: "completed", lastSlide: 6 },
    });
    const primerTimestamp = JSON.parse(primero.body).introStoriesCompletedAt;

    await new Promise((resolve) => setTimeout(resolve, 50));

    const segundo = await app.inject({
      method: "POST",
      url: "/api/auth/me/intro-stories",
      headers: { authorization: `Bearer ${token}` },
      payload: { event: "completed", lastSlide: 6 },
    });
    expect(alSegundo(JSON.parse(segundo.body).introStoriesCompletedAt)).toBe(
      alSegundo(primerTimestamp),
    );
  });

  it("GET /api/auth/me expone los 3 campos de intro-stories", async () => {
    const token = await crearSocio("expuesto-en-me");
    await app.inject({
      method: "POST",
      url: "/api/auth/me/intro-stories",
      headers: { authorization: `Bearer ${token}` },
      payload: { event: "seen", lastSlide: 3 },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.introStoriesSeenAt).not.toBeNull();
    expect(body.introStoriesCompletedAt).toBeNull();
    expect(body.introStoriesLastSlide).toBe(3);
  });

  it("GET /api/auth/me de un socio que nunca abrió las historias devuelve los 3 campos en null", async () => {
    const token = await crearSocio("nunca-abrio");
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.introStoriesSeenAt).toBeNull();
    expect(body.introStoriesCompletedAt).toBeNull();
    expect(body.introStoriesLastSlide).toBeNull();
  });
});
