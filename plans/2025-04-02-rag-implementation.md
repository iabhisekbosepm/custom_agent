# RAG Implementation Plan for CustomAgents

## Context & Current State Summary

### Codebase Architecture
CustomAgents is a terminal-based AI coding assistant built on Bun + TypeScript with React/Ink for TUI. The key architectural pillars are:

| Layer | Key Abstraction | Pattern |
|-------|----------------|---------|
| **Tools** | `Tool<TInput>` interface + `ToolRegistry` | Factory/registry with Zod schemas |
| **Agents** | `AgentDefinition` + `AgentRouter` | Registry with system prompts |
| **Query** | `runQueryLoop` → `streamChatCompletion` | Tool-use loop with OpenAI-compatible API |
| **Memory** | `MemoryStore` (file-based K/V) | Scoped: project/user/session |
| **Services** | `ServiceDefinition` + `ServiceManager` | Start/stop lifecycle |
| **Hooks** | `HookManager` with typed `HookPayloads` | Fire-and-forget event system |
| **Config** | `AppConfig` built from `.env` | Passed through context |
| **State** | `AppStateStore` with immutable updates | Reactive state management |

### Existing Capabilities That Support RAG
- **Embedding infrastructure**: The `streamChatCompletion` already talks OpenAI-compatible API — same provider can generate embeddings via `/embeddings` endpoint
- **Codebase scanning**: `GrepTool` + `GlobTool` already do file discovery; patterns can be reused for ingestion
- **Memory injection pattern**: `runQueryLoop` already accepts `memoryContext` and appends it to the system prompt — identical pattern for RAG context injection
- **Service lifecycle**: `ServiceManager` can manage background indexing/rebuilding
- **Compaction patterns**: Token estimation and truncation strategies already exist in `compaction.ts`

### What's MISSING (Built from Scratch)
There is **zero** vector/embedding/search infrastructure in the codebase. No embeddings, no chunking, no vector store, no semantic search, no index files — nothing.

---

## Proposed Approach

RAG in this codebase requires two parallel subsystems:

### Subsystem A: RAG Indexing (Build side)
1. **Document Chunker** — splits files into overlapping chunks with metadata
2. **Embedding Generator** — calls OpenAI-compatible API for vector embeddings
3. **Vector Store** — file-backed in-memory vector index with persistence
4. **Index Manager Service** — background service to build/update/invalidate
5. **File Watcher** — detects changes and triggers partial re-indexing

### Subsystem B: RAG Query (Retrieval side)
6. **Semantic Search Tool** — new tool (`semantic_search`) for querying the index
7. **RAG Context Injector** — injects retrieved chunks into the query loop
8. **RAG Skill** — `/rag` skill for user-initiated retrieval

### Design Principles
- **Zero heavy dependencies** — avoid LangChain, embedding libraries. Use `fetch` for embeddings, simple cosine similarity math.
- **Follow existing patterns** — Zod schemas, Tool interface, Service lifecycle, Registry pattern.
- **File-backed but in-memory at runtime** — like `MemoryStore`, persist to `.custom-agents/rag/` with in-memory cache.
- **Non-blocking** — indexing runs as a Service, query tools are synchronous.
- **Configurable** — chunk size, embedding model, k-retrieval count all via env/config.

---

## Alternatives Considered

### Alternative 1: Use a local vector DB (ChromaDB/LanceDB)
❌ **Rejected**: Adds heavy native dependencies. This project has zero native deps today.

### Alternative 2: Use an existing RAG framework (LangChain, LlamaIndex)
❌ **Rejected**: Way too heavy, doesn't fit the lightweight philosophy, would require rewriting core patterns.

### Alternative 3: Cloud vector API (Pinecone, Weaviate)
❌ **Rejected**: Introduces external service dependency and API key. The project keeps things local.

### Alternative 4: Pure BM25/text search (no embeddings)
⚠️ **Partially valid**: `grep` already exists for exact matching. BM25 would add limited value over what grep does. Embeddings provide the semantic search that grep can't.

### Alternative 5: Server-sent embeddings from same OpenAI-compatible provider
✅ **Chosen**: Same API endpoint can generate text embeddings (`/embeddings`). No new infrastructure needed. Cosine similarity is O(n*d) and perfectly fine for <10K chunks in a single project.

---

## Implementation Plan

### Phase 1: RAG Types & Configuration

**Files to create/modify:**

