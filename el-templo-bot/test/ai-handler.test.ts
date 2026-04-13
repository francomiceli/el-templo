/**
 * Unit tests for gap closure fixes:
 * 1. Human takeover guard suppresses extra message segments
 * 2. Anthropic mapMessages reconstructs tool_use blocks from ChatMessage.toolCalls
 * 3. Consecutive tool_result messages merged into single user message
 * 4. OpenAI provider unaffected by ChatMessage.toolCalls addition
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChatMessage } from "../src/ai/provider";

// ─── Test Group 2: Anthropic tool_use block reconstruction ──────────────────

describe("AnthropicProvider.mapMessages - tool_use reconstruction", () => {
  let capturedMessages: unknown;

  beforeEach(() => {
    capturedMessages = undefined;
    vi.resetModules();
  });

  /**
   * Helper: create a mocked AnthropicProvider that captures messages.create args.
   */
  async function createMockedProvider() {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "Response" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    vi.doMock("@anthropic-ai/sdk", () => {
      class MockAnthropic {
        messages = { create: mockCreate };
        static APIError = class extends Error {
          status: number;
          constructor(status: number, message: string) {
            super(message);
            this.status = status;
          }
        };
      }
      return { default: MockAnthropic };
    });

    const { AnthropicProvider } = await import("../src/ai/anthropic");
    const provider = new AnthropicProvider("test-model");

    return { provider, mockCreate };
  }

  it("reconstructs tool_use content blocks from ChatMessage.toolCalls", async () => {
    const { provider, mockCreate } = await createMockedProvider();

    const messages: ChatMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "What classes are available?" },
      {
        role: "assistant",
        content: "Let me check the schedule for you.",
        toolCalls: [
          {
            id: "toolu_01abc",
            name: "check_schedule",
            arguments: { dayOfWeek: 1 },
          },
        ],
      },
      {
        role: "tool",
        content: "CrossFit - Lunes 08:00-09:00",
        toolCallId: "toolu_01abc",
        name: "check_schedule",
      },
    ];

    await provider.chat(messages);

    const createArgs = mockCreate.mock.calls[0][0];
    capturedMessages = createArgs.messages;
    const mappedMessages = createArgs.messages as Record<string, unknown>[];

    // System message should be passed separately
    expect(createArgs.system).toBe("You are a helpful assistant.");

    // First message: user
    expect(mappedMessages[0]).toEqual({
      role: "user",
      content: "What classes are available?",
    });

    // Second message: assistant with tool_use content blocks
    const assistantMsg = mappedMessages[1] as {
      role: string;
      content: Array<Record<string, unknown>>;
    };
    expect(assistantMsg.role).toBe("assistant");
    expect(Array.isArray(assistantMsg.content)).toBe(true);

    // Should have text block + tool_use block
    expect(assistantMsg.content).toHaveLength(2);
    expect(assistantMsg.content[0]).toEqual({
      type: "text",
      text: "Let me check the schedule for you.",
    });
    expect(assistantMsg.content[1]).toEqual({
      type: "tool_use",
      id: "toolu_01abc",
      name: "check_schedule",
      input: { dayOfWeek: 1 },
    });

    // Third message: user with tool_result block
    const toolResultMsg = mappedMessages[2] as {
      role: string;
      content: Array<Record<string, unknown>>;
    };
    expect(toolResultMsg.role).toBe("user");
    expect(Array.isArray(toolResultMsg.content)).toBe(true);
    expect(toolResultMsg.content[0]).toEqual({
      type: "tool_result",
      tool_use_id: "toolu_01abc",
      content: "CrossFit - Lunes 08:00-09:00",
    });
  });

  it("omits text block when assistant content is empty/falsy", async () => {
    const { provider, mockCreate } = await createMockedProvider();

    const messages: ChatMessage[] = [
      { role: "user", content: "Check schedules" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "toolu_02def",
            name: "check_schedule",
            arguments: {},
          },
        ],
      },
      {
        role: "tool",
        content: "No classes found",
        toolCallId: "toolu_02def",
        name: "check_schedule",
      },
    ];

    await provider.chat(messages);

    const createArgs = mockCreate.mock.calls[0][0];
    const mappedMessages = createArgs.messages as Record<string, unknown>[];

    // Assistant message should only have tool_use block, no text block
    const assistantMsg = mappedMessages[1] as {
      role: string;
      content: Array<Record<string, unknown>>;
    };
    expect(assistantMsg.content).toHaveLength(1);
    expect(assistantMsg.content[0].type).toBe("tool_use");
  });

  it("merges consecutive tool_result user messages into single user message", async () => {
    const { provider, mockCreate } = await createMockedProvider();

    const messages: ChatMessage[] = [
      { role: "user", content: "Tell me about schedules and location" },
      {
        role: "assistant",
        content: "I'll check both for you.",
        toolCalls: [
          {
            id: "toolu_03aaa",
            name: "check_schedule",
            arguments: {},
          },
          {
            id: "toolu_03bbb",
            name: "get_location",
            arguments: {},
          },
        ],
      },
      {
        role: "tool",
        content: "CrossFit - Lunes 08:00",
        toolCallId: "toolu_03aaa",
        name: "check_schedule",
      },
      {
        role: "tool",
        content: "Alem - Av. Leandro N. Alem 896",
        toolCallId: "toolu_03bbb",
        name: "get_location",
      },
    ];

    await provider.chat(messages);

    const createArgs = mockCreate.mock.calls[0][0];
    const mappedMessages = createArgs.messages as Record<string, unknown>[];

    // Should be 3 messages total: user, assistant, user (merged tool results)
    expect(mappedMessages).toHaveLength(3);

    // The third message should be a single user message with 2 tool_result blocks
    const mergedToolResult = mappedMessages[2] as {
      role: string;
      content: Array<Record<string, unknown>>;
    };
    expect(mergedToolResult.role).toBe("user");
    expect(mergedToolResult.content).toHaveLength(2);
    expect(mergedToolResult.content[0]).toEqual({
      type: "tool_result",
      tool_use_id: "toolu_03aaa",
      content: "CrossFit - Lunes 08:00",
    });
    expect(mergedToolResult.content[1]).toEqual({
      type: "tool_result",
      tool_use_id: "toolu_03bbb",
      content: "Alem - Av. Leandro N. Alem 896",
    });
  });

  it("plain assistant messages without toolCalls are mapped as string content", async () => {
    const { provider, mockCreate } = await createMockedProvider();

    const messages: ChatMessage[] = [
      { role: "user", content: "Hola" },
      {
        role: "assistant",
        content: "Hola! Como puedo ayudarte?",
      },
      { role: "user", content: "Gracias" },
    ];

    await provider.chat(messages);

    const createArgs = mockCreate.mock.calls[0][0];
    const mappedMessages = createArgs.messages as Record<string, unknown>[];

    // Assistant message should be plain string content (not array)
    expect(mappedMessages[1]).toEqual({
      role: "assistant",
      content: "Hola! Como puedo ayudarte?",
    });
  });
});

