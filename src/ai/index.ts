import "server-only";

import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";

/** The server-side Groq model used by the first Closer chat endpoint. */
export const GROQ_CHAT_MODEL = "llama-3.3-70b-versatile" as const;

export function getGroqChatModel(): LanguageModel {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  return createGroq({ apiKey })(GROQ_CHAT_MODEL);
}

/**
 * AI Provider abstraction for Closer.
 *
 * This module establishes the boundary between application logic
 * and the AI provider (Groq). All AI interactions should go
 * through this layer so that provider-specific code is isolated.
 *
 * Architecture:
 *   UI → Application Services → AI Provider → Database / RAG
 *
 * The first Groq model factory is implemented above. Future providers should
 * remain behind this module instead of being imported by route handlers.
 */

/**
 * Configuration for an AI provider.
 */
export interface AIProviderConfig {
  /** The model identifier (e.g., "llama-3.3-70b-versatile") */
  model: string;
  /** Maximum tokens for completion */
  maxTokens?: number;
  /** Temperature for response generation (0-1) */
  temperature?: number;
}

/**
 * A message in a conversation.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * The response from an AI provider.
 */
export interface AIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Abstract AI provider interface.
 *
 * Implementations (e.g., GroqProvider) will fulfill this contract,
 * keeping provider-specific code out of the application layer.
 */
export interface AIProvider {
  /**
   * Generate a chat completion.
   */
  chat(messages: ChatMessage[], config?: Partial<AIProviderConfig>): Promise<AIResponse>;
}
