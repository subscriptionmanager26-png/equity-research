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

## Slack (@pocketedge)

Relay listens for **@pocketedge** mentions and replies in the **same thread**.

1. Create a Slack app and install it to your workspace.
2. Enable **Socket Mode** and copy `SLACK_BOT_TOKEN` (`xoxb-…`) and `SLACK_APP_TOKEN` (`xapp-…`) into `.env.local`.
3. Under **Event Subscriptions**, subscribe to:
   - `app_mention`
   - `message.channels`, `message.groups`, `message.im`, `message.mpim` (for thread follow-ups)
4. Bot token scopes (minimum):
   - `app_mentions:read`
   - `channels:history`, `channels:read`, `groups:history`, `groups:read`
   - `chat:write`, `files:write`
   - `im:history`, `mpim:history`
   - `users:read`
5. Invite `@pocketedge` to the channels where you want to use it.

**Thread context:** the first `@pocketedge` mention starts a thread job. Later replies in that thread (without tagging again) are treated as follow-ups. Relay fetches the thread history and sends it to Cursor as `thread_context`.

For production without Socket Mode, set `SLACK_SIGNING_SECRET` and point Slack Events to `https://your-host/api/slack/events`.

Set `PUBLIC_URL` if Slack messages include file attachments you want Cursor to download.

## How the agent replies

Relay polls the Cursor run and sends the answer back to the **same Telegram chat or Slack thread**. Files the agent writes under `artifacts/` are delivered as documents. If there are no artifacts and the answer is long, Relay also attaches `report.md`.

The automation should **not** POST to Telegram, Slack, or `/api/reply`.

Replace the automation prompt with the text on the dashboard (or this):

```
You are Relay's Cursor automation. Each run is a question from Telegram or Slack.

The webhook payload's "text" field is the user's question. If thread_context is present, it is the same Slack thread — treat it as prior conversation. Answer in your final message.
If the payload includes files[], download each files[].url immediately (they expire in about an hour) and use those files.

If the user should receive a file (research report, PDF, spreadsheet, image), write it under artifacts/, for example artifacts/report.pdf or artifacts/report.md. Relay sends every file in artifacts/ back to the same Telegram chat or Slack thread.

PDF libraries are already installed in this environment: fpdf2, Pillow, and reportlab. Import them directly (from fpdf import FPDF). Do not pip install fpdf2 or any other package unless an import actually fails. To write a PDF you can run: python3 tools/pdf_report.py artifacts/report.pdf "Title" "Paragraph"

Do not POST to Telegram, Slack, Relay, reply_url, or any other URL.
Do not mention webhooks, reply_url, reply_token, Bot API, or delivery.
Relay copies your final answer and artifacts to the user automatically.
```

## Cloud Agent environment (PDF, fpdf2)

Telegram-triggered Cursor agents start in a fresh VM. If that VM has no environment snapshot, the agent `pip install`s fpdf2 on every conversation.

This repo pins those tools in `.cursor/environment.json`:

1. `install` runs `npm install` and `scripts/install-agent-env.sh`, which installs `requirements-agent.txt` (`fpdf2`, Pillow, fonttools, reportlab).
2. After you **Save** the environment and run one **Build**, later agents boot from that snapshot. `fpdf2` is already importable. They should not pip install it again.
3. Point the Cursor automation at **this repository**. An automation with an empty repo list never sees `environment.json`, so it still starts bare and the agent will keep installing packages itself.

Generate a PDF from a preinstalled helper:

```bash
python3 tools/pdf_report.py artifacts/report.pdf "Weekly notes" "First section." "Second section."
```

Optional: point Cursor cloud-agent **statusChange** webhooks at `/api/cursor/status`. If `CURSOR_STATUS_WEBHOOK_SECRET` is set, Relay verifies `X-Webhook-Signature`.

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
