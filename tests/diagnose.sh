#!/bin/bash
# Process a test suite report. If there are failures/skipped, pass it to opencode
# to evaluate and propose fixes. Mirrors retree-hawaii / outings diagnose.sh.
#
# Usage:
#   ./diagnose.sh report.json
#   ./diagnose.sh report.json --test     # print the payload and exit (dry run)

set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <report.json> [--test|-t]" >&2
    exit 1
fi

OPEN_CODE="/home/rweltman/.opencode/bin/opencode"
REPORTFILE="$1"
MODE="run"

if [[ "${2:-}" == "--test" || "${2:-}" == "-t" ]]; then
    MODE="test"
fi

if [[ ! -f "$REPORTFILE" ]]; then
    echo "Error: File not found: $REPORTFILE" >&2
    exit 1
fi

if jq -e '(.failures // 0) > 0 or (.errors // 0) > 0 or (.skipped // 0) > 0' "$REPORTFILE" >/dev/null; then
    echo "There are failures, errors, or skipped tests"
else
    echo "All tests passed with no skips"
    exit 0
fi

SIMPLIFIED="$(echo "$REPORTFILE" | sed -e 's/.json/.simplified.json/')"

jq '{
  timestamp,
  suite_names,
  total_suites,
  tests,
  assertions,
  failures,
  errors,
  skipped,
  time,
  success_rate,
  skipped_tests,
  test_cases: (
    .test_cases
    | map(select(.status != "passed") | del(.assertions, .time))
  )
}' "$REPORTFILE" > "$SIMPLIFIED"

if [[ "$MODE" == "test" ]]; then
    echo "Would invoke: $OPEN_CODE run <prompt with $SIMPLIFIED>"
    exit 0
fi

PROMPT="OpenCode, open $SIMPLIFIED; if 'skipped_tests' is non-empty or 'failures' is non-zero or errors is non-zero, walk through each test that failed, had a warning or was skipped. For each one, locate the corresponding test file and source file, and explain what’s going wrong and how to fix it in the test or in the code or configuration. Propose specific code changes but do not make any changes. Only do this if the skipped_tests field is non-empty or if the failures or errors fields are non-zero. If there are no failures or errors and the skipped_tests field is empty, just say 'All tests passed with no skips.'"

$OPEN_CODE run "$PROMPT"
