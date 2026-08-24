import assert from "node:assert/strict";

const {
  CHUNK_OVERLAP_CHARACTERS,
  MAX_CHUNK_CHARACTERS,
  TARGET_CHUNK_CHARACTERS,
  chunkDocumentText,
  normalizeDocumentText,
} = await import("../src/rag/chunking.ts");

assert.equal(
  normalizeDocumentText("  First line\r\n\r\n\tSecond line\u0000  "),
  "First line\n\nSecond line",
);
assert.deepEqual(chunkDocumentText("A short document."), [
  { chunkIndex: 0, content: "A short document." },
]);
assert.throws(() => chunkDocumentText(" \r\n\t "), /must not be empty/i);

const paragraphs = Array.from(
  { length: 5 },
  (_, index) =>
    `Paragraph ${index + 1}. ` +
    "This paragraph contains stable knowledge content for deterministic chunk testing. ".repeat(
      8,
    ),
).join("\n\n");

const firstRun = chunkDocumentText(paragraphs);
const secondRun = chunkDocumentText(paragraphs);

assert.deepEqual(firstRun, secondRun, "chunking must be stable for identical input");
assert.ok(firstRun.length > 1, "the test document should produce multiple chunks");
assert.deepEqual(
  firstRun.map(({ chunkIndex }) => chunkIndex),
  firstRun.map((_, index) => index),
);
assert.ok(
  firstRun.every(({ content }) => content.length <= MAX_CHUNK_CHARACTERS),
  "chunks must stay within the hard character limit",
);
assert.ok(
  firstRun.some(
    ({ content }, index) =>
      index > 0 &&
      firstRun[index - 1].content.slice(-CHUNK_OVERLAP_CHARACTERS).trim() &&
      content.includes(firstRun[index - 1].content.slice(-40).trim()),
  ),
  "later chunks should retain a small suffix overlap",
);

const oversizedParagraph = "word ".repeat(TARGET_CHUNK_CHARACTERS);
const oversizedChunks = chunkDocumentText(oversizedParagraph);
assert.ok(oversizedChunks.length > 1, "oversized paragraphs must be split");
assert.ok(
  oversizedChunks.every(({ content }) => content.length <= MAX_CHUNK_CHARACTERS),
);

console.log("RAG chunking tests passed.");
