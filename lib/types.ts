export type JobStatus =
  | "queued"
  | "dispatched"
  | "replied"
  | "error";

export type JobSource = "telegram" | "dashboard" | "slack";

export type JobEvent = {
  at: string;
  type: string;
  detail: string;
};

export type JobFile = {
  fileId: string;
  name: string;
  mime?: string;
  size?: number;
  /** Pre-resolved download URL (Slack private URLs). */
  url?: string;
};

export type JobReply = {
  message: string;
  status: string;
  receivedAt: string;
  telegramMessageId?: number;
  slackMessageTs?: string;
  files?: string[];
};

export type Job = {
  id: string;
  createdAt: string;
  updatedAt: string;
  source: JobSource;
  chatId?: number;
  username?: string;
  displayName?: string;
  slackChannelId?: string;
  slackThreadTs?: string;
  slackUserId?: string;
  slackMessageTs?: string;
  prompt: string;
  threadContext?: string;
  files?: JobFile[];
  status: JobStatus;
  cursorHttpStatus?: number;
  cursorBody?: unknown;
  cursorAgentId?: string;
  reply?: JobReply;
  error?: string;
  events: JobEvent[];
};

export type TelegramChat = {
  chatId: number;
  username?: string;
  displayName?: string;
  firstSeenAt: string;
  lastMessageAt: string;
};

export type SlackThreadRef = {
  channelId: string;
  threadTs: string;
  lastJobId?: string;
  updatedAt: string;
};

export type StoreData = {
  jobs: Job[];
  chats: TelegramChat[];
  slackThreads?: Record<string, SlackThreadRef>;
  processedSlackEvents?: string[];
  inbound?: InboundMessage[];
  bot?: {
    id: number;
    username?: string;
    name?: string;
    checkedAt: string;
  };
  slackBot?: {
    id: string;
    userId: string;
    teamId?: string;
    name?: string;
    checkedAt: string;
  };
  slackSearchCursor?: string;
  slackPollCursors?: Record<string, string>;
  processedSlackMessages?: string[];
  telegramOffset?: number;
};

export type InboundMessage = {
  at: string;
  chatId: number;
  text?: string;
  kind: string;
  files?: string[];
};

export type SlackInboundEvent = {
  type: string;
  user?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  channel: string;
  bot_id?: string;
  subtype?: string;
  files?: {
    id: string;
    name?: string;
    mimetype?: string;
    size?: number;
    url_private_download?: string;
  }[];
};
