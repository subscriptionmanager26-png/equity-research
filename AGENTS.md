<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Relay cloud agents

This repository is checked out by Cursor Cloud Agents that answer Telegram and Slack.

For **any financial instrument** (stock, ticker, company, ETF, fund, bond, earnings, filings): follow `.cursor/skills/research/financial-analysis/SKILL.md`. Deliver `artifacts/report.md` plus a 1–2 sentence chat summary. No PDF unless the user asked for one.
