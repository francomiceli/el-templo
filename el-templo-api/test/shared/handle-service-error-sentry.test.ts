/**
 * `handleServiceError` reporta a Sentry los 500 que atrapa una ruta.
 *
 * Caso María Eugenia Rossi (2026-11-25): "error interno del servidor" al entrar
 * en lista de espera, 3 × "Error in member reserve" en el log de pm2 y nada en
 * Sentry. La ruta atrapa el error y responde ella con `handleServiceError`, así
 * que el hook `onError` de `Sentry.setupFastifyErrorHandler` nunca lo veía.
 * Los `AppError` (4xx/5xx deliberados) NO se reportan: son respuestas de negocio.
 * Las rutas de la TV tampoco: consultan cada 750 ms y un corte breve de MySQL
 * dispara decenas de 500 en segundos (ruido).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyBaseLogger, FastifyReply } from "fastify";

const captureException = vi.fn();
vi.mock("@sentry/node", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

import {
  handleServiceError,
  INTERNAL_ERROR_BODY,
  reportUnexpectedError,
} from "../../src/modules/shared/error-handler";
import { ConflictError } from "../../src/modules/shared/errors";

function fakeReply() {
  const sent: { code: number | null; body: unknown } = {
    code: null,
    body: null,
  };
  const reply = {
    sent: false,
    code(c: number) {
      sent.code = c;
      return reply;
    },
    send(b: unknown) {
      sent.body = b;
      return reply;
    },
  };
  return { reply: reply as unknown as FastifyReply, sent };
}

const log = { error: vi.fn() } as unknown as FastifyBaseLogger;

describe("handleServiceError → Sentry", () => {
  beforeEach(() => {
    captureException.mockClear();
  });

  it("un error desconocido se reporta a Sentry con el contexto y responde 500 genérico", () => {
    const { reply, sent } = fakeReply();
    const err = new Error("Failed query: delete from `bookings` ...");

    handleServiceError(err, reply, log, "member reserve");

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(err, {
      tags: { context: "member reserve" },
    });
    expect(sent.code).toBe(500);
    expect(sent.body).toEqual(INTERNAL_ERROR_BODY);
  });

  it("un AppError NO se reporta (es una respuesta de negocio)", () => {
    const { reply, sent } = fakeReply();

    handleServiceError(
      new ConflictError("Ya tenes una reserva para este dia."),
      reply,
      log,
      "member reserve",
    );

    expect(captureException).not.toHaveBeenCalled();
    expect(sent.code).toBe(409);
  });

  it("las rutas de la TV responden 500 pero NO se reportan", () => {
    for (const context of ["tv control screen", "tvAvisos.getActiveForBranch"]) {
      const { reply, sent } = fakeReply();
      handleServiceError(new Error("ER_SERVER_SHUTDOWN"), reply, log, context);
      expect(sent.code).toBe(500);
    }
    expect(captureException).not.toHaveBeenCalled();
  });

  it("reportUnexpectedError (500 armados a mano) reporta salvo TV", () => {
    const err = new Error("x");
    reportUnexpectedError(err, "update member");
    reportUnexpectedError(err, "tv control context");
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(err, {
      tags: { context: "update member" },
    });
  });

  it("si la respuesta ya se envió, no reporta ni responde de nuevo", () => {
    const { reply, sent } = fakeReply();
    (reply as unknown as { sent: boolean }).sent = true;

    handleServiceError(new Error("x"), reply, log, "ctx");

    expect(captureException).not.toHaveBeenCalled();
    expect(sent.code).toBeNull();
  });
});
