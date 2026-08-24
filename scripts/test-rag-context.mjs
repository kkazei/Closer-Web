import assert from "node:assert/strict";

const { buildKnowledgeContext, MAX_KNOWLEDGE_CONTEXT_CHARACTERS } =
  await import("../src/rag/context.ts");

const chunks = [
  {
    chunkId: "chunk-a",
    documentId: "document-a",
    content: "First source content.",
    metadata: { internal: true },
    similarity: 0.9,
  },
  {
    chunkId: "chunk-b",
    documentId: "document-b",
    content: "Second source content.",
    metadata: {},
    similarity: 0.8,
  },
];

const context = buildKnowledgeContext(chunks);
assert.equal(context.ragUsed, true);
assert.equal(context.retrievalCount, 2);
assert.deepEqual(context.retrievedChunkIds, ["chunk-a", "chunk-b"]);
assert.match(context.text, /KNOWLEDGE CONTEXT \(UNTRUSTED REFERENCE MATERIAL\)/);
assert.match(context.text, /\[Source 1\]\nFirst source content\./);
assert.match(context.text, /\[Source 2\]\nSecond source content\./);
assert.match(context.text, /END KNOWLEDGE CONTEXT/);
assert.equal(context.text.includes("internal"), false);
assert.ok(context.text.length <= MAX_KNOWLEDGE_CONTEXT_CHARACTERS);

const empty = buildKnowledgeContext([]);
assert.deepEqual(empty, {
  text: "",
  retrievedChunkIds: [],
  retrievalCount: 0,
  ragUsed: false,
});

const oversized = buildKnowledgeContext([
  {
    ...chunks[0],
    content: "word ".repeat(MAX_KNOWLEDGE_CONTEXT_CHARACTERS),
  },
]);
assert.ok(oversized.text.length <= MAX_KNOWLEDGE_CONTEXT_CHARACTERS);
assert.equal(oversized.retrievalCount, 1);

console.log("RAG context tests passed.");
