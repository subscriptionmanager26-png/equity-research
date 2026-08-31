# Slack setup — reply as **you**, no bot in every channel

You do **not** need a Slack bot invited to every channel.

Relay uses your **user token** (`xoxp-…`) to:

1. **Search** Slack for messages containing `pocketedge` in any channel you can already read
2. **Reply in-thread as you** (`chat.postMessage` with your user token)
3. **Follow thread replies** without saying `pocketedge` again

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
| `files:write` | Send markdown attachments |
| `users:read` | Identify senders |

Reinstall/reauthorize after adding scopes.

---

## Bot token (`xoxb-…`) — you probably don't want this

A **bot token** posts as a **bot user**. It also usually must be **invited** to each channel (`/invite @bot`).

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

Thread follow-up (no `pocketedge` needed):

```
Can you also add risks?
```

---

## Security

If you pasted a token in chat, revoke it at api.slack.com → OAuth & Permissions → Revoke, then generate a new one.

Telegram and Slack stay fully separate — answers never cross platforms.

---

## Direct messages (DMs)

**Yes — DMs work**, with the user token (`xoxp-`):

- Someone DMs you: `@pocketedge summarize this` → Relay triggers and replies in that DM **as you**
- You start a DM: send `@pocketedge …` to a coworker (or yourself) → Relay triggers on your message too
- Thread replies in a DM work the same as channels (follow-ups without `pocketedge`)

Make sure the user token has `im:history`, `im:read`, and `search:read`. No bot invite is needed for DMs you are already in.
