import type { AuthState } from "../panel/auth";
import type { PublicQuestion, PublicWord } from "../panel/state";
import { escapeHtml } from "./shared";

interface AudienceViewModel {
  readonly questions: PublicQuestion[];
  readonly notice?: string | undefined;
}

interface RoleViewModel extends AudienceViewModel {
  readonly auth: AuthState;
  readonly words?: PublicWord[];
  readonly wordCloudEnded?: boolean;
}

interface WordViewModel {
  readonly words: PublicWord[];
  readonly notice?: string | undefined;
}

const appName = "Future Frontend Panels";

export function renderAudiencePage(view: AudienceViewModel): string {
  return pageShell({
    title: appName,
    bodyClass: "bg-app-canvas text-app-text",
    scriptPath: "/panel-live.js",
    body: `
      <main class="mx-auto flex min-h-screen w-[min(42rem,calc(100vw-1.5rem))] flex-col gap-5 px-1 py-6 sm:py-9">
        ${header("Questions")}
        ${notice(view.notice)}
        ${questionForm("/", "Ask a question", "Question", "Send")}
        ${renderAudienceQuestionsFragment(view.questions)}
      </main>`,
  });
}

export function renderAudienceQuestionsFragment(questions: PublicQuestion[]): string {
  return `<section class="space-y-3" aria-label="Available questions" data-live-region="questions" data-live-src="/questions/live">
    ${renderAudienceQuestionsContent(questions)}
  </section>`;
}

export function renderAudienceQuestionsContent(questions: PublicQuestion[]): string {
  return questions.length === 0
    ? emptyState("No questions yet.")
    : questions.map((question) => questionCard(question, "attendee")).join("");
}

export function renderWordPage(view: WordViewModel): string {
  return pageShell({
    title: `Words - ${appName}`,
    bodyClass: "bg-app-canvas text-app-text",
    scriptPath: "/panel-live.js",
    body: `
      <main class="mx-auto flex min-h-screen w-[min(42rem,calc(100vw-1.5rem))] flex-col gap-5 px-1 py-6 sm:py-9">
        ${header("Words")}
        ${notice(view.notice)}
        ${wordForm("/words", "Add word", "Word", "Send")}
        ${renderAudienceWordsFragment(view.words)}
      </main>`,
  });
}

export function renderAudienceWordsFragment(words: PublicWord[]): string {
  return `<section aria-label="Approved words" data-live-region="words" data-live-src="/words/live">
    ${renderAudienceWordsContent(words)}
  </section>`;
}

export function renderAudienceWordsContent(words: PublicWord[]): string {
  return words.length === 0
    ? emptyState("No words yet.")
    : `<div class="flex flex-wrap gap-2">${words.map((word) => wordPill(word, "attendee")).join("")}</div>`;
}

export function renderMcPage(view: RoleViewModel): string {
  if (view.auth.role !== "mc") {
    return renderLoginPage("mc", view.auth.configured);
  }

  return pageShell({
    title: `MC - ${appName}`,
    bodyClass: "bg-app-canvas text-app-text",
    body: `
      <main class="mx-auto flex min-h-screen w-[min(46rem,calc(100vw-1.5rem))] flex-col gap-5 px-1 py-6 sm:py-9">
        ${operatorHeader("MC")}
        ${notice(view.notice)}
        <section class="space-y-3" aria-label="Questions for MC">
          ${view.questions.length === 0 ? emptyState("No questions waiting.") : view.questions.map((question) => questionCard(question, "mc")).join("")}
        </section>
      </main>`,
  });
}

export function renderModeratorPage(view: RoleViewModel): string {
  if (view.auth.role !== "moderator") {
    return renderLoginPage("moderator", view.auth.configured);
  }

  return pageShell({
    title: `Moderator - ${appName}`,
    bodyClass: "bg-app-canvas text-app-text",
    body: `
      <main class="mx-auto flex min-h-screen w-[min(48rem,calc(100vw-1.5rem))] flex-col gap-5 px-1 py-6 sm:py-9">
        ${operatorHeader("Moderator")}
        ${notice(view.notice)}
        ${questionForm("/moderator", "Add moderator question", "Question", "Add")}
        ${moderatorWords(view.words ?? [], view.wordCloudEnded ?? false)}
        <form method="post" action="/moderator/reset">
          <button class="h-12 w-full rounded-lg border border-app-line bg-white px-4 text-sm font-semibold uppercase tracking-[0.14em] text-app-text transition hover:bg-app-accent-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-text/30" type="submit">Reset</button>
        </form>
        <section class="space-y-3" aria-label="Questions for moderator">
          ${view.questions.length === 0 ? emptyState("No questions to moderate.") : view.questions.map((question) => questionCard(question, "moderator")).join("")}
        </section>
      </main>`,
  });
}

