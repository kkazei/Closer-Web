# RAG evaluation results

**Not run in this workspace.** The required `DATABASE_URL`, `HF_TOKEN`, and
`CLOSER_SEED_USER_ID` are not configured here. In addition, the development
seed currently inserts the two Northstar knowledge chunks without embeddings,
and the retrieval primitive filters out chunks without canonical-model
vectors. The fixture uses those seeded chunk IDs, so a valid calibration
requires embedding the seeded Northstar document first.

Run `npm run db:eval-rag` after configuring `DATABASE_URL`, `HF_TOKEN`, and
`CLOSER_SEED_USER_ID` and ensuring the labeled chunks have embeddings from
`sentence-transformers/all-MiniLM-L6-v2`. The evaluator is read-only against
Postgres and writes the metrics table and recommendation below after a run.

## Results by configuration

| Threshold | Top-K | Hit rate | Chunk precision | Unanswerable false-positive rate | Chunks retrieved |
|---:|---:|---:|---:|---:|---:|
| Not run | 0.35-0.75; 3, 5, 8 | n/a | n/a | n/a | n/a |

## Recommended threshold and top-K

**No recommendation yet.** There is no database/provider result to support a
threshold or top-K change. The evaluator will recommend a configuration only
when every labeled chunk is observed in baseline retrievals. It ranks
configurations by hit rate minus unanswerable false-positive rate, then uses
chunk precision and smaller top-K as tie-breakers.
