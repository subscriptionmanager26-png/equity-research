#!/usr/bin/env bash
# Deny browsing other Cloud Agent runs/transcripts in this repo (Relay privacy policy).
set -euo pipefail

printf '%s\n' '{
  "permission": "deny",
  "user_message": "Listing or bulk-fetching other Cloud Agent runs is disabled for this repository.",
  "agent_message": "Do not use cursor-cloud list-cloud-agents or batch-fetch-details. Use only the current message, Slack thread_context, and attachments. For this run: cursor-cloud run-info, get-events, environment-info are allowed if needed."
}'