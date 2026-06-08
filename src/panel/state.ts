export type PanelRole = "attendee" | "mc" | "moderator";

export type PanelMode = "qa" | "wordcloud";

export type QuestionStatus = "pending" | "available" | "active" | "done" | "hidden";

export type WordStatus = "pending" | "approved" | "hidden";

export interface PanelQuestion {
  readonly id: string;
  readonly text: string;
  readonly proposedBy: PanelRole;
  readonly submittedById: string;
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
  readonly submittedByCurrentUser: boolean;
}

export interface QuestionSubmissionResult {
  readonly ok: boolean;
  readonly message: string;
  readonly question?: PublicQuestion;
}

export interface PanelWord {
  readonly id: string;
  readonly text: string;
  readonly normalizedText: string;
  readonly createdAt: number;
  readonly submissionCount: number;
  readonly submitterIds: ReadonlySet<string>;
  readonly voterIds: ReadonlySet<string>;
  readonly status: WordStatus;
}

export interface PublicWord {
  readonly id: string;
  readonly text: string;
  readonly count: number;
  readonly status: WordStatus;
  readonly votedByCurrentUser: boolean;
  readonly submittedByCurrentUser: boolean;
}

export interface WordSubmissionResult {
  readonly ok: boolean;
  readonly message: string;
  readonly word?: PublicWord;
}

interface RateLimitBucket {
  readonly timestamps: number[];
}

interface PanelStore {
  readonly questions: Map<string, PanelQuestion>;
  readonly words: Map<string, PanelWord>;
  readonly rateLimits: Map<string, RateLimitBucket>;
  mode: PanelMode;
  wordPrompt: string;
  wordCloudEndedAt: number | undefined;
}

interface SerializedQuestion {
  readonly id: string;
  readonly text: string;
  readonly proposedBy: PanelRole;
  readonly submittedById?: string | undefined;
  readonly createdAt: number;
  readonly voterIds: string[];
  readonly status: QuestionStatus;
}

interface SerializedWord {
  readonly id: string;
  readonly text: string;
  readonly normalizedText: string;
  readonly createdAt: number;
  readonly submissionCount: number;
  readonly submitterIds?: string[] | undefined;
  readonly voterIds: string[];
  readonly status: WordStatus;
}

export interface SerializedPanelState {
  readonly mode?: PanelMode | undefined;
  readonly wordPrompt?: string | undefined;
  readonly questions: SerializedQuestion[];
  readonly words: SerializedWord[];
  readonly rateLimits: ReadonlyArray<readonly [string, number[]]>;
  readonly wordCloudEndedAt?: number | undefined;
}

const store: PanelStore = {
  questions: new Map(),
  words: new Map(),
  rateLimits: new Map(),
  mode: "qa",
  wordPrompt: "",
  wordCloudEndedAt: undefined,
};

const maximumQuestionLength = 220;
const maximumQuestionSubmissions = 3;
const questionWindowMs = 60_000;
const maximumVotes = 80;
const voteWindowMs = 60_000;
const maximumWordLength = 40;
const maximumWordPromptLength = 160;
const maximumWordSubmissions = 30;
const wordWindowMs = 60_000;
const maximumFailedLoginAttempts = 8;
const loginWindowMs = 10 * 60_000;

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
    submittedById: input.clientId,
    createdAt: now,
    voterIds: new Set(),
    status: input.role === "moderator" ? "available" : "pending",
  };

  store.questions.set(id, question);

  return {
    ok: true,
    message: input.role === "moderator" ? "Question added." : "Question sent.",
    question: toPublicQuestion(question, input.clientId),
  };
}

export function isLoginRateLimited(input: {
  readonly role: Exclude<PanelRole, "attendee">;
  readonly ipAddress: string;
  readonly now?: number;
}): boolean {
  return isCurrentlyRateLimited(
    loginRateLimitKey(input.role, input.ipAddress),
    maximumFailedLoginAttempts,
    loginWindowMs,
    input.now ?? Date.now(),
  );
}

