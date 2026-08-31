# Relay

A small bridge between **Telegram** and a **Cursor automation webhook**.

You already have an automation that starts when something POSTs to:

`https://api2.cursor.sh/automations/webhook/<id>`

Cursor does not have a place to talk back on Telegram. Relay is that missing return path.

```
Telegram message  →  Relay  →  Cursor automation webhook
Relay polls Cursor until the run finishes
Relay  →  Telegram sendMessage  →  you
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

## How the agent replies

Relay polls the Cursor run and sends the last answer to Telegram. Files the agent writes under `artifacts/` (PDF, markdown, images, spreadsheets) are downloaded and sent as Telegram documents. If there are no artifacts and the answer is long, Relay also attaches `report.md`.

The automation should **not** POST to Telegram or to `/api/reply`.

Replace the automation prompt with the text on the dashboard (or this):

```
You are Relay's Cursor automation. Each run is a Telegram question.

The webhook payload's "text" field is the user's question. Answer that question in your final message.
If the payload includes files[], download each files[].url immediately (they expire in about an hour) and use those files.

If the user should receive a file (research report, PDF, spreadsheet, image), write it under artifacts/, for example artifacts/report.pdf or artifacts/report.md. Relay sends every file in artifacts/ to Telegram.

Do not POST to Telegram, Relay, reply_url, or any other URL.
Do not mention webhooks, reply_url, reply_token, Bot API, or delivery.
Relay copies your final answer and artifacts to Telegram automatically.
```

Optional: point Cursor cloud-agent **statusChange** webhooks at `/api/cursor/status`. If `CURSOR_STATUS_WEBHOOK_SECRET` is set, Relay verifies `X-Webhook-Signature`.

## Environment

| Variable | Purpose |
| --- | --- |
| `CURSOR_WEBHOOK_URL` | Automation trigger URL |
| `CURSOR_WEBHOOK_TOKEN` | `Bearer crsr_…` token |
| `TELEGRAM_BOT_TOKEN` | BotFather token |
| `TELEGRAM_CHAT_ID` | Optional fixed chat. Otherwise the first `/start` is remembered |
| `REPLY_WEBHOOK_SECRET` | Shared secret for `/api/reply` |
| `PUBLIC_URL` | Optional public origin if you also want `/api/reply` |
| `TELEGRAM_WEBHOOK_SECRET` | Only if you register `https://your-host/api/telegram/webhook` with Telegram |
| `CURSOR_STATUS_WEBHOOK_SECRET` | Optional HMAC for Cursor status webhooks |

Job history is stored in `.data/store.json` on disk. No database.
