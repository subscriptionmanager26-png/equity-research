"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bot,
  Check,
  Copy,
  LoaderCircle,
  Radio,
  Send,
  TriangleAlert,
} from "lucide-react";

import type { Job } from "@/lib/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AUTOMATION_PROMPT } from "@/lib/automation-prompt";

type StatusPayload = {
  cursorConfigured: boolean;
  telegramConfigured: boolean;
  slackConfigured: boolean;
  slackBotConfigured: boolean;
  slackUserConfigured: boolean;
  slackSocketConfigured: boolean;
  slackUserPollConfigured: boolean;
  slackReplyAsUser: boolean;
  slackTriggerWord: string;
  replyConfigured: boolean;
  publicUrlSet: boolean;
  cursorStatusConfigured?: boolean;
  cursorStatusWebhookUrl?: string;
  telegramChatIdSet: boolean;
  replyUrl: string;
  slackEventsPath: string;
  bot: { username?: string; name?: string } | null;
  slackBot: { name?: string; userId?: string } | null;
  chats: {
    chatId: number;
    username?: string;
    displayName?: string;
    lastMessageAt: string;
  }[];
  jobCount: number;
};


function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1 px-2 text-xs text-muted-foreground"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {label ?? (copied ? "Copied" : "Copy")}
    </Button>
  );
}

function StatusDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  const color = ok
    ? "bg-emerald-400"
    : warn
      ? "bg-amber-400"
      : "bg-zinc-500";
  return (
    <span className={`inline-block size-1.5 rounded-full ${color}`} />
  );
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(iso));
}

function statusBadge(status: Job["status"]) {
  if (status === "replied") return { label: "Replied", variant: "default" as const };
  if (status === "delivering")
    return { label: "Sending", variant: "secondary" as const };
  if (status === "dispatched")
    return { label: "Waiting", variant: "secondary" as const };
  if (status === "error")
    return { label: "Error", variant: "destructive" as const };
  return { label: "Queued", variant: "outline" as const };
}

