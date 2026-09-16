/**
 * Remitentes de email (src/modules/email/sender.ts) + manejo del `{ error }`
 * de Resend en EmailService.
 *
 * Contexto: incidente NODE-5K (2026-09-16). La key de prod está scopeada a
 * un subdominio y el remitente transaccional estaba hardcodeado en el dominio
 * raíz → Resend 403 en /forgot-password. Estos tests fijan:
 *   - EMAIL_FROM y CAMPAIGN_EMAIL_FROM se leen del entorno, con fallbacks.
 *   - Cada método usa el remitente que le corresponde.
 *   - El `{ error }` de Resend no se traga: best-effort loguea, crítico lanza.
 *
 * Unit test puro: `resend` está mockeado, no toca la DB ni la red.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyBaseLogger } from "fastify";

const sendMock = vi.fn();
const batchSendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
    batch = { send: batchSendMock };
  },
}));

const ENV_KEYS = [
  "EMAIL_FROM",
  "CAMPAIGN_EMAIL_FROM",
  "RESEND_API_KEY",
] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

function makeLog() {
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  return log as unknown as FastifyBaseLogger & typeof log;
}

async function loadFresh() {
  vi.resetModules();
  const sender = await import("../../src/modules/email/sender");
  const { EmailService } = await import("../../src/modules/email/service");
  return { ...sender, EmailService };
}

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  sendMock.mockReset();
  batchSendMock.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("sender.ts — resolución de remitentes", () => {
  it("sin env vars cae al remitente histórico para ambos", async () => {
    const { TRANSACTIONAL_EMAIL_FROM, CAMPAIGN_EMAIL_FROM } = await loadFresh();
    expect(TRANSACTIONAL_EMAIL_FROM).toBe("El Templo <noreply@eltemplo.org>");
    expect(CAMPAIGN_EMAIL_FROM).toBe("El Templo <noreply@eltemplo.org>");
  });

  it("solo CAMPAIGN_EMAIL_FROM seteada → el transaccional cae al de campañas (estado prod 2026-09)", async () => {
    process.env.CAMPAIGN_EMAIL_FROM = "El Templo <comunidad@send.eltemplo.org>";
    const { TRANSACTIONAL_EMAIL_FROM, CAMPAIGN_EMAIL_FROM } = await loadFresh();
    expect(CAMPAIGN_EMAIL_FROM).toBe("El Templo <comunidad@send.eltemplo.org>");
    expect(TRANSACTIONAL_EMAIL_FROM).toBe(
      "El Templo <comunidad@send.eltemplo.org>",
    );
  });

  it("solo EMAIL_FROM seteada → transaccional la usa, campañas NO la heredan", async () => {
    process.env.EMAIL_FROM = "El Templo <noreply@mail.eltemplo.org>";
    const { TRANSACTIONAL_EMAIL_FROM, CAMPAIGN_EMAIL_FROM } = await loadFresh();
    expect(TRANSACTIONAL_EMAIL_FROM).toBe(
      "El Templo <noreply@mail.eltemplo.org>",
    );
    expect(CAMPAIGN_EMAIL_FROM).toBe("El Templo <noreply@eltemplo.org>");
  });

  it("con las dos seteadas, cada una es independiente (subdominios distintos)", async () => {
    process.env.EMAIL_FROM = "El Templo <noreply@mail.eltemplo.org>";
    process.env.CAMPAIGN_EMAIL_FROM = "El Templo <comunidad@send.eltemplo.org>";
    const { TRANSACTIONAL_EMAIL_FROM, CAMPAIGN_EMAIL_FROM } = await loadFresh();
    expect(TRANSACTIONAL_EMAIL_FROM).toBe(
      "El Templo <noreply@mail.eltemplo.org>",
    );
    expect(CAMPAIGN_EMAIL_FROM).toBe("El Templo <comunidad@send.eltemplo.org>");
  });

  it("una env var vacía cuenta como no seteada (el workflow siempre escribe la línea)", async () => {
    process.env.EMAIL_FROM = "";
    process.env.CAMPAIGN_EMAIL_FROM = "";
    const { TRANSACTIONAL_EMAIL_FROM, CAMPAIGN_EMAIL_FROM } = await loadFresh();
    expect(TRANSACTIONAL_EMAIL_FROM).toBe("El Templo <noreply@eltemplo.org>");
    expect(CAMPAIGN_EMAIL_FROM).toBe("El Templo <noreply@eltemplo.org>");
  });
});

describe("EmailService — remitente por método y `{ error }` de Resend", () => {
  const TX = "El Templo <noreply@mail.eltemplo.org>";
  const CAMP = "El Templo <comunidad@send.eltemplo.org>";

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = TX;
    process.env.CAMPAIGN_EMAIL_FROM = CAMP;
  });

  it("los transaccionales salen de EMAIL_FROM, las campañas de CAMPAIGN_EMAIL_FROM", async () => {
    sendMock.mockResolvedValue({ data: { id: "x" }, error: null });
    batchSendMock.mockResolvedValue({ data: { data: [] }, error: null });
    const { EmailService } = await loadFresh();
    const svc = new EmailService(makeLog());

    await svc.sendPasswordSetEmail("a@b.c", "Ana", "tmp");
    await svc.sendPasswordResetEmail("a@b.c", "Ana", "123456", 15);
    await svc.sendTrialReminderEmail("a@b.c", "Recordatorio", "cuerpo");
    await svc.sendCampaignTest({
      to: "a@b.c",
      subject: "Asunto",
      html: "<p>hola</p>",
    });

    const froms = sendMock.mock.calls.map((c) => c[0].from);
    expect(froms).toEqual([TX, TX, TX, CAMP]);
    expect(svc.campaignSender()).toBe(CAMP);
  });

  it("sendPasswordSetEmail: rechazo de Resend → loguea error, NO lanza (alta best-effort)", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: {
        name: "validation_error",
        message: "not authorized to send emails from eltemplo.org",
      },
    });
    const { EmailService } = await loadFresh();
    const log = makeLog();
    const svc = new EmailService(log);

    await expect(
      svc.sendPasswordSetEmail("a@b.c", "Ana", "tmp"),
    ).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls[0][0]).toMatchObject({
      to: "a@b.c",
      resendError: expect.stringContaining("not authorized"),
    });
    expect(log.info).not.toHaveBeenCalledWith(
      { to: "a@b.c" },
      "Password-set email sent",
    );
  });

  it("sendPasswordResetEmail y sendTrialReminderEmail: rechazo de Resend → lanzan con el mensaje", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: {
        name: "validation_error",
        message: "not authorized to send emails from eltemplo.org",
      },
    });
    const { EmailService } = await loadFresh();
    const svc = new EmailService(makeLog());

    await expect(
      svc.sendPasswordResetEmail("a@b.c", "Ana", "123456", 15),
    ).rejects.toThrow(/not authorized/);
    await expect(
      svc.sendTrialReminderEmail("a@b.c", "Recordatorio", "cuerpo"),
    ).rejects.toThrow(/not authorized/);
  });

  it("sin RESEND_API_KEY: password-set y trial reminder degradan en silencio, reset lanza", async () => {
    delete process.env.RESEND_API_KEY;
    const { EmailService } = await loadFresh();
    const svc = new EmailService(makeLog());

    await svc.sendPasswordSetEmail("a@b.c", "Ana", "tmp");
    await svc.sendTrialReminderEmail("a@b.c", "R", "b");
    await expect(
      svc.sendPasswordResetEmail("a@b.c", "Ana", "123456", 15),
    ).rejects.toThrow();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
