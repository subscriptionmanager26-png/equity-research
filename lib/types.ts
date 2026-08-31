export type JobStatus =
  | "queued"
  | "dispatched"
  | "replied"
  | "error";

export type JobSource = "telegram" | "dashboard";

export type JobEvent = {
  at: string;
  type: string;
  detail: string;
};

export type JobReply = {
  message: string;
  status: string;
  receivedAt: string;
  telegramMessageId?: number;
};

export type Job = {
  id: string;
  createdAt: string;
  updatedAt: string;
  source: JobSource;
  chatId?: number;
  username?: string;
  displayName?: string;
  prompt: string;
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

export type StoreData = {
  jobs: Job[];
  chats: TelegramChat[];
  inbound?: InboundMessage[];
  bot?: {
    id: number;
    username?: string;
    name?: string;
    checkedAt: string;
  };
  telegramOffset?: number;
};

export type InboundMessage = {
  at: string;
  chatId: number;
  text?: string;
  kind: string;
};
