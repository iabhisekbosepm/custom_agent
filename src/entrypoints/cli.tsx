import React from "react";
import { render } from "ink";
import { initialize } from "./init.js";
import { App } from "../components/App.js";
import { setLoggerMuted } from "../utils/logger.js";

export const VERSION = "0.1.0";

function printHelp(): void {
  console.log(`
custom-agents v${VERSION}
A custom AI coding assistant runtime

Usage:
  bun run src/index.ts [options]

Options:
  --help, -h     Show this help message
  --version, -v  Show version number

Environment variables (see .env.example):
  OPENAI_API_KEY    API key for OpenAI-compatible service (required)
  OPENAI_BASE_URL   API base URL (default: https://openrouter.ai/api/v1)
  MODEL             Model to use (default: openai/gpt-4o)
  LOG_LEVEL         Log level: debug, info, warn, error (default: info)
  MAX_TURNS         Max tool-use turns per query (default: 20)

Slash commands:
  /explain <code>   Explain code in detail
  /commit           Generate a git commit message
  /status           Show project status
  /find <query>     Find files or code
  /compact          Compact conversation context to free token space
  /diff [file]      Show side-by-side diff of uncommitted changes
`);
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log(VERSION);
    process.exit(0);
  }

  // Mute log output during initialization to keep startup clean
  setLoggerMuted(true);

  // Initialize the runtime (async — sets up persistence dirs)
  const {
    config,
    store,
    registry,
    hooks,
    log,
    abortController,
    memory,
    sessionPersistence,
    sessionId,
    taskManager,
    agentRouter,
    skillRegistry,
  } = await initialize();

  // Launch the Ink app
  const instance = render(
    <App
      store={store}
      config={config}
      registry={registry}
      hooks={hooks}
      log={log}
      abortController={abortController}
      memory={memory}
      sessionPersistence={sessionPersistence}
      sessionId={sessionId}
      taskManager={taskManager}
      agentRouter={agentRouter}
      skillRegistry={skillRegistry}
    />
  );

  // Unmute logs now that the UI is rendering
  setLoggerMuted(false);

  // When Ink unmounts, exit cleanly
  instance.waitUntilExit().then(() => {
    log.info("UI exited");
    process.exit(0);
  });
}