export function recordFailedLoginAttempt(input: {
  readonly role: Exclude<PanelRole, "attendee">;
  readonly ipAddress: string;
  readonly now?: number;
}): boolean {
  return isRateLimited(loginRateLimitKey(input.role, input.ipAddress), maximumFailedLoginAttempts, loginWindowMs, input.now ?? Date.now());
}

export function clearFailedLoginAttempts(input: { readonly role: Exclude<PanelRole, "attendee">; readonly ipAddress: string }): void {
  store.rateLimits.delete(loginRateLimitKey(input.role, input.ipAddress));
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

  if (
    !question ||
    question.status === "pending" ||
    question.status === "hidden" ||
    question.status === "done" ||
    question.submittedById === input.clientId ||
    question.voterIds.has(input.clientId)
  ) {
    return false;
  }

  store.questions.set(input.id, {
    ...question,
    voterIds: new Set([...question.voterIds, input.clientId]),
  });

  return true;
}

export function approveQuestion(id: string): boolean {
  const question = store.questions.get(id);

  if (!question || question.status !== "pending") {
    return false;
  }

  store.questions.set(id, { ...question, status: "available" });
  return true;
}

export function editQuestion(id: string, inputText: string): QuestionSubmissionResult {
  const question = store.questions.get(id);
  const text = normalizeQuestion(inputText);

  if (!question || question.status === "done") {
    return { ok: false, message: "Question not found." };
  }

  if (text.length < 8) {
    return { ok: false, message: "Question is too short." };
  }

  const updatedQuestion = { ...question, text };
  store.questions.set(id, updatedQuestion);

  return { ok: true, message: "Question updated.", question: toPublicQuestion(updatedQuestion, "") };
}

export function submitWord(input: {
  readonly text: string;
  readonly clientId: string;
  readonly ipAddress: string;
  readonly now?: number;
}): WordSubmissionResult {
  const now = input.now ?? Date.now();
  const text = normalizeWordDisplay(input.text);
  const normalizedText = normalizeWordKey(text);

  if (store.wordCloudEndedAt !== undefined) {
    return { ok: false, message: "Word cloud ended." };
  }

  if (normalizedText.length < 2) {
    return { ok: false, message: "Word is too short." };
  }

  if (isRateLimited(`word:${input.ipAddress}`, maximumWordSubmissions, wordWindowMs, now)) {
    return { ok: false, message: "Please wait before adding another word." };
  }

  const existing = findWordByKey(normalizedText);

  if (existing && existing.status !== "hidden") {
    const word = {
      ...existing,
      submissionCount: existing.submissionCount + 1,
      submitterIds: new Set([...existing.submitterIds, input.clientId]),
    };
    store.words.set(existing.id, word);
    return { ok: true, message: existing.status === "pending" ? "Word added." : "Word counted.", word: toPublicWord(word, input.clientId) };
  }

  const word: PanelWord = {
    id: createQuestionId(),
    text,
    normalizedText,
    createdAt: now,
    submissionCount: 1,
    submitterIds: new Set([input.clientId]),
    voterIds: new Set(),
    status: "pending",
  };

  store.words.set(word.id, word);
  return { ok: true, message: "Word added.", word: toPublicWord(word, input.clientId) };
}

export function approveWord(id: string): boolean {
  const word = store.words.get(id);

  if (!word || word.status === "hidden") {
    return false;
  }

  store.words.set(id, { ...word, status: "approved" });
  return true;
}

export function voteForWord(input: {
  readonly id: string;
  readonly clientId: string;
  readonly ipAddress: string;
  readonly now?: number;
}): boolean {
  const now = input.now ?? Date.now();

  if (store.wordCloudEndedAt !== undefined || isRateLimited(`word-vote:${input.ipAddress}`, maximumVotes, voteWindowMs, now)) {
    return false;
  }

  const word = store.words.get(input.id);

  if (!word || word.status !== "approved" || word.submitterIds.has(input.clientId) || word.voterIds.has(input.clientId)) {
    return false;
  }

  store.words.set(input.id, {
    ...word,
    voterIds: new Set([...word.voterIds, input.clientId]),
  });

  return true;
}

