#!/usr/bin/env bash
# Publishes the SonarQube quality gate of the last local analysis as the commit status
# `sonarqube` on HEAD (ADR-0016). Needs a SonarQube user token in ~/.config/sonarqube/token
# (read rights) and a `gh` login; analysis tokens cannot read the gate.
set -euo pipefail

# The status must describe exactly the pushed commit that was analysed.
git diff --quiet HEAD || { echo "Working tree is dirty: commit before scanning." >&2; exit 1; }

host="http://localhost:9000"
task_id=$(sed -n 's/^ceTaskId=//p' .scannerwork/report-task.txt)
token_file="$HOME/.config/sonarqube/token"

analysis_id=$(curl -fsS -u "$(cat "$token_file"):" "$host/api/ce/task?id=$task_id" | jq -r '.task.analysisId')
gate=$(curl -fsS -u "$(cat "$token_file"):" "$host/api/qualitygates/project_status?analysisId=$analysis_id" | jq -r '.projectStatus.status')

if [ "$gate" = "OK" ]; then state=success; else state=failure; fi
sha=$(git rev-parse HEAD)
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)

gh api "repos/$repo/statuses/$sha" -f state="$state" -f context=sonarqube \
  -f description="Quality gate $gate (local SonarQube, ADR-0016)" >/dev/null
echo "sonarqube: $state on $sha"
