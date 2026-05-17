/**
 * OpenAI Provider Implementation
 *
 * Implements AiProvider interface using the openai npm package.
 * Supports function calling via tools parameter.
 */

import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import pino from "pino";
import type {
  AiProvider,
  AiResponse,
  ChatMessage,
  ToolCall,
  ToolDefinition,
} from "./provider";

const logger = pino({ name: "openai-provider" });

/**
 * Resolve the OpenAI SDK request-timeout (milliseconds).
 *
 * Phase 94 LAT-01: bounds the upstream call so a hung OpenAI request
 * surfaces as `APIConnectionTimeoutError` within a known window
 * instead of stalling for the SDK's 600s default.
 *
 * Env-overridable via `OPENAI_TIMEOUT_MS`; default 45_000 ms is locked
 * by the Phase 93 ↔ 94 ↔ 97 Cross-Phase Invariant (see
 * `el-templo-bot/.env.example` for the formula). Non-numeric or
 * non-positive values fall back to the default — the operator gets
 * predictable behavior even with a misconfigured env.
 */
function resolveOpenAiTimeoutMs(): number {
  const raw = process.env.OPENAI_TIMEOUT_MS;
  if (raw === undefined || raw === "") return 45_000;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 45_000;
}

export class OpenAiProvider implements AiProvider {
  private client: OpenAI;
  private model: string;

  constructor(model = "gpt-4o-mini") {
    const timeout = resolveOpenAiTimeoutMs();
    this.client = new OpenAI({ timeout: timeout });
    this.model = model;
    logger.info({ model, timeout }, "OpenAI provider initialized");
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): Promise<AiResponse> {
    const openaiMessages = messages.map(
      (msg): ChatCompletionMessageParam => this.mapMessage(msg),
    );

    const openaiTools =
      tools && tools.length > 0 ? tools.map((t) => this.mapTool(t)) : undefined;

    logger.debug(
      {
        model: this.model,
        messageCount: messages.length,
        toolCount: tools?.length ?? 0,
      },
      "Sending chat completion request",
    );

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: openaiMessages,
        ...(openaiTools ? { tools: openaiTools } : {}),
      });

      const choice = response.choices[0];
      if (!choice) {
        throw new Error("OpenAI returned no choices");
      }

      const content = choice.message.content ?? null;
      const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map(
        (tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments) as Record<
            string,
            unknown
          >,
        }),
      );

      logger.debug(
        {
          hasContent: content !== null,
          toolCallCount: toolCalls.length,
          usage: response.usage,
        },
        "Chat completion response received",
      );

      return { content, toolCalls };
    } catch (err: unknown) {
      if (err instanceof OpenAI.APIError) {
        logger.error(
          { status: err.status, message: err.message, code: err.code },
          "OpenAI API error",
        );
        // Phase 94 LAT-02: re-throw the raw OpenAI.APIError so the
        // handler's `err instanceof OpenAI.APIError` discriminator can
        // distinguish upstream errors (interim "Dame un segundo" path)
        // from local exceptions. The previous `new Error(...)` wrap
        // erased `status`/`code` and forced brittle message-text
        // matching at the call site.
        throw err;
      }
      throw err;
    }
  }

  private mapMessage(msg: ChatMessage): ChatCompletionMessageParam {
    switch (msg.role) {
      case "system":
        return { role: "system", content: msg.content };
      case "user":
        return { role: "user", content: msg.content };
      case "assistant": {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          return {
            role: "assistant" as const,
            content: msg.content,
            tool_calls: msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            })),
          };
        }
        return { role: "assistant", content: msg.content };
      }
      case "tool":
        return {
          role: "tool",
          content: msg.content,
          tool_call_id: msg.toolCallId ?? "",
        };
    }
  }

  private mapTool(tool: ToolDefinition): ChatCompletionTool {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  }
}
