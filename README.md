# Relay

A small bridge between **Telegram** and a **Cursor automation webhook**.

You already have an automation that starts when something POSTs to:

`https://api2.cursor.sh/automations/webhook/<id>`

Cursor does not have a place to talk back on Telegram. Relay is that missing return path.

```
Telegram message  →  Relay  →  Cursor automation webhook
Cursor agent      →  POST /api/reply  →  Telegram
```

The dashboard can send the same payload without Telegram, which is useful while you are wiring secrets.

## What you need

1. The Cursor automation **on**. Relay's webhook URL is already in `.env.example`. The automation named **Test on Slack** was off when this project was created — turn it on at [cursor.com/automations](https://cursor.com/automations).
2. A Telegram bot token from [@BotFather](https://t.me/BotFather). Put it in `TELEGRAM_BOT_TOKEN`.
3. A public HTTPS URL for this app (`PUBLIC_URL`) so the cloud agent can POST to `/api/reply`. Localhost is enough for the dashboard and for Telegram long-polling, but Cursor's cloud agent cannot reach `127.0.0.1`.

Regenerate the Cursor webhook token if this one has been shared. Do not commit `.env.local`.

## Run locally

```bash
cp .env.example .env.local
# fill in TELEGRAM_BOT_TOKEN, REPLY_WEBHOOK_SECRET, and the Cursor webhook values
npm install
npm run dev
```

Open [http://127.0.0.1:43147](http://127.0.0.1:43147).

With a bot token set, Relay long-polls Telegram (`getUpdates`) so you do not need a public webhook during development. Message the bot `/start`, then send a task.

## Reply webhook

The agent should POST here when it is done:

```
POST /api/reply
Authorization: Bearer <REPLY_WEBHOOK_SECRET>
Content-Type: application/json

{
  "job_id": "job_…",
  "status": "finished",
  "message": "The answer that should appear in Telegram"
}
```

`job_id` is included in the payload Relay sends to Cursor. If it is missing, Relay delivers to the most recent Telegram chat.

Paste the prompt from the dashboard into the automation instructions so the agent always calls `/api/reply`.

Optional: point Cursor cloud-agent **statusChange** webhooks at `/api/cursor/status`. If `CURSOR_STATUS_WEBHOOK_SECRET` is set, Relay verifies `X-Webhook-Signature`.

## Environment

| Variable | Purpose |
| --- | --- |
| `CURSOR_WEBHOOK_URL` | Automation trigger URL |
| `CURSOR_WEBHOOK_TOKEN` | `Bearer crsr_…` token |
| `TELEGRAM_BOT_TOKEN` | BotFather token |
| `TELEGRAM_CHAT_ID` | Optional fixed chat. Otherwise the first `/start` is remembered |
| `REPLY_WEBHOOK_SECRET` | Shared secret for `/api/reply` |
| `PUBLIC_URL` | Public origin, e.g. `https://your-host` |
| `TELEGRAM_WEBHOOK_SECRET` | Only if you register `https://your-host/api/telegram/webhook` with Telegram |
| `CURSOR_STATUS_WEBHOOK_SECRET` | Optional HMAC for Cursor status webhooks |

Job history is stored in `.data/store.json` on disk. No database.
