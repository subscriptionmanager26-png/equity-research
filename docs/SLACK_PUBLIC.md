# Slack public distribution (multi-workspace)

Pocketedge supports **OAuth install** so any Slack workspace can add the app without copying tokens into your Vercel project.

## How it works

1. You host one Relay deployment (e.g. `https://equity-research-ivory.vercel.app`).
2. Each workspace admin visits **`/api/slack/oauth`** and approves the install.
3. Relay stores that workspace's bot token in Upstash Redis (encrypted).
4. Events from that workspace include `team_id`; jobs and replies use the matching token.

Your existing **env-var tokens** (`SLACK_BOT_TOKEN`, `SLACK_USER_TOKEN`) still work as a single-workspace fallback for your own workspace.

## Slack app checklist

In [api.slack.com/apps](https://api.slack.com/apps) → your app:

### OAuth & Permissions

| Setting | Value |
| --- | --- |
| **Redirect URL** | `https://YOUR_PUBLIC_URL/api/slack/oauth/callback` |
| **Bot Token Scopes** | See `docs/slack-app-manifest.yaml` |

Copy **Client ID** and **Client Secret** to Vercel:

```bash
SLACK_CLIENT_ID=…
SLACK_CLIENT_SECRET=…
PUBLIC_URL=https://YOUR_PUBLIC_URL
SLACK_SIGNING_SECRET=…   # Basic Information → App Credentials
```

### Event Subscriptions

| Setting | Value |
| --- | --- |
| **Request URL** | `https://YOUR_PUBLIC_URL/api/slack/events` |
| **Subscribe to bot events** | `app_mention`, `message.*`, `app_uninstalled` |

### Manage Distribution

1. **Remove hardcoded workspace URLs** from the manifest (use your `PUBLIC_URL`).
2. Under **Manage Distribution** → enable **Activate Public Distribution** when ready.
3. Slack requires a **privacy policy** and **support URL** before App Directory listing.

## Install link

Share this with other workspaces:

```
https://YOUR_PUBLIC_URL/api/slack/oauth
```

After install they are redirected to `/?slack=installed&team=…`.

## Usage in installed workspaces

1. Invite the bot: `/invite @Pocketedge` in each channel.
2. Mention the bot: `@Pocketedge summarize NVDA earnings`.
3. Replies and file attachments are posted **as the bot** in that thread.

The minute poll (`/api/slack/poll`) and user-token search only apply to **your** env-configured workspace. OAuth workspaces rely on the **Events API**.

## Security

- Bot tokens are encrypted at rest (AES-256-GCM, key derived from `SLACK_CLIENT_SECRET` or `CRON_SECRET`).
- `app_uninstalled` removes the workspace install from Redis.
- Rotate `SLACK_CLIENT_SECRET` if it was ever exposed; workspaces must reinstall.

## Optional: single-workspace operator mode

Keep `SLACK_USER_TOKEN` on Vercel for your own workspace if you want poll/search without inviting the bot everywhere. OAuth installs are independent.
