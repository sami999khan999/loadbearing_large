## What it is

**Documents** (`/documents`) lets you paste text to store it, then search everything stored by
meaning, through OpenAI.

## How it works

:::steps
### You paste text

The worker splits it into pieces of about 1,500 characters, each overlapping the next by 200, so
no sentence is cut in half.

### Each piece gets a fingerprint of its meaning

OpenAI turns each piece into a list of numbers (an embedding)
that captures what it is about.

### Search compares meanings

Your question gets a fingerprint too, and the closest pieces come back, even when they use
different words.
:::

## What it needs

| Setting | Meaning |
|---|---|
| `OPENAI_API_KEY` | the key OpenAI gave you. Without it, indexing and search both fail |
| `EMBEDDING_MODEL` | which OpenAI model makes the fingerprints, `text-embedding-3-small` by default |
| `EMBEDDING_DIMENSIONS` | how many numbers each fingerprint has, 1536 for that model |

The fingerprints are stored in Postgres itself (`VECTOR_DRIVER=pgvector`), beside the text.

## Step by step

:::steps
### Index a text

Under **Index text**, paste into **Text** (up to 100,000 characters) and press **Index**. You see
"Queued as …. Search for it in a moment."

### Wait a moment

Indexing runs in the worker.

### Search

Under **Search**, type in **What are you looking for?** and press **Search**. The ten best matches
come back, each with where it came from and a score.
:::

## Who can use it

`ai.embedding.read` to search and `ai.embedding.write` to index. By default only the **Owner** role
has them.

## Good to know

> [!WARNING]
> **Do not change the model once texts are indexed.** Fingerprints from two different models cannot
> be compared, and this kit has no command to redo the old ones. Choose the model before you
> start.

- Every search is recorded in the organization's audit history.
