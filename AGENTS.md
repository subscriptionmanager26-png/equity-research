<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Relay cloud agents

This repository is checked out by Cursor Cloud Agents that answer Telegram and Slack.

For **any financial instrument** (stock, ticker, company, ETF, fund, bond, earnings, filings): follow `.cursor/skills/research/financial-analysis/SKILL.md`. For long reports use `artifacts/<topic>-report.md`; for short answers reply in chat. Relay forwards output unchanged. No PDF unless the user asked for one.

## Privacy: no cross-run agent history

- **Never** call `cursor-cloud` **`list-cloud-agents`** or **`batch-fetch-details`** (enforced by `.cursor/hooks.json`).
- Use only the **current user message**, **`thread_context`** (same Slack/Telegram thread), and **`files[]`** for portfolio or personal data — not transcripts from other Cloud Agent runs.
- Built-in `cursor-cloud` cannot be disabled via `.cursor/environment.json` (see Cursor schema: built-in MCP is exempt from `mcpServerAllowlist` / `disableAllMcpServers`). Repo hooks are the non-Enterprise control.

## Nifty Total Market prices (environment)

Every Cloud Agent environment installs a local SQLite database during `scripts/install-agent-env.sh`:

- Path: `$HOME/.local/share/equity-research/prices/nifty-total-market-2y.sqlite`
- Manifest: `data/prices-manifest.json` (source URLs + expected sha256)
- Use `eod_adjusted` for returns, screens, and backtests; see `data/README.md`
