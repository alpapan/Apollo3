#!/usr/bin/env bash
# Runs the declared apollo `test` task with a fresh private TMPDIR and fails when jest left
# a `jest_*` entry there. Jest's default cacheDirectory is os.tmpdir()/jest_<hash> (haste map
# and transform cache); the task must point it at a git-ignored directory inside this
# project instead. TMPDIR has no fallback: unset halts.
#
# Usage: ENV=test bash scripts/check_jest_cache_outside_tmpdir.sh
# Exit: 0 when the private TMPDIR holds no jest_* entry; 1 when it does; 64 when TMPDIR is
# unset; 70 when the private directory cannot be created.

set -u

: "${TMPDIR:?TMPDIR must be set}"

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

private_tmp="$(mktemp -d "$TMPDIR/apollo-jest-cache-check.XXXXXX")" || exit 70

task_log="$(mktemp "$TMPDIR/curatorium-test-log.XXXXXX")" || exit 70

TMPDIR="$private_tmp" pixi run -m "$project_root/pixi.toml" test > "$task_log" 2>&1
task_rc=$?
echo "apollo test task exit status: $task_rc (log: $task_log)"

leaked="$(find "$private_tmp" -maxdepth 1 -name 'jest_*')"
status=0
if [ -n "$leaked" ]; then
  echo "FAIL: jest left entries in the private TMPDIR:" >&2
  echo "$leaked" >&2
  status=1
else
  echo "PASS: no jest_* entry in the private TMPDIR"
fi

# Jest must have run and written its cache to the project directory the task names.
if [ -z "$(find "$project_root/.yarn/jest-cache" -mindepth 1 -maxdepth 1 2>/dev/null)" ]; then
  echo "FAIL: $project_root/.yarn/jest-cache holds no entry, so jest did not run with it" >&2
  status=1
fi

# Remove only what this script created, by relative name from its parent.
cd "$TMPDIR" || exit "$status"
find "$(basename "$private_tmp")" -delete
exit "$status"
