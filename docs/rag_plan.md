# RAG Implementation Plan for CustomAgents

## Current Architecture Summary

| Layer | What Exists Today | Gap for RAG |
|-------|-------------------|-------------|
| **Memory** | Simple KV file store (key → string) | No embeddings, no vector search |
| **Query Loop** | Builds system prompt + injects `memoryContext` | No retrieval step before/during LLM call |
| **Tools** | regex (grep), glob, file read, shell search | No semantic search tool |
| **Agents** | Sync/background/forked agents, bounded context | Agents can't retrieve from a vector store |
| **Dependencies** | No vector DB or embedding library | Need to add one |

---

## What Needs to Be Built

### 1. Core RAG Abstractions (`src/rag/`)

| File | Purpose |
|------|---------|
| `src/rag/types.ts` | Shared types: `Chunk`, `IndexedFile`, `RAGConfig`, `SearchResult` |
| `src/rag/EmbeddingProvider.ts` | Interface + implementations: OpenAI embeddings, local model (optional) |
| `src/rag/CodeChunker.ts` | Splits source code into semantic chunks (by function/class boundary) |
| `src/rag/VectorStore.ts` | In-memory FlatIndex (cosine similarity on Float32Array) |
| `src/rag/FileScanner.ts` | Walks a project directory, respects `.gitignore`, collects files to index |
| `src/rag/Indexer.ts` | Orchestrates scan → chunk → embed → store pipeline + incremental updates |
| `src/rag/Retriever.ts` | Top-K semantic search with relevance ranking |
| `src/rag/index.ts` | Barrel export + `RAGService` facade |

### 2. RAG Service Lifecycle (`src/services/RAGService.ts`)

A `ServiceDefinition` that:
- Starts a background indexer for the current project
- Watches key files for changes (incremental reindex)
- Exposes `Retriever` for consumers (query loop + tools)

### 3. New Tools (`src/tools/RAGSearchTool/`)

| Tool | Agent Use Case |
|------|---------------|
| **`RAGSearchTool`** | `"rag_search"` — semantic search over the indexed codebase, agent-driven |
| **`RAGAskTool`** (optional) | `"rag_ask"` — agent poses a natural-language question, tool does retrieval + summarizes |

### 4. Query Loop Integration (`src/query/query.ts`)

The query loop already accepts an optional `memoryContext`. Extend `QueryConfig`:

```ts
export interface QueryConfig {
  // ... existing
  /** If set, retrieved semantic context is injected before the system prompt */
  ragContext?: string;
  /** Optional: auto-retrieve context for the user query */
  autoRetrieve?: boolean;
  retriever?: Retriever;
}
```

Inject into system prompt similarly to `memoryContext`:

```ts
if (qc.ragContext) {
  systemContent += `\n\n--- Retrieved Code Context ---\n${qc.ragContext}`;
}
```

### 5. Configuration (`src/types/config.ts`)

Add RAG config to `AppConfig`:

```ts
export interface RAGConfig {
  enabled: boolean;
  embeddingSource: "openai" | "local";  // or "cohere" | "voyage"
  embeddingModel: string;               // e.g. "text-embedding-3-small"
  chunkSize: number;                    // e.g. 512 (chars) — auto-detected for code
  chunkOverlap: number;                 // e.g. 50
  topK: number;                         // default: 10
  similarityThreshold: number;          // e.g. 0.65
  indexingPath: string;                 // default: workspace root
  ignoredPaths: string[];               // e.g. ["node_modules", "dist", ".git"]
}
```

---

## Key Interface Designs

### `EmbeddingProvider`

```ts
export interface EmbeddingProvider {
  /** Returns a Float32Array embedding for the given text */
  embed(text: string): Promise<Float32Array>;
  /** Batch embedding for many texts */
  embedBatch(texts: string[]): Promise<Float32Array[]>;
  /** Dimensionality of the embedding model */
  dimensions: number;
}
```

### `VectorStore` (MVP: flat index, swappable later for Chroma/Qdrant)

```ts
export interface VectorStore {
  add(ids: string[], embeddings: Float32Array[], metadata: Record<string, any>[]): void;
  remove(ids: string[]): void;
  /** Top-K search by query embedding */
  search(query: Float32Array, topK: number, threshold?: number): SearchResult[];
  /** Persist to disk */
  save(dir: string): Promise<void>;
  /** Load from disk */
  load(dir: string): Promise<void>;
  size(): number;
}

export interface SearchResult {
  id: string;            // "filepath:chunk_index"
  filePath: string;
  chunk: string;
  score: number;         // cosine similarity
  metadata: {
    fileName: string;
    language: string;
    functionScope?: string;
    charOffset?: number;
  };
}
```

### `Retriever`

