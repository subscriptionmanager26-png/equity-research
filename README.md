# Relay

A small bridge between **Telegram**, **Slack**, and a **Cursor automation webhook**.

You already have an automation that starts when something POSTs to:

`https://api2.cursor.sh/automations/webhook/<id>`

Cursor does not have a built-in way to talk back on Telegram or Slack. Relay is that return path.

```
Telegram or Slack  →  Relay  →  Cursor automation webhook
Relay polls Cursor until the run finishes
Relay  →  same Telegram chat or Slack thread  →  you
```

The dashboard can send the same payload without typing in Telegram.
Relay does not depend on the cloud agent calling Telegram itself.

## What you need

1. The Cursor automation **on**. The automation named **Test on Slack** was off when this project was created — turn it on at [cursor.com/automations](https://cursor.com/automations).
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

## Slack (trigger word: `pocketedge`)

There is **no Slack app named "Pocketedge"**. Relay watches for the word **`pocketedge`** in messages (change with `SLACK_TRIGGER_WORD`). Example:

```
@pocketedge summarize today's standup
```

Thread replies in the same conversation are treated as follow-ups without saying `pocketedge` again.

**Quick start:** set `SLACK_USER_TOKEN` (`xoxp-…`) in `.env.local` — see [docs/SLACK_SETUP.md](docs/SLACK_SETUP.md) for scopes and step-by-step help.

**Production:** create a Slack app and set `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN` (Socket Mode). Full instructions in [docs/SLACK_SETUP.md](docs/SLACK_SETUP.md).

Slack and Telegram stay fully separate — answers never cross platforms.

## How the agent replies

Relay polls the Cursor run as a **fallback**, but for fast delivery you should enable the **Cursor status webhook** (see below). When configured, Cursor POSTs to Relay as soon as the agent finishes; Relay then forwards the agent's **final chat message** plus any **artifacts** unchanged.

### Fast delivery: Cursor → Relay status webhook

1. Expose Relay publicly — set `PUBLIC_URL` (e.g. `https://relay.yourdomain.com` or an ngrok URL in dev).
2. Generate a secret (32+ chars) and set `CURSOR_STATUS_WEBHOOK_SECRET` in `.env.local`.
3. In [Cursor → Cloud Agents → Webhooks](https://cursor.com/dashboard?tab=webhooks), add:
   - **URL:** `{PUBLIC_URL}/api/cursor/status`
   - **Event:** `statusChange`
   - **Secret:** same value as `CURSOR_STATUS_WEBHOOK_SECRET`
4. Restart Relay. The dashboard shows whether the status webhook is configured.

Relay matches the webhook's agent `id` to the job, fetches conversation + artifacts, and delivers immediately. Polling continues as a backup if the webhook is missed.

**Slack attachments:** Relay can send files to Slack with your user token (`files:write`). Slack → Cursor file sharing works via inline base64 when `PUBLIC_URL` is unset, or via download URLs when it is set.

The automation should **not** POST to Telegram, Slack, or `/api/reply`.

Replace the automation prompt with the text on the dashboard (copy from the Relay UI — it lives in `lib/automation-prompt.ts`).

## Cloud Agent environment

Point the Cursor automation at **this repository** so runs check out Relay (including `.cursor/environment.json` and **project skills**). Personal Cursor skills on your laptop are **not** copied to cloud VMs.

The **financial-analysis** skill lives at `.cursor/skills/research/financial-analysis/SKILL.md` (also linked from `.agents/skills/`). Equity/stock/ETF questions should follow it. Overview: [docs/financial-analysis/README.md](docs/financial-analysis/README.md).

Optional: save the environment and run one build so `npm install` is pre-baked.

Optional: point Cursor cloud-agent **statusChange** webhooks at `{PUBLIC_URL}/api/cursor/status` — **recommended for fast delivery**. Set `PUBLIC_URL` and `CURSOR_STATUS_WEBHOOK_SECRET`; Relay verifies `X-Webhook-Signature`.

## Environment

| Variable | Purpose |
| --- | --- |
| `CURSOR_WEBHOOK_URL` | Automation trigger URL |
| `CURSOR_WEBHOOK_TOKEN` | `Bearer crsr_…` token |
| `TELEGRAM_BOT_TOKEN` | BotFather token |
| `TELEGRAM_CHAT_ID` | Optional fixed chat. Otherwise the first `/start` is remembered |
| `SLACK_BOT_TOKEN` | Slack bot token (`xoxb-…`) |
| `SLACK_APP_TOKEN` | Slack app-level token for Socket Mode (`xapp-…`) |
| `SLACK_SIGNING_SECRET` | For HTTPS Events API at `/api/slack/events` |
| `REPLY_WEBHOOK_SECRET` | Shared secret for `/api/reply` |
| `PUBLIC_URL` | Optional public origin (`/api/reply`, Slack attachment URLs) |
| `TELEGRAM_WEBHOOK_SECRET` | Only if you register `https://your-host/api/telegram/webhook` with Telegram |
| `CURSOR_STATUS_WEBHOOK_SECRET` | Optional HMAC for Cursor status webhooks |

Job history is stored in `.data/store.json` on disk. No database.
