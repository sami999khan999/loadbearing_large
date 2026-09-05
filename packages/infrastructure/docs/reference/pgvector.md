---
title: pgvector
description: Why the vector store starts inside Postgres, what the permission filter has to run on, the score floor — and the ORDER BY that stops the HNSW index being used at all.
---

# pgvector

`PgVectorStore` is the `VectorStore` implementation the container binds when
`VECTOR_DRIVER=pgvector`, which is today's only value. The extension lives in the same Postgres the
domain tables are in.

## Why it starts here

The corpus is **conceptually derived**: every chunk can be rebuilt by re-embedding its source
document. That property is the whole reason a dedicated vector database can be adopted later without
a migration plan — the adoption is a new folder under `src/`, one more member of the driver union,
and a re-index.

Nothing above `Container` learns which store is running, and that is not luck. `VectorStore.search()`
takes the **resolved goal scope as a parameter**, so the seam was swappable from the first day: a
remote store holds no `CapabilitySet` and can join back to nothing, so a port that filtered results
afterwards could never have been implemented by one.

## The permission filter runs on the input set

```ts
const scope =
  goalIds.length > 0
    ? or(isNull(documentChunks.goalId), inArray(documentChunks.goalId, [...goalIds]))
    : isNull(documentChunks.goalId);
```

**An empty scope means org-wide chunks only, never everything.** If it meant "no filter", a bug that
failed to compute the permitted set would grant the entire corpus rather than deny it.

Filtering after retrieval is the failure this shape prevents: by then the model has already seen what
the actor cannot.

The tenant predicate is on every method, `deleteBySource` included — a delete keyed only on a
caller-supplied `sourceId` is a cross-tenant write, and nothing about the result looks wrong.

## The score floor

```ts
private static readonly MIN_SCORE = 0.3;
```

Vector search always returns `limit` rows however bad the match. Without a floor, an unrelated
question retrieves the least-unrelated documents in the corpus and presents them as answers.

## `metadata` is an untyped bag

Two `NOT NULL` columns — `sourceType` and `chunkIndex` — are read out of it defensively.
`String(unknown)` would write `"[object Object]"` and never throw, so both go through a narrowing
helper with a fallback.

## The `ORDER BY` defeats the index

**This is a known defect** (`P2.3` in `tasks/IMPLEMENTATION-PLAN.md`), recorded here because the
query looks correct:

```ts
const similarity = sql<number>`1 - (${cosineDistance(documentChunks.embedding, [...embedding])})`;
…
.orderBy(desc(similarity))
```

pgvector serves an HNSW index only for an ascending order on the distance operator itself —
`ORDER BY embedding <=> $1 ASC`. Ordering by `desc(1 - distance)` is an expression the planner cannot
match to the index, so **every search is a tenant-wide sequential scan** with a full distance
computation per row. It returns correct results, which is why it survives review; it stops being
survivable at corpus size.

The fix is to order by `asc(cosineDistance(...))` and express the floor as
`distance < 1 - MIN_SCORE`, keeping `1 - distance` only in the projected `score`. The spec that goes
with it runs `EXPLAIN` and asserts an index scan, because nothing else distinguishes the two queries
from their results.
