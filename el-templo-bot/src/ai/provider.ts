/**
 * AI Provider Interface
 *
 * Model-agnostic interface for AI chat completions with tool/function calling.
 * Implementations: OpenAI (openai.ts) and Anthropic (anthropic.ts).
 *
 * Select provider via AI_PROVIDER env var ('openai' | 'anthropic').
 */

import { AnthropicProvider } from "./anthropic";
import { OpenAiProvider } from "./openai";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  name?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiResponse {
  content: string | null;
  toolCalls: ToolCall[];
}

export interface AiProvider {
  /**
   * Send a chat completion request with optional tools.
   * If the model wants to call a tool, toolCalls will be populated.
   * If the model wants to respond with text, content will be populated.
   */
  chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<AiResponse>;
}

const DEFAULTS: Record<string, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
};

/**
 * Factory function -- create the right provider based on env config.
 *
 * Uses AI_PROVIDER env var to select implementation, AI_MODEL for model override.
 */
export function createAiProvider(): AiProvider {
  const provider = process.env.AI_PROVIDER || "openai";
  const model = process.env.AI_MODEL || DEFAULTS[provider];

  switch (provider) {
    case "openai":
      return new OpenAiProvider(model);
    case "anthropic":
      return new AnthropicProvider(model);
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}
