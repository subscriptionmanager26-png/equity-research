# Deploy Relay on Vercel

Vercel gives you a **stable HTTPS URL** for Cursor status webhooks — no localtunnel needed.

## What runs where

| Component | Local dev | Vercel |
|-----------|-----------|--------|
| Telegram | Long-poll (`getUpdates`) | Webhook → `/api/telegram/webhook` |
| Cursor status | `/api/cursor/status` | Same (auto `PUBLIC_URL` from `VERCEL_URL`) |
| Cursor backup poll | In-process waiter | Manual `GET /api/cursor/poll` (Hobby forbids more than one cron per day; status webhook is the live path) |
| Job store | `.data/store.json` | **Vercel KV** (required) |
| Slack user poller | Local only | Use Slack Events API → `/api/slack/events` |

## Steps

### 1. Create a Vercel project

```bash
npm i -g vercel   # or use npx vercel
vercel link
```

Import this repo in the [Vercel dashboard](https://vercel.com/new) if you prefer the UI.

### 2. Add Vercel KV (required for job history)

1. Vercel project → **Storage** → **Create Database** → **KV**
2. Connect it to the project — this sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically

Without KV, serverless functions have no persistent disk and job/chat state is lost between requests.

### 3. Set environment variables

In Vercel → **Settings** → **Environment Variables**, add:

| Variable | Required |
|----------|----------|
| `CURSOR_WEBHOOK_URL` | Yes |
| `CURSOR_WEBHOOK_TOKEN` | Yes |
| `CURSOR_STATUS_WEBHOOK_SECRET` | Yes (32+ chars) |
| `TELEGRAM_BOT_TOKEN` | Yes |
| `TELEGRAM_WEBHOOK_SECRET` | Recommended |
| `REPLY_WEBHOOK_SECRET` | Recommended |
| `CRON_SECRET` | Recommended (protects `/api/cursor/poll`) |
| `SLACK_BOT_TOKEN` + `SLACK_SIGNING_SECRET` | If using Slack Events API |

You do **not** need to set `PUBLIC_URL` on Vercel — Relay infers it from `VERCEL_URL`.

### 4. Deploy

```bash
vercel --prod
```

### 5. Register Telegram webhook (once per deploy URL)

```bash
curl -X POST "https://YOUR-APP.vercel.app/api/setup" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Or open the URL in the dashboard after deploy — the **Status webhook** card should show green.

### 6. Cursor webhook

Relay **automatically** attaches `webhook: { url, secret }` to every Cursor automation dispatch when `CURSOR_STATUS_WEBHOOK_SECRET` is set. No manual Cursor dashboard step needed for Telegram-triggered jobs.

## Artifacts

If the agent writes `artifacts/foo-report.md` but Telegram only gets text, Cursor’s artifacts API may not have published the file yet. Relay:

1. **Waits for the chat answer on the status webhook** (does not return 200 until Telegram/Slack has the text — this is what removes the long delay)
2. Retries artifact download after the response (`after()`) and again via `/api/cursor/poll` cron, using stored `pendingArtifacts`
3. Sends the file as a **second message** when Cursor publishes it

If the file never appears in Cursor’s API, open the agent run on cursor.com — that’s a Cursor platform limitation, not Relay dropping the file.

The existing Vercel project must build from this repo’s `app/` directory. A deploy with no `app/` or `pages/` folder will fail with `missing_pages_app`.
