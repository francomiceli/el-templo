/**
 * Integration tests for WhatsApp webhook endpoints.
 *
 * Tests the bot's webhook routes (GET /webhook verification + POST /webhook
 * message handling) against a real MySQL test database.
 *
 * sendTextMessage is mocked to avoid real WhatsApp API calls.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../../src/db/schema/index";
import type { MetaWebhookPayload } from "../../../el-templo-bot/src/whatsapp/types";

// Mock sendTextMessage before importing routes
vi.mock(
  "../../../el-templo-bot/src/whatsapp/client",
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import("../../../el-templo-bot/src/whatsapp/client")
      >();
    return {
      ...original,
      sendTextMessage: vi.fn().mockResolvedValue("wamid.sent.mock123"),
    };
  },
);

// Import after mock setup
import { webhookRoutes } from "../../../el-templo-bot/src/webhook/routes";
import { sendTextMessage } from "../../../el-templo-bot/src/whatsapp/client";

const VERIFY_TOKEN = "test-verify-token-12345";

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeTextPayload(
  phone: string,
  text: string,
  wamid: string,
  contactName = "Test User",
): MetaWebhookPayload {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "BUSINESS_ACCOUNT_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: "PHONE_ID",
              },
              contacts: [{ profile: { name: contactName }, wa_id: phone }],
              messages: [
                {
                  id: wamid,
                  from: phone,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: text },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

function makeImagePayload(phone: string, wamid: string): MetaWebhookPayload {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "BUSINESS_ACCOUNT_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: "PHONE_ID",
              },
              contacts: [{ profile: { name: "Image Sender" }, wa_id: phone }],
              messages: [
                {
                  id: wamid,
                  from: phone,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "image",
                  image: { id: "IMG_ID", mime_type: "image/jpeg" },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

function makeStatusPayload(): MetaWebhookPayload {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "BUSINESS_ACCOUNT_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: "PHONE_ID",
              },
              statuses: [
                {
                  id: "wamid.status123",
                  status: "delivered",
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  recipient_id: "5491100000001",
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe("WhatsApp Webhook", () => {
  let app: FastifyInstance;
  let pool: mysql.Pool;

  /**
   * Wait for async handler to complete.
   * Uses the onMessageHandled callback from webhook routes.
   */
  function waitForHandler(): Promise<void> {
    return handlerPromise;
  }

  let handlerResolve: () => void;
  let handlerPromise: Promise<void>;

  function resetHandlerPromise(): void {
    handlerPromise = new Promise<void>((resolve) => {
      handlerResolve = resolve;
    });
  }

  beforeAll(async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;
    process.env.WHATSAPP_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_ID = "test-phone-id";

    pool = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: "eltemplo_test",
    });

    const db = drizzle(pool, { schema, mode: "default" });

    app = Fastify({ logger: false });

    // Decorate with db so webhookRoutes can access fastify.db
    app.decorate("db", db);

    resetHandlerPromise();

    await app.register(webhookRoutes, {
      onMessageHandled: () => handlerResolve(),
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up test data
    await pool.execute("DELETE FROM whatsapp_messages");
    await pool.execute("DELETE FROM whatsapp_conversations");

    // Reset mocks
    vi.mocked(sendTextMessage).mockReset();
    vi.mocked(sendTextMessage).mockResolvedValue("wamid.sent.mock123");

    resetHandlerPromise();
  });

  // ─── GET /webhook ──────────────────────────────────────────────────────────

  describe("GET /webhook — verification", () => {
    it("returns challenge on valid verification request", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=test_challenge_123`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toBe("test_challenge_123");
    });

    it("returns 403 on invalid verify token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=test123",
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("Forbidden");
    });
  });

  // ─── POST /webhook ─────────────────────────────────────────────────────────

  describe("POST /webhook — text message from new sender", () => {
    it("creates conversation, saves messages, and sends echo", async () => {
      const payload = makeTextPayload(
        "5491100000001",
        "Hello from WhatsApp!",
        "wamid.inbound001",
      );

      const res = await app.inject({
        method: "POST",
        url: "/webhook",
        payload,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toBe("EVENT_RECEIVED");

      // Wait for async handler
      await waitForHandler();

      // Verify conversation created
      const [convRows] = await pool.execute(
        "SELECT * FROM whatsapp_conversations WHERE phone = '5491100000001'",
      );
      const conversations = convRows as Record<string, unknown>[];
      expect(conversations).toHaveLength(1);
      expect(conversations[0].conversation_status).toBe("active");
      expect(conversations[0].client_state).toBe("lead");
      expect(conversations[0].contact_name).toBe("Test User");

      // Verify inbound message saved
      const [msgRows] = await pool.execute(
        "SELECT * FROM whatsapp_messages WHERE whatsapp_message_id = 'wamid.inbound001'",
      );
      const messages = msgRows as Record<string, unknown>[];
      expect(messages).toHaveLength(1);
      expect(messages[0].message_direction).toBe("inbound");
      expect(messages[0].content).toBe("Hello from WhatsApp!");

      // Verify outbound echo message saved
      const [echoRows] = await pool.execute(
        "SELECT * FROM whatsapp_messages WHERE message_direction = 'outbound_bot'",
      );
      const echoMessages = echoRows as Record<string, unknown>[];
      expect(echoMessages).toHaveLength(1);
      expect(echoMessages[0].content).toBe("Echo: Hello from WhatsApp!");
      expect(echoMessages[0].whatsapp_message_id).toBe("wamid.sent.mock123");

      // Verify sendTextMessage was called correctly
      expect(sendTextMessage).toHaveBeenCalledWith(
        "5491100000001",
        "Echo: Hello from WhatsApp!",
      );
    });
  });

  describe("POST /webhook — text message from existing sender", () => {
    it("reuses existing conversation", async () => {
      // Pre-insert a conversation
      await pool.execute(
        `INSERT INTO whatsapp_conversations (phone, contact_name, conversation_status, client_state, last_message_at, created_at, updated_at)
         VALUES ('5491100000002', 'Existing User', 'active', 'lead', NOW(), NOW(), NOW())`,
      );

      const payload = makeTextPayload(
        "5491100000002",
        "Follow-up message",
        "wamid.inbound002",
        "Existing User",
      );

      const res = await app.inject({
        method: "POST",
        url: "/webhook",
        payload,
      });

      expect(res.statusCode).toBe(200);
      await waitForHandler();

      // Still only 1 conversation
      const [convRows] = await pool.execute(
        "SELECT * FROM whatsapp_conversations WHERE phone = '5491100000002'",
      );
      const conversations = convRows as Record<string, unknown>[];
      expect(conversations).toHaveLength(1);

      // Message saved and echo sent
      const [msgRows] = await pool.execute(
        "SELECT * FROM whatsapp_messages ORDER BY id",
      );
      const messages = msgRows as Record<string, unknown>[];
      expect(messages).toHaveLength(2); // inbound + outbound
      expect(sendTextMessage).toHaveBeenCalledOnce();
    });
  });

  describe("POST /webhook — duplicate wamid (dedup)", () => {
    it("skips processing for duplicate message ID", async () => {
      // Pre-insert conversation and message
      const [convResult] = await pool.execute(
        `INSERT INTO whatsapp_conversations (phone, contact_name, conversation_status, client_state, last_message_at, created_at, updated_at)
         VALUES ('5491100000003', 'Dedup User', 'active', 'lead', NOW(), NOW(), NOW())`,
      );
      const conversationId = (convResult as { insertId: number }).insertId;

      await pool.execute(
        `INSERT INTO whatsapp_messages (conversation_id, message_direction, content, wa_message_type, whatsapp_message_id, created_at)
         VALUES (?, 'inbound', 'Original message', 'text', 'wamid.dedup001', NOW())`,
        [conversationId],
      );

      const payload = makeTextPayload(
        "5491100000003",
        "Duplicate attempt",
        "wamid.dedup001",
        "Dedup User",
      );

      const res = await app.inject({
        method: "POST",
        url: "/webhook",
        payload,
      });

      expect(res.statusCode).toBe(200);
      await waitForHandler();

      // Only 1 message with that wamid (no duplicate)
      const [msgRows] = await pool.execute(
        "SELECT * FROM whatsapp_messages WHERE whatsapp_message_id = 'wamid.dedup001'",
      );
      const messages = msgRows as Record<string, unknown>[];
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("Original message");

      // sendTextMessage should NOT have been called
      expect(sendTextMessage).not.toHaveBeenCalled();
    });
  });

  describe("POST /webhook — non-text message (image)", () => {
    it("returns 200 but does not store or reply", async () => {
      const payload = makeImagePayload("5491100000004", "wamid.image001");

      const res = await app.inject({
        method: "POST",
        url: "/webhook",
        payload,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toBe("EVENT_RECEIVED");

      // Small delay to ensure no async processing occurred
      await new Promise((r) => setTimeout(r, 100));

      // No messages created
      const [msgRows] = await pool.execute("SELECT * FROM whatsapp_messages");
      const messages = msgRows as Record<string, unknown>[];
      expect(messages).toHaveLength(0);

      // No conversations created
      const [convRows] = await pool.execute(
        "SELECT * FROM whatsapp_conversations WHERE phone = '5491100000004'",
      );
      const conversations = convRows as Record<string, unknown>[];
      expect(conversations).toHaveLength(0);

      expect(sendTextMessage).not.toHaveBeenCalled();
    });
  });

  describe("POST /webhook — delivery status update", () => {
    it("returns 200 without processing", async () => {
      const payload = makeStatusPayload();

      const res = await app.inject({
        method: "POST",
        url: "/webhook",
        payload,
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toBe("EVENT_RECEIVED");

      // Small delay to ensure no async processing occurred
      await new Promise((r) => setTimeout(r, 100));

      // No DB writes
      const [msgRows] = await pool.execute(
        "SELECT COUNT(*) as count FROM whatsapp_messages",
      );
      const counts = msgRows as Record<string, unknown>[];
      expect(counts[0].count).toBe(0);

      expect(sendTextMessage).not.toHaveBeenCalled();
    });
  });
});