export function renderWordScreenPage(words: PublicWord[]): string {
  return pageShell({
    title: `Word cloud - ${appName}`,
    bodyClass: "min-h-screen bg-black text-white",
    scriptPath: "/panel-live.js",
    body: `
      <main class="flex min-h-screen items-center justify-center px-8 py-10">
        ${renderWordScreenFragment(words)}
      </main>`,
  });
}

export function renderWordScreenFragment(words: PublicWord[]): string {
  return `<section class="flex w-full items-center justify-center" aria-label="Word cloud screen" data-live-region="word-screen" data-live-src="/words/screen/live">
    ${renderWordScreenContent(words)}
  </section>`;
}

export function renderWordScreenContent(words: PublicWord[]): string {
  return words.length === 0
    ? `<p class="text-center text-3xl font-semibold text-white/78 sm:text-5xl">Waiting.</p>`
    : `<div class="flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-5">${words.map(screenWord).join("")}</div>`;
}

export function renderScreenPage(question: PublicQuestion | undefined): string {
  const content = question
    ? `<p class="max-w-5xl text-balance text-center text-5xl font-semibold leading-[1.03] text-white sm:text-7xl lg:text-8xl">${escapeHtml(question.text)}</p>`
    : `<p class="text-center text-3xl font-semibold text-white/78 sm:text-5xl">Waiting.</p>`;

  return pageShell({
    title: `Screen - ${appName}`,
    refreshSeconds: 5,
    bodyClass: "min-h-screen bg-black text-white",
    body: `
      <main class="flex min-h-screen items-center justify-center px-8 py-10">
        ${content}
      </main>`,
  });
}

function renderLoginPage(role: "mc" | "moderator", configured: boolean): string {
  const label = role === "mc" ? "MC" : "Moderator";
  const setupMessage = configured
    ? ""
    : `<p class="rounded-lg border border-app-line px-4 py-3 text-sm leading-6 text-app-text">Set AUTH_SECRET and ${role === "mc" ? "MC_PASSCODE" : "MODERATOR_PASSCODE"}.</p>`;

  return pageShell({
    title: `${label} login - ${appName}`,
    bodyClass: "bg-app-canvas text-app-text",
    body: `
      <main class="mx-auto flex min-h-screen w-[min(28rem,calc(100vw-1.5rem))] flex-col justify-center gap-6 py-6">
        ${header(label)}
        ${setupMessage}
        <form class="space-y-3" method="post" action="/${role}/login">
          <input class="h-14 w-full rounded-lg border border-app-line bg-white px-4 text-lg shadow-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/35" name="passcode" type="password" autocomplete="current-password" required>
          <button class="h-14 w-full rounded-lg bg-app-text px-4 text-sm font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-app-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40" type="submit">Enter</button>
        </form>
      </main>`,
  });
}

