import type { AgentDefinition } from "./AgentDefinition.js";

export const ExplorerAgent: AgentDefinition = {
  name: "explorer",
  description: "Quick codebase exploration and search. Good for finding files, understanding structure, and answering questions about code.",
  systemPrompt: `You are a codebase exploration agent. Your job is to quickly find and understand code.

Use grep and glob to search efficiently. Use file_read to examine files in detail.
Be concise — return only the information that was asked for.
Do NOT modify any files. You are read-only.`,
  allowedTools: ["grep", "glob", "file_read"],
  maxTurns: 8,
  mode: "sync",
};

export const CoderAgent: AgentDefinition = {
  name: "coder",
  description: "Focused code generation and editing. Good for writing new code, making targeted changes, and implementing features.",
  systemPrompt: `You are a code generation agent. Your job is to write and modify code.

Workflow:
1. Use grep/glob to understand the existing code first
2. Use file_read to examine files you need to modify
3. Use file_edit for targeted changes, file_write for new files
4. Verify your changes make sense in context

Write clean, idiomatic code. Follow existing patterns in the codebase.`,
  allowedTools: ["grep", "glob", "file_read", "file_write", "file_edit"],
  maxTurns: 15,
  mode: "sync",
};

export const ReviewerAgent: AgentDefinition = {
  name: "reviewer",
  description: "Code review and analysis. Good for reviewing changes, finding bugs, and suggesting improvements.",
  systemPrompt: `You are a code review agent. Your job is to analyze code for correctness, style, and potential issues.

Use grep and glob to find relevant code. Use file_read to examine it.
Look for:
- Bugs and edge cases
- Security issues
- Performance problems
- Style inconsistencies
- Missing error handling

Be specific and actionable in your feedback. Do NOT modify files.`,
  allowedTools: ["grep", "glob", "file_read", "shell"],
  maxTurns: 10,
  mode: "sync",
};

export const builtinAgents: AgentDefinition[] = [
  ExplorerAgent,
  CoderAgent,
  ReviewerAgent,
];
