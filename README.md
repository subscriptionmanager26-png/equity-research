# Relay

A small bridge between **Telegram**, **Slack**, and a **Cursor cloud agent**.

Relay launches a cloud agent against this repository via the Cloud Agents API. It does not depend on a Cursor Automation staying enabled.

```
Telegram or Slack  →  Relay  →  POST /v0/agents (this repo)
Relay receives the Cursor status webhook (or polls)
Relay  →  same Telegram chat or Slack thread  →  you
```

The dashboard can send the same payload without typing in Telegram.
Relay does not depend on the cloud agent calling Telegram itself.

## What you need

1. A Cursor API key (`CURSOR_WEBHOOK_TOKEN`) from [cursor.com/dashboard](https://cursor.com/dashboard) → API Keys.
2. A Telegram bot token from [@BotFather](https://t.me/BotFather) in `TELEGRAM_BOT_TOKEN`.
3. Message the bot `/start` once so Relay stores your chat id.

The cloud agent replies by calling Telegram's `sendMessage` API. You do not need `PUBLIC_URL` for that. `PUBLIC_URL` is only if you also want the agent to POST to this app's `/api/reply`.

Regenerate the Cursor webhook token if this one has been shared. Do not commit `.env.local`.

## Run locally

```bash
cp .env.example .env.local
# fill in TELEGRAM_BOT_TOKEN, REPLY_WEBHOOK_SECRET, and the Cursor webhook values
npm install
npm run dev
```

Open [http://127.0.0.1:43147](http://127.0.0.1:43147).

With a bot token set, Relay long-polls Telegram (`getUpdates`). Message the bot `/start`, then send a task. Attachments (documents, photos) are forwarded as `files[]` download URLs in the Cursor webhook payload.

To use a **channel or group**, add the bot as an **admin** (it must be allowed to post messages), then tag it:

```
@open_kush_bot summarize today's thread
```

Relay ignores channel posts that do not mention the bot, so the channel does not trigger a Cursor run on every message.

## Slack

On **Vercel production**, Slack uses the Events API (same pattern as Telegram). Create the app from [docs/slack-app-manifest.yaml](docs/slack-app-manifest.yaml), then set `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET`. Invite `@Relay` and mention it:

```
@Relay analyze SBIN
```

Thread replies are follow-ups. Full steps: [docs/SLACK_SETUP.md](docs/SLACK_SETUP.md).

**Local only:** `SLACK_USER_TOKEN` (`xoxp-…`) + trigger word `pocketedge` (poller). Socket Mode is also local-only.

Slack and Telegram stay fully separate — answers never cross platforms.

## How the agent replies

Relay polls the Cursor run as a **fallback**, but for fast delivery you should enable the **Cursor status webhook** (see below). When configured, Cursor POSTs to Relay as soon as the agent finishes; Relay then forwards the agent's **final chat message** plus any **artifacts** unchanged.

### Fast delivery: Cursor → Relay status webhook

1. Expose Relay publicly — set `PUBLIC_URL` (e.g. your production host, or `npx localtunnel --port 43147` in dev).
2. Generate a secret (32+ chars) and set `CURSOR_STATUS_WEBHOOK_SECRET` in `.env.local`.
3. Restart Relay.

When both are set, Relay **automatically attaches** `{ url, secret }` to every cloud-agent create — you do **not** need to configure a global webhook in the Cursor dashboard unless you launch agents outside Relay.

Optional: you can also add `{PUBLIC_URL}/api/cursor/status` in Cursor → Cloud Agents → Webhooks for agents started elsewhere.

Relay matches the webhook's agent `id` to the job, fetches conversation + artifacts, and delivers immediately. Polling continues as a backup if the webhook is missed.

**Slack attachments:** Relay can send files to Slack with your user token (`files:write`). Slack → Cursor file sharing works via inline base64 when `PUBLIC_URL` is unset, or via download URLs when it is set.

The cloud agent should **not** POST to Telegram, Slack, or `/api/reply`.

The prompt is `lib/automation-prompt.ts` and is sent as Cloud Agents `prompt.text`.

## Cloud Agent environment

Cloud agents check out **this repository** (`CURSOR_AGENT_REPOSITORY`, default `https://github.com/subscriptionmanager26-png/equity-research`) so runs include `.cursor/environment.json` and **project skills**. Personal Cursor skills on your laptop are **not** copied to cloud VMs.

The **financial-analysis** skill lives at `.cursor/skills/research/financial-analysis/SKILL.md` (also linked from `.agents/skills/`). Equity/stock/ETF questions should follow it. Overview: [docs/financial-analysis/README.md](docs/financial-analysis/README.md).

Optional: save the environment and run one build so `npm install` is pre-baked.

Optional: point Cursor cloud-agent **statusChange** webhooks at `{PUBLIC_URL}/api/cursor/status` — **recommended for fast delivery**. Set `CURSOR_STATUS_WEBHOOK_SECRET`; Relay verifies `X-Webhook-Signature`. On **Vercel**, `PUBLIC_URL` is automatic — see [docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md).

## Environment

| Variable | Purpose |
| --- | --- |
| `CURSOR_AGENT_MODEL` | Optional. Cloud Agent model id (`grok-4.6`, `composer-2.5`, `claude-opus-5`, …). Omit = Cursor account default |
| `CURSOR_AGENT_MODEL_PARAMS` | Optional. Comma-separated `effort=high,fast=false` (and other params from `GET /v1/models`) |
| `CURSOR_WEBHOOK_URL` | Optional Automations webhook; unused unless `CURSOR_USE_AUTOMATION_WEBHOOK=true` |
| `TELEGRAM_BOT_TOKEN` | BotFather token |
| `TELEGRAM_CHAT_ID` | Optional fixed chat. Otherwise the first `/start` is remembered |
| `SLACK_BOT_TOKEN` | Bot token (`xoxb-…`) for Vercel Events API |
| `SLACK_SIGNING_SECRET` | Slack request signing secret for `/api/slack/events` |
| `REPLY_WEBHOOK_SECRET` | Shared secret for `/api/reply` |
| `PUBLIC_URL` | Optional public origin (`/api/reply`, Slack attachment URLs) |
| `TELEGRAM_WEBHOOK_SECRET` | Only if you register `https://your-host/api/telegram/webhook` with Telegram |
| `CURSOR_STATUS_WEBHOOK_SECRET` | Optional HMAC for Cursor status webhooks |

Job history is stored in `.data/store.json` on disk. No database.
