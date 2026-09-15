import { buildKnowledgeContext } from "@/rag/context";

const chunk = {
  chunkId: "chunk-a",
  documentId: "document-a",
  content: "Closer qualifies SaaS leads using fit, intent, and readiness signals.",
  metadata: { source: "internal" },
  similarity: 0.91,
};

describe("RAG context construction", () => {
  it("returns no model context when retrieval has no eligible chunks", () => {
    expect(buildKnowledgeContext([])).toEqual({
      text: "",
      retrievedChunkIds: [],
      retrievalCount: 0,
      ragUsed: false,
    });
  });

  it("marks retrieved text as untrusted and returns only safe chunk metadata", () => {
    const result = buildKnowledgeContext([chunk]);

    expect(result.ragUsed).toBe(true);
    expect(result.retrievalCount).toBe(1);
    expect(result.retrievedChunkIds).toEqual(["chunk-a"]);
    expect(result.text).toContain("KNOWLEDGE CONTEXT (UNTRUSTED REFERENCE MATERIAL)");
    expect(result.text).toContain(chunk.content);
    expect(result.text).toContain("END KNOWLEDGE CONTEXT");
    expect(result.text).not.toContain("internal");
    expect(result.text).not.toContain("0.91");
  });
});
