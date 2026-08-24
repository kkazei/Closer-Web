export const TARGET_CHUNK_CHARACTERS = 1_200;
export const MAX_CHUNK_CHARACTERS = 1_600;
export const CHUNK_OVERLAP_CHARACTERS = 180;
export const MAX_DOCUMENT_CHARACTERS = 100_000;
export const MAX_CHUNKS_PER_DOCUMENT = 100;

export type DocumentChunk = Readonly<{
  chunkIndex: number;
  content: string;
}>;

/**
 * Normalizes plain text while keeping blank lines as paragraph boundaries.
 * Null bytes and whitespace-only paragraphs are discarded as input noise.
 */
export function normalizeDocumentText(value: string): string {
  if (typeof value !== "string") {
    throw new Error("Document content must be text.");
  }

  const normalizedLineEndings = value
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "");

  return normalizedLineEndings
    .split(/\n\s*\n+/u)
    .map((paragraph) =>
      paragraph
        .replace(/[ \t]*\n[ \t]*/gu, " ")
        .replace(/[ \t]+/gu, " ")
        .trim(),
    )
    .filter((paragraph) => paragraph.length > 0)
    .join("\n\n");
}

function splitWords(value: string, maxCharacters: number): string[] {
  const parts: string[] = [];
  let remaining = value.trim();

  while (remaining.length > maxCharacters) {
    let cut = remaining.lastIndexOf(" ", maxCharacters);

    if (cut <= 0) {
      const nextSpace = remaining.indexOf(" ", maxCharacters);
      cut = nextSpace > 0 ? nextSpace : maxCharacters;
    }

    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining.length > 0) {
    parts.push(remaining);
  }

  return parts;
}

function splitLongParagraph(paragraph: string): string[] {
  if (paragraph.length <= TARGET_CHUNK_CHARACTERS) {
    return [paragraph];
  }

  const sentences = paragraph.split(/(?<=[.!?])\s+/u).filter(Boolean);
  const parts: string[] = [];
  let current = "";

  const flushCurrent = () => {
    if (current.length > 0) {
      parts.push(current);
      current = "";
    }
  };

  for (const sentence of sentences.length > 0 ? sentences : [paragraph]) {
    if (sentence.length > MAX_CHUNK_CHARACTERS) {
      flushCurrent();
      parts.push(...splitWords(sentence, MAX_CHUNK_CHARACTERS));
      continue;
    }

    const candidate = current.length > 0 ? `${current} ${sentence}` : sentence;

    if (
      current.length > 0 &&
      candidate.length > TARGET_CHUNK_CHARACTERS
    ) {
      flushCurrent();
      current = sentence;
    } else {
      current = candidate;
    }
  }

  flushCurrent();
  return parts;
}

function takeOverlap(value: string): string {
  const suffix = value.slice(-CHUNK_OVERLAP_CHARACTERS);
  const firstWhitespace = suffix.search(/\s/u);

  return firstWhitespace > 0 ? suffix.slice(firstWhitespace).trim() : suffix;
}

function startNextChunk(previous: string, nextUnit: string): string {
  const overlap = takeOverlap(previous);
  const availableOverlap = Math.max(
    0,
    MAX_CHUNK_CHARACTERS - nextUnit.length - 2,
  );
  const boundedOverlap =
    availableOverlap > 0 ? overlap.slice(-availableOverlap).trim() : "";

  return boundedOverlap.length > 0
    ? `${boundedOverlap}\n\n${nextUnit}`
    : nextUnit;
}

/**
 * Produces stable, paragraph-aware chunks for plain-text knowledge documents.
 * Normal paragraphs are grouped near the target size; oversized paragraphs
 * fall back to sentence and then word boundaries. A small suffix overlap is
 * retained between chunks when the size limit permits it.
 */
export function chunkDocumentText(value: string): DocumentChunk[] {
  const normalized = normalizeDocumentText(value);

  if (normalized.length === 0) {
    throw new Error("Document content must not be empty.");
  }

  if (normalized.length > MAX_DOCUMENT_CHARACTERS) {
    throw new Error(
      `Document content exceeds the ${MAX_DOCUMENT_CHARACTERS}-character limit.`,
    );
  }

  const units = normalized
    .split("\n\n")
    .flatMap((paragraph) => splitLongParagraph(paragraph));
  const chunks: string[] = [];
  let current = "";

  for (const unit of units) {
    const candidate = current.length > 0 ? `${current}\n\n${unit}` : unit;

    if (
      current.length > 0 &&
      candidate.length <= TARGET_CHUNK_CHARACTERS
    ) {
      current = candidate;
      continue;
    }

    if (current.length > 0) {
      chunks.push(current);
      current = startNextChunk(current, unit);
    } else {
      current = unit;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
    throw new Error(
      `Document content produces more than the ${MAX_CHUNKS_PER_DOCUMENT}-chunk limit.`,
    );
  }

  return chunks.map((content, chunkIndex) => ({ chunkIndex, content }));
}