// ─── Test Group 3: OpenAI provider unaffected by toolCalls ──────────────────

describe("OpenAiProvider - tool_calls mapping", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function createMockedOpenAiProvider() {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: "Response text",
            tool_calls: undefined,
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    vi.doMock("openai", () => {
      class MockOpenAI {
        chat = {
          completions: {
            create: mockCreate,
          },
        };
        static APIError = class extends Error {
          status: number;
          code: string | null;
          constructor(
            status: number,
            message: string,
            code: string | null = null,
          ) {
            super(message);
            this.status = status;
            this.code = code;
          }
        };
      }
      return { default: MockOpenAI };
    });

    const { OpenAiProvider } = await import("../src/ai/openai");
    const provider = new OpenAiProvider("test-model");

    return { provider, mockCreate };
  }

  it("includes tool_calls on assistant messages that have toolCalls", async () => {
    const { provider, mockCreate } = await createMockedOpenAiProvider();

    const messages: ChatMessage[] = [
      { role: "user", content: "What classes?" },
      {
        role: "assistant",
        content: "Checking schedule...",
        toolCalls: [
          {
            id: "call_123",
            name: "check_schedule",
            arguments: { branch: "palermo" },
          },
        ],
      },
      {
        role: "tool",
        content: "CrossFit - Mon 8am",
        toolCallId: "call_123",
        name: "check_schedule",
      },
    ];

    await provider.chat(messages);

    const capturedMessages = mockCreate.mock.calls[0][0].messages as Array<
      Record<string, unknown>
    >;

    // Assistant message should include tool_calls array
    expect(capturedMessages[1]).toEqual({
      role: "assistant",
      content: "Checking schedule...",
      tool_calls: [
        {
          id: "call_123",
          type: "function",
          function: {
            name: "check_schedule",
            arguments: '{"branch":"palermo"}',
          },
        },
      ],
    });

    // Tool message mapped correctly
    expect(capturedMessages[2]).toEqual({
      role: "tool",
      content: "CrossFit - Mon 8am",
      tool_call_id: "call_123",
    });
  });

  it("does not include tool_calls on plain assistant messages", async () => {
    const { provider, mockCreate } = await createMockedOpenAiProvider();

    const messages: ChatMessage[] = [
      { role: "user", content: "Hola" },
      {
        role: "assistant",
        content: "Hola! Como puedo ayudarte?",
      },
    ];

    await provider.chat(messages);

    const capturedMessages = mockCreate.mock.calls[0][0].messages as Array<
      Record<string, unknown>
    >;

    // Plain assistant message should NOT have tool_calls
    expect(capturedMessages[1]).toEqual({
      role: "assistant",
      content: "Hola! Como puedo ayudarte?",
    });
    expect(capturedMessages[1]).not.toHaveProperty("tool_calls");
  });
});

