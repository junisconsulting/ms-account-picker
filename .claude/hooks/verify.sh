#!/usr/bin/env bash
# The deterministic gate for ms-account-picker. Wired as a Stop hook.
# exit 0 = green, exit 2 = red (blocks the turn, feeds stderr back to Claude).
#
# The repo is small and has no build step, so this checks everything every run
# instead of selecting by diff — it stays well under a second.
# ponytail: full sweep, switch to git-diff selection if this ever exceeds ~2s.

set -u

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

# Stop-hook safety: stand down when Claude is already inside a stop hook.
# The payload arrives on stdin, so the read is bounded — without the timeout a
# manual run that inherits an open stdin (a pipeline, a heredoc) blocks here.
# ponytail: run this script standalone; do not chain it in front of a command
# that needs stdin, it will consume that input.
INPUT=""
[ -t 0 ] || INPUT="$(timeout 1 cat 2>/dev/null || true)"
case "$INPUT" in *'"stop_hook_active":true'*) exit 0 ;; esac

command -v node >/dev/null 2>&1 || exit 0

FAILED=0
fail() { echo "$1" >&2; FAILED=1; }

# 1. Manifest must be valid JSON — a broken manifest bricks the extension silently.
if [ -f src/manifest.json ]; then
  ERR="$(node -e "JSON.parse(require('fs').readFileSync('src/manifest.json','utf8'))" 2>&1)" \
    || fail "Invalid JSON in src/manifest.json: $ERR"
fi

# 2. Syntax check every JS file we ship or test.
# Everything here is an ES module, and plain `node --check` silently PASSES an
# ESM file with syntax errors (verified on node 22) — it detects module syntax
# and bails out of the CommonJS check. Feeding the file on stdin with an
# explicit --input-type is the form that actually parses as a module.
while IFS= read -r f; do
  ERR="$(node --input-type=module --check < "$f" 2>&1)" \
    || fail "Syntax error in $f: $ERR"
done < <(find src tests -name '*.js' -type f 2>/dev/null)

# 3. Unit tests, if any exist yet.
if find tests/unit -name '*.test.js' -type f 2>/dev/null | grep -q .; then
  OUT="$(node --test tests/unit/ 2>&1)" || fail "Unit tests failed:
$OUT"
fi

[ "$FAILED" -eq 0 ] || exit 2
echo "verify: green"
exit 0
