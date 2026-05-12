#!/usr/bin/env bash
# gstack-gbrain bootstrap
# Installs gstack into ~/.claude/skills/gstack and gbrain as a global CLI.
# Idempotent: safe to re-run after a pull or submodule update.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

bold()   { printf '\033[1m%s\033[0m\n' "$*"; }
ok()     { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn()   { printf '  \033[33m!\033[0m %s\n' "$*"; }
err()    { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; }
hdr()    { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

# ---------------------------------------------------------------
# 0. Preflight
# ---------------------------------------------------------------
hdr "Preflight"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "$1 is required but not on PATH."
    echo "    Install: $2"
    exit 1
  fi
  ok "$1 found"
}

need git "https://git-scm.com/"
need bun "https://bun.sh/  (curl -fsSL https://bun.sh/install | bash)"

# ---------------------------------------------------------------
# 1. Submodules
# ---------------------------------------------------------------
hdr "Submodules"

if [ ! -f "gstack/setup" ] || [ ! -f "gbrain/package.json" ]; then
  echo "  Initializing submodules..."
  git submodule update --init --recursive
fi
ok "gstack/  ($(cd gstack && git rev-parse --short HEAD))"
ok "gbrain/  ($(cd gbrain && git rev-parse --short HEAD))"

# ---------------------------------------------------------------
# 2. gstack: install at ~/.claude/skills/gstack
# ---------------------------------------------------------------
hdr "gstack"

GSTACK_TARGET="$HOME/.claude/skills/gstack"
mkdir -p "$(dirname "$GSTACK_TARGET")"

if [ -e "$GSTACK_TARGET" ] && [ ! -L "$GSTACK_TARGET" ]; then
  warn "$GSTACK_TARGET exists as a real directory (probably from a prior install)."
  warn "Leaving it alone. To switch to this repo's checkout, remove it and re-run."
else
  if [ -L "$GSTACK_TARGET" ]; then
    rm "$GSTACK_TARGET"
  fi
  ln -s "$REPO_ROOT/gstack" "$GSTACK_TARGET"
  ok "Symlinked $GSTACK_TARGET -> $REPO_ROOT/gstack"
fi

echo "  Running gstack/setup..."
( cd "$GSTACK_TARGET" && ./setup ) || {
  err "gstack setup failed. See output above."
  exit 1
}
ok "gstack installed"

# ---------------------------------------------------------------
# 3. gbrain: bun install + bun link
# ---------------------------------------------------------------
hdr "gbrain"

(
  cd gbrain
  echo "  bun install..."
  bun install
  echo "  bun link..."
  bun link
)
ok "gbrain CLI linked globally"

if ! command -v gbrain >/dev/null 2>&1; then
  warn "gbrain CLI is not on PATH yet. You may need to open a new shell, or add bun's link dir to PATH:"
  echo "    export PATH=\"\$HOME/.bun/bin:\$PATH\""
fi

# ---------------------------------------------------------------
# 4. gbrain init (skip if a brain already exists)
# ---------------------------------------------------------------
hdr "Brain"

if [ -d "$HOME/.gbrain" ]; then
  ok "~/.gbrain already exists — skipping init"
else
  echo "  No brain at ~/.gbrain — running gbrain init (PGLite default)..."
  echo "  You will be asked a few questions about API keys."
  gbrain init || {
    warn "gbrain init did not complete. You can re-run it later: gbrain init"
  }
fi

# ---------------------------------------------------------------
# 5. MCP snippet
# ---------------------------------------------------------------
hdr "Claude Code MCP wiring"

cat <<'JSON'
  Add this to your Claude Code MCP config so the brain is reachable as MCP tools:

  {
    "mcpServers": {
      "gbrain": { "command": "gbrain", "args": ["serve"] }
    }
  }

  Common locations:
    macOS Claude Desktop: ~/Library/Application Support/Claude/claude_desktop_config.json
    Claude Code (per-user): ~/.claude/server.json
    Cursor / Windsurf: their MCP settings panel

  After adding the snippet, restart Claude Code. You should see ~30 gbrain tools
  available (query, search, get_page, put_page, list_pages, find_orphans, etc.).
JSON

# ---------------------------------------------------------------
# 6. Done
# ---------------------------------------------------------------
hdr "Done"

cat <<EOF
  gstack skills:   $GSTACK_TARGET
  gbrain CLI:      $(command -v gbrain 2>/dev/null || echo '<not on PATH yet — open a new shell>')
  gbrain data:     $HOME/.gbrain
  This repo:       $REPO_ROOT

  Try inside Claude Code:
    /office-hours   (gstack — startup diagnostic)
    /review         (gstack — review the current branch)
    gbrain query "your question"   (gbrain — search the brain)

  Update everything later:
    git -C "$REPO_ROOT" submodule update --remote --merge
    "$REPO_ROOT/bootstrap.sh"
EOF
