import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type EvalQuestion = Readonly<{
  id: string;
  question: string;
  answerable: boolean;
  expectedChunkIds: string[];
}>;

type EvalFixture = Readonly<{
  businessSlug: string;
  businessId: string;
  expectedChunks: ReadonlyArray<{
    chunkId: string;
    documentId: string;
    section: string;
  }>;
  questions: EvalQuestion[];
}>;

type RetrievedChunk = Readonly<{
  chunkId: string;
  documentId: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}>;

type Metrics = Readonly<{
  threshold: number;
  topK: number;
  hitRate: number;
  precision: number;
  falsePositiveRate: number;
  retrievedChunks: number;
}>;

const MIN_THRESHOLD_HUNDREDTHS = 35;
const MAX_THRESHOLD_HUNDREDTHS = 75;
const THRESHOLD_STEP_HUNDREDTHS = 5;
const TOP_K_VALUES = [3, 5, 8] as const;
const BASELINE_TOP_K = 8;

function loadEnvironment(): void {
  if (existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }

  if (existsSync(".env")) {
    process.loadEnvFile(".env");
  }

  const missing = ["DATABASE_URL", "HF_TOKEN", "CLOSER_SEED_USER_ID"].filter(
    (name) => !process.env[name],
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing environment variable(s): ${missing.join(", ")}. Configure them in .env.local or the process environment.`,
    );
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      process.env.CLOSER_SEED_USER_ID!,
    )
  ) {
    throw new Error("CLOSER_SEED_USER_ID must be a valid profile UUID.");
  }
}

function loadFixture(): EvalFixture {
  const path = fileURLToPath(
    new URL("../tests/fixtures/rag-eval.json", import.meta.url),
  );
  const fixture = JSON.parse(readFileSync(path, "utf8")) as EvalFixture;

  if (
    !fixture.businessId ||
    !fixture.businessSlug ||
    !Array.isArray(fixture.expectedChunks) ||
    !Array.isArray(fixture.questions) ||
    fixture.questions.length < 25 ||
    fixture.questions.length > 30
  ) {
    throw new Error("The RAG evaluation fixture has an invalid shape.");
  }

  const questionIds = new Set<string>();
  for (const item of fixture.questions) {
    if (
      !item.id ||
      !item.question.trim() ||
      typeof item.answerable !== "boolean" ||
      !Array.isArray(item.expectedChunkIds) ||
      questionIds.has(item.id) ||
      (item.answerable && item.expectedChunkIds.length === 0) ||
      (!item.answerable && item.expectedChunkIds.length > 0)
    ) {
      throw new Error(`Invalid or duplicate RAG evaluation question: ${item.id}`);
    }

    questionIds.add(item.id);
  }

  return fixture;
}

function thresholds(): number[] {
  const values: number[] = [];

  for (
    let value = MIN_THRESHOLD_HUNDREDTHS;
    value <= MAX_THRESHOLD_HUNDREDTHS;
    value += THRESHOLD_STEP_HUNDREDTHS
  ) {
    values.push(value / 100);
  }

  return values;
}

function isRelevant(
  chunk: RetrievedChunk,
  expectedChunkIds: ReadonlySet<string>,
): boolean {
  return expectedChunkIds.has(chunk.chunkId);
}

function calculateMetrics(
  fixture: EvalFixture,
  baseline: ReadonlyMap<string, RetrievedChunk[]>,
  threshold: number,
  topK: number,
): Metrics {
  const answerable = fixture.questions.filter((item) => item.answerable);
  const unanswerable = fixture.questions.filter((item) => !item.answerable);
  let answerableHits = 0;
  let falsePositiveQuestions = 0;
  let retrievedChunks = 0;
  let relevantChunks = 0;

  for (const item of fixture.questions) {
    const eligible = (baseline.get(item.id) ?? [])
      .filter((chunk) => chunk.similarity >= threshold)
      .slice(0, topK);
    const expectedIds = new Set(item.expectedChunkIds);
    const relevant = eligible.filter((chunk) =>
      isRelevant(chunk, expectedIds),
    );

    retrievedChunks += eligible.length;
    relevantChunks += relevant.length;

    if (item.answerable && relevant.length > 0) {
      answerableHits += 1;
    }

    if (!item.answerable && eligible.length > 0) {
      falsePositiveQuestions += 1;
    }
  }

  return {
    threshold,
    topK,
    hitRate: answerableHits / answerable.length,
    precision: retrievedChunks === 0 ? 0 : relevantChunks / retrievedChunks,
    falsePositiveRate: falsePositiveQuestions / unanswerable.length,
    retrievedChunks,
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function recommend(metrics: readonly Metrics[]): Metrics {
  return [...metrics].sort((left, right) => {
    const leftBalance = left.hitRate - left.falsePositiveRate;
    const rightBalance = right.hitRate - right.falsePositiveRate;

    return (
      rightBalance - leftBalance ||
      right.precision - left.precision ||
      left.topK - right.topK ||
      right.threshold - left.threshold
    );
  })[0];
}

function renderResults(
  fixture: EvalFixture,
  metrics: readonly Metrics[],
  observedChunkIds: ReadonlySet<string>,
): string {
  const expectedChunkIds = new Set(
    fixture.questions.flatMap((item) => item.expectedChunkIds),
  );
  const expectedChunks = expectedChunkIds.size;
  const coveredChunks = [...expectedChunkIds].filter((id) =>
    observedChunkIds.has(id),
  ).length;
  const calibrated = expectedChunks > 0 && coveredChunks === expectedChunks;
  const generatedAt = new Date().toISOString().slice(0, 10);
  const rows = metrics
    .map(
      (result) =>
        `| ${result.threshold.toFixed(2)} | ${result.topK} | ${formatPercent(result.hitRate)} | ${formatPercent(result.precision)} | ${formatPercent(result.falsePositiveRate)} | ${result.retrievedChunks} |`,
    )
    .join("\n");

  const recommendation = calibrated
    ? (() => {
        const chosen = recommend(metrics);
        const balance = chosen.hitRate - chosen.falsePositiveRate;

        return [
          `Recommended similarity threshold: **${chosen.threshold.toFixed(2)}**; top-K: **${chosen.topK}**.`,
          `This configuration had a ${formatPercent(chosen.hitRate)} answerable-question hit rate, ${formatPercent(chosen.precision)} chunk precision, and ${formatPercent(chosen.falsePositiveRate)} unanswerable-question false-positive rate. It maximizes hit rate minus false-positive rate (${balance.toFixed(3)}); ties favor higher precision, then smaller top-K, then the higher threshold.`,
        ].join("\n\n");
      })()
    : `**No recommendation yet.** The run observed ${coveredChunks} of ${expectedChunks} labeled demo chunks in the baseline retrievals. The dev seed inserts its two Northstar chunks without embeddings, so the calibration is not valid until the expected chunks have current-model embeddings. If the document was re-ingested and received new chunk IDs, update the labels in \`tests/fixtures/rag-eval.json\` and rerun.`;

  return [
    "# RAG evaluation results",
    "",
    `- Run date: ${generatedAt}`,
    `- Business: ${fixture.businessSlug} (${fixture.businessId})`,
    `- Questions: ${fixture.questions.length} (${fixture.questions.filter((item) => item.answerable).length} answerable, ${fixture.questions.filter((item) => !item.answerable).length} unanswerable)`,
    `- Labeled chunk coverage: ${coveredChunks}/${expectedChunks}${calibrated ? " (complete)" : " (incomplete; do not use these metrics to change defaults)"}`,
    "- Retrieval used the existing Hugging Face embedding provider and `retrieveKnowledge` inside `withAuthenticatedDb`. PostgreSQL RLS and the explicit business filter both apply. The script issues read-only retrieval queries.",
    "",
    "## Results by configuration",
    "",
    "Hit rate is the share of answerable questions with at least one expected chunk in the returned top-K. Precision is the share of all retrieved chunks whose IDs are labeled relevant for that question. False-positive rate is the share of unanswerable questions returning one or more chunks above the threshold.",
    "",
    "| Threshold | Top-K | Hit rate | Chunk precision | Unanswerable false-positive rate | Chunks retrieved |",
    "|---:|---:|---:|---:|---:|---:|",
    rows,
    "",
    "## Recommended threshold and top-K",
    "",
    recommendation,
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  loadEnvironment();
  const fixture = loadFixture();

  const { closePrivilegedDb, withAuthenticatedDb } = await import(
    "../src/db/index"
  );
  const { retrieveKnowledge } = await import("../src/rag/retrieval");
  const { getHuggingFaceEmbeddingProvider } = await import(
    "../src/rag/embeddings"
  );

  try {
    const provider = getHuggingFaceEmbeddingProvider();
    const baseline = new Map<string, RetrievedChunk[]>();
    const observedChunkIds = new Set<string>();

    for (const item of fixture.questions) {
      const chunks = await withAuthenticatedDb(
        { userId: process.env.CLOSER_SEED_USER_ID! },
        () =>
          retrieveKnowledge({
            businessId: fixture.businessId,
            query: item.question,
            topK: BASELINE_TOP_K,
            similarityThreshold: MIN_THRESHOLD_HUNDREDTHS / 100,
            provider,
          }),
      );

      baseline.set(item.id, chunks);
      for (const chunk of chunks) {
        observedChunkIds.add(chunk.chunkId);
      }
    }

    const allMetrics = thresholds().flatMap((threshold) =>
      TOP_K_VALUES.map((topK) =>
        calculateMetrics(fixture, baseline, threshold, topK),
      ),
    );
    const resultsPath = fileURLToPath(
      new URL("../docs/rag-eval-results.md", import.meta.url),
    );

    mkdirSync(fileURLToPath(new URL("../docs/", import.meta.url)), {
      recursive: true,
    });
    writeFileSync(
      resultsPath,
      renderResults(fixture, allMetrics, observedChunkIds),
      "utf8",
    );

    console.log(`Evaluated ${fixture.questions.length} questions across ${allMetrics.length} configurations.`);
    console.log(`Results written to ${resultsPath}.`);
    if (
      [...new Set(fixture.questions.flatMap((item) => item.expectedChunkIds))]
        .some((chunkId) => !observedChunkIds.has(chunkId))
    ) {
      console.warn(
        "Some labeled chunks were not retrieved at the baseline setting. The results file will not recommend a threshold or top-K.",
      );
    }
  } finally {
    await closePrivilegedDb();
  }
}

main().catch((error: unknown) => {
  console.error("RAG evaluation failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
