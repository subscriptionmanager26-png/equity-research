/** Convert GitHub-flavored markdown into Slack mrkdwn or Telegram HTML. */

type Segment = { kind: "code" | "text"; value: string };

function splitFences(markdown: string): Segment[] {
  const parts: Segment[] = [];
  const re = /```([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown))) {
    if (match.index > last) {
      parts.push({ kind: "text", value: markdown.slice(last, match.index) });
    }
    parts.push({ kind: "code", value: match[1] ?? "" });
    last = match.index + match[0].length;
  }
  if (last < markdown.length) {
    parts.push({ kind: "text", value: markdown.slice(last) });
  }
  return parts.length ? parts : [{ kind: "text", value: markdown }];
}

function convertTablesToCode(text: string) {
  const lines = text.split("\n");
  const out: string[] = [];
  let table: string[] = [];
  const flush = () => {
    if (!table.length) return;
    out.push("```", ...table, "```");
    table = [];
  };
  for (const line of lines) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      table.push(line.trim());
      continue;
    }
    flush();
    out.push(line);
  }
  flush();
  return out.join("\n");
}

function convertCommon(text: string, style: "slack" | "telegram") {
  let s = convertTablesToCode(text);
  s = s.replace(/^#{1,6}\s+(.+)$/gm, style === "slack" ? "*$1*" : "<b>$1</b>");
  s = s.replace(/^---+$/gm, "");
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) =>
    style === "slack"
      ? `<${url}|${alt || url}>`
      : `<a href="${escapeAttr(url)}">${escapeHtml(alt || url)}</a>`,
  );
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
    style === "slack"
      ? `<${url}|${label}>`
      : `<a href="${escapeAttr(url)}">${escapeHtml(label)}</a>`,
  );
  s = s.replace(/\*\*(.+?)\*\*/g, style === "slack" ? "*$1*" : "<b>$1</b>");
  s = s.replace(/__(.+?)__/g, style === "slack" ? "*$1*" : "<b>$1</b>");
  s = s.replace(/~~(.+?)~~/g, style === "slack" ? "~$1~" : "<s>$1</s>");
  if (style === "telegram") {
    s = s.replace(/(^|[^\w*])\*(?!\*)([^*\n]+)\*(?!\*)/g, "$1<i>$2</i>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  }
  return s;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function slackFence(code: string) {
  return "```" + code.replace(/```/g, "'''") + "```";
}

function telegramFence(code: string) {
  return `<pre>${escapeHtml(code)}</pre>`;
}

export function markdownToSlackMrkdwn(markdown: string) {
  return splitFences(markdown)
    .map((part) =>
      part.kind === "code" ? slackFence(part.value) : convertCommon(part.value, "slack"),
    )
    .join("")
    .trim();
}

export function markdownToTelegramHtml(markdown: string) {
  return splitFences(markdown)
    .map((part) =>
      part.kind === "code"
        ? telegramFence(part.value)
        : convertCommon(part.value, "telegram"),
    )
    .join("")
    .trim();
}
