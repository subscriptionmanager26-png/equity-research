# Slack OAuth scope justifications

Copy-paste text for Slack App Directory / public distribution review. Each reason is at least 75 characters.

For **public OAuth-only** installs, bot scopes are usually sufficient. User scopes are mainly for single-workspace operator mode (poll/search with `SLACK_USER_TOKEN`). See [SLACK_PUBLIC.md](./SLACK_PUBLIC.md).

---

## Bot token scopes

### app_mentions:read

PocketEdge starts work when users @mention the bot; this scope delivers those events so we can run Cursor and reply in-thread.

### assistant:write

PocketEdge may act as a Slack App Agent so users can invoke research tasks from Slack assistant surfaces, not only channel mentions.

*Optional — remove if you are not using Slack’s App Agent / Assistant UI.*

### channels:history

When @Pocketedge is mentioned in a channel thread, we read earlier messages in that thread to give the Cursor agent useful conversation context.

### chat:write

PocketEdge posts Cursor agent answers, status updates, and error messages back into the same Slack thread where the user asked the question.

### files:read

Users often attach PDFs or spreadsheets with their question; we download those files so the Cursor agent can read and analyze them.

### files:write

When Cursor produces report files (e.g. markdown), PocketEdge uploads them into the request thread so users get the full deliverable in Slack.

### im:history

Users can @mention PocketEdge in DMs; we read that DM thread’s history so follow-up questions and context are handled correctly.

### im:read

We need basic DM metadata to route mention and message events to the correct direct-message conversation for each workspace user.

### im:write

PocketEdge may open a direct message with a user when needed for onboarding, install confirmation, or a private response outside a channel.

*Optional — remove unless you proactively open DMs with users.*

### links:read

If a user shares a URL in their message, PocketEdge reads it so the Cursor agent can summarize or analyze the linked content on request.

*Optional — remove if unused.*

### links:write

When PocketEdge posts replies containing URLs, this scope allows Slack to show readable link previews in the thread for the team.

*Optional — remove if unused.*

### pins:read

Pinned channel messages sometimes contain key context; PocketEdge may read pins when building background for a user’s research question.

*Optional — remove if unused.*

### reactions:read

PocketEdge may read existing emoji reactions on messages when determining thread state or avoiding duplicate processing of the same request.

*Optional — remove if unused.*

### reactions:write

PocketEdge adds 👀 when a request is picked up and 👍 when the Cursor answer is posted, giving users clear status without extra chat noise.

### users.profile:read

We use basic profile fields (e.g. display name) only to label who asked a question in logs and agent prompts—not for marketing or outreach.

*Optional — remove if unused.*

### users:read

We resolve Slack user IDs to workspace members so PocketEdge can ignore its own bot messages and attribute inbound requests correctly.

### users:read.email

Only used if the workspace explicitly links Slack users to accounts by email; not used for cold outreach or any purpose outside user-initiated requests.

*Optional — remove unless you match users by email.*

### users:write

Used solely to set PocketEdge’s bot presence/availability status in Slack; we never modify human user profiles or account settings.

*Optional — remove if unused.*

---

## User token scopes

*For single-workspace operator mode only. Not required for public multi-workspace OAuth installs.*

### channels:history

In operator mode, the authorizing user’s token reads public channel threads so PocketEdge can gather context around @pocketedge messages they can already see.

### channels:read

We list and resolve public channel IDs when scanning configured channels or fetching thread context for messages the authorizing user can access.

### chat:write

In single-workspace mode, replies are posted in-thread on the authorizing user’s behalf when the deployment uses a user token instead of the bot.

### files:write

Uploads Cursor-generated report files into Slack threads on the authorizing user’s behalf when that workspace runs in user-token reply mode.

### groups:history

Same as public channels: read private-channel thread history the authorizing user already has access to, for context around @pocketedge requests.

### im:history

Reads DM thread history for the authorizing user so PocketEdge can handle @pocketedge questions and follow-ups in direct messages they participate in.

### im:read

Resolves DM conversation metadata for the authorizing user so polled or searched inbound messages are matched to the correct conversation.

### reactions:write

Adds 👀 while the agent is working and 👍 when done on the authorizing user’s behalf in operator mode, matching the bot’s status behavior.

### search:read

Backup ingress for the operator workspace: search recent messages containing @pocketedge when Events API delivery is delayed or unavailable.

### users:read

During search and polling, maps user IDs to workspace members so PocketEdge identifies senders and skips its own outbound messages.

---

## Recommended minimum (bot-only public distribution)

Matches the OAuth flow in `lib/slack-oauth.ts`:

- `app_mentions:read`
- `chat:write`
- `channels:history`
- `groups:history`
- `im:history`
- `mpim:history`
- `files:read`
- `files:write`
- `users:read`
- `reactions:write`
- `channels:read`
- `groups:read`
- `im:read`