export function Dashboard() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [statusRes, jobsRes] = await Promise.all([
        fetch("/api/status"),
        fetch("/api/jobs"),
      ]);
      if (!statusRes.ok || !jobsRes.ok) {
        throw new Error("Could not load Relay status");
      }
      setStatus((await statusRes.json()) as StatusPayload);
      const payload = (await jobsRes.json()) as { jobs: Job[] };
      setJobs(payload.jobs);
      setLoadError(null);
      setReady(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Load failed");
    }
  }, []);

  useEffect(() => {
    const immediate = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => {
      window.clearTimeout(immediate);
      window.clearInterval(timer);
    };
  }, [refresh]);

  async function sendMessage() {
    const prompt = text.trim();
    if (!prompt || sending) return;
    setSending(true);
    setActionError(null);
    try {
      const response = await fetch("/api/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: prompt }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not send to Cursor");
      }
      setText("");
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function simulateReply() {
    setSimulating(true);
    setActionError(null);
    try {
      const response = await fetch("/api/jobs/simulate", { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Simulate failed");
      }
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Simulate failed");
    } finally {
      setSimulating(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sky-300">
            <Radio className="size-4" />
            <p className="text-xs font-medium tracking-[0.2em] uppercase">
              Telegram · Cursor
            </p>
          </div>
          <h1 className="font-heading text-3xl tracking-tight text-white sm:text-4xl">
            Relay
          </h1>
          <p className="max-w-xl text-sm leading-6 text-zinc-400">
            Message your Telegram bot or include <code className="font-mono text-[12px] text-sky-200">@{status?.slackTriggerWord ?? "pocketedge"}</code> in Slack. Relay posts to Cursor and replies in the same chat or thread.
          </p>
        </div>
        <a
          href="https://cursor.com/automations/abd6db4e-a511-11f1-a7d1-d6b4613131ce"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-zinc-400 transition hover:text-white"
        >
          Open automation
          <ArrowUpRight className="size-3.5" />
        </a>
      </header>

      {loadError ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {loadError}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="Cursor cloud agent"
          ok={Boolean(status?.cursorConfigured)}
          detail={
            status?.cursorConfigured
              ? "API token loaded. Relay launches a cloud agent on this repo for each message."
              : "Set CURSOR_WEBHOOK_TOKEN in .env.local (Cursor API key)."
          }
        />
        <StatusCard
          title="Telegram bot"
          ok={Boolean(status?.telegramConfigured)}
          warn={Boolean(status?.telegramConfigured && !status.chats.length)}
          detail={
            status?.telegramConfigured
              ? status.bot?.username
                ? `@${status.bot.username}${
                    status.chats[0]
                      ? ` · last chat ${status.chats[0].displayName ?? status.chats[0].chatId}`
                      : " · send /start to register a chat"
                  }`
                : "Token set. Send /start so Relay can store your chat id."
              : "Add TELEGRAM_BOT_TOKEN from @BotFather to receive replies in Telegram."
          }
        />
        <StatusCard
          title="Slack (as you)"
          ok={Boolean(status?.slackUserPollConfigured)}
          detail={
            status?.slackUserPollConfigured
              ? `User token — searches for "${status.slackTriggerWord}" in channels you can already read. Replies as you. No bot invites.`
              : status?.slackSocketConfigured
                ? `Bot app mode — replies as ${status.slackBot?.name ?? "the bot"}, not as you. Prefer SLACK_USER_TOKEN instead.`
                : "Set SLACK_USER_TOKEN (xoxp-) to trigger from Slack and reply as yourself."
          }
        />
        <StatusCard
          title="Status webhook"
          ok={Boolean(status?.cursorStatusConfigured)}
          warn={Boolean(status?.publicUrlSet && !status?.cursorStatusConfigured)}
          detail={
            status?.cursorStatusConfigured
              ? "Cursor notifies Relay when agents finish — fast delivery."
              : status?.publicUrlSet
                ? "Set CURSOR_STATUS_WEBHOOK_SECRET and add the URL in Cursor → Cloud Agents → Webhooks."
                : "Set PUBLIC_URL + CURSOR_STATUS_WEBHOOK_SECRET for instant delivery (polling is the fallback)."
          }
        />
        <StatusCard
          title="Agent reply"
          ok={Boolean(
            (status?.telegramConfigured && status.chats.length) ||
              status?.slackConfigured,
          )}
          detail={
            status?.slackConfigured || status?.telegramConfigured
              ? "Relay delivers Cursor answers to Telegram chats and Slack threads."
              : "Configure Telegram and/or Slack so Relay can deliver answers."
          }
        />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-6">
          <Card className="border-white/5 bg-zinc-950/60 ring-white/10">
            <CardHeader>
              <CardTitle>Ask the agent</CardTitle>
              <CardDescription>
                Same path as Telegram: your text is POSTed to the Cursor
                automation. The agent replies in the linked Telegram chat.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Summarize what changed in this repo and reply in Telegram."
                className="min-h-28 resize-y bg-zinc-900/80"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
              />
              {actionError ? (
                <p className="text-sm text-red-300">{actionError}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void sendMessage()}
                  disabled={sending || !text.trim()}
                >
                  {sending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                  Send to Cursor
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void simulateReply()}
                  disabled={simulating || jobs.length === 0}
                >
                  {simulating ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Bot className="size-4" />
                  )}
                  Simulate agent reply
                </Button>
              </div>
              <p className="text-xs text-zinc-500">
                Ctrl/⌘ + Enter to send. Simulate posts a fake answer through
                the same reply path, including Telegram if a chat is registered.
              </p>
            </CardContent>
          </Card>

          <Card className="border-white/5 bg-zinc-950/60 ring-white/10">
            <CardHeader>
              <CardTitle>Automation prompt</CardTitle>
              <CardDescription>
                Paste this into the Cursor automation. Relay delivers the
                answer; the agent should only write it.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-200">
                  Paste into cursor.com/automations
                </p>
                <CopyButton value={AUTOMATION_PROMPT} label="Copy prompt" />
              </div>
              <pre className="overflow-x-auto rounded-lg bg-black/50 p-3 font-mono text-[11px] leading-5 text-zinc-300">
                {AUTOMATION_PROMPT}
              </pre>
              <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-3 text-sm leading-6 text-zinc-300">
                <p className="font-medium text-amber-100">
                  Fast delivery — Cursor status webhook
                </p>
                <p className="mt-2 text-xs text-zinc-400">
                  When <code className="font-mono text-[11px]">PUBLIC_URL</code> and{" "}
                  <code className="font-mono text-[11px]">CURSOR_STATUS_WEBHOOK_SECRET</code>{" "}
                  are set, Relay attaches the status webhook to every Cursor dispatch
                  automatically. Optional global URL for agents started outside Relay:{" "}
                  {status?.cursorStatusWebhookUrl ? (
                    <code className="font-mono text-[11px] text-amber-200">
                      {status.cursorStatusWebhookUrl}
                    </code>
                  ) : (
                    <code className="font-mono text-[11px] text-amber-200">
                      {"{PUBLIC_URL}"}/api/cursor/status
                    </code>
                  )}
                  .
                </p>
                {status?.cursorStatusWebhookUrl ? (
                  <div className="mt-2">
                    <CopyButton
                      value={status.cursorStatusWebhookUrl}
                      label="Copy webhook URL"
                    />
                  </div>
                ) : null}
              </div>
              <div className="rounded-lg border border-sky-400/20 bg-sky-400/5 px-3 py-3 text-sm leading-6 text-zinc-300">
                <p className="font-medium text-sky-100">
                  Financial-analysis skill (in this repo)
                </p>
                <p className="mt-2 text-xs text-zinc-400">
                  Cloud agents load{" "}
                  <code className="font-mono text-[11px] text-sky-200">
                    .cursor/skills/research/financial-analysis/SKILL.md
                  </code>
                  . Point the Cursor automation at{" "}
                  <strong className="font-medium text-zinc-300">this
                  repository</strong>
                  , paste the prompt above, and Save. Relay forwards the agent&apos;s
                  chat message and any{" "}
                  <code className="font-mono text-[11px] text-sky-200">
                    artifacts/*.md
                  </code>{" "}
                  files unchanged — no PDF unless asked.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-white/5 bg-zinc-950/60 ring-white/10">
          <CardHeader>
            <CardTitle>Traffic</CardTitle>
            <CardDescription>
              {status
                ? `${status.jobCount} job${status.jobCount === 1 ? "" : "s"} recorded`
                : "Loading jobs…"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!ready ? (
              <div className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-10 text-sm text-zinc-400">
                <LoaderCircle className="size-4 animate-spin" />
                Loading jobs…
              </div>
            ) : jobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center">
                <p className="text-sm text-zinc-300">No jobs yet</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Send a message from the composer, or text your Telegram bot.
                </p>
              </div>
            ) : (
              <ol className="flex flex-col gap-3">
                {jobs.map((job) => {
                  const badge = statusBadge(job.status);
                  return (
                    <li
                      key={job.id}
                      className="rounded-xl border border-white/8 bg-black/30 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                          <span className="font-mono text-[11px] text-zinc-500">
                            {job.id.slice(0, 18)}
                          </span>
                        </div>
                        <span className="text-xs text-zinc-500">
                          {formatTime(job.updatedAt)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-zinc-200">
                        {job.prompt}
                      </p>
                      {job.files?.length ? (
                        <p className="mt-1 text-xs text-sky-200/80">
                          {job.files.map((file) => file.name).join(", ")}
                        </p>
                      ) : null}
                      {job.reply ? (
                        <div className="mt-3 rounded-lg bg-sky-400/8 px-3 py-2 text-sm leading-6 text-sky-50">
                          {job.reply.message}
                          {job.reply.files?.length ? (
                            <p className="mt-2 text-xs text-sky-200/80">
                              Sent files: {job.reply.files.join(", ")}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {job.error ? (
                        <p className="mt-2 text-sm text-red-300">{job.error}</p>
                      ) : null}
                      <p className="mt-2 text-xs text-zinc-500">
                        {job.source === "telegram"
                          ? `Telegram${job.displayName ? ` · ${job.displayName}` : ""}`
                          : job.source === "slack"
                            ? `Slack${job.slackChannelId ? ` · ${job.slackChannelId}` : ""}${job.displayName ? ` · ${job.displayName}` : ""}`
                            : "Dashboard"}
                        {job.events[0] ? ` · ${job.events[0].detail}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusCard({
  title,
  detail,
  ok,
  warn,
}: {
  title: string;
  detail: string;
  ok: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-zinc-950/50 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
        <StatusDot ok={ok} warn={warn} />
        {title}
      </div>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p>
    </div>
  );
}
