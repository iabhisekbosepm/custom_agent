#!/usr/bin/env bash
#
# install.sh — Install CustomAgents CLI from GitHub.
#
# One-liner install:
#   curl -fsSL https://raw.githubusercontent.com/iabhisekbosepm/custom_agent/main/install.sh | bash
#
# Usage:
#   curl ... | bash               Full install
#   curl ... | bash -s -- --update Re-copy source + reinstall deps (keeps config)
#   bash install.sh               Run locally (if you have the repo cloned)
#   bash install.sh --update      Update existing installation
#
# Author: Abhisek Bose
#

set -euo pipefail

# ── Configuration ──
REPO_URL="https://github.com/iabhisekbosepm/custom_agent.git"
INSTALL_DIR="$HOME/.custom-agents-cli"
CONFIG_DIR="$HOME/.custom-agents"
CONFIG_FILE="$CONFIG_DIR/config.env"
BIN_DIR="$HOME/.local/bin"
LAUNCHER="$BIN_DIR/custom-agents"

UPDATE_ONLY=false
if [[ "${1:-}" == "--update" ]]; then
  UPDATE_ONLY=true
fi

echo ""
echo "  CustomAgents CLI Installer"
echo "  =========================="
echo ""

# ── 1. Check for git ──
if ! command -v git &>/dev/null; then
  echo "ERROR: git is required but not installed."
  echo "Install git first: https://git-scm.com/downloads"
  exit 1
fi

# ── 2. Check for bun (auto-install if missing) ──
if ! command -v bun &>/dev/null; then
  echo "bun is not installed. Installing bun..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  if ! command -v bun &>/dev/null; then
    echo "ERROR: bun installation failed. Please install bun manually: https://bun.sh"
    exit 1
  fi
  echo "bun installed successfully."
fi

# ── 3. Download source from GitHub ──
if [[ -d "$INSTALL_DIR/.git" ]]; then
  echo "Updating source in $INSTALL_DIR..."
  git -C "$INSTALL_DIR" fetch --all --quiet
  git -C "$INSTALL_DIR" reset --hard origin/main --quiet
else
  echo "Downloading CustomAgents to $INSTALL_DIR..."
  rm -rf "$INSTALL_DIR"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" --quiet
fi
echo "Source ready."

# ── 4. Install dependencies ──
echo "Installing dependencies..."
(cd "$INSTALL_DIR" && bun install)
echo "Dependencies installed."

# ── 5. Create global config (skip on --update if config already exists) ──
if [[ "$UPDATE_ONLY" == true && -f "$CONFIG_FILE" ]]; then
  echo "Config exists at $CONFIG_FILE — keeping existing config."
else
  mkdir -p "$CONFIG_DIR"

  if [[ -f "$CONFIG_FILE" ]]; then
    echo ""
    echo "Config already exists at $CONFIG_FILE."
    read -rp "Overwrite it? [y/N] " overwrite
    overwrite="$(printf '%s' "$overwrite" | tr '[:upper:]' '[:lower:]')"
    if [[ "$overwrite" != "y" ]]; then
      echo "Keeping existing config."
    else
      _write_config=true
    fi
  else
    _write_config=true
  fi

  if [[ "${_write_config:-}" == "true" ]]; then
    echo ""
    echo "── Configure CustomAgents ──"
    echo ""

    read -rp "OpenAI API key (or OpenRouter key): " api_key
    if [[ -z "$api_key" ]]; then
      echo "WARNING: No API key provided. You can set it later in $CONFIG_FILE"
      api_key="sk-your-key-here"
    fi

    read -rp "API base URL [https://openrouter.ai/api/v1]: " base_url
    base_url="${base_url:-https://openrouter.ai/api/v1}"

    read -rp "Model [openrouter/auto]: " model
    model="${model:-openrouter/auto}"

    cat > "$CONFIG_FILE" <<EOF
# CustomAgents global configuration
OPENAI_API_KEY=$api_key
OPENAI_BASE_URL=$base_url
MODEL=$model
LOG_LEVEL=info
MAX_TURNS=20
CONTEXT_BUDGET=120000
EOF
    echo "Config written to $CONFIG_FILE"
  fi
fi

# ── 6. Write launcher to ~/.local/bin/custom-agents ──
mkdir -p "$BIN_DIR"
cat > "$LAUNCHER" <<'LAUNCHER_SCRIPT'
#!/usr/bin/env bash
#
# custom-agents — Launch the CustomAgents AI coding assistant.
#
# Loads config from:
#   1. .env in cwd (if present — Bun auto-loads it)
#   2. ~/.custom-agents/config.env (global fallback)
#

INSTALL_DIR="$HOME/.custom-agents-cli"
CONFIG_FILE="$HOME/.custom-agents/config.env"

# If no local .env, source the global config so env vars are set
if [[ ! -f ".env" && -f "$CONFIG_FILE" ]]; then
  set -a
  source "$CONFIG_FILE"
  set +a
fi

exec bun run "$INSTALL_DIR/src/index.ts" "$@"
LAUNCHER_SCRIPT
chmod +x "$LAUNCHER"
echo "Launcher installed at $LAUNCHER"

# ── 7. Ensure ~/.local/bin is in PATH ──
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo ""
  echo "Adding $BIN_DIR to PATH..."

  shell_rc=""
  case "$(basename "${SHELL:-bash}")" in
    zsh)  shell_rc="$HOME/.zshrc" ;;
    bash)
      if [[ -f "$HOME/.bash_profile" ]]; then
        shell_rc="$HOME/.bash_profile"
      else
        shell_rc="$HOME/.bashrc"
      fi
      ;;
    *)    shell_rc="$HOME/.profile" ;;
  esac

  if [[ -n "$shell_rc" ]]; then
    if ! grep -q 'CustomAgents CLI' "$shell_rc" 2>/dev/null; then
      echo '' >> "$shell_rc"
      echo '# CustomAgents CLI' >> "$shell_rc"
      echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$shell_rc"
      echo "Added PATH entry to $shell_rc"
    fi
  fi

  export PATH="$BIN_DIR:$PATH"
fi

# ── 8. Done ──
VERSION="$(grep '"version"' "$INSTALL_DIR/package.json" | head -1 | sed 's/.*: "//;s/".*//')"
echo ""
echo "CustomAgents v${VERSION} installed successfully!"
echo ""
echo "  Source:   $INSTALL_DIR"
echo "  Config:   $CONFIG_FILE"
echo "  Command:  $LAUNCHER"
echo ""
echo "Usage:"
echo "  custom-agents            Launch in current directory"
echo "  custom-agents --version  Show version"
echo "  custom-agents --help     Show help"
echo ""
echo "Update:     curl -fsSL https://raw.githubusercontent.com/iabhisekbosepm/custom_agent/main/install.sh | bash -s -- --update"
echo "Uninstall:  curl -fsSL https://raw.githubusercontent.com/iabhisekbosepm/custom_agent/main/uninstall.sh | bash"
echo ""
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo "NOTE: Restart your shell or run:  source ${shell_rc:-~/.profile}"
fi
