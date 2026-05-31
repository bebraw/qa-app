export type PanelRole = "attendee" | "mc" | "moderator";

export type QuestionStatus = "available" | "active" | "done" | "hidden";

export interface PanelQuestion {
  readonly id: string;
  readonly text: string;
  readonly proposedBy: PanelRole;
  readonly createdAt: number;
  readonly voterIds: ReadonlySet<string>;
  readonly status: QuestionStatus;
}

export interface PublicQuestion {
  readonly id: string;
  readonly text: string;
  readonly proposedBy: PanelRole;
  readonly createdAt: number;
  readonly votes: number;
  readonly status: QuestionStatus;
  readonly votedByCurrentUser: boolean;
}

export interface QuestionSubmissionResult {
  readonly ok: boolean;
  readonly message: string;
  readonly question?: PublicQuestion;
}

interface RateLimitBucket {
  readonly timestamps: number[];
}

interface PanelStore {
  readonly questions: Map<string, PanelQuestion>;
  readonly rateLimits: Map<string, RateLimitBucket>;
}

const store: PanelStore = {
  questions: new Map(),
  rateLimits: new Map(),
};

const maximumQuestionLength = 220;
const maximumQuestionSubmissions = 3;
const questionWindowMs = 60_000;
const maximumVotes = 80;
const voteWindowMs = 60_000;

export function proposeQuestion(input: {
  readonly text: string;
  readonly role: PanelRole;
  readonly clientId: string;
  readonly ipAddress: string;
  readonly now?: number;
}): QuestionSubmissionResult {
  const now = input.now ?? Date.now();
  const text = normalizeQuestion(input.text);

  if (text.length < 8) {
    return { ok: false, message: "Question is too short." };
  }

  if (isRateLimited(`question:${input.ipAddress}`, maximumQuestionSubmissions, questionWindowMs, now)) {
    return { ok: false, message: "Please wait before adding another question." };
  }

  const id = createQuestionId();
  const question: PanelQuestion = {
    id,
    text,
    proposedBy: input.role,
    createdAt: now,
    voterIds: new Set([input.clientId]),
    status: "available",
  };

  store.questions.set(id, question);

  return {
    ok: true,
    message: "Question added.",
    question: toPublicQuestion(question, input.clientId),
  };
}

export function voteForQuestion(input: {
  readonly id: string;
  readonly clientId: string;
  readonly ipAddress: string;
  readonly now?: number;
}): boolean {
  const now = input.now ?? Date.now();

  if (isRateLimited(`vote:${input.ipAddress}`, maximumVotes, voteWindowMs, now)) {
    return false;
  }

  const question = store.questions.get(input.id);

  if (!question || question.status === "hidden" || question.status === "done" || question.voterIds.has(input.clientId)) {
    return false;
  }

  store.questions.set(input.id, {
    ...question,
    voterIds: new Set([...question.voterIds, input.clientId]),
  });

  return true;
}

export function chooseActiveQuestion(id: string): boolean {
  const selected = store.questions.get(id);

  if (!selected || selected.status === "hidden" || selected.status === "done") {
    return false;
  }

  for (const question of store.questions.values()) {
    if (question.status === "active") {
      store.questions.set(question.id, { ...question, status: "available" });
    }
  }

  store.questions.set(id, { ...selected, status: "active" });
  return true;
}

export function markActiveQuestionDone(): boolean {
  const active = getActiveQuestion();

  if (!active) {
    return false;
  }

  store.questions.set(active.id, { ...active, status: "done" });
  return true;
}

export function hideQuestion(id: string): boolean {
  const question = store.questions.get(id);

  if (!question || question.status === "done") {
    return false;
  }

  store.questions.set(id, { ...question, status: "hidden" });
  return true;
}

export function resetPanel(): void {
  store.questions.clear();
}

export function listAudienceQuestions(clientId: string): PublicQuestion[] {
  return sortQuestions(
    [...store.questions.values()].filter((question) => question.status === "available" || question.status === "active"),
  ).map((question) => toPublicQuestion(question, clientId));
}

export function listModeratorQuestions(clientId: string): PublicQuestion[] {
  return sortQuestions([...store.questions.values()].filter((question) => question.status !== "done")).map((question) =>
    toPublicQuestion(question, clientId),
  );
}

export function listMcQuestions(clientId: string): PublicQuestion[] {
  return sortQuestions(
    [...store.questions.values()].filter((question) => question.status === "available" || question.status === "active"),
  ).map((question) => toPublicQuestion(question, clientId));
}

export function getActivePublicQuestion(): PublicQuestion | undefined {
  const active = getActiveQuestion();
  return active ? toPublicQuestion(active, "") : undefined;
}

export function clearPanelStateForTests(): void {
  store.questions.clear();
  store.rateLimits.clear();
}

function getActiveQuestion(): PanelQuestion | undefined {
  return [...store.questions.values()].find((question) => question.status === "active");
}

function normalizeQuestion(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim().slice(0, maximumQuestionLength);
}

function toPublicQuestion(question: PanelQuestion, clientId: string): PublicQuestion {
  return {
    id: question.id,
    text: question.text,
    proposedBy: question.proposedBy,
    createdAt: question.createdAt,
    votes: question.voterIds.size,
    status: question.status,
    votedByCurrentUser: question.voterIds.has(clientId),
  };
}

function sortQuestions(questions: PanelQuestion[]): PanelQuestion[] {
  return [...questions].sort((left: PanelQuestion, right: PanelQuestion) => {
    if (left.status === "active" && right.status !== "active") {
      return -1;
    }

    if (right.status === "active" && left.status !== "active") {
      return 1;
    }

    const voteDifference = right.voterIds.size - left.voterIds.size;

    if (voteDifference !== 0) {
      return voteDifference;
    }

    return left.createdAt - right.createdAt;
  });
}

function isRateLimited(key: string, maximum: number, windowMs: number, now: number): boolean {
  const bucket = store.rateLimits.get(key) ?? { timestamps: [] };
  const recentTimestamps = bucket.timestamps.filter((timestamp) => now - timestamp < windowMs);

  if (recentTimestamps.length >= maximum) {
    store.rateLimits.set(key, { timestamps: recentTimestamps });
    return true;
  }

  store.rateLimits.set(key, { timestamps: [...recentTimestamps, now] });
  return false;
}

function createQuestionId(): string {
  return globalThis.crypto.randomUUID();
}