1. **`src/rag/types.ts`** (NEW) — Core RAG type definitions
   - `Embedding` — float[] with dim info
   - `Chunk` — id, filePath, content, embedding, metadata (startLine, endLine, language)
   - `ChunkMetadata` — file-level and chunk-level metadata
   - `IndexInfo` — index stats (chunk count, files indexed, last rebuild time)
   - `RagConfig` — embedding model, chunk size, overlap, k-retrieval, index path

2. **`src/types/config.ts`** (MODIFY) — Extend `EnvConfigSchema` and `AppConfig` with RAG fields:
   ```typescript
   // Add to EnvConfigSchema:
   EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
   EMBEDDING_DIM: z.coerce.number().default(1536),
   RAG_CHUNK_SIZE: z.coerce.number().default(500),
   RAG_OVERLAP: z.coerce.number().default(100),
   RAG_K: z.coerce.number().default(5),
   ```

### Phase 2: Document Chunker

3. **`src/rag/chunker.ts`** (NEW) — File-to-chunk pipeline
   - `chunkFile(filePath, config)` → `Chunk[]`
   - Language-aware splitting (respect function/class boundaries for TS/JS/Python)
   - Simple fallback: line-based chunking with overlap
   - Metadata extraction (language from extension, start/end lines)
   - Use configurable `RAG_CHUNK_SIZE` (chars) and `RAG_OVERLAP`

### Phase 3: Embedding Generator

4. **`src/rag/embedding.ts`** (NEW) — OpenAI-compatible embedding API client
   - `generateEmbedding(text, config)` → `float[]`
   - `generateBatchEmbeddings(texts, config)` → `float[][]` (batch for efficiency)
   - Uses `fetch` to `${baseUrl}/embeddings` with same API key
   - Error handling for API failures with retry logic
   - Dimension validation against `EMBEDDING_DIM`

### Phase 4: Vector Store

5. **`src/rag/vectorStore.ts`** (NEW) — File-backed in-memory vector index
   - Cosine similarity implementation
   - `add(chunks: Chunk[])`, `query(vector: float[], k: number)`, `remove(filePatterns)`, `rebuild(filePaths)`, `persist()`, `load()`
   - In-memory for fast queries, persisted to `.custom-agents/rag/index.json`
   - Serialization: store vectors as arrays of numbers
   - Include `IndexInfo` for metadata about the index state

### Phase 5: Index Manager Service

6. **`src/rag/indexManager.ts`** (NEW) — `IndexManager` class (not a Service yet)
   - Orchestrates: detect files → chunk → embed → store
   - `buildIndex()` — full rebuild over configured paths
   - `updateIndex()` — incremental update (only changed files since last build)
   - Track file hashes (MD5 of content) for change detection
   - Progress reporting via callbacks for UI updates

7. **`src/rag/RagIndexService.ts`** (NEW) — Wraps `IndexManager` as a `ServiceDefinition`
   - On `start()`: load existing index, optionally rebuild or incremental update
   - On `stop()`: persist index to disk
   - Register with `ServiceManager` in `init.ts`
   - Auto-build on startup if no index exists

### Phase 6: Semantic Search Tool

8. **`src/tools/SemanticSearchTool/SemanticSearchTool.ts`** (NEW) — New tool
   - Factory function: `createSemanticSearchTool(vectorStore, ragConfig)`
   - Parameters via Zod: `{ query: string, k?: number, fileFilter?: string }`
   - On call: embed the query → top-k cosine similarity → return formatted chunks
   - Result format: `"Found ${n} matches:\n\n--- ${file}:${lines} ---\n${content}\n\n..."`
   - `isReadOnly: true`
   - Register in `init.ts` after vector store is available

### Phase 7: RAG Context Integration into Query Loop

9. **`src/rag/contextInjector.ts`** (NEW) — Automatic RAG context injection
   - `injectRagContext(query, messages, vectorStore, config)` → enriched system message
   - On each query: automatically perform semantic search on the user's question
   - Inject top-k chunks as a "Context" section in the system prompt (similar to how memoryContext works)
   - Add hook `rag:retrieval` to `HookPayloads` for observability:
     ```typescript
     "rag:retrieval": { query: string; chunksFound: number; topFiles: string[] }
     ```

10. **`src/query/query.ts`** (MODIFY) — Integrate RAG context into query loop
    - Add `vectorStore?: VectorStore` field to `QueryConfig`
    - In the main loop, before LLM call, if vectorStore exists: call `contextInjector` and prepend results to system prompt
    - Follow exact same pattern as the existing `memoryContext` injection

