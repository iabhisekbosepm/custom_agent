#!/usr/bin/env bash
#
# custom-agents — Run the Custom Agents AI coding assistant in any project.
#
# Usage:
#   custom-agents            Launch in current directory
#   custom-agents --help     Show help
#   custom-agents --version  Show version
#
# Config resolution order:
#   1. .env in cwd (Bun auto-loads this)
#   2. ~/.custom-agents/config.env (global fallback)
#   3. .env next to this script (development fallback)
#

# ── Resolve the directory where this script (and the project) lives ──
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")")" && pwd)"
GLOBAL_CONFIG="$HOME/.custom-agents/config.env"

# ── Load config ──
# Priority: .env in cwd (Bun handles this) > global config > script-dir .env
if [ -f ".env" ]; then
  # Bun will auto-load .env from cwd — nothing to do
  :
elif [ -f "$GLOBAL_CONFIG" ]; then
  set -a
  source "$GLOBAL_CONFIG"
  set +a
elif [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

# ── Run the app with bun, from the USER's current working directory ──
exec bun run "$SCRIPT_DIR/src/index.ts" "$@"
