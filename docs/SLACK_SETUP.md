# Slack setup

Relay answers Slack **as the Pocketedge bot** (`SLACK_BOT_TOKEN`). Replies are **thread-only**.

## Production (Vercel) — Events API

Slack pushes messages to Relay in ~1–2 seconds via the **Events API**. No background polling runs on Vercel.

1. Create a Slack app (or reuse yours) at [api.slack.com/apps](https://api.slack.com/apps).
2. Set on Vercel Production: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_TRIGGER_WORD=pocketedge`, `CRON_SECRET`, and `PUBLIC_URL` (or rely on `VERCEL_URL`).
3. Optional: `QSTASH_TOKEN` — only needed on the deploy that removes a legacy minute poll schedule (see below).

### Slack app settings

| Setting | Value |
| --- | --- |
| **Event Subscriptions** | Enabled |
| **Request URL** | `https://equity-research-ivory.vercel.app/api/slack/events` |
| **Bot events** | `app_mention`, `message.channels`, `message.groups`, `message.im`, `message.mpim`, `app_uninstalled` |

**Bot token scopes:** `app_mentions:read`, `chat:write`, `files:read`, `files:write`, `channels:history`, `groups:history`, `im:history`, `mpim:history`, `users:read`, `reactions:write`

Invite the bot (`/invite @newsagent`) to channels where `@pocketedge` should work.

Say `@pocketedge …` in any channel the bot is in. In **channels**, only messages that mention `@pocketedge` start a job or a follow-up. In **DMs**, a thread reply continues the agent without the mention.

Telegram and Slack stay separate. A Slack question is answered in that Slack thread only.

### Manual catch-up after downtime

If Relay was down when Slack sent an event, that message is lost unless the user mentions again. For rare recovery, run a **manual** scan (costs Active CPU — use sparingly):

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
  "https://equity-research-ivory.vercel.app/api/slack/poll?force=1"
```

Requires `SLACK_USER_TOKEN` on Vercel if you rely on workspace search; bot-token Events API does not need it for normal operation.

### Legacy QStash schedule cleanup

If you previously used minute polling, delete schedule **`relay-slack-poll-minute`** in [Upstash QStash](https://console.upstash.com/qstash), or set `QSTASH_TOKEN` once on deploy so Relay deletes it automatically.

---

## Local only — reply as **you** (user token polling)

You do **not** need a Slack bot invited to every channel.

Relay uses your **user token** (`xoxp-…`) to:

1. **Search** Slack for messages containing `pocketedge` in any channel you can already read
2. **Reply in-thread as you** (`chat.postMessage` with your user token)
3. **Follow-ups:** in DMs, thread replies continue the agent; in channels, say `@pocketedge` again so group chat is not treated as a question

No app named "Pocketedge" is required. `pocketedge` is just a trigger word.

Local dev runs `startSlackUserPoller()` — a long-running search loop (`npm run dev`). This does not run on Vercel.

---

## What to put in `.env.local`

```bash
SLACK_USER_TOKEN=xoxp-…
SLACK_TRIGGER_WORD=pocketedge
```

That is all you need for the local user-token workflow.

### User token scopes

At [api.slack.com/apps](https://api.slack.com/apps) → your app → **OAuth & Permissions** → **User Token Scopes**:

| Scope | Why |
| --- | --- |
| `search:read` | Find `pocketedge` in channels and DMs you can read |
| `channels:history`, `groups:history` | Read thread context in channels |
| `im:history`, `im:read` | Direct messages (1:1 DMs) |
| `mpim:history` | Group DMs |
| `channels:read`, `groups:read` | Resolve channels |
| `chat:write` | Post replies **as you** |
| `reactions:write` | 👀 while working, 👍 when the answer is posted |
| `files:write` | Send markdown attachments |
| `users:read` | Identify senders |

Reinstall/reauthorize after adding scopes.

---

## Bot token (`xoxb-…`) on Vercel

On Vercel this **is** the production token (Events API). The table below only applies to **local** “reply as you” vs “reply as a bot”.

A **bot token** posts as a **bot user**. It must be **invited** to each channel (`/invite @Relay`).

| | User token `xoxp-` | Bot token `xoxb-` |
| --- | --- | --- |
| Replies as | **You** | A bot |
| Channel invites | **Not needed** (uses your membership) | Needed per channel |
| How Relay listens | Workspace search + your threads (local) | App events (Vercel) |

If you gave Relay a bot token expecting it to reply as you, it cannot — that is a Slack platform rule. Keep the bot token out of `.env.local` unless you explicitly want a separate bot identity.

---

## Optional: limit to specific channels

If `search:read` is unavailable on your plan, set channel IDs you are already in:

```bash
SLACK_CHANNEL_IDS=C01234567,C76543210
```

---

## Try it

In any channel the bot is in:

```
@pocketedge summarize the Q3 plan
```

Relay acks in that thread and posts the Cursor answer when the run finishes.

Thread follow-up in a **channel** (must mention `@pocketedge`):

```
@pocketedge also add risks
```

In a **DM**, a normal thread reply is enough.

---

## Security

If you pasted a token in chat, revoke it at api.slack.com → OAuth & Permissions → Revoke, then generate a new one.

Telegram and Slack stay fully separate — answers never cross platforms.

---

## Direct messages (DMs)

**Yes — DMs work** with the bot token on Vercel (`message.im` event) or with the user token locally.

- Someone DMs the bot: `@pocketedge summarize this` → Relay triggers and replies in that DM
- Thread replies in a DM continue the agent without `@pocketedge`. In a channel, mention `@pocketedge` again.

Make sure the bot has `im:history` (and related scopes). For local user-token mode, include `im:history`, `im:read`, and `search:read`.