### Phase 8: RAG Skill & CLI Commands

11. **`src/skills/builtinSkills.ts`** (MODIFY) — Add `/rag` skill
    - Type: "prompt"
    - Prompt template: "Search the codebase index for information about: {{input}}. Use semantic_search to find relevant code."
    - Required tools: ["semantic_search"]

12. **`src/skills/index.ts`** (MODIFY) — Export updated skills if needed

### Phase 9: Wiring It All Together

13. **`src/entrypoints/init.ts`** (MODIFY) — Wire up RAG subsystem
    - Import `VectorStore`, `IndexManager`, `RagIndexService`
    - Create `VectorStore` instance with path `.custom-agents/rag/`
    - Create `RagIndexService` and register with `ServiceManager`
    - Create `createSemanticSearchTool(vectorStore, ragConfig)` and register in registry
    - Extend `InitResult` to include `vectorStore` and `ragConfig`
    - Update `DEFAULT_SYSTEM_PROMPT` to mention `semantic_search`

14. **`src/components/App.tsx`** & **`src/screens/REPL.tsx`** (MODIFY) — Pass vectorStore through runtime
    - Add `vectorStore` to `RuntimeContextValue`
    - Pass it through to REPL and then into `runQueryLoop`

### Phase 10: Edge Cases & Polish

15. **`src/rag/config.ts`** (NEW) — Build RAG config from env (parallel to `env.ts` utility)
    - Read from `process.env` or fallback to defaults
    - Validate embedding dimension matches the model

16. **Testing** — Colocate tests next to each module (follow existing pattern):
    - `src/rag/chunker.test.ts` — Test chunk boundaries, overlap, language detection
    - `src/rag/vectorStore.test.ts` — Test cosine similarity, add/query/remove
    - `src/rag/embedding.test.ts` — Mock fetch, test batch behavior

---

## File Structure After Implementation

```
src/rag/
├── types.ts              # RAG types and interfaces
├── config.ts             # RAG-specific config building
├── chunker.ts            # File-to-chunk splitting
├── chunker.test.ts
├── embedding.ts          # OpenAI embedding API client
├── vectorStore.ts        # In-memory cosine-similarity vector store
├── vectorStore.test.ts
├── indexManager.ts       # Build/update/invalidate orchestration
├── contextInjector.ts    # Automatic RAG context injection into queries
└── RagIndexService.ts    # Background service lifecycle wrapper

src/tools/SemanticSearchTool/
└── SemanticSearchTool.ts # Tool for querying the vector store
```

## New Dependencies

**None required.** All RAG functionality can be implemented with:
- Bun's `fetch` for embedding API
- Native `Math` for cosine similarity
- Bun's filesystem APIs for persistence
- Existing Zod for schemas
- Node's `crypto` for file hashing (or Bun's `Bun.file` + comparison)

## Risk & Considerations

### Risks
1. **Embedding API rate limits** — Many OpenAI-compatible providers don't expose /embeddings endpoint, or rate-limit it heavily. The `EMBEDDING_MODEL` config lets users switch.
2. **Index size** — For large codebases, in-memory arrays of 1536-dim vectors × 10K chunks = ~60MB. Acceptable for this project.
3. **Cold start time** — Building index on startup for a large project could take time. Solution: incremental builds, persist index between sessions, show progress.
4. **Context window overflow** — Injected RAG chunks + existing context could push over budget. Mitigation: the existing compaction system handles this automatically.

### Testing Strategy
- Unit test each component in isolation (chunker, vectorStore math, embedding formatting)
- Mock `fetch` for embedding API in tests (use standard `Response` mock)
- Integration test: full build → query cycle with mock vectors

### Migration Path
- Start with Phase 1-6 to get semantic search tool working standalone
- Phase 7-9 add automatic injection (the "auto-RAG" behavior)
- Phase 10 adds polish (skills, UI, config)
- All phases are additive — no breaking changes to existing code

### Future Extensions
- **Multi-codebase indexing**: Index multiple project directories
- **Cross-file chunking**: Smarter chunk boundaries for code (function-level)
- **Hybrid search**: Combine BM25 (grep) scores with cosine similarity
- **Reranking**: LLM-based reranking of top-K results for better precision
- **MCP integration**: Expose vector store as an MCP server for external tools
