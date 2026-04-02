# RAG Implementation Plan — CustomAgents

## Table of Contents
1. [Context & Current State](#1-context--current-state)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [Proposed Architecture](#3-proposed-architecture)
4. [Key Interfaces](#4-key-interfaces)
5. [File & Folder Structure](#5-file--folder-structure)
6. [New Dependencies](#6-new-dependencies)
7. [Integration Points](#7-integration-points)
8. [New Tools](#8-new-tools)
9. [Implementation Phases](#9-implementation-phases)
10. [Alternatives Considered](#10-alternatives-considered)
11. [Risks & Mitigations](#11-risks--mitigations)

---

## 1. Context & Current State

CustomAgents is a modular agentic IDE framework built with TypeScript/Bun. Key architectural pillars:

- **Tool system**: `Tool<TInput>` interface with `name`, `description`, Zod `parameters`, `isReadOnly`, and `call()`. Tools are registered in a `ToolRegistry` and converted to OpenAI function-calling format via `toOpenAITools()`.
- **Query loop**: `runQueryLoop()` streams LLM responses, handles tool calls via orchestration, supports context compaction. Context is injected into the system prompt.
- **Memory**: Simple file-based KV store (`MemoryStore`) with `buildContext()` that concatenates entries for the system prompt. No embeddings, no vector search.
- **Services**: `ServiceDefinition` with `start()/stop()` lifecycle, managed by `ServiceManager`.
- **Init flow**: `initialize()` in `init.ts` bootstraps everything — config, stores, registries, tools — then hands off to the Ink React app.
- **Config**: `AppConfig` built from env vars. Passed through React context and into query loop.
- **Current search capability**: `GrepTool` (regex) and `GlobTool` (filename patterns). No semantic search exists.

**What's missing for RAG**: No embedding model integration, no vector store, no chunking strategy, no retrieval pipeline, no semantic search tool. The LLM can only find code via pattern matching (grep) — it cannot do semantic queries like "where is authentication handled?" or "how does the query loop handle tool errors?"

---

## 2. Goals & Non-Goals

### Goals
1. **Semantic codebase search** — agents and users can query the codebase semantically ("find the compaction logic") via embeddings.
2. **Retrieved context injection** — relevant code snippets are injected into the query loop's system prompt, not just as raw grep results.
3. **Incremental indexing** — the codebase can be re-indexed incrementally when files change.
4. **Configurable** — embedding model, chunk size, similarity threshold, and index scope are user-configurable via env/config.
5. **Lightweight** — no heavy external services required. Works on a developer's machine with minimal setup.

### Non-Goals
- Not a full-text search replacement (keep grep/glob as-is for exact matching).
- Not a distributed/multi-repo index (single-project focus).
- Not a persistent cross-project knowledge graph.
- Not an embedding model — we call external APIs or run local inference.

---

## 3. Proposed Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Query Loop                         │
│  ┌─────────────────────────────────────────────┐    │
│  │  runQueryLoop() builds system prompt         │    │
│  │  ┌────────────────────────────────────┐      │    │
│  │  │  memoryContext (existing)           │      │    │
│  │  │  + ragContext (NEW: retrieved docs) │      │    │
│  │  └────────────────────────────────────┘      │    │
│  └─────────────────────────────────────────────┘    │
│                       ▲                              │
│                       │ calls                        │
│              ┌────────┴────────┐                     │
│              │   query_rag     │  ← NEW TOOL          │
│              │   (semantic     │                     │
│              │    search)      │                     │
│              └────────┬────────┘                     │
│                       │ uses                          │
└───────────────────────┼──────────────────────────────┘
                        │
          ┌─────────────┴──────────────┐
          │   RetrievalService (NEW)   │
          │  ┌──────────────────────┐  │
          │  │ VectorStore          │  │
          │  │  - add / query / del │  │
          │  │  - similarity search │  │
          │  └──────────────────────┘  │
          │  ┌──────────────────────┐  │
          │  │ EmbeddingProvider    │  │
          │  │  - embed(text→vec)   │  │
          │  └──────────────────────┘  │
          │  ┌──────────────────────┐  │
          │  │ Chunker              │  │
          │  │  - split file→chunks │  │
          │  └──────────────────────┘  │
          └─────────────┬──────────────┘
                        │
                        │ manages
              ┌─────────┴──────────┐
              │ IndexService (NEW)  │
              │  - full scan        │
              │  - incremental updt │
              │  - file watching    │
              │  - persistence      │
              └─────────────────────┘
```

**Key design decision**: The Retriever is a **tool** (available to the agent) AND also a **service** (background indexing). The retrieval is tool-call based — the agent decides when to use semantic search — rather than auto-injecting all results into every query. This preserves the existing architecture where context injection happens through tool results in the conversation.

---

## 4. Key Interfaces

### 4.1 EmbeddingProvider

```typescript
export interface EmbeddingProvider {
  /** Generate a single embedding vector from text. */
  embed(text: string): Promise<number[]>;

  /** Generate embeddings for a batch of texts (bulk optimization). */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** Dimensionality of the embedding vectors. */
  dimensions: number;
}

/** OpenAI-compatible embedding provider (via API). */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  dimensions = 1536; // text-embedding-3-small
  // ...
}

/** Cohere embedding provider (alternative API). */
export class CohereEmbeddingProvider implements EmbeddingProvider {
  dimensions = 1024; // embed-v3
  // ...
}

/** Local ONNX embedding provider (no API key needed). */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  dimensions = 384; // all-MiniLM-L6-v2
  // ...
}
```

### 4.2 VectorStore

```typescript
export interface VectorDocument {
  id: string;
  content: string;        // The text chunk
  filePath: string;       // Source file path
  startLine: number;      // Start line in source file
  endLine: number;        // End line in source file
  metadata: Record<string, string>; // Extra metadata (language, etc.)
}

export interface VectorSearchResult {
  document: VectorDocument;
  score: number;          // Similarity score (0-1, higher = more similar)
}

export interface VectorStore {
  /** Add documents with their embeddings. */
  add(documents: VectorDocument[], embeddings: number[][]): Promise<void>;

  /** Search for similar documents. */
  query(
    embedding: number[],
    options?: { topK?: number; threshold?: number; filePathFilter?: string }
  ): Promise<VectorSearchResult[]>;

  /** Remove documents by ID. */
  delete(ids: string[]): Promise<void>;

  /** Remove all documents matching a file path (for re-indexing). */
  deleteByFilePath(filePath: string): Promise<void>;

  /** Total document count. */
  count(): Promise<number>;

  /** Persist/store index. */
  persist(): Promise<void>;
}
```

**Recommendation**: Use a **custom lightweight flat-file vector store** (JSON/flatbuffers with cosine similarity computed in-Bun) for MVP. This avoids external dependencies and keeps the codebase self-contained. For larger codebases, a fallback to an in-memory HNSW index via `@langchain/community/vectorstores/memory` or `@xenova/transformers` can be added later.

### 4.3 Chunker

```typescript
export interface CodeChunk {
  text: string;
  filePath: string;
  startLine: number;
  endLine: number;
  language: string;
}

export interface Chunker {
  /** Split a file's content into semantic chunks. */
  chunkFile(content: string, filePath: string): Promise<CodeChunk[]>;
}
```

**Strategy**: Use a **language-aware chunker** that respects code structure:
- For all files: split by blank-line-separated paragraphs, cap at `maxChunkSize` tokens
- For known languages (`.ts`, `.py`, `.js`, etc.): prefer splitting at function/class boundaries
- Include the parent scope name as context (e.g., `"function runQueryLoop"` as prefix)
- Adjacent small chunks are merged if below a minimum threshold

### 4.4 RetrievalService

```typescript
export interface RetrieverConfig {
  embeddingProvider: EmbeddingProvider;
  vectorStore: VectorStore;
  chunker: Chunker;

  /** Maximum chunks to return. */
  topK: number;

  /** Minimum similarity score (0-1). */
  similarityThreshold: number;

  /** Whether to include file context (neighboring lines) in results. */
  includeContext: boolean;

  /** Max lines of file context around each chunk. */
  contextLines: number;
}

export class RetrievalService {
  private config: RetrieverConfig;
  private log: Logger;

  constructor(config: RetrieverConfig, log: Logger);

  /** Index a single file. */
  indexFile(filePath: string, content: string): Promise<void>;

  /** Index multiple files. */
  indexFiles(filePaths: string[]): Promise<void>;

  /** Remove a file from the index. */
  removeFile(filePath: string): Promise<void>;

  /** Semantic search. */
  search(
    query: string,
    options?: { topK?: number; threshold?: number; filePathFilter?: string }
  ): Promise<RetrievalResult[]>;

  /** Format results as a string for injection into system prompt. */
  formatResults(results: RetrievalResult[]): string;
}

export interface RetrievalResult {
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  language: string;
  score: number;
}
```

### 4.5 IndexService (background indexing as a Service)

```typescript
export class IndexService implements ServiceDefinition {
  name = "rag-indexer";
  description = "Maintains the semantic code index for RAG.";

  private retrieval: RetrievalService;
  private projectRoot: string;

  constructor(retrieval: RetrievalService, projectRoot: string, log: Logger);

  async start(log: Logger): Promise<ServiceHandle> {
    // Perform initial full indexing
    await this.retrieval.indexFiles(scanProjectFiles(this.projectRoot));
    // Optionally start file watcher (chokidar) for incremental updates
    
    return {
      stop: async () => {
        // Stop file watcher
        await this.retrieval.vectorStore.persist();
      }
    };
  }
}
```

### 4.6 RAG Config Extension

```typescript
// Add to src/types/config.ts:

export interface RAGConfig {
  /** Whether RAG is enabled. */
  enabled: boolean;

  /** Embedding provider: "openai" | "cohere" | "local" */
  embeddingProvider: "openai" | "cohere" | "local";

  /** API key for the embedding provider (if external). */
  embeddingApiKey?: string;

  /** Base URL for embedding API (if different from chat API). */
  embeddingBaseUrl?: string;

  /** Maximum chunk size in characters. */
  chunkSize: number;  // default: 1024

  /** Overlap between chunks in characters. */
  chunkOverlap: number;  // default: 128

  /** Maximum results to return. */
  topK: number;  // default: 5

  /** Minimum similarity score. */
  similarityThreshold: number;  // default: 0.7

  /** Glob patterns to include in indexing. */
  includePatterns: string[];  // default: ["**/*.{ts,tsx,js,jsx,py,md,json,yaml,yml}"]

  /** Glob patterns to exclude. */
  excludePatterns: string[];  // default: ["node_modules/**", "dist/**", ".git/**"]

  /** Path to persist the vector index. */
  indexPath: string;  // default: ".custom-agents/rag-index/"
}
```

---

## 5. File & Folder Structure

```
src/
├── rag/                          ← NEW: All RAG-related code
│   ├── types.ts                   # Shared types (VectorDocument, Chunk, etc.)
│   ├── EmbeddingProvider.ts       # EmbeddingProvider interface + implementations
│   │   ├── OpenAIEmbeddingProvider.ts
│   │   ├── CohereEmbeddingProvider.ts   ← (optional, later phase)
│   │   └── LocalEmbeddingProvider.ts    ← (optional, later phase)
│   ├── VectorStore.ts             # VectorStore interface + implementation
│   │   └── FlatFileVectorStore.ts # Lightweight flat-file implementation
│   ├── Chunker.ts                 # Code chunking logic
│   ├── RetrievalService.ts        # Core retrieval service
│   ├── IndexService.ts            # Background indexing service
│   ├── index.ts                   # Public exports
│   └── FileScanner.ts             # Project file discovery (glob + filters)
│
├── tools/RAGTool/                 ← NEW: RAG semantic search tool
│   └── RAGTool.ts
│
├── tools/RAGIndexTool/            ← NEW: Manual re-index tool
│   └── RAGIndexTool.ts
│
├── hooks/
│   └── index.ts                   # Add "rag:search" hook event (see §7.3)
│
├── types/
│   └── config.ts                  # Add RAGConfig interface (see §4.6)
│
├── components/
│   ├── App.tsx                    # Add retriever to RuntimeContext (see §7.2)
│   └── IndexStatus.tsx            ← NEW: Display indexing status (optional UI)
│
├── screens/
│   └── REPL.tsx                   # Add /index slash command (see §7.4)
│
├── entrypoints/
│   ├── init.ts                    # Wire up RAG subsystem (see §7.1)
│   └── cli.tsx                    # Add --index / --reindex CLI flags (later)
│
└── tools/
    └── registry.ts                # Register RAGTool, RAGIndexTool
```

---

## 6. New Dependencies

| Package | Purpose | Notes |
|---------|---------|-------|
| **None required for MVP** | — | Bun has built-in `fetch`, `Bun.file`, globbing. Can implement cosine similarity natively. |
| `@langchain/cohere` | Cohere embeddings (optional, phase 2) | Only if multi-provider needed |
| `@xenova/transformers` | Local ONNX embeddings (optional, phase 2) | ~40MB model download, fully offline |
| `chokidar` | File watching for incremental updates (optional, phase 2) | Can also use `fs.watch` from Bun |
| `tiktoken` | Token-accurate chunk sizing (optional) | Our char-based estimate is fine for MVP |

**Recommendation**: Start with **zero new npm dependencies** for the MVP. All embedding providers use HTTP `fetch` (Bun native), cosine similarity is a few lines of math, and the flat-file vector store is just JSON + array iteration. Add optional deps later for production hardening.

### Embedding Provider Recommendations

| Provider | Dimensions | API Type | Cost | Latency | When to Use |
|----------|-----------|----------|------|---------|-------------|
| **OpenAI `text-embedding-3-small`** | 1536 | REST API | $0.02/million tokens | ~50-100ms | Default recommendation. Already using OpenAI-compatible API. No new deps. Reuses existing `apiKey`/`baseUrl` pattern if embedding endpoint uses same provider. |
| **Cohere `embed-v3`** | 1024 | REST API | Free tier available | ~100ms | Good quality with multilingual support. Phase 2. |
| **Local ONNX `all-MiniLM-L6-v2`** | 384 | Local | Free | ~30-50ms/chunk | Best for offline/dev-only. Larger initial download. |

**Default**: OpenAI `text-embedding-3-small` through the same `OPENAI_BASE_URL` provider (e.g., OpenRouter, direct OpenAI). This minimizes configuration — users already have an API key and base URL.

---

## 7. Integration Points

### 7.1 Init Flow (`src/entrypoints/init.ts`)

The RAG subsystem is initialized alongside existing systems:

```typescript
// In initialize(), after creating MemoryStore:

// Create RAG config from env (defaults loaded if not set)
const ragConfig = loadRAGConfig(env, DATA_DIR);

if (ragConfig.enabled) {
  // Create embedding provider
  const embeddingProvider = createEmbeddingProvider(ragConfig);
  
  // Create vector store (loads persisted index if exists)
  const vectorStore = new FlatFileVectorStore(ragConfig.indexPath, log);
  await vectorStore.load();
  
  // Create retrieval service
  const chunker = new CodeChunker({ chunkSize: ragConfig.chunkSize, chunkOverlap: ragConfig.chunkOverlap });
  const retriever = new RetrievalService({
    embeddingProvider,
    vectorStore,
    chunker,
    topK: ragConfig.topK,
    similarityThreshold: ragConfig.similarityThreshold,
    includeContext: true,
    contextLines: 3,
  }, log.child("rag"));
  
  // Create and start index service (as a managed Service)
  const indexService = new IndexService(retriever, process.cwd(), ragConfig.includePatterns, ragConfig.excludePatterns, log.child("rag-index"));
  await serviceManager.start(indexService.name); // actually register+start
  
  // Register RAG tools
  registry.register(createRAGTool(retriever));
  registry.register(createRAGIndexTool(retriever));
  
  log.info("RAG subsystem initialized", {
    provider: ragConfig.embeddingProvider,
    documents: await vectorStore.count(),
  });
} else {
  retriever = null;
  log.info("RAG is disabled");
}
```

### 7.2 Query Loop Integration (`src/query/query.ts` and `src/query/queryTypes.ts`)

**Approach**: Inject retrieved context into the system prompt, similar to how `memoryContext` works today.

Changes to `QueryConfig` in `src/query/queryTypes.ts`:

```typescript
export interface QueryConfig {
  config: AppConfig;
  registry: ToolRegistry;
  hooks: HookManager;
  getAppState: () => AppState;
  setAppState: (updater: Updater<AppState>) => void;
  abortSignal: AbortSignal;
  log: Logger;
  memoryContext?: string;          // existing
  ragContext?: string;             // NEW: pre-retrieved code context
}
```

Changes to `runQueryLoop()` in `src/query/query.ts` — extend the system prompt builder:

```typescript
// In runQueryLoop(), after building systemContent with memoryContext:

let systemContent = config.systemPrompt;
if (qc.memoryContext) {
  systemContent += `\n\n--- Persistent Memory ---\n${qc.memoryContext}`;
}
// NEW:
if (qc.ragContext) {
  systemContent += `\n\n--- Relevant Code Context ---\n${qc.ragContext}`;
}
```

Note: This is an **optional** injection path. The primary way RAG context enters the loop is through the RAGTool (semantic search tool call), which returns results as tool output in the conversation. The `ragContext` field is for cases where the caller wants to pre-fetch relevant snippets before the query loop starts (e.g., auto-context based on `/query` commands).

### 7.3 Hook System (`src/hooks/index.ts`)

Add a new hook event for RAG operations:

```typescript
export interface HookPayloads {
  // ... existing events ...
  "rag:search": {
    query: string;
    results: VectorSearchResult[];
    durationMs: number;
  };
}
```

### 7.4 REPL Slash Command (`src/screens/REPL.tsx`)

Add `/rag <query>` and `/index` commands:

```typescript
// In handleSubmit(), alongside /compact and /diff handlers:

if (text.trim() === "/index" || text.trim().startsWith("/index ")) {
  // Trigger re-indexing
  if (!retriever) {
    store.set((s) => ({
      ...s,
      messages: [...s.messages, {
        role: "system" as const,
        content: "[/index: RAG is not enabled. Set RAG_ENABLED=true in .env]"
      }],
    }));
    return;
  }
  // Index asynchronously
  retriever.indexFiles(await scanProjectFiles(process.cwd()))
    .then((count) => {
      store.set((s) => ({
        ...s,
        messages: [...s.messages, {
          role: "system" as const,
          content: `[/index: Indexed ${count} documents]`
        }],
      }));
    })
    .catch((err) => {
      log.error("/index failed", { error: String(err) });
    });
  return;
}
```

### 7.5 Environment Variables

Add to `.env.example` / config schema:

```bash
# RAG Configuration
RAG_ENABLED=true                    # Enable/disable RAG
RAG_EMBEDDING_PROVIDER=openai       # openai | cohere | local
RAG_CHUNK_SIZE=1024                 # Max chars per chunk
RAG_CHUNK_OVERLAP=128               # Overlap between chunks
RAG_TOP_K=5                         # Max search results
RAG_SIMILARITY_THRESHOLD=0.7        # Min cosine similarity
RAG_INDEX_PATH=.custom-agents/rag-index  # Persist path
```

---

## 8. New Tools

### 8.1 RAGTool — Semantic Code Search 🆕

The primary RAG tool the agent uses to search the codebase semantically.

```typescript
// src/tools/RAGTool/RAGTool.ts
import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { RetrievalService } from "../../rag/RetrievalService.js";

const RAGInput = z.object({
  query: z.string().describe(
    "Semantic search query describing what you're looking for. " +
    "Be specific about functionality, behavior, or patterns. " +
    "Examples: 'authentication middleware', 'error handling in the query loop', 'how context budget is calculated'"
  ),
  top_k: z.number().int().positive().optional()
    .describe("Maximum number of results (default: 5, max: 20)"),
  file_filter: z.string().optional()
    .describe("Optional glob pattern to limit search to specific files/directories"),
});

type RAGInput = z.infer<typeof RAGInput>;

export function createRAGTool(retriever: RetrievalService): Tool<RAGInput> {
  return {
    name: "rag_search",
    description:
      "Semantic search across the codebase. Finds code by concept/meaning rather than exact pattern match. " +
      "Use when you need to understand architecture, find related concepts, or locate code by what it does " +
      "rather than what it's named. Complements grep (pattern matching) and glob (file discovery).",
    parameters: RAGInput,
    isReadOnly: true,

    async call(input: RAGInput, context: ToolUseContext): Promise<ToolResult> {
      const topK = Math.min(input.top_k ?? 5, 20);

      try {
        const results = await retriever.search(input.query, {
          topK,
          filePathFilter: input.file_filter,
        });

        if (results.length === 0) {
          return {
            content: "No semantically relevant code found. Try refining your query or using grep for exact pattern matching.",
          };
        }

        // Format: line-separated code blocks with file paths and scores
        const formatted = results.map((r, i) =>
          `${i + 1}. [Score: ${r.score.toFixed(2)}] ${r.filePath}:${r.startLine}-${r.endLine}\n` +
          `\`\`\`${r.language || ''}\n${r.content}\n\`\`\`\n`
        ).join("\n");

        return { content: formatted };
      } catch (err) {
        return {
          content: `RAG search failed: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    },
  };
}
```

### 8.2 RAGIndexTool — Manual Re-index 🆕

For triggering re-indexing from the agent.

```typescript
// src/tools/RAGIndexTool/RAGIndexTool.ts
import { z } from "zod";
import type { Tool, ToolResult, ToolUseContext } from "../Tool.js";
import type { RetrievalService } from "../../rag/RetrievalService.js";

const RAGIndexInput = z.object({
  paths: z.array(z.string()).optional()
    .describe("Specific file paths or glob patterns to re-index. If omitted, scans entire project."),
  force: z.boolean().optional()
    .describe("Force full re-index even for unchanged files (default: false)"),
});

type RAGIndexInput = z.infer<typeof RAGIndexInput>;

export function createRAGIndexTool(retriever: RetrievalService): Tool<RAGIndexInput> {
  return {
    name: "rag_index",
    description:
      "Re-index files for semantic search. Use when the codebase has changed and you need to " +
      "update the RAG index. Supports selective re-indexing of specific files.",
    parameters: RAGIndexInput,
    isReadOnly: false,  // Side effect: modifies the index

    async call(input: RAGIndexInput, context: ToolUseContext): Promise<ToolResult> {
      try {
        if (input.force) {
          // Full re-index: clear and rebuild
          // ... implementation
          return { content: `Full re-index complete. ${count} documents indexed.` };
        }
        
        if (input.paths) {
          // Selective re-index
          const count = await retriever.indexFiles(input.paths);
          return { content: `Indexed ${count} documents from specified paths.` };
        }
        
        // Default: incremental scan
        const count = await retriever.indexFiles(await scanProjectFiles(process.cwd()));
        return { content: `Incremental index complete. ${count} documents indexed/updated.` };
      } catch (err) {
        return {
          content: `Re-index failed: ${err instanceof Error ? err.message : String(err)}`,
          isError: true,
        };
      }
    },
  };
}
```

---

## 9. Implementation Phases

### Phase 1: Foundation — Embedding Provider + Vector Store (Days 1-2)
**Goal**: Core abstractions work end-to-end with tests.

1. **Create `src/rag/types.ts`**
   - Define `VectorDocument`, `VectorSearchResult`, `CodeChunk`, `RetrievalResult`
   
2. **Create `src/rag/EmbeddingProvider.ts`** and `OpenAIEmbeddingProvider.ts`
   - Interface + OpenAI impl using `fetch` to `/embeddings` endpoint
   - Batch support (send multiple texts in one request)
   - Error handling, retries, timeout
   
3. **Create `src/rag/VectorStore.ts`** and `FlatFileVectorStore.ts`
   - Interface + flat-file JSON implementation
   - Cosine similarity function (pure math in Bun)
   - `load()` / `persist()` to/from `ragIndex/` directory
   - CRUD operations: add, query, delete, deleteByFilePath
   
4. **Create `src/rag/utils.ts`**
   - Cosine similarity function
   - Vector normalization
   - Simple benchmarking helper

**Testing**: Unit tests for cosine similarity, embedding batching, vector store CRUD.

### Phase 2: Chunking — File Scanner + Code Chunker (Days 3-4)
**Goal**: Can ingest files and produce smart chunks.

5. **Create `src/rag/FileScanner.ts`**
   - `scanProjectFiles(root, includePatterns, excludePatterns)`: string[] 
   - Respects `.gitignore` via `bun:fs` or manual filtering
   - Returns file paths sorted by importance (entrypoints first, then utils)
   
6. **Create `src/rag/Chunker.ts`**
   - `CodeChunker` class with language-aware splitting
   - For `.ts`/`.js`: split at function/class boundaries (simple regex-based detection)
   - For all files: split at blank-line paragraphs, cap at `maxChunkSize`
   - Merge small adjacent chunks
   - Include scope context (e.g., `"function runQueryLoop\n\n" + chunkBody`)
   
7. **Create `src/rag/RetrievalService.ts`**
   - Wire together: provider + store + chunker
   - `indexFile(path, content)` → chunk → embed → add to store
   - `search(query)` → embed query → vector query → format results
   - `formatResults()` for system prompt injection

**Testing**: Test chunker output on real codebase files. Verify chunk sizes are reasonable (500-1500 chars). Test retrieval round-trip on this project.

### Phase 3: Service Integration — Index Service + Tool Wiring (Days 5-6)
**Goal**: Index runs as a service, tools are available to agents.

8. **Create `src/rag/IndexService.ts`**
   - Implements `ServiceDefinition`
   - On `start()`: scans and indexes all project files
   - Returns `ServiceHandle` with `stop()` that persists index
   - Phase 2 optional: `chokidar` for incremental file watching
   
9. **Create `src/tools/RAGTool/RAGTool.ts`** and **`src/tools/RAGIndexTool/RAGIndexTool.ts`**
   - Implement both tools per §8 definitions above
   - Register in `init.ts`
   
10. **Wire into `src/entrypoints/init.ts`**
    - Create RAG config, embedding provider, vector store, retrieval service
    - Register and start IndexService via ServiceManager
    - Register RAGTool and RAGIndexTool in ToolRegistry
    - Add to `InitResult` if retriever reference needed in UI

11. **Update `src/types/config.ts`**
    - Add `RAGConfig` interface
    - Add `loadRAGConfig()` helper function
    - Extend `EnvConfigSchema` with RAG env vars

12. **Update `src/hooks/index.ts`**
    - Add `"rag:search"` to `HookPayloads`

13. **Update `src/components/App.tsx`**
    - Add `retriever` to `RuntimeContextValue` and props
    - Pass through from `init.ts`

14. **Update `src/screens/REPL.tsx`**
    - Add `/rag <query>` command handler
    - Add `/index` re-index command

**Testing**: Manual testing — start the app, run `/rag "how does the query loop work"`, verify results are semantically relevant.

### Phase 4: Agent Integration & Optimization (Days 7-8)
**Goal**: Agents benefit from RAG automatically.

15. **Update `src/agents/runAgent.ts`**
    - Pass `retriever` into agent's query loop (optional `ragContext` pre-fetch)
    - Consider: auto-search when agent gets a question that could benefit from semantic search

16. **Update `src/query/queryTypes.ts` and `src/query/query.ts`**
    - Add `ragContext?: string` to `QueryConfig`
    - Inject into system prompt builder

17. **Update default system prompt** in `init.ts`
    - Mention `rag_search` tool in the system prompt
    - Document when to use it vs. `grep`

18. **Add `src/rag/index.ts`** barrel exports

**Testing**: Spawn an agent (e.g., explorer) with a semantic task. Verify it uses `rag_search` and gets relevant results.

### Phase 5: Polish, Persistence, Edge Cases (Day 9+)
19. **Implement index persistence** — robust save/load with corruption recovery
20. **Implement incremental updates** — file hash comparison, only re-embed changed files
21. **Add `--index` CLI flag** in `cli.tsx` for pre-indexing without starting the REPL
22. **Add `IndexStatus` UI component** showing index size, last-updated time
23. **Optional: `LocalEmbeddingProvider`** using `@xenova/transformers`
24. **Add comprehensive tests** — chunker unit tests, retrieval integration tests

---

## 10. Alternatives Considered

### A. Auto-inject RAG context in every query (vs. tool-based retrieval)
**Rejected because**: Would bloat every query with potentially irrelevant context. The current architecture works well with explicit tool calls — the model should decide when semantic search is needed. The `ragContext` field in `QueryConfig` remains available for specific use cases (e.g., pre-fetching for `/query` slash commands).

### B. Use a real vector DB (Chroma, Qdrant, Weaviate)
**Rejected for MVP**: These require external processes/containers, add deployment complexity, and are overkill for single-project indices (~10K chunks max for a medium codebase). A flat-file JSON store with cosine similarity in memory is sufficient. A production upgrade path to Chroma/Qdrant is straightforward since we have the `VectorStore` interface.

### C. Use langchainjs for the entire RAG pipeline
**Rejected**: LangChain adds 150+ transitive dependencies and a heavy abstraction layer. Our RAG needs are simple (embed → store → query), and we can implement it in ~200 LOC with our custom interfaces. This keeps the codebase maintainable and consistent with existing patterns.

### D. Line-per-line document splitting (vs. smart chunking)
**Rejected**: Without respecting code boundaries, chunks will cut across function definitions, making retrieved context harder to understand. Our language-aware chunker that preserves function/class scope is better for code retrieval.

### E. Hybrid search (BM25 + vector similarity)
**Deferred**: BM25 keyword matching would complement semantic search, but adds complexity. `GrepTool` already handles exact keyword search, so semantic search fills a distinct niche. Can revisit for Phase 2+.

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Embedding API costs** for large codebases | Medium | Default `chunkSize` limits total chunks. A 100KB project ~100 chunks = $0.002 at OpenAI prices. Add `maxIndexSize` config. |
| **Index staleness** — code changes between index runs | Medium | Provide `rag_index` tool for manual re-index. Phase 2 adds file watcher for auto-updates. |
| **Cosine similarity on large vectors is slow** | Low | At 10K docs × 1536 dims, a query takes ~10ms in Bun. Use typed arrays for performance. Add topK early-exit optimization for future growth. |
| **Poor chunk quality** at code boundaries | Medium | Language-aware chunker that splits at function/class boundaries. Phase 5 can add AST-based chunking via `tree-sitter` if needed. |
| **Embedding model quality mismatch** (different from chat model's understanding) | Low | Using same provider (OpenAI) ensures embedding and chat model are in the same semantic space. |
| **Index corruption** on crash during persistence | Low | Write index to temp file, then atomically rename. On load failure, rebuild from scratch. |
| **Tool description confusion** — model doesn't know when to use `rag_search` vs `grep` | Medium | Clear tool descriptions with usage guidance. Update system prompt with decision tree. |

### Testing Strategy

- **Unit tests**: Cosine similarity, chunker splitting logic, vector store CRUD, embedding provider batching
- **Integration tests**: Full retrieval round-trip on actual codebase files
- **Manual tests**: Semantic queries expected to return relevant results (e.g., "how are tool calls executed" → `orchestration.ts`; "what is the system prompt builder" → `query.ts` + `init.ts`)
- **Performance tests**: Index time for medium project (~100 files), query latency for 10K documents

### Migration Path

- **Opt-in**: RAG is disabled by default (`RAG_ENABLED=false`). Existing users unaffected.
- **No breaking changes**: All existing tools, query loops, and agents continue to work identically.
- **Index persistence**: First run creates index from scratch. Subsequent runs load persisted index and incrementally update.
- **Rollback**: Remove RAG config/env vars, all RAG code is in `src/rag/` — easy to remove if needed.
