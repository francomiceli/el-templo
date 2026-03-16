/**
 * AI Provider Interface
 *
 * Model-agnostic interface for AI chat completions with tool/function calling.
 * Implementations: OpenAI (openai.ts) and Anthropic (anthropic.ts).
 *
 * Select provider via AI_PROVIDER env var ('openai' | 'anthropic').
 */

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

/**
 * Factory function — create the right provider based on env config.
 *
 * TODO: Implement. Read AI_PROVIDER env, instantiate OpenAiProvider or AnthropicProvider.
 */
export function createAiProvider(): AiProvider {
  const provider = process.env.AI_PROVIDER || "openai";

  switch (provider) {
    case "openai":
      // TODO: return new OpenAiProvider(process.env.AI_MODEL || "gpt-4o-mini");
      throw new Error("OpenAI provider not yet implemented");
    case "anthropic":
      // TODO: return new AnthropicProvider(process.env.AI_MODEL || "claude-haiku-4-5-20251001");
      throw new Error("Anthropic provider not yet implemented");
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}