function pageShell(input: {
  readonly title: string;
  readonly body: string;
  readonly bodyClass: string;
  readonly refreshSeconds?: number;
  readonly scriptPath?: string;
}): string {
  const refresh = input.refreshSeconds ? `<meta http-equiv="refresh" content="${input.refreshSeconds}">` : "";
  const script = input.scriptPath ? `<script src="${escapeHtml(input.scriptPath)}" type="module"></script>` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${refresh}
    <title>${escapeHtml(input.title)}</title>
    <link rel="stylesheet" href="/styles.css">
    ${script}
  </head>
  <body class="min-h-screen ${input.bodyClass} antialiased">
    ${input.body}
  </body>
</html>`;
}

function header(title: string): string {
  return `<header class="flex items-end justify-between gap-4 border-b border-app-line pb-4 pt-2">
    <h1 class="text-5xl font-semibold leading-none sm:text-6xl">${escapeHtml(title)}</h1>
    <a class="shrink-0 text-sm font-semibold uppercase tracking-[0.14em] text-app-text-soft hover:text-app-text" href="/">Future Frontend</a>
  </header>`;
}

function operatorHeader(role: string): string {
  return `<header class="flex flex-col gap-4 border-b border-app-line pb-4 sm:flex-row sm:items-end sm:justify-between">
    <div class="flex items-end gap-3">
      <h1 class="text-4xl font-semibold leading-none sm:text-5xl">Queue</h1>
      <span class="pb-1 text-sm font-semibold uppercase tracking-[0.14em] text-app-text-soft">${escapeHtml(role)}</span>
    </div>
    <form method="post" action="/logout">
      <button class="h-11 rounded-lg border border-app-line bg-white px-4 text-sm font-semibold text-app-text-soft transition hover:border-app-text/25 hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/35" type="submit">Sign out</button>
    </form>
  </header>`;
}

function questionForm(action: string, label: string, placeholder: string, button: string): string {
  return `<form class="rounded-lg border border-app-line bg-app-surface p-3 shadow-panel" method="post" action="${escapeHtml(action)}">
    <label class="sr-only" for="question-text">${escapeHtml(label)}</label>
    <textarea class="min-h-24 w-full resize-y rounded-md border border-app-line bg-white px-4 py-3 text-lg leading-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/35" id="question-text" name="question" maxlength="220" placeholder="${escapeHtml(placeholder)}" required></textarea>
    <button class="mt-3 h-12 w-full rounded-lg bg-app-text px-4 text-sm font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-app-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40" type="submit">${escapeHtml(button)}</button>
  </form>`;
}

function wordForm(action: string, label: string, placeholder: string, button: string): string {
  return `<form class="flex gap-2 rounded-lg border border-app-line bg-app-surface p-3 shadow-panel" method="post" action="${escapeHtml(action)}">
    <label class="sr-only" for="word-text">${escapeHtml(label)}</label>
    <input class="h-12 min-w-0 flex-1 rounded-md border border-app-line bg-white px-4 text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/35" id="word-text" name="word" maxlength="40" placeholder="${escapeHtml(placeholder)}" required>
    <button class="h-12 rounded-lg bg-app-text px-5 text-sm font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-app-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40" type="submit">${escapeHtml(button)}</button>
  </form>`;
}

function moderatorWords(words: PublicWord[], ended: boolean): string {
  return `<section class="space-y-3" aria-label="Word cloud">
    <div class="flex items-end justify-between gap-3 border-b border-app-line pb-3">
      <div class="flex items-end gap-3">
        <h2 class="text-3xl font-semibold leading-none">Words</h2>
        ${ended ? `<span class="pb-1 text-sm font-semibold uppercase tracking-[0.14em] text-app-text-soft">Ended</span>` : ""}
      </div>
      <form method="post" action="/moderator/words/end">
        <button class="h-10 rounded-lg border border-app-line bg-white px-4 text-sm font-semibold text-app-text-soft transition hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/35" type="submit" ${ended ? "disabled" : ""}>End</button>
      </form>
    </div>
    ${words.length === 0 ? emptyState("No words yet.") : `<div class="space-y-2">${words.map(moderatorWordRow).join("")}</div>`}
  </section>`;
}

function questionCard(question: PublicQuestion, role: "attendee" | "mc" | "moderator"): string {
  const activeClass = question.status === "active" ? "border-app-accent bg-app-accent-ghost" : "border-app-line bg-white";
  const pendingLabel =
    question.status === "pending"
      ? `<span class="rounded-full border border-app-line px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-app-text-soft">Pending</span>`
      : "";
  const hiddenLabel =
    question.status === "hidden"
      ? `<span class="rounded-full border border-app-line px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-app-text-soft">Hidden</span>`
      : "";
  const activeLabel =
    question.status === "active"
      ? `<span class="rounded-full bg-app-text px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white">Live</span>`
      : "";

  return `<article class="rounded-lg border ${activeClass} p-4 shadow-panel">
    <div class="flex items-start justify-between gap-4">
      <p class="text-xl font-semibold leading-7">${escapeHtml(question.text)}</p>
      <div class="flex shrink-0 flex-col items-end gap-2">
        <span class="text-2xl font-semibold leading-none">${question.votes}</span>
        <span class="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-app-text-soft">votes</span>
      </div>
    </div>
    <div class="mt-4 flex flex-wrap items-center gap-2">
      ${activeLabel}${pendingLabel}${hiddenLabel}${actions(question, role)}
    </div>
  </article>`;
}

function wordPill(word: PublicWord, role: "attendee" | "moderator"): string {
  const voteButton = word.votedByCurrentUser
    ? `<button class="h-10 rounded-full border border-app-line bg-app-surface px-4 text-sm font-semibold text-app-text-soft" type="submit" disabled>${escapeHtml(word.text)} ${word.count}</button>`
    : `<form method="post" action="${role === "moderator" ? "/moderator/words/vote" : "/words/vote"}">
        <input type="hidden" name="wordId" value="${escapeHtml(word.id)}">
        <button class="h-10 rounded-full border border-app-line bg-white px-4 text-sm font-semibold text-app-text transition hover:bg-app-accent-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/35" type="submit">${escapeHtml(word.text)} ${word.count}</button>
      </form>`;

  return voteButton;
}

function moderatorWordRow(word: PublicWord): string {
  const status =
    word.status === "pending"
      ? `<span class="rounded-full border border-app-line px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-app-text-soft">Pending</span>`
      : "";

  return `<article class="rounded-lg border border-app-line bg-white p-3">
    <div class="flex flex-wrap items-center gap-2">
      <span class="mr-auto text-xl font-semibold">${escapeHtml(word.text)}</span>
      <span class="text-sm font-semibold text-app-text-soft">${word.count}</span>
      ${status}
      ${word.status === "pending" ? wordActionButton("/moderator/words/approve", word.id, "Approve", "bg-app-text text-white hover:bg-app-accent-strong") : wordPill(word, "moderator")}
      ${wordActionButton("/moderator/words/hide", word.id, "Hide", "border-app-line bg-white text-app-text-soft hover:text-app-text")}
    </div>
    <form class="mt-3 flex gap-2" method="post" action="/moderator/words/merge">
      <input type="hidden" name="wordId" value="${escapeHtml(word.id)}">
      <input class="h-10 min-w-0 flex-1 rounded-md border border-app-line bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/35" name="target" placeholder="Merge into">
      <button class="h-10 rounded-lg border border-app-line bg-white px-4 text-sm font-semibold text-app-text-soft transition hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/35" type="submit">Merge</button>
    </form>
  </article>`;
}

function screenWord(word: PublicWord): string {
  const size = Math.min(7, 2.5 + word.count * 0.7);
  return `<span class="font-semibold leading-none" style="font-size:${size}rem">${escapeHtml(word.text)}</span>`;
}

function actions(question: PublicQuestion, role: "attendee" | "mc" | "moderator"): string {
  const voteAction = role === "moderator" ? "/moderator/vote" : "/vote";
  const voteButton = question.votedByCurrentUser
    ? `<button class="h-10 rounded-lg border border-app-line bg-app-surface px-4 text-sm font-semibold text-app-text-soft" type="submit" disabled>Voted</button>`
    : actionButton(voteAction, question.id, "+1", "border-app-line bg-app-surface text-app-text hover:border-app-accent/40");

  if (role === "attendee") {
    return voteButton;
  }

  if (role === "mc") {
    return `${actionButton("/mc/select", question.id, "Ask", "bg-app-text text-white hover:bg-app-accent-strong")}
      <form method="post" action="/mc/done"><button class="h-10 rounded-lg border border-app-line bg-white px-4 text-sm font-semibold text-app-text-soft hover:text-app-text" type="submit">Done</button></form>`;
  }

  const approveButton =
    question.status === "pending"
      ? actionButton("/moderator/approve", question.id, "Approve", "bg-app-text text-white hover:bg-app-accent-strong")
      : "";
  const moderatorVoteButton = question.status === "pending" ? "" : voteButton;

  return `${approveButton}${moderatorVoteButton}${actionButton("/moderator/hide", question.id, "Hide", "border-app-line bg-white text-app-text-soft hover:text-app-text")}`;
}

function actionButton(action: string, questionId: string, label: string, classes: string): string {
  return `<form method="post" action="${escapeHtml(action)}">
    <input type="hidden" name="questionId" value="${escapeHtml(questionId)}">
    <button class="h-10 rounded-lg border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/35 ${classes}" type="submit">${escapeHtml(label)}</button>
  </form>`;
}

function wordActionButton(action: string, wordId: string, label: string, classes: string): string {
  return `<form method="post" action="${escapeHtml(action)}">
    <input type="hidden" name="wordId" value="${escapeHtml(wordId)}">
    <button class="h-10 rounded-lg border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/35 ${classes}" type="submit">${escapeHtml(label)}</button>
  </form>`;
}

function notice(message: string | undefined): string {
  return message
    ? `<p class="rounded-lg border border-app-line bg-white px-4 py-3 text-sm font-semibold text-app-text-soft shadow-panel">${escapeHtml(message)}</p>`
    : "";
}

function emptyState(message: string): string {
  return `<p class="rounded-lg border border-dashed border-app-line px-5 py-10 text-center text-lg font-semibold text-app-text-soft">${escapeHtml(message)}</p>`;
}
