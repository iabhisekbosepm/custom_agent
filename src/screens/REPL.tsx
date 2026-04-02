import React, { useCallback } from "react";
import { Box, Text } from "ink";
import { useAppState } from "../state/AppState.js";
import type { AppStateStore } from "../state/AppStateStore.js";
import type { UserMessage } from "../types/messages.js";
import { useRuntime } from "../components/App.js";
import { InputBar } from "../components/InputBar.js";
import { MessageList } from "../components/MessageList.js";
import { ActivityDisplay } from "../components/ActivityDisplay.js";
import { DiffDisplay } from "../components/DiffDisplay.js";
import { runQueryLoop } from "../query/query.js";
import { compactMessages, estimateMessageTokens } from "../query/compaction.js";
import { computeSideBySideDiff, type DiffResult } from "../utils/diff.js";
import { resolveFileReferences } from "../utils/fileResolver.js";
import { VERSION } from "../entrypoints/cli.js";

interface REPLProps {
  store: AppStateStore;
}

export function REPL({ store }: REPLProps) {
  const state = useAppState();
  const {
    config,
    registry,
    hooks,
    log,
    abortController,
    memory,
    sessionPersistence,
    sessionId,
    skillRegistry,
  } = useRuntime();

  const handleDiff = useCallback(
    async (arg: string) => {
      try {
        // Check if we're in a git repo
        const gitCheck = Bun.spawn(["git", "rev-parse", "--is-inside-work-tree"], {
          stdout: "pipe",
          stderr: "pipe",
        });
        const gitCheckExit = await gitCheck.exited;
        if (gitCheckExit !== 0) {
          store.set((s) => ({
            ...s,
            messages: [
              ...s.messages,
              { role: "system" as const, content: "[/diff: Not a git repository]" },
            ],
          }));
          return;
        }

        if (arg) {
          // Single file diff
          const file = Bun.file(arg);
          if (!(await file.exists())) {
            store.set((s) => ({
              ...s,
              messages: [
                ...s.messages,
                { role: "system" as const, content: `[/diff: File not found: ${arg}]` },
              ],
            }));
            return;
          }

          const currentContent = await file.text();

          // Get HEAD version
          const gitShow = Bun.spawn(["git", "show", `HEAD:${arg}`], {
            stdout: "pipe",
            stderr: "pipe",
          });
          const oldContent = await new Response(gitShow.stdout).text();
          const gitShowExit = await gitShow.exited;

          const baseContent = gitShowExit === 0 ? oldContent : "";
          if (baseContent === currentContent) {
            store.set((s) => ({
              ...s,
              messages: [
                ...s.messages,
                { role: "system" as const, content: `[/diff: No changes in ${arg}]` },
              ],
            }));
            return;
          }

          const diff = computeSideBySideDiff(arg, baseContent, currentContent);
          store.set((s) => ({
            ...s,
            pendingDiffs: [...s.pendingDiffs, diff],
            focusOwner: "diffViewer",
          }));
        } else {
          // All changed files
          const proc = Bun.spawn(["git", "diff", "--name-only"], {
            stdout: "pipe",
            stderr: "pipe",
          });
          const output = await new Response(proc.stdout).text();
          await proc.exited;

          const files = output.trim().split("\n").filter(Boolean);
          if (files.length === 0) {
            store.set((s) => ({
              ...s,
              messages: [
                ...s.messages,
                { role: "system" as const, content: "[/diff: No uncommitted changes]" },
              ],
            }));
            return;
          }

          const diffs: DiffResult[] = [];
          for (const filePath of files) {
            const gitShow = Bun.spawn(["git", "show", `HEAD:${filePath}`], {
              stdout: "pipe",
              stderr: "pipe",
            });
            const oldContent = await new Response(gitShow.stdout).text();
            await gitShow.exited;

            const currentFile = Bun.file(filePath);
            const currentContent = (await currentFile.exists())
              ? await currentFile.text()
              : "";

            diffs.push(computeSideBySideDiff(filePath, oldContent, currentContent));
          }

          store.set((s) => ({
            ...s,
            pendingDiffs: [...s.pendingDiffs, ...diffs],
            focusOwner: "diffViewer",
          }));
        }
      } catch (err) {
        log.error("/diff failed", { error: String(err) });
        store.set((s) => ({
          ...s,
          messages: [
            ...s.messages,
            {
              role: "system" as const,
              content: `[/diff error: ${err instanceof Error ? err.message : String(err)}]`,
            },
          ],
        }));
      }
    },
    [store, log]
  );

  const handleSubmit = useCallback(
    (text: string) => {
      // Handle /compact as a direct action (no LLM call)
      if (text.trim() === "/compact") {
        const currentMessages = store.get().messages;
        const beforeTokens = estimateMessageTokens(currentMessages);

        compactMessages(
          currentMessages,
          { contextBudget: config.contextBudget, force: true },
          hooks,
          log.child("compact")
        )
          .then((result) => {
            if (result.didCompact) {
              store.set((s) => ({
                ...s,
                messages: [
                  ...result.messages,
                  {
                    role: "system" as const,
                    content: `[Compacted: ~${beforeTokens} → ~${result.compactedTokens} tokens | ${result.removedMessages} messages removed | strategy: ${result.strategy}]`,
                  },
                ],
              }));
            } else {
              store.set((s) => ({
                ...s,
                messages: [
                  ...s.messages,
                  {
                    role: "system" as const,
                    content: `[Nothing to compact — conversation is ~${beforeTokens} tokens]`,
                  },
                ],
              }));
            }
          })
          .catch((err) => {
            log.error("Compact failed", { error: String(err) });
          });
        return;
      }

      // Handle /diff as a direct action (no LLM call)
      if (text.trim() === "/diff" || text.trim().startsWith("/diff ")) {
        const arg = text.trim().slice("/diff".length).trim();
        handleDiff(arg);
        return;
      }

      let userContent = text;

      // Handle slash commands — expand via SkillRegistry
      if (text.startsWith("/")) {
        const spaceIdx = text.indexOf(" ");
        const skillName = spaceIdx === -1 ? text.slice(1) : text.slice(1, spaceIdx);
        const skillInput = spaceIdx === -1 ? "" : text.slice(spaceIdx + 1);

        const expanded = skillRegistry.expand(skillName, skillInput);
        if (expanded) {
          userContent = expanded;
        } else {
          // Unknown skill — list available ones
          const available = skillRegistry
            .list()
            .filter((s) => s.userInvocable)
            .map((s) => `/${s.name} — ${s.description}`)
            .join("\n");
          userContent = `Unknown command "${text}". Available commands:\n${available}\n\nPlease let the user know these commands are available.`;
        }
      }

      // Show original text (with @tokens) immediately in message list
      const displayMsg: UserMessage = { role: "user", content: userContent };
      store.set((s) => ({
        ...s,
        messages: [...s.messages, displayMsg],
      }));

      // Resolve @ file references, then run query loop with expanded content
      const cwd = process.cwd();
      resolveFileReferences(userContent, cwd)
        .then(async ({ expandedText }) => {
          // If references were expanded, update the last user message for the LLM
          if (expandedText !== userContent) {
            store.set((s) => {
              const msgs = [...s.messages];
              // Find the last user message we just added and replace its content for LLM
              for (let i = msgs.length - 1; i >= 0; i--) {
                if (msgs[i].role === "user" && msgs[i].content === userContent) {
                  msgs[i] = { ...msgs[i], content: expandedText };
                  break;
                }
              }
              return { ...s, messages: msgs };
            });
          }

          const currentMessages = store.get().messages;
          const memoryContext = await memory.buildContext(["project", "user"]);
          await runQueryLoop(currentMessages, {
            config,
            registry,
            hooks,
            getAppState: store.get,
            setAppState: store.set,
            abortSignal: abortController.signal,
            log: log.child("query"),
            memoryContext: memoryContext || undefined,
          });

          // Save transcript after each completed query
          const finalMessages = store.get().messages;
          await sessionPersistence.save(sessionId, finalMessages, config.model);
        })
        .catch((err) => {
          log.error("Query loop unexpected error", {
            error: String(err),
          });
        });
    },
    [config, registry, hooks, store, log, abortController, memory, sessionPersistence, sessionId, skillRegistry]
  );

  const isBusy = state.inputMode === "busy" || state.focusOwner !== "input";

  // Build box-drawn header
  const titleLine = `Custom Agents v${VERSION}`;
  const modelLine = `model: ${state.model}`;
  const cwdLine = `cwd: ${process.cwd().replace(new RegExp(`^${process.env.HOME || ""}`), "~")}`;
  const lines = [titleLine, modelLine, cwdLine];
  const maxLen = Math.max(...lines.map((l) => l.length));
  const pad = (s: string) => s + " ".repeat(maxLen - s.length);
  const top = `╭${"─".repeat(maxLen + 4)}╮`;
  const bot = `╰${"─".repeat(maxLen + 4)}╯`;

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text>{top}</Text>
        <Text>
          {"│  "}
          <Text color="cyan" bold>{pad(titleLine)}</Text>
          {"  │"}
        </Text>
        <Text dimColor>
          {"│  "}
          {pad(modelLine)}
          {"  │"}
        </Text>
        <Text dimColor>
          {"│  "}
          {pad(cwdLine)}
          {"  │"}
        </Text>
        <Text>{bot}</Text>
      </Box>

      {!isBusy && state.messages.length === 0 && (
        <Box marginBottom={1}>
          <Text dimColor>
            {"  Tip: Use @file to reference files \u00b7 /help for commands \u00b7 Esc to cancel"}
          </Text>
        </Box>
      )}

      <MessageList messages={state.messages} />

      <ActivityDisplay />

      <DiffDisplay />

      {state.lastError && (
        <Box>
          <Text color="red">Error: {state.lastError}</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <InputBar disabled={isBusy} onSubmit={handleSubmit} />
      </Box>
    </Box>
  );
}
