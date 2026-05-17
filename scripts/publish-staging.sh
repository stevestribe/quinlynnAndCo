#!/usr/bin/env bash
set -euo pipefail

REPO="stevestribe/quinlynnAndCo"
WORKFLOW_FILE="deploy-staging.yml"

if [[ -z "${FLOW_COMMIT_SHA:-}" ]]; then
  echo "FLOW_COMMIT_SHA is required." >&2
  exit 1
fi

if [[ "${FLOW_BRANCH:-}" != "main" ]]; then
  echo "Staging publish must run from main. Current branch: ${FLOW_BRANCH:-unknown}" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is required to dispatch the staging workflow." >&2
  exit 1
fi

workflow_ready=0
for _ in {1..30}; do
  if gh workflow view "$WORKFLOW_FILE" --repo "$REPO" >/dev/null 2>&1; then
    workflow_ready=1
    break
  fi
  sleep 2
done

if [[ "$workflow_ready" != "1" ]]; then
  echo "GitHub workflow is not available yet: ${WORKFLOW_FILE}" >&2
  exit 1
fi

echo "Dispatching staging deploy workflow for commit ${FLOW_COMMIT_SHA}."
gh workflow run "$WORKFLOW_FILE" \
  --repo "$REPO" \
  --ref main \
  -f commit_sha="$FLOW_COMMIT_SHA"

run_id=""
for _ in {1..30}; do
  run_id="$(
    gh run list \
      --repo "$REPO" \
      --workflow "$WORKFLOW_FILE" \
      --event workflow_dispatch \
      --json databaseId,headSha,status,createdAt \
      --jq ".[] | select(.headSha == \"${FLOW_COMMIT_SHA}\") | .databaseId" |
      head -n 1
  )"

  if [[ -n "$run_id" ]]; then
    break
  fi
  sleep 2
done

if [[ -z "$run_id" ]]; then
  echo "Could not find the dispatched staging workflow run." >&2
  exit 1
fi

echo "Watching staging deploy run ${run_id}."
gh run watch "$run_id" --repo "$REPO" --exit-status