```ts
export interface Retriever {
  /** Semantic search over the index, returns ranked results with text snippets */
  search(query: string, topK?: number): Promise<SearchResult[]>;
}
```

---

## Code Chunker Strategy

For code, a naive 512-char overlap split is **terrible**. Use this approach:

1. **Split at top-level boundaries**: class defs, function defs, `export { ... }` blocks
2. **Max chunk size ~500 chars** — if a function >500, split it at inner boundaries
3. **Prepend parent scope context** to each chunk: for a method inside `class Foo { ... }`, prepend `"class Foo {"` so similarity search has context
4. **File metadata** attached: filename, detected language, line range

---

## Query Loop Integration Flow

```
User query → Query Loop
                │
                ├─ if autoRetrieve:
                │     retriever.search(userQuery) → ragContext
                │     inject into system prompt
                │
                ├─ LLM generates assistant message
                │
                ├─ If LLM calls "rag_search" tool:
                │     → Retriever.search(toolQuery) → ranked chunks
                │     → return as tool result
                │     → LLM re-prompts with results
                │
                └─ Final answer
```

**Key point**: The agent can do **multi-turn retrieval** — search, read results, narrow down, search again. This is the "agentic RAG" pattern and fits perfectly with this framework's tool-call loop.

---

## Dependencies

| Package | Why |
|---------|-----|
| `ignore` (npm) | `.gitignore` parsing for FileScanner |
| `gpt-tokenizer` | Token counting for chunk sizing |
| **OpenAI SDK** (already used via `streamChatCompletion`) | `text-embedding-3-small` embeddings — reuse same API key/config |
| **No vector DB needed for MVP** | Flat Float32Array index with cosine is fast enough for <100K vectors |
| **cosine-similarity** (or implement manually) | Cosine similarity — ~10 lines with Float32Array, no dep needed |

---

## Project Structure (New Files)

```
src/
├── rag/
│   ├── types.ts              # Shared types
│   ├── EmbeddingProvider.ts  # OpenAI + interface
│   ├── CodeChunker.ts        # Code-aware chunking
│   ├── VectorStore.ts        # Flat cosine-sim index
│   ├── FileScanner.ts        # Project file walker + .gitignore
│   ├── Indexer.ts            # scan → chunk → embed → store
│   ├── Retriever.ts          # High-level search API
│   └── index.ts              # RAGService facade + export
├── services/
│   └── RAGService.ts         # ServiceDefinition for lifecycle
├── tools/
│   └── RAGSearchTool/
│       └── RAGSearchTool.ts  # Tool implementation
└── types/
    └── config.ts             # Add RAGConfig interface
```

---

## Implementation Phases

### Phase 1 — Foundation (can be built independently)
1. `types.ts` — define `Chunk`, `SearchResult`, `RAGConfig`, `IndexEntry`
2. `EmbeddingProvider.ts` — OpenAI embedding implementation (reuse existing API config)
3. `VectorStore.ts` — flat Float32Array index with cosine similarity, save/load
4. `CodeChunker.ts` — regex-based chunking with scope context

### Phase 2 — Index Pipeline
5. `FileScanner.ts` — walk project, filter by `.gitignore` + ignore list
6. `Indexer.ts` — orchestrates: scan → chunk → embed → add to VectorStore
   - Deduplication: hash(file contents) to detect changes
   - Incremental: only re-embed changed files
7. `Retriever.ts` — embed query → VectorStore.search → rank → return

### Phase 3 — Service & Tool Integration
8. `RAGService.ts` — ServiceDefinition, runs indexer, exposes Retriever
9. `RAGSearchTool` — Tool that calls `retriever.search(query)`
10. Register tool in `registry.ts`

### Phase 4 — Query Loop Integration
11. Extend `QueryConfig` with `ragContext`, `autoRetrieve`, `retriever`
12. Inject `ragContext` into system prompt in `query.ts`
13. Auto-retrieve on query start if `ragContext` not present and `autoRetrieve`

### Phase 5 — Polish & Config
14. Config UI (if React UI needs RAG settings)
15. CLI flags for RAG operations
16. Add `init` command: `rag init` to bootstrap index

---

## Design Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| **OpenAI embeddings** (not local) | Reuses existing API key, `text-embedding-3-small` is cheap ($0.02/M tokens), much better than any local small model |
| **Flat Float32Array index** (no vector DB) | <100K chunks fits fine in memory (~30MB index for a large repo). Zero operational complexity |
| **Agent-driven retrieval** (primary) + **auto-retrieve** (optional) | Agent knows when it needs more context. Auto-retrieve catches cases where the query is vague/broad |
| **Code-aware chunking** | Critical for code — splitting at `function` boundaries preserves semantic meaning, unlike arbitrary char splits |
| **Persisted index on disk** | `~/.custom-agents/rag-index/<project-hash>/` — survives restarts, only rebuilds changed files |
