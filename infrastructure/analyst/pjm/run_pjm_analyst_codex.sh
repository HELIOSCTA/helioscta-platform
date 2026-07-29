#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${OPENAI_API_KEY:-}" || -n "${CODEX_API_KEY:-}" ]]; then
  echo "Refusing to run: OPENAI_API_KEY/CODEX_API_KEY is present. Use ChatGPT-managed Codex auth for plan usage." >&2
  exit 64
fi

CODEX_BIN="${CODEX_BIN:-codex}"
CODEX_HOME="${CODEX_HOME:-/var/lib/helioscta/pjm-analyst/codex-home}"
WORKDIR="${HELIOS_ANALYST_WORKDIR:-/var/lib/helioscta/pjm-analyst/workspace}"
OUTPUT_DIR="${HELIOS_ANALYST_OUTPUT_DIR:-/var/lib/helioscta/pjm-analyst/output}"
PROMPT_FILE="${HELIOS_ANALYST_PROMPT_FILE:-/var/lib/helioscta/pjm-analyst/runtime/pjm-analyst-prompt.md}"
SCHEMA_FILE="${HELIOS_ANALYST_SCHEMA_FILE:-/var/lib/helioscta/pjm-analyst/runtime/pjm-analyst-output.schema.json}"

if ! command -v "$CODEX_BIN" >/dev/null 2>&1; then
  echo "Refusing to run: codex binary not found at CODEX_BIN=$CODEX_BIN." >&2
  exit 127
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Refusing to run: prompt file not found: $PROMPT_FILE" >&2
  exit 66
fi

if [[ ! -f "$SCHEMA_FILE" ]]; then
  echo "Refusing to run: output schema not found: $SCHEMA_FILE" >&2
  exit 66
fi

mkdir -p "$WORKDIR" "$OUTPUT_DIR/archive"

if [[ ! -d "$WORKDIR/.git" ]]; then
  git -C "$WORKDIR" init >/dev/null
fi

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)"
TMP_JSON="$OUTPUT_DIR/.pjm-analyst-$RUN_ID.tmp.json"
RUN_JSON="$OUTPUT_DIR/archive/$RUN_ID.json"
RUN_MD="$OUTPUT_DIR/archive/$RUN_ID.md"
LATEST_JSON="$OUTPUT_DIR/latest.json"
LATEST_MD="$OUTPUT_DIR/latest.md"

export CODEX_HOME

"$CODEX_BIN" exec \
  --cd "$WORKDIR" \
  --sandbox workspace-write \
  --output-schema "$SCHEMA_FILE" \
  --output-last-message "$TMP_JSON" \
  -c 'approval_policy="never"' \
  -c 'sandbox_workspace_write.network_access=true' \
  -c "sandbox_workspace_write.writable_roots=[\"$WORKDIR\"]" \
  - < "$PROMPT_FILE"

python3 - "$TMP_JSON" "$RUN_JSON" "$RUN_MD" "$LATEST_JSON" "$LATEST_MD" <<'PY'
import json
import shutil
import sys
from pathlib import Path

tmp_json, run_json, run_md, latest_json, latest_md = map(Path, sys.argv[1:])
payload = json.loads(tmp_json.read_text(encoding="utf-8"))
memo = payload.get("markdown_memo") or ""
if not isinstance(memo, str) or not memo.strip():
    raise SystemExit("Codex output did not include non-empty markdown_memo")

run_json.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
run_md.write_text(memo.rstrip() + "\n", encoding="utf-8")
shutil.copyfile(run_json, latest_json)
shutil.copyfile(run_md, latest_md)
tmp_json.unlink(missing_ok=True)
PY

echo "PJM analyst memo written to $RUN_JSON and $RUN_MD"