// ─── Test Group 1: Human takeover suppresses extra segments ─────────────────

describe("handleInboundMessage - human takeover segment suppression", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("sends only one segment when humanTakeoverTriggered is true", async () => {
    const sendCalls: string[] = [];

    // Build a long AI response that would normally split into 3+ segments (>800 chars)
    const longResponse =
      "Te conecto con alguien del equipo de El Templo para que te ayude " +
      "con tu consulta. Un representante se va a comunicar con vos lo antes posible.\n\n" +
      "Mientras tanto, te cuento que tenemos clases disponibles todos los dias " +
      "de la semana en nuestras dos sedes: Alem y Constitucion. Podes consultar " +
      "los horarios y disponibilidad en cualquier momento escribiendo aca. " +
      "Ofrecemos CrossFit, funcional, yoga, y muchas mas actividades para " +
      "todos los niveles, desde principiantes hasta avanzados.\n\n" +
      "Tambien ofrecemos diferentes planes de membresia que se adaptan a tus " +
      "necesidades y presupuesto. Desde planes foundation de 3 clases por " +
      "semana hasta planes performance ilimitados con acceso a todas las " +
      "sedes y horarios. Cada plan incluye seguimiento personalizado y " +
      "acceso a nuestra app para reservar tus clases.\n\n" +
      "Nuestro equipo se va a comunicar con vos a la brevedad para resolver " +
      "tu consulta de manera personalizada. Gracias por tu paciencia y " +
      "esperamos verte pronto entrenando en El Templo!";

    // Mock AI provider: first call returns tool call for request_human,
    // second call returns the long response text
    let chatCallCount = 0;

    vi.doMock("../src/ai/provider", () => ({
      createAiProvider: () => ({
        chat: async () => {
          chatCallCount++;
          if (chatCallCount === 1) {
            return {
              content: null,
              toolCalls: [
                {
                  id: "toolu_human",
                  name: "request_human",
                  arguments: { reason: "User wants to talk to a person" },
                },
              ],
            };
          }
          return {
            content: longResponse,
            toolCalls: [],
          };
        },
      }),
    }));

    vi.doMock("../src/ai/system-prompt", () => ({
      getSystemPrompt: () => "You are a helpful assistant.",
    }));

    vi.doMock("../src/ai/tools", () => ({
      BOT_TOOLS: [],
      executeTool: async () =>
        "Conversacion transferida a un agente humano. Razon: User wants to talk to a person",
    }));

    vi.doMock("../src/whatsapp/client", () => ({
      sendTextMessage: async (_phone: string, text: string) => {
        sendCalls.push(text);
        return `wamid_${sendCalls.length}`;
      },
    }));

    vi.doMock("../src/memory/session", () => ({
      getSession: async () => null,
      updateSession: async () => {},
      isDebounceActive: async () => false,
      setDebounce: async () => {},
      deleteDebounce: async () => {},
    }));

    vi.doMock("../src/memory/profile", () => ({
      getProfile: async () => null,
      updateProfile: async () => {},
      buildProfileContext: () => "",
    }));

    vi.doMock("../src/state/machine", () => ({
      determineClientState: async () => ({
        state: "lead",
        userId: null,
      }),
      updateConversationState: async () => {},
    }));

    const { handleInboundMessage } = await import("../src/webhook/handler");

    // Mock DB
    const dbExecuteResults: unknown[] = [
      [[{ id: 1, conversation_status: "active" }]], // SELECT conversation
      [{ affectedRows: 1 }], // UPDATE conversation
      [{ insertId: 100 }], // INSERT inbound message
      [
        [
          {
            content: "quiero hablar con alguien",
            message_direction: "inbound",
          },
        ],
      ], // SELECT history
      [{ insertId: 101 }], // INSERT outbound message (handoff)
    ];

    const mockDb = {
      execute: vi.fn().mockImplementation(() => {
        const result = dbExecuteResults.shift();
        return Promise.resolve(result);
      }),
    };

    const mockLog = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      fatal: vi.fn(),
      trace: vi.fn(),
      child: vi.fn(),
      level: "info",
      silent: vi.fn(),
    };

    await handleInboundMessage(
      mockDb as never,
      mockLog as never,
      {
        phone: "5491100000001",
        contactName: "Test User",
        text: "quiero hablar con alguien",
        messageType: "text",
        whatsappMessageId: "wamid_test_001",
        rawPayload: {},
      } as never,
    );

    // Only 1 segment should have been sent (the handoff message)
    expect(sendCalls).toHaveLength(1);

    // The sent message should be the first segment of the long response
    expect(sendCalls[0]).toContain("Te conecto con alguien");

    // The long response would normally split into 3+ segments at 800 chars
    expect(longResponse.length).toBeGreaterThan(800);
  });
});
