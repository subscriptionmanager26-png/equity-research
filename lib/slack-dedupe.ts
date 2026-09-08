/** Canonical Redis/store key for a Slack inbound message (Events API + poll). */
export function slackInboundDedupeKey(
  channel: string,
  ts: string,
  teamId?: string,
) {
  const team = teamId?.trim();
  return team ? `${team}:${channel}:${ts}` : `${channel}:${ts}`;
}
