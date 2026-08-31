# Slack setup for Relay

You do **not** need a Slack app named "Pocketedge". Relay watches for the word **`pocketedge`** (configurable) in messages — e.g. `@pocketedge analyze this` or `pocketedge summarize the thread`.

## Option A — Quick start (user token only)

You already have a **user token** (`xoxp-…`). That is enough to try Slack without creating a bot app.

1. Put it in `.env.local`:
   ```bash
   SLACK_USER_TOKEN=xoxp-…
   SLACK_TRIGGER_WORD=pocketedge
   ```
2. Make sure the token has these **User Token Scopes** at [api.slack.com/apps](https://api.slack.com/apps) → your app → **OAuth & Permissions**:
   - `channels:history`, `channels:read`
   - `groups:history`, `groups:read`
   - `chat:write`, `files:write`
   - `users:read`
3. Restart Relay (`npm run dev`).
4. In a channel you belong to, post:
   ```
   @pocketedge what changed in our repo today?
   ```
5. Relay replies **in that thread** as **your Slack user** (because it uses your user token).

**Security:** If you pasted the token in chat or email, **revoke it** at api.slack.com/apps → OAuth & Permissions → Revoke, then generate a new one.

### Optional: limit which channels Relay watches

```bash
SLACK_CHANNEL_IDS=C01234567,C76543210
```

Leave empty to poll every channel your user has joined (up to 50).

---

## Option B — Slack bot app (recommended for production)

Replies come from a **bot** instead of your personal account.

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**. Name it anything (e.g. `relay-bot`).
2. **OAuth & Permissions** → Bot Token Scopes:
   - `app_mentions:read`
   - `channels:history`, `channels:read`, `groups:history`, `groups:read`
   - `chat:write`, `files:write`
   - `im:history`, `mpim:history`
   - `users:read`
3. **Install to Workspace** → copy **Bot User OAuth Token** → `SLACK_BOT_TOKEN=xoxb-…`
4. **Socket Mode** → Enable → create **App-Level Token** with `connections:write` → `SLACK_APP_TOKEN=xapp-…`
5. **Event Subscriptions** → Enable → Subscribe to:
   - `app_mention`
   - `message.channels`, `message.groups`, `message.im`, `message.mpim`
6. Invite the bot to channels: `/invite @relay-bot`
7. Mention it using your trigger word in the app’s display name, **or** keep using `pocketedge` in message text with Option A’s text matching if you also run the poller.

With Socket Mode, you do **not** need `PUBLIC_URL` for Slack triggers.

---

## Token cheat sheet

| Variable | Looks like | Purpose |
| --- | --- | --- |
| `SLACK_USER_TOKEN` | `xoxp-…` | Poll channels as you; post as you |
| `SLACK_BOT_TOKEN` | `xoxb-…` | Bot posts and receives `app_mention` events |
| `SLACK_APP_TOKEN` | `xapp-…` | Socket Mode connection |
| `SLACK_SIGNING_SECRET` | random string | Only for HTTPS Events API at `/api/slack/events` |
| `SLACK_TRIGGER_WORD` | `pocketedge` | Text that means “call Relay” (no app name required) |

---

## How triggering works

- **First message:** include `pocketedge` (or `@pocketedge`) with your question → Relay sends it to Cursor.
- **Thread follow-ups:** reply in the **same thread** without saying `pocketedge` again → Relay includes prior thread messages as context.
- **Telegram stays separate:** Slack jobs never reply on Telegram and vice versa.
