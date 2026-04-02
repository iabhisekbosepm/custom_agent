import type { SkillDefinition } from "./index.js";

export const ExplainSkill: SkillDefinition = {
  name: "explain",
  description: "Explain code in detail",
  type: "prompt",
  promptTemplate:
    "Explain the following code in detail. Cover what it does, how it works, and any notable patterns or potential issues.\n\n{{input}}",
  userInvocable: true,
};

export const CommitSkill: SkillDefinition = {
  name: "commit",
  description: "Generate a git commit message for staged changes",
  type: "prompt",
  promptTemplate:
    'Run `git diff --cached` to see the staged changes, then write a concise commit message following conventional commits format. If nothing is staged, run `git diff` and suggest what to stage.\n\n{{input}}',
  requiredTools: ["shell"],
  userInvocable: true,
};

export const StatusSkill: SkillDefinition = {
  name: "status",
  description: "Show project status (git, running tasks, session info)",
  type: "prompt",
  promptTemplate:
    "Give a brief project status. Run `git status` and `git log --oneline -5` to show recent activity. Summarize what's going on.\n\n{{input}}",
  requiredTools: ["shell"],
  userInvocable: true,
};

export const FindSkill: SkillDefinition = {
  name: "find",
  description: "Find files or code in the project",
  type: "prompt",
  promptTemplate:
    "Find the following in this codebase. Use glob to find files by name and grep to search file contents. Be thorough but concise.\n\n{{input}}",
  requiredTools: ["grep", "glob"],
  userInvocable: true,
};

export const CompactSkill: SkillDefinition = {
  name: "compact",
  description: "Compact conversation context to free up token space",
  type: "tool",
  userInvocable: true,
};

export const DiffSkill: SkillDefinition = {
  name: "diff",
  description: "Show side-by-side diff of uncommitted changes",
  type: "tool",
  userInvocable: true,
};

export const BriefSkill: SkillDefinition = {
  name: "brief",
  description: "Toggle brief/compact output mode",
  type: "prompt",
  promptTemplate:
    "Toggle brief mode using the brief_toggle tool. If the user provided a preference, pass it as the enable parameter: {{input}}",
  requiredTools: ["brief_toggle"],
  userInvocable: true,
};

export const PlanSkill: SkillDefinition = {
  name: "plan",
  description: "Enter planning mode to explore before implementing",
  type: "prompt",
  promptTemplate:
    "Enter plan mode using the enter_plan_mode tool. Use the following as the plan description: {{input}}",
  requiredTools: ["enter_plan_mode"],
  userInvocable: true,
};

export const AgentSkill: SkillDefinition = {
  name: "agent",
  description: "Create a custom agent from a natural language description",
  type: "prompt",
  promptTemplate: `The user wants to create a custom agent. Based on their description below, generate an appropriate agent definition and call the agent_create tool.

Guidelines for generating the agent definition:
- **name**: Derive a short, lowercase, hyphenated name (e.g., "test-runner", "doc-writer")
- **description**: Concise 1-2 sentence summary
- **systemPrompt**: Detailed prompt defining the agent's role, workflow, and constraints
- **allowedTools**: Minimal set needed. Available: grep, glob, file_read, file_write, file_edit, shell
  - Read-only tasks: ["grep", "glob", "file_read"]
  - Code modification: ["grep", "glob", "file_read", "file_write", "file_edit"]
  - Shell needed (tests, builds, git): add "shell"
- **maxTurns**: Simple=5-8, Medium=10-15, Complex=15-25
- **mode**: Almost always "sync"

User description: {{input}}

Now call the agent_create tool with the generated definition.`,
  requiredTools: ["agent_create"],
  userInvocable: true,
};

export const builtinSkills: SkillDefinition[] = [
  ExplainSkill,
  CommitSkill,
  StatusSkill,
  FindSkill,
  CompactSkill,
  DiffSkill,
  BriefSkill,
  PlanSkill,
  AgentSkill,
];
