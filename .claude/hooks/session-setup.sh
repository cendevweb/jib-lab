#!/usr/bin/env bash
# SessionStart: make the workspace runnable in Claude Code on the web (fresh container).
set -euo pipefail
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then exit 0; fi
cd "${CLAUDE_PROJECT_DIR:-.}"
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install >/dev/null 2>&1
echo "jib-lab: dependencies installed. Run 'pnpm projects' to see project phases."
