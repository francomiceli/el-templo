#!/usr/bin/env bash
# Phase 93 ↔ 94 ↔ 97 Cross-Phase Invariant guard.
#
# Asserts that DEBOUNCE_TTL_SECONDS satisfies:
#   DEBOUNCE_TTL_SECONDS >= (OPENAI_TIMEOUT_MS/1000) * MAX_TOOL_ITERATIONS
#                         + executeTool_timeout_seconds * MAX_TOOL_ITERATIONS
#                         + safety_buffer
#
# Concrete v5.3.3 defaults (post-Phase-94+97 target):
#   OPENAI_TIMEOUT_MS = 45000             (Phase 94 LAT-01)
#   MAX_TOOL_ITERATIONS = 5
#   executeTool_timeout_seconds = 30      (Phase 95 BOOK-01 + Phase 97 RGUARD-03)
#   safety_buffer = 20
#   Minimum TTL = 45 * 5 + 30 * 5 + 20 = 395 → round up to 600s
#
# Exits 0 if the invariant holds; non-zero otherwise. Intended for
# manual invocation or CI; not wired into git hooks by Phase 94.
set -euo pipefail

TTL=${DEBOUNCE_TTL_SECONDS:-600}
TIMEOUT_S=$(( ${OPENAI_TIMEOUT_MS:-45000} / 1000 ))
MAX_TOOL_ITERATIONS=${MAX_TOOL_ITERATIONS:-5}
EXECUTE_TOOL_BUDGET=${EXECUTE_TOOL_BUDGET_SECONDS:-30}
BUFFER=${INVARIANT_BUFFER_SECONDS:-20}

MINIMUM=$(( TIMEOUT_S * MAX_TOOL_ITERATIONS + EXECUTE_TOOL_BUDGET * MAX_TOOL_ITERATIONS + BUFFER ))

if [ "$TTL" -lt "$MINIMUM" ]; then
  echo "INVARIANT VIOLATION: DEBOUNCE_TTL_SECONDS=$TTL < required minimum $MINIMUM" >&2
  echo "  Formula: $TIMEOUT_S * $MAX_TOOL_ITERATIONS + $EXECUTE_TOOL_BUDGET * $MAX_TOOL_ITERATIONS + $BUFFER = $MINIMUM" >&2
  exit 1
fi

echo "Cross-phase invariant OK: TTL=$TTL >= minimum $MINIMUM"
exit 0