export function hideWord(id: string): boolean {
  const word = store.words.get(id);

  if (!word) {
    return false;
  }

  store.words.set(id, { ...word, status: "hidden" });
  return true;
}

export function mergeWord(sourceId: string, targetText: string): boolean {
  const source = store.words.get(sourceId);
  const normalizedTarget = normalizeWordKey(targetText);

  if (!source || source.status === "hidden" || normalizedTarget.length < 2) {
    return false;
  }

  const target = findWordByKey(normalizedTarget);

  if (!target || target.id === source.id || target.status === "hidden") {
    store.words.set(source.id, {
      ...source,
      text: normalizeWordDisplay(targetText),
      normalizedText: normalizedTarget,
    });
    return true;
  }

  store.words.set(target.id, {
    ...target,
    submissionCount: target.submissionCount + source.submissionCount,
    submitterIds: new Set([...target.submitterIds, ...source.submitterIds]),
    voterIds: new Set([...target.voterIds, ...source.voterIds]),
    status: target.status === "approved" || source.status === "approved" ? "approved" : "pending",
  });
  store.words.set(source.id, { ...source, status: "hidden" });
  return true;
}

export function endWordCloud(now = Date.now()): void {
  store.wordCloudEndedAt = now;
}

export function chooseActiveQuestion(id: string): boolean {
  const selected = store.questions.get(id);

  if (!selected || selected.status === "pending" || selected.status === "hidden" || selected.status === "done") {
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
  store.words.clear();
  store.mode = "qa";
  store.wordPrompt = "";
  store.wordCloudEndedAt = undefined;
}

export function getPanelMode(): PanelMode {
  return store.mode;
}

export function setPanelMode(mode: PanelMode): void {
  store.mode = mode;
}

export function getWordPrompt(): string {
  return store.wordPrompt;
}

export function setWordPrompt(prompt: string): void {
  store.wordPrompt = normalizeWordPrompt(prompt);
}

export function listAudienceQuestions(clientId: string): PublicQuestion[] {
  return sortQuestions(
    [...store.questions.values()].filter(
      (question) =>
        question.status === "available" ||
        question.status === "active" ||
        (question.status === "pending" && question.submittedById === clientId),
    ),
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

export function listAudienceWords(clientId: string): PublicWord[] {
  if (store.wordCloudEndedAt !== undefined) {
    return [];
  }

  return sortPublicWords(
    [...store.words.values()]
      .filter((word) => word.status === "approved" || (word.status === "pending" && word.submitterIds.has(clientId)))
      .map((word) => toPublicWord(word, clientId)),
  );
}

export function listModeratorWords(clientId: string): PublicWord[] {
  return sortWords([...store.words.values()].filter((word) => word.status !== "hidden")).map((word) => toPublicWord(word, clientId));
}

export function listScreenWords(): PublicWord[] {
  if (store.wordCloudEndedAt !== undefined) {
    return [];
  }

  return sortWords([...store.words.values()].filter((word) => word.status === "approved")).map((word) => toPublicWord(word, ""));
}

export function wordCloudEnded(): boolean {
  return store.wordCloudEndedAt !== undefined;
}

export function clearPanelStateForTests(): void {
  store.questions.clear();
  store.words.clear();
  store.rateLimits.clear();
  store.mode = "qa";
  store.wordPrompt = "";
  store.wordCloudEndedAt = undefined;
}

export function serializePanelState(): SerializedPanelState {
  return {
    mode: store.mode,
    wordPrompt: store.wordPrompt,
    questions: [...store.questions.values()].map((question) => ({
      ...question,
      voterIds: [...question.voterIds],
    })),
    words: [...store.words.values()].map((word) => ({
      ...word,
      submitterIds: [...word.submitterIds],
      voterIds: [...word.voterIds],
    })),
    rateLimits: [...store.rateLimits.entries()].map(([key, bucket]) => [key, bucket.timestamps]),
    wordCloudEndedAt: store.wordCloudEndedAt,
  };
}

export function loadPanelState(state: SerializedPanelState | undefined): void {
  clearPanelStateForTests();

  if (!state) {
    return;
  }

  for (const question of state.questions) {
    store.questions.set(question.id, {
      ...question,
      submittedById: question.submittedById ?? question.voterIds[0] ?? "",
      voterIds: new Set(question.voterIds),
    });
  }

  for (const word of state.words) {
    store.words.set(word.id, {
      ...word,
      submitterIds: new Set(word.submitterIds ?? []),
      voterIds: new Set(word.voterIds),
    });
  }

  for (const [key, timestamps] of state.rateLimits) {
    store.rateLimits.set(key, { timestamps: [...timestamps] });
  }

  store.mode = state.mode ?? "qa";
  store.wordPrompt = normalizeWordPrompt(state.wordPrompt ?? "");
  store.wordCloudEndedAt = state.wordCloudEndedAt;
}

function getActiveQuestion(): PanelQuestion | undefined {
  return [...store.questions.values()].find((question) => question.status === "active");
}

function normalizeQuestion(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim().slice(0, maximumQuestionLength);
}

function normalizeWordDisplay(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim().slice(0, maximumWordLength);
}

function normalizeWordPrompt(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim().slice(0, maximumWordPromptLength).trim();
}

function normalizeWordKey(text: string): string {
  return normalizeWordDisplay(text)
    .toLocaleLowerCase("en")
    .replaceAll(/^[^\p{Letter}\p{Number}]+|[^\p{Letter}\p{Number}]+$/gu, "")
    .replaceAll(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
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
    submittedByCurrentUser: question.submittedById === clientId,
  };
}

function toPublicWord(word: PanelWord, clientId: string): PublicWord {
  return {
    id: word.id,
    text: word.text,
    count: publicWordCount(word, clientId),
    status: word.status,
    votedByCurrentUser: word.voterIds.has(clientId),
    submittedByCurrentUser: word.submitterIds.has(clientId),
  };
}

function publicWordCount(word: PanelWord, clientId: string): number {
  if (word.status === "pending" && word.submitterIds.has(clientId)) {
    return 1;
  }

  return word.submissionCount + word.voterIds.size;
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

function sortWords(words: PanelWord[]): PanelWord[] {
  return [...words].sort((left, right) => {
    const countDifference = right.submissionCount + right.voterIds.size - (left.submissionCount + left.voterIds.size);

    if (countDifference !== 0) {
      return countDifference;
    }

    return left.createdAt - right.createdAt;
  });
}

function sortPublicWords(words: PublicWord[]): PublicWord[] {
  return [...words].sort((left, right) => {
    const countDifference = right.count - left.count;

    if (countDifference !== 0) {
      return countDifference;
    }

    const textDifference = left.text.localeCompare(right.text, "en");

    if (textDifference !== 0) {
      return textDifference;
    }

    return left.id.localeCompare(right.id);
  });
}

function findWordByKey(normalizedText: string): PanelWord | undefined {
  return [...store.words.values()].find((word) => word.normalizedText === normalizedText);
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

function isCurrentlyRateLimited(key: string, maximum: number, windowMs: number, now: number): boolean {
  const bucket = store.rateLimits.get(key) ?? { timestamps: [] };
  const recentTimestamps = bucket.timestamps.filter((timestamp) => now - timestamp < windowMs);
  store.rateLimits.set(key, { timestamps: recentTimestamps });
  return recentTimestamps.length >= maximum;
}

function loginRateLimitKey(role: Exclude<PanelRole, "attendee">, ipAddress: string): string {
  return `login:${role}:${ipAddress}`;
}

function createQuestionId(): string {
  return globalThis.crypto.randomUUID();
}
