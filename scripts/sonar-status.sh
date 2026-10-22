#!/usr/bin/env bash
# Publishes the SonarQube quality gate of the local analysis of HEAD as the commit status
# `sonarqube` (ADR-0016). Needs a SonarQube user token in ~/.config/sonarqube/token (analysis
# tokens cannot read the gate) and a `gh` login. Run by `pnpm sonar` after `sonar-scanner`.
set -euo pipefail

host="http://localhost:9000"
token_file="$HOME/.config/sonarqube/token"
sha=$(git rev-parse HEAD)

# Token passed through a curl config on stdin, never on the command line (visible in `ps`).
IFS= read -r token < "$token_file"
sonar_get() { printf 'user = "%s:"\n' "$token" | curl -fsS -K - "$host$1"; }

task_id=$(sed -n 's/^ceTaskId=//p' .scannerwork/report-task.txt)
[ -n "$task_id" ] || { echo "No analysis task found: run sonar-scanner first." >&2; exit 1; }

task=$(sonar_get "/api/ce/task?id=$task_id")
[ "$(jq -r '.task.status' <<<"$task")" = "SUCCESS" ] || { echo "Analysis task did not succeed." >&2; exit 1; }
analysis_id=$(jq -r '.task.analysisId' <<<"$task")

# The status must describe the analysed commit, not a stale report.
revision=$(sonar_get "/api/project_analyses/search?project=asv&ps=10" \
  | jq -r --arg id "$analysis_id" '.analyses[] | select(.key == $id) | .revision')
[ "$revision" = "$sha" ] || { echo "Last analysis is of ${revision:-unknown}, not HEAD $sha." >&2; exit 1; }

gate=$(sonar_get "/api/qualitygates/project_status?analysisId=$analysis_id" | jq -r '.projectStatus.status')
if [ "$gate" = "OK" ]; then state=success; else state=failure; fi

repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
gh api "repos/$repo/statuses/$sha" -f state="$state" -f context=sonarqube \
  -f description="Quality gate $gate (local SonarQube, ADR-0016)" >/dev/null
echo "sonarqube: $state on $sha"
