import type { AuthState } from "../panel/auth";
import type { PublicQuestion } from "../panel/state";
import { escapeHtml } from "./shared";

interface AudienceViewModel {
  readonly questions: PublicQuestion[];
  readonly notice?: string | undefined;
}

interface RoleViewModel extends AudienceViewModel {
  readonly auth: AuthState;
}

const appName = "Future Frontend Panels";

export function renderAudiencePage(view: AudienceViewModel): string {
  return pageShell({
    title: appName,
    bodyClass: "bg-app-canvas text-app-text",
    body: `
      <main class="mx-auto flex min-h-screen w-[min(42rem,calc(100vw-1.5rem))] flex-col gap-7 px-1 py-6 sm:py-10">
        ${header("Questions", "Ask or lift up what should be discussed next.")}
        ${notice(view.notice)}
        ${questionForm("/", "Ask a question", "Question for the panel", "Send")}
        <section class="space-y-3" aria-label="Available questions">
          ${view.questions.length === 0 ? emptyState("No questions yet.") : view.questions.map((question) => questionCard(question, "attendee")).join("")}
        </section>
      </main>`,
  });
}

export function renderMcPage(view: RoleViewModel): string {
  if (view.auth.role !== "mc") {
    return renderLoginPage("mc", view.auth.configured);
  }

  return pageShell({
    title: `MC - ${appName}`,
    bodyClass: "bg-app-canvas text-app-text",
    body: `
      <main class="mx-auto flex min-h-screen w-[min(46rem,calc(100vw-1.5rem))] flex-col gap-7 px-1 py-6 sm:py-10">
        ${operatorHeader("MC", "Choose the question currently being asked.")}
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
      <main class="mx-auto flex min-h-screen w-[min(48rem,calc(100vw-1.5rem))] flex-col gap-7 px-1 py-6 sm:py-10">
        ${operatorHeader("Moderator", "Shape the queue before it reaches the room.")}
        ${notice(view.notice)}
        ${questionForm("/moderator", "Add moderator question", "Seed question for the panel", "Add")}
        <form method="post" action="/moderator/reset">
          <button class="h-12 w-full rounded-lg border border-red-900/20 bg-red-50 px-4 text-sm font-semibold text-red-900 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-800/30" type="submit">Reset panel</button>
        </form>
        <section class="space-y-3" aria-label="Questions for moderator">
          ${view.questions.length === 0 ? emptyState("No questions to moderate.") : view.questions.map((question) => questionCard(question, "moderator")).join("")}
        </section>
      </main>`,
  });
}

export function renderScreenPage(question: PublicQuestion | undefined): string {
  const content = question
    ? `<p class="max-w-5xl text-balance text-center text-5xl font-semibold leading-[1.03] tracking-[-0.035em] text-white sm:text-7xl lg:text-8xl">${escapeHtml(question.text)}</p>`
    : `<p class="text-center text-3xl font-semibold tracking-[-0.02em] text-white/78 sm:text-5xl">Questions will appear here.</p>`;

  return pageShell({
    title: `Screen - ${appName}`,
    refreshSeconds: 5,
    bodyClass: "min-h-screen bg-[#11130f] text-white",
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
    : `<p class="rounded-lg bg-red-50 px-4 py-3 text-sm leading-6 text-red-900">Set AUTH_SECRET and ${role === "mc" ? "MC_PASSCODE" : "MODERATOR_PASSCODE"} before using this view.</p>`;

  return pageShell({
    title: `${label} login - ${appName}`,
    bodyClass: "bg-app-canvas text-app-text",
    body: `
      <main class="mx-auto flex min-h-screen w-[min(28rem,calc(100vw-1.5rem))] flex-col justify-center gap-6 py-6">
        ${header(label, "Enter the panel passcode.")}
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
}): string {
  const refresh = input.refreshSeconds ? `<meta http-equiv="refresh" content="${input.refreshSeconds}">` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${refresh}
    <title>${escapeHtml(input.title)}</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body class="min-h-screen ${input.bodyClass} antialiased">
    ${input.body}
  </body>
</html>`;
}

function header(title: string, subtitle: string): string {
  return `<header class="space-y-3 pt-2">
    <p class="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-app-accent">Future Frontend</p>
    <h1 class="text-5xl font-semibold leading-[0.95] tracking-[-0.05em] sm:text-6xl">${escapeHtml(title)}</h1>
    <p class="max-w-2xl text-lg leading-7 text-app-text-soft">${escapeHtml(subtitle)}</p>
  </header>`;
}

function operatorHeader(role: string, subtitle: string): string {
  return `<header class="flex flex-col gap-4 border-b border-app-line pb-5 sm:flex-row sm:items-end sm:justify-between">
    <div class="space-y-2">
      <p class="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-app-accent">${escapeHtml(role)}</p>
      <h1 class="text-4xl font-semibold leading-none tracking-[-0.04em] sm:text-5xl">Panel queue</h1>
      <p class="max-w-2xl text-base leading-7 text-app-text-soft">${escapeHtml(subtitle)}</p>
    </div>
    <form method="post" action="/logout">
      <button class="h-11 rounded-lg border border-app-line bg-white px-4 text-sm font-semibold text-app-text-soft transition hover:border-app-text/25 hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/35" type="submit">Sign out</button>
    </form>
  </header>`;
}

function questionForm(action: string, label: string, placeholder: string, button: string): string {
  return `<form class="rounded-lg border border-app-line bg-app-surface p-3 shadow-panel" method="post" action="${escapeHtml(action)}">
    <label class="sr-only" for="question-text">${escapeHtml(label)}</label>
    <textarea class="min-h-28 w-full resize-y rounded-md border border-app-line bg-white px-4 py-3 text-lg leading-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/35" id="question-text" name="question" maxlength="220" placeholder="${escapeHtml(placeholder)}" required></textarea>
    <button class="mt-3 h-12 w-full rounded-lg bg-app-text px-4 text-sm font-semibold uppercase tracking-[0.16em] text-white transition hover:bg-app-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40" type="submit">${escapeHtml(button)}</button>
  </form>`;
}

function questionCard(question: PublicQuestion, role: "attendee" | "mc" | "moderator"): string {
  const activeClass = question.status === "active" ? "border-app-accent bg-app-accent-ghost" : "border-app-line bg-white";
  const hiddenLabel =
    question.status === "hidden"
      ? `<span class="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-red-900">Hidden</span>`
      : "";
  const activeLabel =
    question.status === "active"
      ? `<span class="rounded-full bg-app-accent px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white">Live</span>`
      : "";

  return `<article class="rounded-lg border ${activeClass} p-4 shadow-panel">
    <div class="flex items-start justify-between gap-4">
      <p class="text-xl font-semibold leading-7 tracking-[-0.025em]">${escapeHtml(question.text)}</p>
      <div class="flex shrink-0 flex-col items-end gap-2">
        <span class="text-2xl font-semibold leading-none">${question.votes}</span>
        <span class="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-app-text-soft">votes</span>
      </div>
    </div>
    <div class="mt-4 flex flex-wrap items-center gap-2">
      ${activeLabel}${hiddenLabel}${actions(question, role)}
    </div>
  </article>`;
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

  return `${voteButton}${actionButton("/moderator/hide", question.id, "Hide", "border-red-900/20 bg-red-50 text-red-900 hover:bg-red-100")}`;
}

function actionButton(action: string, questionId: string, label: string, classes: string): string {
  return `<form method="post" action="${escapeHtml(action)}">
    <input type="hidden" name="questionId" value="${escapeHtml(questionId)}">
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
