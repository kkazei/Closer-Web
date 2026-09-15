import {
  CHUNK_OVERLAP_CHARACTERS,
  MAX_CHUNK_CHARACTERS,
  MAX_DOCUMENT_CHARACTERS,
  chunkDocumentText,
  normalizeDocumentText,
} from "@/rag/chunking";

describe("knowledge chunking", () => {
  it("normalizes line endings, whitespace, and empty paragraphs", () => {
    expect(
      normalizeDocumentText("  First\r\n\r\n\0 Second\n line  \n\n   "),
    ).toBe("First\n\nSecond line");
  });

  it("rejects empty and oversized documents", () => {
    expect(() => chunkDocumentText(" \n\n ")).toThrow("must not be empty");
    expect(() => chunkDocumentText("x".repeat(MAX_DOCUMENT_CHARACTERS + 1))).toThrow(
      "exceeds",
    );
  });

  it("returns stable, ordered chunks within the hard size limit", () => {
    const input = [
      "Product qualification for SaaS sales teams.",
      "The assistant collects fit, intent, budget, and timeline signals before creating a structured lead record.",
      "Teams use the resulting score to prioritize conversations and follow up with qualified buyers.",
    ].join("\n\n");

    const first = chunkDocumentText(input);
    const second = chunkDocumentText(input);

    expect(second).toEqual(first);
    expect(first.map(({ chunkIndex }) => chunkIndex)).toEqual(
      first.map((_, index) => index),
    );
    expect(first.every(({ content }) => content.length <= MAX_CHUNK_CHARACTERS)).toBe(
      true,
    );
    expect(first[0]?.content).toContain("Product qualification");
  });

  it("splits oversized paragraphs without dropping their beginning or end", () => {
    const input = `Start ${"qualification signal ".repeat(180)} finish.`;
    const chunks = chunkDocumentText(input);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(({ content }) => content.length <= MAX_CHUNK_CHARACTERS)).toBe(
      true,
    );
    expect(chunks[0]?.content).toContain("Start");
    expect(chunks.at(-1)?.content).toContain("finish.");
    expect(CHUNK_OVERLAP_CHARACTERS).toBeGreaterThan(0);
  });
});
