# Slack setup

Relay answers Slack **as you** with `SLACK_USER_TOKEN`. It **searches** any channel or DM you can already read for `pocketedge` / `@pocketedge`. You do **not** invite a bot to each channel. Replies are **thread-only** (not also posted to the channel).

## Production (Vercel)

1. Create a Slack app (or reuse yours) and add **User Token Scopes** below, then reinstall so you get an `xoxp-…` token.
2. Set on Vercel Production: `SLACK_USER_TOKEN`, `SLACK_TRIGGER_WORD=pocketedge`, `CRON_SECRET`.
3. Optional: `SLACK_BOT_TOKEN` + `SLACK_SIGNING_SECRET` if you still want Events API as a backup. Not required for channel pickup.

Relay scans Slack about every 8 seconds (user-token search) and whenever the dashboard, Telegram, or `/api/slack/poll` runs. A daily cron restarts the scan if it went idle.

Say `@pocketedge …` in any channel you can read. In **channels**, only messages that mention `@pocketedge` start a job or a follow-up — ordinary channel or thread chatter is left alone. In **DMs with you**, a thread reply is still a follow-up without the mention.

Telegram and Slack stay separate. A Slack question is answered in that Slack thread only.

### Slack app settings if you created the app by hand

- **Event Subscriptions** (optional backup) → Request URL: `https://equity-research-ivory.vercel.app/api/slack/events`
- Subscribe to bot events: `app_mention`, `message.channels`, `message.groups`, `message.im`, `message.mpim`
- Bot token scopes (optional): `app_mentions:read`, `chat:write`, `channels:history`, `groups:history`, `im:history`, `mpim:history`, `files:read`, `files:write`, `users:read`, `reactions:write`

---

## Local only — reply as **you** (no bot invite)

You do **not** need a Slack bot invited to every channel.

Relay uses your **user token** (`xoxp-…`) to:

1. **Search** Slack for messages containing `pocketedge` in any channel you can already read
2. **Reply in-thread as you** (`chat.postMessage` with your user token)
3. **Follow-ups:** in DMs, thread replies continue the agent; in channels, say `@pocketedge` again so group chat is not treated as a question

No app named "Pocketedge" is required. `pocketedge` is just a trigger word.

---

## What to put in `.env.local`

```bash
SLACK_USER_TOKEN=xoxp-…
SLACK_TRIGGER_WORD=pocketedge
```

That is all you need for the workflow you described.

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

On Vercel this **is** the right token (Events API). The table below only applies to **local** “reply as you” vs “reply as a bot”.

A **bot token** posts as a **bot user**. It must be **invited** to each channel (`/invite @Relay`).

| | User token `xoxp-` | Bot token `xoxb-` |
| --- | --- | --- |
| Replies as | **You** | A bot |
| Channel invites | **Not needed** (uses your membership) | Needed per channel |
| How Relay listens | Workspace search + your threads | App events / Socket Mode |

If you gave Relay a bot token expecting it to reply as you, it cannot — that is a Slack platform rule. Keep the bot token out of `.env.local` unless you explicitly want a separate bot identity.

---

## Optional: limit to specific channels

If `search:read` is unavailable on your plan, set channel IDs you are already in:

```bash
SLACK_CHANNEL_IDS=C01234567,C76543210
```

---

## Try it

In any channel you already belong to:

```
@pocketedge summarize the Q3 plan
```

Relay acks in that thread and posts the Cursor answer **as your Slack account** when the run finishes.

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

**Yes — DMs work**, with the user token (`xoxp-`):

- Someone DMs you: `@pocketedge summarize this` → Relay triggers and replies in that DM **as you**
- You start a DM: send `@pocketedge …` to a coworker (or yourself) → Relay triggers on your message too
- Thread replies in a DM continue the agent without `@pocketedge`. In a channel, mention `@pocketedge` again.

Make sure the user token has `im:history`, `im:read`, and `search:read`. No bot invite is needed for DMs you are already in.
