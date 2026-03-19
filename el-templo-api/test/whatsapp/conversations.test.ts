/**
 * Integration tests for WhatsApp admin conversation endpoints.
 *
 * Tests GET /api/admin/whatsapp/conversations (list) and
 * GET /api/admin/whatsapp/conversations/:id (detail) against
 * a real MySQL test database.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createTestApp, getAuthToken } from "../helpers";
import { eq } from "drizzle-orm";
import * as schema from "../../src/db/schema";

const TEST_PHONES = ["+5491199990001", "+5491199990002", "+5491199990003"];

describe("WhatsApp Admin Conversations", () => {
  let app: FastifyInstance;
  let adminToken: string;
  let conversationIds: number[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    adminToken = await getAuthToken(app, "admin@test.com", "adminpass123");

    // Insert test conversations
    for (let i = 0; i < TEST_PHONES.length; i++) {
      const phone = TEST_PHONES[i];
      const status = i === 2 ? "closed" : "active";
      const clientState = i === 0 ? "lead" : "active_member";

      const result = await app.db.insert(schema.whatsappConversations).values({
        phone,
        contactName: `Test Contact ${i + 1}`,
        status,
        clientState,
        lastMessageAt: new Date(Date.now() - i * 60000),
      });

      conversationIds.push(Number(result[0].insertId));
    }

    // Insert messages for the first conversation
    const msgValues = [];
    for (let j = 0; j < 7; j++) {
      msgValues.push({
        conversationId: conversationIds[0],
        direction:
          j % 2 === 0 ? ("inbound" as const) : ("outbound_bot" as const),
        content: `Test message ${j + 1}`,
        messageType: "text" as const,
        createdAt: new Date(Date.now() - (7 - j) * 60000),
      });
    }

    await app.db.insert(schema.whatsappMessages).values(msgValues);
  });

  afterAll(async () => {
    // Clean up: delete messages then conversations
    for (const convId of conversationIds) {
      await app.db
        .delete(schema.whatsappMessages)
        .where(eq(schema.whatsappMessages.conversationId, convId));
    }

    for (const phone of TEST_PHONES) {
      await app.db
        .delete(schema.whatsappConversations)
        .where(eq(schema.whatsappConversations.phone, phone));
    }

    await app.close();
  });

  // ─── List Conversations ─────────────────────────────────────────────────

  it("GET /conversations returns 200 with conversations array and total", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/whatsapp/conversations",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("conversations");
    expect(body).toHaveProperty("total");
    expect(body).toHaveProperty("page");
    expect(body).toHaveProperty("limit");
    expect(Array.isArray(body.conversations)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(3);

    // Verify conversation structure
    const conv = body.conversations[0];
    expect(conv).toHaveProperty("id");
    expect(conv).toHaveProperty("phone");
    expect(conv).toHaveProperty("status");
    expect(conv).toHaveProperty("clientState");
    expect(conv).toHaveProperty("messageCount");
    expect(conv).toHaveProperty("createdAt");
  });

  it("GET /conversations?status=active filters by status", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/whatsapp/conversations?status=active",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    for (const conv of body.conversations) {
      expect(conv.status).toBe("active");
    }
  });

  it("GET /conversations?clientState=lead filters by clientState", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/whatsapp/conversations?clientState=lead",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.conversations.length).toBeGreaterThanOrEqual(1);
    for (const conv of body.conversations) {
      expect(conv.clientState).toBe("lead");
    }
  });

  it("GET /conversations?search=9999 filters by phone substring", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/whatsapp/conversations?search=9999",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.conversations.length).toBeGreaterThanOrEqual(1);
    for (const conv of body.conversations) {
      expect(conv.phone).toContain("9999");
    }
  });

  it("GET /conversations?page=1&limit=1 returns correct pagination", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/whatsapp/conversations?page=1&limit=1",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.conversations.length).toBe(1);
    expect(body.total).toBeGreaterThan(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(1);
  });

  it("GET /conversations without auth returns 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/whatsapp/conversations",
    });

    expect(res.statusCode).toBe(401);
  });

  // ─── Conversation Detail ────────────────────────────────────────────────

  it("GET /conversations/:id returns conversation with messages", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/whatsapp/conversations/${conversationIds[0]}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("conversation");
    expect(body).toHaveProperty("messages");
    expect(body).toHaveProperty("totalMessages");
    expect(body.conversation.id).toBe(conversationIds[0]);
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.totalMessages).toBe(7);
    expect(body.messages.length).toBe(7);

    // Verify message structure
    const msg = body.messages[0];
    expect(msg).toHaveProperty("id");
    expect(msg).toHaveProperty("direction");
    expect(msg).toHaveProperty("content");
    expect(msg).toHaveProperty("createdAt");
  });

  it("GET /conversations/:id with non-existent id returns 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/whatsapp/conversations/999999",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it("GET /conversations/:id messages are ordered by createdAt ASC", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/whatsapp/conversations/${conversationIds[0]}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const messages = body.messages;
    expect(messages.length).toBeGreaterThan(1);

    for (let i = 1; i < messages.length; i++) {
      const prev = new Date(messages[i - 1].createdAt).getTime();
      const curr = new Date(messages[i].createdAt).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });
});
