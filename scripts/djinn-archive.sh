#!/usr/bin/env bash
# djinn-archive.sh — move a branch's .djinn/ artifacts to .archive/
#
# Called by the GitHub Action after a PR is merged.
#
# Usage:
#   BRANCH="feat/my-feature" MERGE_DATE="2026-05-17" ./djinn-archive.sh
#
# Environment variables:
#   BRANCH      — the merged branch name (required)
#   MERGE_DATE  — the merge date in YYYY-MM-DD format (required)

set -euo pipefail

if [[ -z "${BRANCH:-}" ]]; then
  echo "ERROR: BRANCH is required" >&2
  exit 1
fi

if [[ -z "${MERGE_DATE:-}" ]]; then
  echo "ERROR: MERGE_DATE is required" >&2
  exit 1
fi

SOURCE=".djinn/${BRANCH}"
DEST=".djinn/.archive/${MERGE_DATE}/${BRANCH}"

if [[ ! -d "$SOURCE" ]]; then
  echo "No artifacts to archive at ${SOURCE} — skipping."
  exit 0
fi

echo "Archiving: ${SOURCE} → ${DEST}"

mkdir -p "$(dirname "$DEST")"
mv "$SOURCE" "$DEST"

git add ".djinn/.archive/${MERGE_DATE}/"
git add -u ".djinn/${BRANCH}/"  # stage the deletion

git commit -m "chore(djinn): archive artifacts for ${BRANCH} (merged ${MERGE_DATE})"

echo "Archived successfully."
