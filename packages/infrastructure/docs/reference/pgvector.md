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

`SearchDocumentsUseCase` is the caller, behind `document.search` and `/documents`. It resolves the
scope with `capabilities.goalsWith()` before this method is reached, which is the arrangement the
signature exists to force — and with no goal feature in the kit that resolves to `[]`, meaning the
org-wide corpus rather than everything.

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

## Order on the distance, not on the similarity

```ts
const distance = cosineDistance(documentChunks.embedding, [...embedding]);
const similarity = sql<number>`1 - (${distance})`;
…
.where(and(eq(documentChunks.organizationId, organizationId), scope, lt(distance, MAX_DISTANCE)))
.orderBy(asc(distance))
```

**pgvector serves an HNSW index only for an ascending order on the operator itself** —
`ORDER BY embedding <=> $1 ASC`. Ordering by `desc(1 - distance)`, which is what this store did until
it was fixed, is an expression the planner cannot match to the index, so that path was unavailable at
every table size. The query returned correct results, which is exactly why it survived review.

The floor moved with the ordering: `MAX_DISTANCE = 1 - MIN_SCORE`, and the predicate is on the same
`distance` expression. `1 - distance` survives only in the projected `score`, where the port's callers
want a similarity.

### What the spec can and cannot assert

`tests/vector/pg-vector.store.spec.ts` asserts the **shape**: the issued SQL orders by the bare
operator ascending, with no `DESC` and no inversion, and the plan's sort key is the operator rather
than an expression over it.

It deliberately does **not** assert "an index scan happened", and the reason is worth knowing:

> **HNSW cannot serve the tenant predicate.** `organization_id = $1` is not part of the index, so a
> filtered nearest-neighbour query is a post-filtering path — the planner picks between it and the
> tenant index by estimated cost. At the row counts a spec can seed, taking
> `document_chunks_goal_null_idx` and sorting is genuinely cheaper, and Postgres is right to.

So an "asserts an index scan" spec is a spec that passes or fails on table statistics. What has to
hold at every size is the ordering shape, which is what makes the HNSW path *available* to the
planner at the size where it wins.
