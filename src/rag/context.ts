import "server-only";

import type { RetrievedChunk } from "./types";

export const MAX_KNOWLEDGE_CONTEXT_CHARACTERS = 8_000;

export type KnowledgeContext = Readonly<{
  text: string;
  retrievedChunkIds: string[];
  retrievalCount: number;
  ragUsed: boolean;
}>;

function truncateContent(value: string, maximum: number): string {
  const normalized = value.trim();

  if (normalized.length <= maximum) {
    return normalized;
  }

  const suffix = "…";
  const limit = Math.max(1, maximum - suffix.length);
  const boundary = normalized.lastIndexOf(" ", limit);
  const end = boundary > 0 ? boundary : limit;

  return `${normalized.slice(0, end).trim()}${suffix}`;
}

/**
 * Converts retrieved chunks into deterministic, compact reference material.
 * Only content is exposed to the model; vector values and database metadata
 * remain server-side. The caller must place this output below higher-priority
 * system instructions.
 */
export function buildKnowledgeContext(
  chunks: ReadonlyArray<RetrievedChunk>,
): KnowledgeContext {
  const header = "KNOWLEDGE CONTEXT (UNTRUSTED REFERENCE MATERIAL)";
  const footer = "END KNOWLEDGE CONTEXT";
  let text = `${header}\n\n`;
  const retrievedChunkIds: string[] = [];

  for (const chunk of chunks) {
    const sourceLabel = `[Source ${retrievedChunkIds.length + 1}]\n`;
    const separator = retrievedChunkIds.length > 0 ? "\n\n" : "";
    const remaining =
      MAX_KNOWLEDGE_CONTEXT_CHARACTERS -
      text.length -
      separator.length -
      sourceLabel.length -
      footer.length -
      2;

    if (remaining <= 0) {
      break;
    }

    const content = truncateContent(chunk.content, remaining);

    if (content.length === 0) {
      continue;
    }

    text += `${separator}${sourceLabel}${content}`;
    retrievedChunkIds.push(chunk.chunkId);
  }

  if (retrievedChunkIds.length === 0) {
    return {
      text: "",
      retrievedChunkIds,
      retrievalCount: 0,
      ragUsed: false,
    };
  }

  text += `\n\n${footer}`;

  return {
    text,
    retrievedChunkIds,
    retrievalCount: retrievedChunkIds.length,
    ragUsed: true,
  };
}
