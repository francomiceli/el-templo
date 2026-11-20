/**
 * Unit tests de los errores con código del regalo de Aura (fase 215).
 *
 * Todo es puro, sin DB: tabla de códigos, status HTTP, cuerpo de la respuesta y
 * el reenvío de lo que no es un `GiftError` a `handleServiceError`.
 */

import { describe, it, expect, vi } from "vitest";
import type { FastifyBaseLogger, FastifyReply } from "fastify";
import {
  GIFT_ERROR_CODES,
  GiftError,
  giftErrorBody,
  sendGiftError,
} from "../../src/modules/aura/gift-errors";
import { NotFoundError } from "../../src/modules/shared/errors";

interface FakeReply {
  sent: boolean;
  statusCode: number | null;
  payload: unknown;
  code(status: number): FakeReply;
  send(body: unknown): FakeReply;
}

function fakeReply(): FakeReply {
  const reply: FakeReply = {
    sent: false,
    statusCode: null,
    payload: null,
    code(status: number) {
      reply.statusCode = status;
      return reply;
    },
    send(body: unknown) {
      reply.payload = body;
      reply.sent = true;
      return reply;
    },
  };
  return reply;
}

function fakeLog(): FastifyBaseLogger {
  return { error: vi.fn() } as unknown as FastifyBaseLogger;
}

describe("códigos del regalo", () => {
  it("son exactamente estos siete", () => {
    expect([...GIFT_ERROR_CODES].sort()).toEqual(
      [
        "REGALO_NO_DISPONIBLE",
        "REGALO_NO_ENCONTRADO",
        "REGALO_SIN_PERMISO",
        "REGALO_TOPE_SEMANAL",
        "REGALO_VENCIDO",
        "REGALO_YA_ANULADO",
        "REGALO_YA_DADO",
      ].sort(),
    );
  });
});

describe("GiftError", () => {
  it("REGALO_NO_ENCONTRADO responde 404", () => {
    expect(new GiftError("REGALO_NO_ENCONTRADO").statusCode).toBe(404);
  });

  it("REGALO_SIN_PERMISO responde 403", () => {
    expect(new GiftError("REGALO_SIN_PERMISO").statusCode).toBe(403);
  });

  it.each([
    "REGALO_TOPE_SEMANAL",
    "REGALO_YA_DADO",
    "REGALO_VENCIDO",
    "REGALO_NO_DISPONIBLE",
    "REGALO_YA_ANULADO",
  ] as const)("%s responde 409", (code) => {
    expect(new GiftError(code).statusCode).toBe(409);
  });

  it("conserva el código y el nombre", () => {
    const err = new GiftError("REGALO_TOPE_SEMANAL");
    expect(err.code).toBe("REGALO_TOPE_SEMANAL");
    expect(err.name).toBe("GiftError");
    expect(err.message.length).toBeGreaterThan(0);
  });

  it("instanceof funciona después de lanzar y atrapar", () => {
    let caught: unknown = null;
    try {
      throw new GiftError("REGALO_YA_DADO");
    } catch (err: unknown) {
      caught = err;
    }
    expect(caught instanceof GiftError).toBe(true);
    expect(caught instanceof Error).toBe(true);
  });
});

describe("giftErrorBody", () => {
  it("devuelve error, message y code, con el mensaje en español", () => {
    const body = giftErrorBody(new GiftError("REGALO_VENCIDO"));
    expect(body.code).toBe("REGALO_VENCIDO");
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    expect(body.message).toMatch(/regalo/i);
  });

  it("cada código tiene un mensaje propio y sin datos de otras personas", () => {
    const messages = new Set<string>();
    for (const code of GIFT_ERROR_CODES) {
      const body = giftErrorBody(new GiftError(code));
      expect(body.code).toBe(code);
      expect(body.message).not.toMatch(/\d/);
      messages.add(body.message);
    }
    expect(messages.size).toBe(GIFT_ERROR_CODES.length);
  });
});

describe("sendGiftError", () => {
  it("un GiftError sale con su status y su code", () => {
    const reply = fakeReply();
    sendGiftError(
      new GiftError("REGALO_TOPE_SEMANAL"),
      reply as unknown as FastifyReply,
      fakeLog(),
      "test",
    );
    expect(reply.statusCode).toBe(409);
    expect(reply.payload).toMatchObject({ code: "REGALO_TOPE_SEMANAL" });
  });

  it("un AppError común se delega en handleServiceError (sin code)", () => {
    const reply = fakeReply();
    sendGiftError(
      new NotFoundError("no está"),
      reply as unknown as FastifyReply,
      fakeLog(),
      "test",
    );
    expect(reply.statusCode).toBe(404);
    expect(reply.payload).not.toHaveProperty("code");
  });

  it("un error desconocido sale como 500 genérico y se loguea", () => {
    const reply = fakeReply();
    const log = fakeLog();
    sendGiftError(
      new Error("boom"),
      reply as unknown as FastifyReply,
      log,
      "test",
    );
    expect(reply.statusCode).toBe(500);
    expect(JSON.stringify(reply.payload)).not.toContain("boom");
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("no responde dos veces si la respuesta ya salió", () => {
    const reply = fakeReply();
    reply.sent = true;
    sendGiftError(
      new GiftError("REGALO_YA_DADO"),
      reply as unknown as FastifyReply,
      fakeLog(),
      "test",
    );
    expect(reply.statusCode).toBeNull();
  });
});
