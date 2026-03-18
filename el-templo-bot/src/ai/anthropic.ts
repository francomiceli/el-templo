/**
 * Anthropic Provider Implementation
 *
 * Implements AiProvider interface using @anthropic-ai/sdk.
 * Supports function calling via tool_use content blocks.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Tool,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages";
import pino from "pino";
import type {
  AiProvider,
  AiResponse,
  ChatMessage,
  ToolCall,
  ToolDefinition,
} from "./provider";

const logger = pino({ name: "anthropic-provider" });

export class AnthropicProvider implements AiProvider {
  private client: Anthropic;
  private model: string;

  constructor(model = "claude-haiku-4-5-20251001") {
    this.client = new Anthropic();
    this.model = model;
    logger.info({ model }, "Anthropic provider initialized");
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): Promise<AiResponse> {
    // Extract system message (Anthropic takes it as a separate param)
    const systemMessage = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    const anthropicMessages = this.mapMessages(nonSystemMessages);
    const anthropicTools =
      tools && tools.length > 0 ? tools.map((t) => this.mapTool(t)) : undefined;

    logger.debug(
      {
        model: this.model,
        messageCount: nonSystemMessages.length,
        toolCount: tools?.length ?? 0,
        hasSystem: systemMessage !== undefined,
      },
      "Sending messages.create request",
    );

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        ...(systemMessage ? { system: systemMessage.content } : {}),
        messages: anthropicMessages,
        ...(anthropicTools ? { tools: anthropicTools } : {}),
      });

      // Extract text from text blocks
      const textBlocks = response.content.filter(
        (block): block is Anthropic.TextBlock => block.type === "text",
      );
      const content =
        textBlocks.length > 0 ? textBlocks.map((b) => b.text).join("\n") : null;

      // Extract tool use blocks
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );
      const toolCalls: ToolCall[] = toolUseBlocks.map((block) => ({
        id: block.id,
        name: block.name,
        arguments: block.input as Record<string, unknown>,
      }));

      logger.debug(
        {
          hasContent: content !== null,
          toolCallCount: toolCalls.length,
          stopReason: response.stop_reason,
          usage: response.usage,
        },
        "Messages response received",
      );

      return { content, toolCalls };
    } catch (err: unknown) {
      if (err instanceof Anthropic.APIError) {
        logger.error(
          { status: err.status, message: err.message },
          "Anthropic API error",
        );
        throw new Error(`Anthropic API error (${err.status}): ${err.message}`);
      }
      throw err;
    }
  }

  /**
   * Map ChatMessage[] to Anthropic's MessageParam[].
   *
   * Anthropic requires alternating user/assistant turns. Tool results must be
   * sent as user messages with tool_result content blocks.
   */
  private mapMessages(messages: ChatMessage[]): MessageParam[] {
    const result: MessageParam[] = [];

    for (const msg of messages) {
      switch (msg.role) {
        case "user":
          result.push({ role: "user", content: msg.content });
          break;

        case "assistant": {
          // If the assistant message has associated tool calls, those would have
          // been tracked via the ToolCall[] in AiResponse. For conversation replay,
          // we reconstruct assistant messages with tool_use blocks when toolCallId
          // context is available in subsequent tool result messages.
          // For plain text assistant messages, map directly.
          result.push({ role: "assistant", content: msg.content });
          break;
        }

        case "tool": {
          // Tool results in Anthropic must be sent as user messages with
          // tool_result content blocks
          const toolResultBlock: ToolResultBlockParam = {
            type: "tool_result",
            tool_use_id: msg.toolCallId ?? "",
            content: msg.content,
          };
          result.push({
            role: "user",
            content: [toolResultBlock],
          });
          break;
        }
      }
    }

    return result;
  }

  private mapTool(tool: ToolDefinition): Tool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters as Tool.InputSchema,
    };
  }
}
