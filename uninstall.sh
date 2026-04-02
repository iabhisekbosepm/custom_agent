#!/usr/bin/env bash
#
# uninstall.sh — Remove the CustomAgents CLI installation.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/iabhisekbosepm/custom_agent/main/uninstall.sh | bash
#   bash uninstall.sh
#
# Author: Abhisek Bose
#

set -euo pipefail

INSTALL_DIR="$HOME/.custom-agents-cli"
CONFIG_DIR="$HOME/.custom-agents"
LAUNCHER="$HOME/.local/bin/custom-agents"

echo ""
echo "  CustomAgents CLI Uninstaller"
echo "  ============================"
echo ""

# ── Remove installed source ──
if [[ -d "$INSTALL_DIR" ]]; then
  echo "Removing $INSTALL_DIR..."
  rm -rf "$INSTALL_DIR"
  echo "  Removed."
else
  echo "$INSTALL_DIR does not exist — skipping."
fi

# ── Remove launcher ──
if [[ -f "$LAUNCHER" ]]; then
  echo "Removing $LAUNCHER..."
  rm -f "$LAUNCHER"
  echo "  Removed."
else
  echo "$LAUNCHER does not exist — skipping."
fi

# ── Ask before removing user config/data ──
if [[ -d "$CONFIG_DIR" ]]; then
  echo ""
  echo "$CONFIG_DIR contains your config and project data."
  read -rp "Delete it? [y/N] " confirm </dev/tty
  confirm="$(printf '%s' "$confirm" | tr '[:upper:]' '[:lower:]')"
  if [[ "$confirm" == "y" ]]; then
    rm -rf "$CONFIG_DIR"
    echo "  Removed."
  else
    echo "  Kept."
  fi
fi

echo ""
echo "CustomAgents has been uninstalled."
echo ""
echo "NOTE: The PATH entry in your shell rc file was not removed."
echo "You can manually remove the 'CustomAgents CLI' line from your shell config."
